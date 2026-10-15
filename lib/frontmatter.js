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
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { data: {}, body: src };

  const data = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const item = /^\s+-\s*(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      data[listKey].push(scalar(item[1]));
      continue;
    }

    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    listKey = value.trim() === '' ? key : null;
    data[key] = value.trim() === '' ? '' : parseValue(value);
  }
  return { data, body: src.slice(m[0].length) };
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
