import { parseFragment } from 'parse5';

export const htmlAdapter = {
  tag: (node) => node.tagName || '',
  text: (node) => node.nodeName === '#text' ? node.value : null,
  children: (node) => node.childNodes || [],
  classes: (node) => node.attrs?.find((attr) => attr.name === 'class')?.value || '',
};

// 由本次构建注入共享规则，避免静态 import 在开发进程中缓存旧版本。
export function createPlainText(collectText) {
  return (html) => collectText(parseFragment(html), htmlAdapter, false).text;
}
