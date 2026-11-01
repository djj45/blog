import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { isWithin } from './output.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
};
const RELOAD_SCRIPT = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>`;

export function createPreviewServer({ outDir, getBase = () => '/', clients = new Set() }) {
  outDir = path.resolve(outDir);
  function send(res, status, file) {
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let data = fs.readFileSync(file);
    if (type.startsWith('text/html')) data = data.toString().replace('</body>', `${RELOAD_SCRIPT}\n</body>`);
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  }
  function safeFile(file) {
    // 检查词法路径及真实路径，不能通过 ../ 或符号链接读到输出目录外。
    if (!isWithin(outDir, file)) return null;
    try {
      const real = fs.realpathSync(file);
      return isWithin(fs.realpathSync(outDir), real) ? real : null;
    } catch { return null; }
  }
  function notFound(res) {
    const file = safeFile(path.join(outDir, '404.html'));
    if (file && fs.statSync(file).isFile()) return send(res, 404, file);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
  return http.createServer((req, res) => {
    try {
      const { pathname, search } = new URL(req.url, 'http://localhost');
      if (pathname === '/__reload') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      let p;
      try { p = decodeURIComponent(pathname); } catch { return notFound(res); }
      if (p.includes('\0') || p.includes('\\')) return notFound(res);
      const base = getBase();
      if (base !== '/') {
        if (`${p}/` === base || p === '/') {
          res.writeHead(302, { Location: encodeURI(base) });
          return res.end();
        }
        if (!p.startsWith(base)) return notFound(res);
        p = `/${p.slice(base.length)}`;
      }
      let file = path.join(outDir, p);
      const real = safeFile(file);
      if (!real) return notFound(res);
      if (fs.statSync(real).isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(301, { Location: `${pathname}/${search}` });
          return res.end();
        }
        file = path.join(file, 'index.html');
      }
      file = safeFile(file);
      if (!file || !fs.statSync(file).isFile()) return notFound(res);
      send(res, 200, file);
    } catch {
      if (!res.headersSent) notFound(res);
      else res.end();
    }
  });
}
