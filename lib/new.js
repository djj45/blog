/**
 * 新建文章
 *
 *   npm run new "文章标题"              → posts/文章标题.md
 *   npm run new "文章标题" my-post      → posts/my-post.md（自定义网址）
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, slugify, formatDateTime } from './utils.js';

const [title, slugArg] = process.argv.slice(2);
if (!title) {
  console.log('用法：npm run new "文章标题" [网址名]');
  process.exit(1);
}

const slug = slugify(slugArg || title);
if (!slug) {
  console.error('✗ 无法从标题生成文件名，请在标题后面再写一个英文网址名');
  process.exit(1);
}

const dir = path.join(ROOT, 'posts');
const file = path.join(dir, `${slug}.md`);
if (fs.existsSync(file)) {
  console.error(`✗ 已存在：${path.relative(ROOT, file)}`);
  process.exit(1);
}

const safeTitle = /^[\s"'[{>|*&!%#@`-]|:\s|\s#/.test(title) ? JSON.stringify(title) : title;
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, `---\ntitle: ${safeTitle}\ndate: ${formatDateTime(new Date())}\ntags: []\n---\n\n`);
console.log(`✓ 已创建 ${path.relative(ROOT, file)}`);
