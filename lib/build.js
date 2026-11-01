/**
 * 构建：posts/ + pages/ + static/ + theme/ → dist/
 *
 *   node lib/build.js                 输出到 dist/
 *   node lib/build.js --drafts        连草稿一起构建
 *   node lib/build.js --out <目录>     指定输出目录
 */
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMarkdown } from './markdown.js';
import { parseFrontMatter } from './frontmatter.js';
import { ROOT, escapeHtml, slugify, uniqueId, parseDate, formatDate, argValue } from './utils.js';
import { assertSafeOutput, isWithin, OutputPlan } from './output.js';
import { createPlainText } from './text.js';

const r = (...p) => path.join(ROOT, ...p);

/** 每次都重新 import（带时间戳），开发时改配置 / 模板无需重启 */
const freshImport = (file) => import(`${pathToFileURL(file).href}?t=${Date.now()}`);

async function loadConfig() {
  const user = existsSync(r('blog.config.js')) ? (await freshImport(r('blog.config.js'))).default : {};
  const config = {
    title: '我的博客',
    description: '',
    author: '',
    base: '/',
    lang: 'zh-CN',
    nav: [],
    footer: '',
    ...user,
  };
  config.base = `/${config.base}/`.replace(/\/+/g, '/');
  if (!/^\/(?:[^?#\\\s/]+\/)*$/.test(config.base) || config.base.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('base 必须是站内目录路径，例如 / 或 /blog/');
  }
  if (config.siteUrl) {
    const site = new URL(config.siteUrl);
    if (!/^https?:$/.test(site.protocol) || site.username || site.password || site.search || site.hash || site.pathname !== '/') {
      throw new Error('siteUrl 必须是完整域名地址，例如 https://example.com；子路径请使用 base');
    }
    config.siteUrl = site.origin;
  }
  return config;
}

/** 读取 posts/ 或 pages/：支持 foo.md，或 foo/index.md（同目录可放图片等附件） */
async function collect(dir) {
  const abs = r(dir);
  if (!existsSync(abs)) return [];
  const items = [];
  for (const ent of await fs.readdir(abs, { withFileTypes: true })) {
    if (/^[._]/.test(ent.name)) continue; // 以 . 或 _ 开头的文件忽略
    if (ent.isDirectory()) {
      const file = path.join(abs, ent.name, 'index.md');
      if (existsSync(file)) items.push(await readSource(file, ent.name, path.join(abs, ent.name)));
    } else if (/\.md$/i.test(ent.name)) {
      items.push(await readSource(path.join(abs, ent.name), ent.name.replace(/\.md$/i, ''), null));
    }
  }
  return items;
}

async function readSource(file, name, assetsDir) {
  let parsed;
  try {
    parsed = parseFrontMatter(await fs.readFile(file, 'utf8'));
  } catch (err) {
    throw new Error(`${path.relative(ROOT, file)}：${err.message}`, { cause: err });
  }
  const { data, body: raw } = parsed;
  if (data.imageLoading !== undefined && !['lazy', 'eager'].includes(data.imageLoading)) {
    throw new Error(`${file}：imageLoading 必须是 lazy 或 eager`);
  }
  let body = raw;

  // 正文开头的 # 一级标题作为文章标题（front matter 的 title 优先）
  let title = data.title ? String(data.title) : '';
  const h1 = /^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/.exec(body);
  if (h1) {
    title ||= h1[1];
    body = body.slice(h1[0].length);
  }

  // 文件名可带日期前缀：2026-10-15-hello.md
  const prefixed = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(name);
  const slug = slugify(data.slug || (prefixed ? prefixed[2] : name)) || 'untitled';
  const date = parseDate(data.date) || (prefixed && parseDate(prefixed[1])) || (await fs.stat(file)).mtime;

  return {
    file,
    assetsDir,
    slug,
    title: title || slug,
    date,
    dateStr: formatDate(date),
    tags: normalizeTags(data.tags),
    description: typeof data.description === 'string' ? data.description : '',
    draft: data.draft === true,
    showToc: data.toc === true,
    body,
    data,
  };
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(/[,，]/);
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
}

function excerpt(html, plainText, max = 120) {
  const m = /<p>([\s\S]*?)<\/p>/.exec(html);
  if (!m) return '';
  const text = plainText(m[1]);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function build({ outDir = r('dist'), drafts = false, quiet = false } = {}) {
  const t0 = performance.now();
  outDir = await assertSafeOutput(outDir);
  const config = await loadConfig();
  const theme = await freshImport(r('theme', 'layout.js'));
  const md = createMarkdown({ base: config.base });

  // 1. 收集
  let posts = await collect('posts');
  if (!drafts) posts = posts.filter((p) => !p.draft);
  posts.sort((a, b) => b.date - a.date);
  let pages = await collect('pages');
  if (!drafts) pages = pages.filter((p) => !p.draft);

  posts.forEach((p) => (p.path = `posts/${p.slug}/`));
  pages.forEach((p) => (p.path = `${p.slug}/`));
  const all = [...posts, ...pages];

  const plan = new OutputPlan();
  const write = (rel, content, owner = `内置页面 ${rel}`) => plan.add(rel, { content, owner });
  // 首先登记生成文件，再登记所有静态文件和附件；不允许任何来源互相覆盖。
  const generated = ['index.html', 'tags/index.html', 'search/index.html', '404.html', 'search.json', 'sitemap.xml'];
  for (const rel of generated) write(rel, '');
  for (const p of all) {
    write(`${p.path}index.html`, '', p.file);
  }
  await plan.copyTree(r('static'));
  for (const name of await fs.readdir(r('theme'))) {
    if (name === 'layout.js' || /^[._]/.test(name)) continue;
    const source = r('theme', name);
    const stat = await fs.lstat(source);
    if (stat.isSymbolicLink()) throw new Error(`资源不能是符号链接：${source}`);
    if (stat.isDirectory()) await plan.copyTree(source, `${name}/`);
    else plan.add(name, { source, owner: source });
  }
  for (const p of all) {
    if (p.assetsDir) await plan.copyTree(p.assetsDir, p.path, { markdown: true });
  }

  // 将脚本/样式固定为本次构建的快照，索引和浏览器必须使用相同的规则字节。
  const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 16);
  const versions = new Map();
  for (const [rel, entry] of plan.files) {
    if (entry.source && /\.(?:css|js)$/i.test(rel)) {
      entry.content = await fs.readFile(entry.source);
      delete entry.source;
      versions.set(rel, hash(entry.content));
    }
  }
  // text.js 是无依赖的共享模块；按源码加载，既避开文件模块缓存，也避免读取期间的版本错配。
  const rules = plan.files.get('text.js').content;
  const { collectText } = await import(`data:text/javascript;base64,${rules.toString('base64')}`);
  const plainText = createPlainText(collectText);

  // 2. 渲染 Markdown
  const url = (p = '') => (/^([a-z][a-z\d+.-]*:|\/\/|#)/i.test(p) ? p : config.base + String(p).replace(/^\//, ''));
  const byFile = new Map(all.map((p) => [p.file, p]));
  for (const p of all) {
    const env = {
      resolveMd: (rel) => {
        const source = rel.startsWith('/') ? path.resolve(ROOT, `.${rel}`) : path.resolve(path.dirname(p.file), rel);
        if (!isWithin(ROOT, source)) return null;
        const target = byFile.get(source);
        return target ? url(target.path) : null;
      },
      imageLoading: p.data.imageLoading,
      imageSize: (src) => {
        if (!src || /^([a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return null;
        let pathname;
        try { pathname = decodeURIComponent(src.split(/[?#]/)[0]); } catch { return null; }
        if (config.base !== '/' && pathname.startsWith(config.base)) pathname = `/${pathname.slice(config.base.length)}`;
        const rel = pathname.startsWith('/') ? pathname.slice(1) : path.posix.normalize(p.path + pathname);
        const file = plan.files.get(rel)?.source;
        if (!file) return null;
        try {
          const size = imageSize(readFileSync(file));
          return size.width > 0 && size.height > 0 ? size : null;
        } catch { return null; } // 不支持的格式或损坏图片仍按原地址输出
      },
    };
    try {
      p.html = md.render(p.body, env);
    } catch (err) {
      throw new Error(`${path.relative(ROOT, p.file)}：${err.message}`, { cause: err });
    }
    p.toc = p.showToc ? env.toc : [];
    p.description ||= excerpt(p.html, plainText);
  }
  posts.forEach((p, i) => {
    p.newer = posts[i - 1];
    p.older = posts[i + 1];
  });

  // 3. 模板、索引和 sitemap 仍在内存里生成；所有步骤成功后才替换产物。
  const index = all.map((p) => ({
    title: p.title,
    url: url(p.path),
    date: posts.includes(p) ? p.dateStr : '',
    tags: p.tags,
    text: plainText(p.html),
  }));
  plan.files.get('search.json').content = JSON.stringify(index);
  versions.set('search.json', hash(plan.files.get('search.json').content));
  // ES module 的传递依赖也使用内容哈希，避免 search.js 更新后仍加载旧 text.js。
  const searchScript = plan.files.get('search.js');
  if (searchScript?.content && versions.has('text.js')) {
    const content = searchScript.content.toString().replace("'./text.js'", `'./text.js?v=${versions.get('text.js')}'`);
    searchScript.content = content;
    versions.set('search.js', hash(content));
  }
  const tags = new Map();
  for (const p of posts) for (const t of p.tags) (tags.get(t) || tags.set(t, []).get(t)).push(p);
  const tagList = [...tags].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh'));
  const usedTags = new Set();
  const tagIds = new Map(tagList.map(([t]) => [t, uniqueId(usedTags, t.trim().replace(/\s+/g, '-') || 'tag')]));
  const tagId = (t) => tagIds.get(t);
  const ctx = {
    site: config,
    url,
    esc: escapeHtml,
    tagId,
    tagUrl: (t) => `${url('tags/')}#${encodeURIComponent(tagId(t))}`,
    asset: (p) => `${url(p)}?v=${versions.get(p) || ''}`,
    canonical: (p) => config.siteUrl ? new URL(url(p), config.siteUrl).href : '',
  };

  const render = (rel, content) => { plan.files.get(rel).content = content; };
  for (const p of posts) render(`${p.path}index.html`, theme.post(ctx, p));
  for (const p of pages) render(`${p.path}index.html`, theme.page(ctx, p));
  render('index.html', theme.home(ctx, posts));
  render('tags/index.html', theme.tags(ctx, tagList));
  render('search/index.html', theme.search(ctx));
  render('404.html', theme.notFound(ctx));
  if (config.siteUrl) {
    const urls = ['', 'tags/', ...all.filter((p) => !p.draft).map((p) => p.path)];
    render('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${escapeHtml(ctx.canonical(p))}</loc></url>`).join('\n')}\n</urlset>\n`);
  } else plan.files.delete('sitemap.xml');
  await plan.publish(outDir);

  if (!quiet) {
    const ms = Math.round(performance.now() - t0);
    console.log(`✓ ${posts.length} 篇文章，${pages.length} 个页面 → ${path.relative(process.cwd(), outDir) || '.'}（${ms} ms）`);
  }
  return { config, posts, pages };
}

/* ---------- 命令行入口 ---------- */

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const out = argValue('--out');
  build({ outDir: out ? path.resolve(out) : undefined, drafts: process.argv.includes('--drafts') }).catch((err) => {
    console.error(`✗ 构建失败：${err.message}`);
    process.exit(1);
  });
}
