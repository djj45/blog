import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 项目根目录 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** 标题 / 文件名 → URL 友好的 slug，保留中文等 Unicode 字母 */
export function slugify(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

const pad = (n) => String(n).padStart(2, '0');

/** 解析 2026-10-15 / 2026-10-15 21:30 / 2026-10-15T21:30:00，按本地时间 */
export function parseDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v ?? '').trim());
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

export const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const formatDateTime = (d) => `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 读取 --key value 形式的命令行参数 */
export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
