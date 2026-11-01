import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { parseFragment } from 'parse5';
import { ROOT } from '../lib/utils.js';
import { parseFrontMatter } from '../lib/frontmatter.js';
import { createMarkdown } from '../lib/markdown.js';
import { assertSafeOutput, OutputPlan } from '../lib/output.js';
import { createPlainText, htmlAdapter } from '../lib/text.js';
import { collectText, findHits, hitPieces, parseTerms } from '../theme/text.js';
import { createPreviewServer } from '../lib/preview.js';

const exec = promisify(execFile);
const plainText = createPlainText(collectText);

async function fixture(t, config = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const name of ['lib', 'theme']) await fs.cp(path.join(ROOT, name), path.join(root, name), { recursive: true });
  for (const name of ['posts', 'pages', 'static']) await fs.mkdir(path.join(root, name));
  await fs.symlink(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'blog.config.js'), `export default ${JSON.stringify({ title: '测试博客', siteUrl: 'https://example.com', ...config })};`);
  const write = async (rel, content) => {
    const file = path.join(root, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };
  const read = (rel) => fs.readFile(path.join(root, 'dist', rel), 'utf8');
  const build = (...args) => exec(process.execPath, ['lib/build.js', ...args], { cwd: root });
  return { root, write, read, build };
}

test('front matter 正确处理注释，并拒绝含糊或重复的 draft', () => {
  const { data } = parseFrontMatter('---\ndraft: true # 不发布\ntitle: "带 # 标题" # 注释\ntags: [a, b] # 注释\ndescription: it\'s good # 注释\n---\n正文');
  assert.equal(data.draft, true);
  assert.equal(data.title, '带 # 标题');
  assert.equal(data.description, "it's good");
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.equal(parseFrontMatter('---\ndraft: false # 发布\n---\n').data.draft, false);
  for (const value of ['"true"', 'yes', '', 'TRUE', '[true]', 'true#typo']) {
    assert.throws(() => parseFrontMatter(`---\ndraft: ${value}\n---\n`), /draft/);
  }
  assert.throws(() => parseFrontMatter('---\ndraft true\n---\n'), /front matter/);
  assert.throws(() => parseFrontMatter('---\ndraft: true\ndraft: false\n---\n'), /重复/);
  assert.throws(() => parseFrontMatter('---\ndraft: true\n正文'), /结束分隔符/);
  assert.equal(Object.keys(parseFrontMatter('---\n---\n正文').data).length, 0);
});

test('危险输出目录在删除或创建任何文件前被拒绝，包括符号链接绕过', async (t) => {
  const f = await fixture(t);
  await f.write('posts/keep.md', '# 保留');
  await f.write('dist/sentinel', 'old');
  for (const out of ['.', '..', 'posts', 'posts/nested', 'lib', 'theme', 'pages', 'static', 'node_modules']) {
    await assert.rejects(f.build('--out', out), /不安全的输出目录/);
  }
  await fs.symlink(path.join(f.root, 'posts'), path.join(f.root, 'alias'), 'dir');
  await assert.rejects(f.build('--out', 'alias/nested'), /不安全的输出目录/);
  assert.equal(await fs.readFile(path.join(f.root, 'posts/keep.md'), 'utf8'), '# 保留');
  assert.equal(await f.read('sentinel'), 'old');
  assert.equal(await assertSafeOutput(path.join(f.root, 'new-output'), f.root), path.join(f.root, 'new-output'));
});

test('文章、独立页面及其附件统一隔离草稿，预览时显示但不进 sitemap', async (t) => {
  const f = await fixture(t);
  await f.write('posts/public.md', '# 已发布\n\n可搜索正文');
  for (const dir of ['posts', 'pages']) {
    await f.write(`${dir}/secret/index.md`, '---\ndraft: true # 保密\n---\n# 未发布\n\n秘密正文');
    await f.write(`${dir}/secret/private.txt`, 'private');
  }
  await f.build();
  const index = JSON.parse(await f.read('search.json'));
  assert.equal(index.length, 1);
  assert.equal(index[0].title, '已发布');
  for (const rel of ['posts/secret', 'secret']) {
    await assert.rejects(fs.access(path.join(f.root, 'dist', rel)), { code: 'ENOENT' });
  }
  await f.write('pages/secret/index.md', '---\ndraft: "true"\n---\n# 含糊草稿');
  await assert.rejects(f.build(), /pages\/secret\/index.md.*draft 必须是布尔值/);
  assert.equal(JSON.parse(await f.read('search.json')).length, 1);
  await f.write('pages/secret/index.md', '---\ndraft: true\n---\n# 未发布');
  await f.build('--drafts');
  for (const rel of ['posts/secret', 'secret']) {
    assert.match(await f.read(`${rel}/index.html`), /noindex, follow/);
    assert.match(await f.read(`${rel}/index.html`), /class="badge">草稿/);
    assert.equal(await f.read(`${rel}/private.txt`), 'private');
  }
  assert.equal(JSON.parse(await f.read('search.json')).length, 3);
  assert.doesNotMatch(await f.read('sitemap.xml'), /secret/);
});

test('所有输出来源的冲突均报错并保留原产物', async (t) => {
  const f = await fixture(t);
  await f.write('posts/public.md', '# 文章');
  await f.build();
  const original = await f.read('index.html');
  const cases = [
    ['pages/tags.md', '# 自定义标签页'],
    ['pages/search.md', '# 自定义搜索页'],
    ['pages/other.md', '---\nslug: tags\n---\n# 重复网址'],
    ['posts/duplicate.md', '---\nslug: public\n---\n# 重复文章'],
    ['static/search.json', '{}'],
    ['static/style.css', 'body {}'],
    ['static/posts', '文件与目录冲突'],
    ['static/INDEX.HTML', '大小写冲突'],
    ['posts/with-assets/index.html', '附件覆盖正文'],
  ];
  await f.write('posts/with-assets/index.md', '# 带附件');
  for (const [rel, content] of cases) {
    await f.write(rel, content);
    await assert.rejects(f.build(), /输出路径冲突/);
    assert.equal(await f.read('index.html'), original);
    await fs.rm(path.join(f.root, rel));
  }
  await f.write('static/posts/public/asset.txt', 'static');
  await f.write('posts/with-assets/shared.txt', 'one');
  await f.write('static/posts/with-assets/shared.txt', 'two');
  await assert.rejects(f.build(), /输出路径冲突/);
});

test('渲染和 staging 写入失败均保留旧输出，成功替换时清理旧文件', async (t) => {
  const f = await fixture(t);
  await f.write('posts/public.md', '# 文章');
  await f.build();
  const previous = await f.read('index.html');
  await f.write('posts/public.md', '# 文章\n\n[坏链接](./missing.md)');
  await assert.rejects(f.build(), /失效的 Markdown 内链/);
  assert.equal(await f.read('index.html'), previous);
  const plan = new OutputPlan();
  plan.add('new.txt', { content: 'new', owner: 'test' });
  plan.add('bad.txt', { source: path.join(f.root, 'missing.txt'), owner: 'test' });
  await assert.rejects(plan.publish(path.join(f.root, 'dist')), { code: 'ENOENT' });
  assert.equal(await f.read('index.html'), previous);
  assert.equal((await fs.readdir(f.root)).some((name) => name.startsWith('.dist-build-')), false);
  await f.write('posts/public.md', '# 新文章');
  await f.write('dist/stale.txt', 'obsolete');
  await f.build();
  assert.match(await f.read('index.html'), /新文章/);
  await assert.rejects(f.read('stale.txt'), { code: 'ENOENT' });
});

test('子路径部署、Markdown 查询参数和 SEO 地址一致，外链保持原样', async (t) => {
  const f = await fixture(t, { base: '/blog/' });
  await f.write('posts/hello world.md', '# 目标文章');
  await f.write('posts/source.md', '# 来源\n\n[绝对](/posts/hello%20world.md?q=test#part)\n\n[相对](./hello%20world.md?q=test#part)\n\n[外部](https://example.org/a.md?q=x#part)\n\n![](/images/cover.svg)');
  await f.write('static/images/cover.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>');
  await f.build();
  const html = await f.read('posts/source/index.html');
  assert.equal((html.match(/href="\/blog\/posts\/hello-world\/\?q=test#part"/g) || []).length, 2);
  assert.match(html, /href="https:\/\/example.org\/a.md\?q=x#part"/);
  assert.match(html, /src="\/blog\/images\/cover.svg"[^>]*width="800" height="400"/);
  assert.match(html, /rel="canonical" href="https:\/\/example.com\/blog\/posts\/source\/"/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /property="og:url" content="https:\/\/example.com\/blog\/posts\/source\/"/);
  assert.match(await f.read('sitemap.xml'), /https:\/\/example.com\/blog\/posts\/source\//);
  assert.doesNotMatch(await f.read('sitemap.xml'), /404|search/);
  assert.doesNotMatch(await f.read('404.html'), /rel="canonical"/);
  assert.equal(JSON.parse(await f.read('search.json')).every((p) => p.url.startsWith('/blog/')), true);
});

test('最终标题、脚注和标签锚点唯一，链接指向对应 ID', async (t) => {
  const md = createMarkdown();
  const env = {};
  const html = md.render('## a\n## a\n## a-1\n## fn-1\n\n脚注[^x]\n\n[^x]: 内容', env);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(env.toc.slice(0, 3).map((h) => h.id), ['a', 'a-1', 'a-1-1']);
  const f = await fixture(t);
  await f.write('posts/tags.md', '---\ntags: [a b, a-b, a-b-1]\n---\n# 标签文章');
  await f.build();
  const tags = await f.read('tags/index.html');
  const tagIds = [...tags.matchAll(/class="tag-group" id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(tagIds).size, 3);
  for (const id of tagIds) assert.ok((await f.read('posts/tags/index.html')).includes(`/tags/#${encodeURIComponent(id)}`));
});

test('内容哈希在只改文章时保留 CSS/JS 缓存，并更新索引与模块依赖版本', async (t) => {
  const f = await fixture(t);
  await f.write('posts/public.md', '# 文章\n\n第一版');
  const versions = async () => {
    const html = await f.read('search/index.html');
    return Object.fromEntries([...html.matchAll(/(?:href|src|data-index)="\/((?:style\.css|search\.js|search\.json)\?v=[a-f0-9]+)"/g)].map((m) => m[1].split('?v=')));
  };
  await f.build();
  const first = await versions();
  const firstModule = await f.read('search.js');
  await f.build();
  assert.deepEqual(await versions(), first);
  await f.write('posts/public.md', '# 文章\n\n第二版');
  await f.build();
  const second = await versions();
  assert.equal(second['style.css'], first['style.css']);
  assert.equal(second['search.js'], first['search.js']);
  assert.notEqual(second['search.json'], first['search.json']);
  await fs.appendFile(path.join(f.root, 'theme/text.js'), '\n// 修改依赖\n');
  await f.build();
  assert.notEqual((await versions())['search.js'], first['search.js']);
  assert.notEqual(await f.read('search.js'), firstModule);
});

test('同一进程连续构建时，共享搜索规则的修改与恢复同步到索引、摘要和浏览器模块', async (t) => {
  const f = await fixture(t);
  await f.write('posts/public.md', '# 文章\n\n保留<span>隐藏</span>正文');
  const { build } = await import(pathToFileURL(path.join(f.root, 'lib/build.js')).href);
  const rulesFile = path.join(f.root, 'theme/text.js');
  const original = await fs.readFile(rulesFile, 'utf8');
  const modified = original.replace("'noscript'", "'noscript', 'span'");
  assert.notEqual(modified, original);
  const snapshots = [];
  for (const [source, expected] of [[original, '保留隐藏正文'], [modified, '保留正文'], [original, '保留隐藏正文']]) {
    await fs.writeFile(rulesFile, source);
    await build({ outDir: path.join(f.root, 'dist'), quiet: true });
    const index = JSON.parse(await f.read('search.json'));
    assert.equal(index[0].text, expected);
    assert.ok((await f.read('posts/public/index.html')).includes(`<meta name="description" content="${expected}">`));
    const emitted = await f.read('text.js');
    assert.equal(emitted, source);
    // 使用实际输出给浏览器的模块核对规则及命中计数。
    const browserRules = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}`);
    const dom = parseFragment('<p>保留<span>隐藏</span>正文</p>');
    const browserText = browserRules.collectText(dom, htmlAdapter).text;
    assert.equal(index[0].text, browserText);
    assert.equal(browserRules.findHits(browserText, ['隐藏']).length, expected.includes('隐藏') ? 1 : 0);
    snapshots.push({ script: await f.read('search.js'), index: await f.read('search.json') });
  }
  assert.notEqual(snapshots[0].script, snapshots[1].script);
  assert.notEqual(snapshots[0].index, snapshots[1].index);
  assert.deepEqual(snapshots[0], snapshots[2]);
});

test('本地图片自动补尺寸，首图可选择 eager，其余图片继续 lazy', async (t) => {
  const f = await fixture(t);
  await f.write('posts/pictures/index.md', '---\nimageLoading: eager\n---\n# 图片\n\n![封面](cover.svg)\n\n![再次](cover.svg)\n\n![远程](https://example.com/remote.png)');
  await f.write('posts/pictures/cover.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"></svg>');
  await f.build();
  const html = await f.read('posts/pictures/index.html');
  assert.match(html, /src="cover.svg"[^>]*width="640" height="360"[^>]*loading="eager"/);
  assert.match(html, /src="cover.svg"[^>]*loading="lazy"/);
  assert.match(html, /src="https:\/\/example.com\/remote.png" alt="远程" loading="lazy"/);
});

test('域名未配置时省略绝对 SEO 地址和 sitemap，静态符号链接拒绝复制', async (t) => {
  const f = await fixture(t, { siteUrl: '' });
  await f.write('posts/public.md', '# 文章');
  await f.build();
  assert.doesNotMatch(await f.read('index.html'), /rel="canonical"|property="og:url"/);
  await assert.rejects(f.read('sitemap.xml'), { code: 'ENOENT' });
  await fs.symlink(path.join(f.root, 'posts/public.md'), path.join(f.root, 'static/leak.txt'));
  await assert.rejects(f.build(), /资源不能是符号链接/);
  await assert.rejects(f.read('leak.txt'), { code: 'ENOENT' });
});

test('搜索归一化保留行内连接、分隔块与 br，并把命中还原到文本节点', () => {
  const html = '<h2>标题<a class="anchor">#</a></h2><p>前<br>后 前<em>后</em> 前</p><p>后 &copy; &nbsp; İ中文😀</p><script>前后</script><a class="fn-back">↩</a>';
  assert.equal(plainText(html), '标题 前 后 前后 前 后 © İ中文😀');
  const root = parseFragment(html);
  const { text, positions } = collectText(root, htmlAdapter);
  const hits = findHits(text, parseTerms('前后'));
  assert.equal(hits.length, 1);
  const pieces = hitPieces(positions, ...hits[0]);
  assert.equal(pieces.map(({ node, start, end }) => node.value.slice(start, end)).join(''), '前后');
  assert.equal(pieces.length, 2);
  assert.deepEqual(findHits('İ中文😀', parseTerms('中文')), [[1, 3]]);
  assert.deepEqual(findHits('aaaa', parseTerms('aa a')), [[0, 2], [2, 4]]);
});

function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text, location: res.headers.location }));
    }).on('error', reject);
  });
}

test('预览服务器拒绝兄弟目录、编码越界及符号链接，支持子路径与重定向', async (t) => {
  const f = await fixture(t);
  await f.write('dist/index.html', '<body>home</body>');
  await f.write('dist/404.html', '<body>missing</body>');
  await f.write('dist/docs/index.html', '<body>docs</body>');
  await f.write('dist-backup/secret.txt', 'SECRET');
  await fs.symlink(path.join(f.root, 'dist-backup'), path.join(f.root, 'dist/leak'), 'dir');
  let base = '/';
  const server = createPreviewServer({ outDir: path.join(f.root, 'dist'), getBase: () => base });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const port = server.address().port;
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal((await request(port, '/')).status, 200);
  for (const p of ['/%2e%2e%2fdist-backup/secret.txt', '/leak/secret.txt', '/%00', '/bad%zz', '/%2e%2e%5cdist-backup/secret.txt']) {
    const res = await request(port, p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(res.text, /SECRET/);
  }
  base = '/blog/';
  assert.equal((await request(port, '/')).location, '/blog/');
  assert.equal((await request(port, '/blog')).location, '/blog/');
  assert.equal((await request(port, '/blog/docs?q=test')).location, '/blog/docs/?q=test');
  assert.equal((await request(port, '/blog/docs/')).status, 200);
  assert.equal((await request(port, '/blogger/')).status, 404);
});

test('开发预览在产物替换后保持空闲，真实内容变更仍会重建', { timeout: 15000 }, async (t) => {
  const f = await fixture(t);
  await f.write('posts/public.md', '# 文章');
  // dev 的 PORT 不接受 0；先取得一个当前可用的本机端口。
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ['lib/dev.js'], { cwd: f.root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill('SIGTERM');
      await done;
    }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  async function until(predicate) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (child.exitCode !== null || Date.now() > deadline) assert.fail(`预览状态未达到预期：${stdout}\n${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  const builds = () => (stdout.match(/✓ /g) || []).length;
  await until(() => stdout.includes('本地预览：'));
  await fs.rename(path.join(f.root, '.preview'), path.join(f.root, 'old-output'));
  await fs.rename(path.join(f.root, 'old-output'), path.join(f.root, '.preview'));
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(builds(), 1, stdout);
  await f.write('posts/public.md', '# 改过的文章\n\n保留<span>隐藏</span>正文');
  await until(() => builds() >= 2);
  await fs.appendFile(path.join(f.root, 'blog.config.js'), '\n// 配置已修改\n');
  await until(() => builds() >= 3);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(builds(), 3, stdout);
  assert.equal(stderr, '');
  assert.match((await request(port, '/posts/public/')).text, /改过的文章/);
  const indexBefore = JSON.parse((await request(port, '/search.json')).text);
  assert.equal(indexBefore[0].text, '保留隐藏正文');
  const rulesFile = path.join(f.root, 'theme/text.js');
  const rules = await fs.readFile(rulesFile, 'utf8');
  await fs.writeFile(rulesFile, rules.replace("'noscript'", "'noscript', 'span'"));
  await until(() => builds() >= 4);
  const indexAfter = JSON.parse((await request(port, '/search.json')).text);
  assert.equal(indexAfter[0].text, '保留正文');
  assert.match((await request(port, '/text.js')).text, /'noscript', 'span'/);
  assert.equal(stderr, '');
});
