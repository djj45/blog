/**
 * 本地预览：构建（含草稿）→ 起一个静态服务器 → 文件变动自动重建并刷新浏览器
 *
 *   npm run dev                 默认 http://localhost:4000
 *   PORT=8080 npm run dev       换端口
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { build } from './build.js';
import { ROOT, argValue } from './utils.js';

const outDir = path.resolve(argValue('--out') || path.join(ROOT, '.preview'));
const WATCH = ['posts', 'pages', 'static', 'theme', 'blog.config.js'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
};
const RELOAD_SCRIPT = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>`;

let base = '/';
const clients = new Set();

/* ---------- 构建（变动合并，避免并发） ---------- */

let building = false;
let queued = false;
async function rebuild(reason) {
  if (building) return void (queued = true);
  building = true;
  try {
    if (reason) process.stdout.write(`↻ ${reason}  `);
    const { config } = await build({ outDir, drafts: true });
    base = config.base;
    for (const res of clients) res.write('data: reload\n\n');
  } catch (err) {
    console.error(`✗ 构建失败：${err.message}`);
  } finally {
    building = false;
    if (queued) {
      queued = false;
      rebuild();
    }
  }
}

/* ---------- 静态服务器 ---------- */

function send(res, status, file) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  let data = fs.readFileSync(file);
  if (type.startsWith('text/html')) data = data.toString().replace('</body>', `${RELOAD_SCRIPT}\n</body>`);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}

function notFound(res) {
  const page = path.join(outDir, '404.html');
  if (fs.existsSync(page)) return send(res, 404, page);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

const server = http.createServer((req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost');

  if (pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return notFound(res);
  }

  // 配置了子路径 base 时，去掉前缀再找文件
  if (base !== '/') {
    if (`${p}/` === base || p === '/') {
      res.writeHead(302, { Location: encodeURI(base) });
      return res.end();
    }
    if (!p.startsWith(base)) return notFound(res);
    p = `/${p.slice(base.length)}`;
  }

  let file = path.join(outDir, p);
  if (!file.startsWith(outDir)) return notFound(res);

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/${search}` });
      return res.end();
    }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(res);
  send(res, 200, file);
});

/* ---------- 启动 ---------- */

await rebuild();

let timer;
for (const name of WATCH) {
  const target = path.join(ROOT, name);
  if (!fs.existsSync(target)) continue;
  const recursive = fs.statSync(target).isDirectory();
  fs.watch(target, { recursive }, (event, filename) => {
    clearTimeout(timer);
    const changed = filename ? path.join(name, String(filename)) : name;
    timer = setTimeout(() => rebuild(changed), 80);
  });
}

let port = Number(process.env.PORT) || 4000;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT) {
    server.listen(++port);
  } else {
    console.error(err.message);
    process.exit(1);
  }
});
server.on('listening', () => {
  console.log(`\n  本地预览：http://localhost:${port}${base}\n  保存文件会自动刷新，Ctrl+C 退出\n`);
});
server.listen(port);
