// 构建端（parse5）和浏览器共用的正文提取、空白归一化和命中算法。
// 保持模块无依赖，构建器从与浏览器相同的源码快照加载规则。
const BLOCK = new Set('address article aside blockquote br caption dd details div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul'.split(' '));
const SKIP = new Set(['script', 'style', 'template', 'noscript']);
const domAdapter = {
  tag: (node) => node.nodeType === 1 ? node.localName : '',
  text: (node) => node.nodeType === 3 ? node.data : null,
  children: (node) => node.childNodes || [],
  classes: (node) => node.nodeType === 1 ? node.getAttribute('class') || '' : '',
};

export function collectText(root, adapter = domAdapter, mapPositions = true) {
  let text = '';
  const positions = [];
  let pending = null;
  function space(position = null) {
    if (text && pending === null) pending = { position };
  }
  function visit(node) {
    const tag = adapter.tag(node);
    if (SKIP.has(tag) || /(?:^|\s)(?:anchor|fn-back)(?:\s|$)/.test(adapter.classes(node))) return;
    if (BLOCK.has(tag)) space();
    const value = adapter.text(node);
    if (value !== null) {
      for (let i = 0; i < value.length; i++) {
        if (/\s/u.test(value[i])) space({ node, offset: i });
        else {
          if (pending) {
            text += ' ';
            if (mapPositions) positions.push(pending.position);
            pending = null;
          }
          text += value[i];
          if (mapPositions) positions.push({ node, offset: i });
        }
      }
    } else {
      for (const child of adapter.children(node)) visit(child);
    }
    if (BLOCK.has(tag)) space();
  }
  visit(root);
  return { text, positions };
}

export const parseTerms = (q) => [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];

// Unicode 小写可能增加字符数（如 İ），将命中偏移还原到原始 UTF-16 文本。
export function findHits(text, terms) {
  const lower = text.toLowerCase();
  const starts = [];
  const ends = [];
  let offset = 0;
  for (const ch of text) {
    const folded = ch.toLowerCase();
    for (let i = 0; i < folded.length; i++) {
      starts.push(offset);
      ends.push(offset + ch.length);
    }
    offset += ch.length;
  }
  const all = [];
  for (const term of terms) {
    if (!term) continue;
    for (let i = lower.indexOf(term); i !== -1; i = lower.indexOf(term, i + term.length)) {
      all.push([starts[i], ends[i + term.length - 1]]);
    }
  }
  all.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const hits = [];
  let end = -1;
  for (const hit of all) {
    if (hit[0] >= end) {
      hits.push(hit);
      end = hit[1];
    }
  }
  return hits;
}

export function hitPieces(positions, start, end) {
  const pieces = [];
  for (let i = start; i < end; i++) {
    const point = positions[i];
    if (!point) continue;
    const last = pieces.at(-1);
    if (last?.node === point.node && last.end === point.offset) last.end++;
    else pieces.push({ node: point.node, start: point.offset, end: point.offset + 1 });
  }
  return pieces;
}
