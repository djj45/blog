/**
 * 极简 front matter 解析（YAML 的一个小子集，够写博客用）：
 *
 *   ---
 *   title: 标题
 *   date: 2026-10-15 21:30
 *   tags: [随笔, 工具]        # 行内数组
 *   draft: true               # 布尔值
 *   aliases:                  # 或者多行列表
 *     - a
 *     - b
 *   ---
 */
export function parseFrontMatter(src) {
  src = src.replace(/^﻿/, '');
  if (!/^---[ \t]*(?:\r?\n|$)/.test(src)) return { data: {}, body: src };
  const m = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(src);
  if (!m) throw new Error('front matter 缺少结束分隔符 ---');

  const data = Object.create(null);
  let listKey = null;
  for (const rawLine of m[1].split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const item = /^\s+-\s*(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      data[listKey].push(scalar(item[1]));
      continue;
    }

    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`不支持的 front matter 格式：${line.trim()}`);
    const [, key, value] = kv;
    if (Object.hasOwn(data, key)) throw new Error(`front matter 字段重复：${key}`);
    listKey = value.trim() === '' ? key : null;
    data[key] = value.trim() === '' ? '' : parseValue(value);
  }
  if (Object.hasOwn(data, 'draft') && typeof data.draft !== 'boolean') {
    throw new Error('front matter 的 draft 必须是布尔值 true 或 false（不能加引号）');
  }
  return { data, body: src.slice(m[0].length) };
}

function stripComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s:[,]/.test(value[i - 1]))) quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trimEnd();
  }
  return value;
}

function parseValue(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(scalar).filter((s) => s !== '');
  }
  return scalar(v);
}

function scalar(v) {
  v = v.trim();
  if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}
