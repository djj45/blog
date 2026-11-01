/**
 * 本地预览：构建（含草稿）→ 起一个静态服务器 → 文件变动自动重建并刷新浏览器
 *
 *   npm run dev                 默认 http://127.0.0.1:4000
 *   PORT=8080 npm run dev       换端口
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from './build.js';
import { createPreviewServer } from './preview.js';
import { assertSafeOutput } from './output.js';
import { ROOT, argValue } from './utils.js';

const outDir = await assertSafeOutput(path.resolve(argValue('--out') || path.join(ROOT, '.preview')));
const WATCH = ['posts', 'pages', 'static', 'theme', 'blog.config.js'];
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

const server = createPreviewServer({ outDir, getBase: () => base, clients });

/* ---------- 启动 ---------- */

await rebuild();

let timer;
for (const name of WATCH) {
  const target = path.join(ROOT, name);
  if (!fs.existsSync(target)) continue;
  const recursive = fs.statSync(target).isDirectory();
  let previous = recursive ? null : fs.readFileSync(target);
  fs.watch(target, { recursive }, (event, filename) => {
    // macOS 可能把同级产物目录的替换误报给文件 watcher；只在配置内容变化时重建。
    if (!recursive) {
      const next = fs.existsSync(target) ? fs.readFileSync(target) : null;
      if ((!next && !previous) || (next && previous && next.equals(previous))) return;
      previous = next;
    }
    clearTimeout(timer);
    const changed = filename ? path.join(name, String(filename)) : name;
    timer = setTimeout(() => rebuild(changed), 80);
  });
}

let port = Number(process.env.PORT) || 4000;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT) {
    server.listen(++port, '127.0.0.1');
  } else {
    console.error(err.message);
    process.exit(1);
  }
});
server.on('listening', () => {
  console.log(`\n  本地预览：http://127.0.0.1:${port}${base}\n  保存文件会自动刷新，Ctrl+C 退出\n`);
});
server.listen(port, '127.0.0.1');
