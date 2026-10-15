/**
 * 构建：posts/ + pages/ + static/ + theme/ → dist/
 *
 *   node lib/build.js                 输出到 dist/
 *   node lib/build.js --drafts        连草稿一起构建
 *   node lib/build.js --out <目录>     指定输出目录
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMarkdown } from './markdown.js';
import { parseFrontMatter } from './frontmatter.js';
import { ROOT, escapeHtml, slugify, parseDate, formatDate, argValue } from './utils.js';

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
  const { data, body: raw } = parseFrontMatter(await fs.readFile(file, 'utf8'));
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

function excerpt(html, max = 120) {
  const m = /<p>([\s\S]*?)<\/p>/.exec(html);
  if (!m) return '';
  const text = decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });
}

/** 渲染后的 HTML → 纯文本，供搜索用。块级标签换成空格，行内标签直接去掉（避免把中文词拆开） */
const BLOCK_TAGS = /<\/?(?:p|li|ol|ul|h[1-6]|pre|blockquote|table|thead|tbody|tr|td|th|figure|figcaption|div|section|details|summary|br|hr)\b[^>]*>/gi;
function plainText(html) {
  return decodeEntities(
    html
      .replace(/<a class="anchor"[^>]*>#<\/a>/g, '')
      .replace(/<a [^>]*class="fn-back"[^>]*>[\s\S]*?<\/a>/g, '')
      .replace(BLOCK_TAGS, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export async function build({ outDir = r('dist'), drafts = false, quiet = false } = {}) {
  const t0 = performance.now();
  const config = await loadConfig();
  const theme = await freshImport(r('theme', 'layout.js'));
  const md = createMarkdown({ base: config.base });

  // 1. 收集
  let posts = await collect('posts');
  if (!drafts) posts = posts.filter((p) => !p.draft);
  posts.sort((a, b) => b.date - a.date);
  const pages = await collect('pages');

  posts.forEach((p) => (p.path = `posts/${p.slug}/`));
  pages.forEach((p) => (p.path = `${p.slug}/`));
  const all = [...posts, ...pages];

  const taken = new Map();
  for (const p of all) {
    if (taken.has(p.path)) {
      throw new Error(`网址冲突：${path.relative(ROOT, p.file)} 与 ${path.relative(ROOT, taken.get(p.path).file)} 都生成 /${p.path}`);
    }
    taken.set(p.path, p);
  }

  // 2. 渲染 Markdown
  const url = (p = '') => (/^([a-z][a-z\d+.-]*:|\/\/|#)/i.test(p) ? p : config.base + String(p).replace(/^\//, ''));
  const byFile = new Map(all.map((p) => [p.file, p]));
  for (const p of all) {
    const env = {
      resolveMd: (rel) => {
        const target = byFile.get(path.resolve(path.dirname(p.file), rel));
        return target ? url(target.path) : null;
      },
    };
    p.html = md.render(p.body, env);
    p.toc = p.showToc ? env.toc : [];
    p.description ||= excerpt(p.html);
  }
  posts.forEach((p, i) => {
    p.newer = posts[i - 1];
    p.older = posts[i + 1];
  });

  // 3. 写文件
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  if (existsSync(r('static'))) await fs.cp(r('static'), outDir, { recursive: true });
  // theme/ 里除模板外的文件（样式、脚本）复制到网站根目录
  for (const name of await fs.readdir(r('theme'))) {
    if (name !== 'layout.js' && !/^[._]/.test(name)) await fs.cp(r('theme', name), path.join(outDir, name), { recursive: true });
  }
  for (const p of all) {
    if (p.assetsDir) {
      await fs.cp(p.assetsDir, path.join(outDir, p.path), {
        recursive: true,
        filter: (src) => !/\.md$/i.test(src) && !/(^|[\\/])[._][^\\/]*$/.test(path.relative(p.assetsDir, src)),
      });
    }
  }

  const write = async (rel, content) => {
    const file = path.join(outDir, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  const tagId = (t) => t.trim().replace(/\s+/g, '-');
  const ctx = {
    site: config,
    url,
    esc: escapeHtml,
    tagId,
    tagUrl: (t) => `${url('tags/')}#${encodeURIComponent(tagId(t))}`,
    version: Date.now().toString(36),
  };

  const tags = new Map();
  for (const p of posts) for (const t of p.tags) (tags.get(t) || tags.set(t, []).get(t)).push(p);
  const tagList = [...tags].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh'));

  for (const p of posts) await write(`${p.path}index.html`, theme.post(ctx, p));
  for (const p of pages) await write(`${p.path}index.html`, theme.page(ctx, p));
  await write('index.html', theme.home(ctx, posts));
  await write('tags/index.html', theme.tags(ctx, tagList));
  await write('search/index.html', theme.search(ctx));
  await write('404.html', theme.notFound(ctx));

  // 搜索索引：标题、网址、日期、标签、正文纯文本
  const index = [...posts, ...pages].map((p) => ({
    title: p.title,
    url: url(p.path),
    date: posts.includes(p) ? p.dateStr : '',
    tags: p.tags,
    text: plainText(p.html),
  }));
  await write('search.json', JSON.stringify(index));

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
