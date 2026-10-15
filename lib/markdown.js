/**
 * Markdown 渲染：markdown-it（CommonMark + 表格 + 删除线 + 自动链接）
 * 再加几个小插件补齐 GFM 常用功能：
 *   - 代码高亮（highlight.js，构建时完成，页面不需要 JS）
 *   - 任务列表  - [ ] / - [x]
 *   - 脚注      [^1]
 *   - 提示块    > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
 *   - 标题锚点 + 目录数据
 *   - 独占一段的图片 → <figure>，带 title 时生成图注
 *   - 站内 .md 链接自动改写为文章网址；/ 开头的地址自动加上 base
 */
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { escapeHtml, slugify } from './utils.js';

export function createMarkdown({ base = '/' } = {}) {
  const md = new MarkdownIt({
    html: true, // 允许内嵌 HTML（<details>、<kbd> 等）
    linkify: true, // 裸网址自动变链接
    typographer: false, // 不替换引号，避免影响中文标点
    highlight,
  });

  md.use(footnotes)
    .use(cjkBreaks)
    .use(taskLists)
    .use(alerts)
    .use(figures)
    .use(headingAnchors)
    .use(links, { base })
    .use(tables);

  return md;
}

/* ---------- 代码高亮 ---------- */

function highlight(code, lang) {
  const language = lang && hljs.getLanguage(lang) ? lang : '';
  const html = language
    ? hljs.highlight(code, { language, ignoreIllegals: true }).value
    : escapeHtml(code);
  const label = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
  return `<pre${label}><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${html}</code></pre>`;
}

/* ---------- 中文换行 ---------- */

// 段落内的单个回车在 HTML 里会变成空格，中文之间多出空格很难看：两侧都是中日韩字符时去掉
const CJK = /[⺀-鿿豈-﫿＀-￯]/;

function cjkBreaks(md) {
  md.renderer.rules.softbreak = (tokens, idx, opts) => {
    const before = tokens[idx - 1]?.content.slice(-1);
    const after = tokens[idx + 1]?.content.charAt(0);
    if (before && after && CJK.test(before) && CJK.test(after)) return '';
    return opts.breaks ? '<br>\n' : '\n';
  };
}

/* ---------- 标题锚点 & 目录 ---------- */

function headingAnchors(md) {
  md.core.ruler.push('heading_ids', (state) => {
    const used = new Map();
    const toc = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      const text = inlineText(tokens[i + 1]);
      let id = slugify(text) || 'section';
      const n = used.get(id) || 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      tokens[i].attrSet('id', id);
      const level = Number(tokens[i].tag.slice(1));
      if (level === 2 || level === 3) toc.push({ level, id, text });
    }
    state.env.toc = toc;
  });

  md.renderer.rules.heading_close = (tokens, idx) => {
    const id = tokens[idx - 2].attrGet('id');
    return `<a class="anchor" href="#${id}" aria-label="本节链接">#</a></${tokens[idx].tag}>\n`;
  };
}

function inlineText(inline) {
  return (inline.children || [])
    .filter((t) => t.type === 'text' || t.type === 'code_inline')
    .map((t) => t.content)
    .join('')
    .trim();
}

/* ---------- 任务列表 ---------- */

function taskLists(md) {
  md.core.ruler.push('task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline') continue;
      if (tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
      const first = inline.children?.[0];
      const m = first?.type === 'text' && /^\[([ xX])\](?:\s+|$)/.exec(first.content);
      if (!m) continue;

      first.content = first.content.slice(m[0].length);
      const box = new state.Token('html_inline', '', 0);
      box.content = `<input type="checkbox" disabled${m[1] === ' ' ? '' : ' checked'}>`;
      inline.children.unshift(box);

      const item = tokens[i - 2];
      item.attrJoin('class', 'task');
      for (let j = i - 3; j >= 0; j--) {
        const t = tokens[j];
        if ((t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && t.level === item.level - 1) {
          if (!(t.attrGet('class') || '').includes('tasks')) t.attrJoin('class', 'tasks');
          break;
        }
      }
    }
  });
}

/* ---------- GitHub 风格提示块 ---------- */

const ALERT_TITLES = { note: '备注', tip: '提示', important: '重要', warning: '警告', caution: '注意' };

function alerts(md) {
  md.core.ruler.push('alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open') continue;
      const inline = tokens[i + 2];
      const first = inline.children?.[0];
      const m = first?.type === 'text' && /^\[!(note|tip|important|warning|caution)\][ \t]*$/i.exec(first.content);
      if (!m) continue;

      tokens[i].meta = { ...tokens[i].meta, alert: m[1].toLowerCase() };
      inline.children.shift();
      if (inline.children[0]?.type === 'softbreak') inline.children.shift();
      if (!inline.children.length) tokens[i + 1].hidden = tokens[i + 3].hidden = true;
    }
  });

  const fallback = (tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts);
  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const type = tokens[idx].meta?.alert;
    if (!type) return fallback(tokens, idx, opts, env, self);
    return `<blockquote class="alert alert-${type}">\n<p class="alert-title">${ALERT_TITLES[type]}</p>\n`;
  };
}

/* ---------- 图片段落 → figure ---------- */

function figures(md) {
  md.core.ruler.push('figures', (state) => {
    const tokens = state.tokens;
    for (let i = 1; i < tokens.length - 1; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 1].hidden) continue;
      const kids = (inline.children || []).filter(
        (t) => !(t.type === 'text' && !t.content.trim()) && t.type !== 'softbreak',
      );
      if (kids.length !== 1 || kids[0].type !== 'image') continue;

      tokens[i - 1].tag = tokens[i + 1].tag = 'figure';
      const title = kids[0].attrGet('title');
      if (title) {
        const cap = new state.Token('html_inline', '', 0);
        cap.content = `<figcaption>${escapeHtml(title)}</figcaption>`;
        inline.children.push(cap);
      }
    }
  });
}

/* ---------- 链接与图片地址 ---------- */

function links(md, { base }) {
  const prefix = base.replace(/\/$/, '');

  const fix = (href, env) => {
    if (!href) return href;
    // /images/a.png → /base/images/a.png
    if (/^\/(?!\/)/.test(href)) return prefix + href;
    // ./other-post.md → 对应文章网址
    if (!/^([a-z][a-z\d+.-]*:|\/\/|#)/i.test(href) && env?.resolveMd) {
      const [p, hash] = href.split('#');
      if (/\.md$/i.test(p)) {
        const url = env.resolveMd(safeDecode(p));
        if (url) return url + (hash ? `#${hash}` : '');
      }
    }
    return href;
  };

  const render = (tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts);

  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const href = fix(t.attrGet('href'), env);
    t.attrSet('href', href);
    if (/^https?:\/\//i.test(href)) {
      t.attrSet('target', '_blank');
      t.attrSet('rel', 'noopener');
    }
    return render(tokens, idx, opts, env, self);
  };

  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    t.attrSet('src', fix(t.attrGet('src'), env));
    t.attrSet('loading', 'lazy');
    return image(tokens, idx, opts, env, self);
  };
}

function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/* ---------- 表格：外包一层，窄屏可横向滚动 ---------- */

function tables(md) {
  md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n';
  md.renderer.rules.table_close = () => '</table>\n</div>\n';
}

/* ---------- 脚注（[^label] 引用 + [^label]: 定义） ---------- */

function footnotes(md) {
  const { isSpace } = md.utils;

  // 块级：[^label]: 内容（后续缩进 4 格的行属于同一条脚注）
  function footnoteDef(state, startLine, endLine, silent) {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (start + 4 > max) return false;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */ || state.src.charCodeAt(start + 1) !== 0x5e /* ^ */) return false;

    let pos;
    for (pos = start + 2; pos < max; pos++) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 0x20) return false;
      if (ch === 0x5d /* ] */) break;
    }
    if (pos === start + 2) return false;
    if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 0x3a /* : */) return false;
    if (silent) return true;
    pos++;

    const fn = (state.env.footnotes ??= { refs: {}, list: [] });
    const label = state.src.slice(start + 2, pos - 2);
    fn.refs[`:${label}`] = -1;

    const open = new state.Token('footnote_reference_open', '', 1);
    open.meta = { label };
    open.level = state.level++;
    state.tokens.push(open);

    const oldBMark = state.bMarks[startLine];
    const oldTShift = state.tShift[startLine];
    const oldSCount = state.sCount[startLine];
    const oldParentType = state.parentType;

    const posAfterColon = pos;
    const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
    let offset = initial;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (!isSpace(ch)) break;
      offset += ch === 0x09 ? 4 - (offset % 4) : 1;
      pos++;
    }

    state.tShift[startLine] = pos - posAfterColon;
    state.sCount[startLine] = offset - initial;
    state.bMarks[startLine] = posAfterColon;
    state.blkIndent += 4;
    state.parentType = 'footnote';
    if (state.sCount[startLine] < state.blkIndent) state.sCount[startLine] += state.blkIndent;

    state.md.block.tokenize(state, startLine, endLine, true);

    state.parentType = oldParentType;
    state.blkIndent -= 4;
    state.tShift[startLine] = oldTShift;
    state.sCount[startLine] = oldSCount;
    state.bMarks[startLine] = oldBMark;

    const close = new state.Token('footnote_reference_close', '', -1);
    close.level = --state.level;
    state.tokens.push(close);
    return true;
  }

  // 行内：[^label]
  function footnoteRef(state, silent) {
    const max = state.posMax;
    const start = state.pos;
    const fn = state.env.footnotes;
    if (start + 3 > max || !fn) return false;
    if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5e) return false;

    let pos;
    for (pos = start + 2; pos < max; pos++) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 0x20 || ch === 0x0a) return false;
      if (ch === 0x5d) break;
    }
    if (pos === start + 2 || pos >= max) return false;
    pos++;

    const label = state.src.slice(start + 2, pos - 1);
    if (fn.refs[`:${label}`] === undefined) return false;

    if (!silent) {
      let id = fn.refs[`:${label}`];
      if (id < 0) {
        id = fn.list.length;
        fn.list[id] = { label, count: 0 };
        fn.refs[`:${label}`] = id;
      }
      const token = state.push('footnote_ref', '', 0);
      token.meta = { id, subId: fn.list[id].count++ };
    }
    state.pos = pos;
    state.posMax = max;
    return true;
  }

  // 把脚注定义从正文里摘出来，按引用顺序附到文末
  function footnoteTail(state) {
    const fn = state.env.footnotes;
    if (!fn) return;

    const bodies = {};
    let current = null;
    let label = null;
    state.tokens = state.tokens.filter((t) => {
      if (t.type === 'footnote_reference_open') {
        current = [];
        label = t.meta.label;
        return false;
      }
      if (t.type === 'footnote_reference_close') {
        bodies[`:${label}`] = current;
        current = null;
        return false;
      }
      if (current) current.push(t);
      return !current;
    });

    if (!fn.list.length) return;
    state.tokens.push(new state.Token('footnote_block_open', '', 1));
    fn.list.forEach((item, id) => {
      const open = new state.Token('footnote_open', '', 1);
      open.meta = { id };
      state.tokens.push(open, ...(bodies[`:${item.label}`] || []));

      const last = state.tokens[state.tokens.length - 1];
      const para = last.type === 'paragraph_close' ? state.tokens.pop() : null;
      for (let subId = 0; subId < Math.max(item.count, 1); subId++) {
        const anchor = new state.Token('footnote_anchor', '', 0);
        anchor.meta = { id, subId };
        state.tokens.push(anchor);
      }
      if (para) state.tokens.push(para);
      state.tokens.push(new state.Token('footnote_close', '', -1));
    });
    state.tokens.push(new state.Token('footnote_block_close', '', -1));
  }

  md.block.ruler.before('reference', 'footnote_def', footnoteDef, { alt: ['paragraph', 'reference'] });
  md.inline.ruler.after('image', 'footnote_ref', footnoteRef);
  md.core.ruler.after('inline', 'footnote_tail', footnoteTail);

  const refId = ({ id, subId }) => `fnref-${id + 1}${subId > 0 ? `-${subId}` : ''}`;
  const r = md.renderer.rules;
  r.footnote_ref = (tokens, idx) => {
    const { id } = tokens[idx].meta;
    return `<sup class="fn-ref"><a href="#fn-${id + 1}" id="${refId(tokens[idx].meta)}">${id + 1}</a></sup>`;
  };
  r.footnote_block_open = () => '<section class="footnotes" aria-label="脚注">\n<ol>\n';
  r.footnote_block_close = () => '</ol>\n</section>\n';
  r.footnote_open = (tokens, idx) => `<li id="fn-${tokens[idx].meta.id + 1}">`;
  r.footnote_close = () => '</li>\n';
  r.footnote_anchor = (tokens, idx) =>
    ` <a href="#${refId(tokens[idx].meta)}" class="fn-back" aria-label="返回正文">↩︎</a>`;
}
