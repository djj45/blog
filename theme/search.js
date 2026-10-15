// 站内搜索，两种用法：
//   1. 搜索页：读取构建时生成的 search.json，逐字匹配标题、标签和正文，
//      每篇文章列出几处命中的段落，点哪一处就跳到文章里的那个位置。
//   2. 文章页：网址带 ?q=关键词&i=第几处 时，高亮正文里所有命中，滚动到第 i 处，
//      右下角出现一个小条，可以上下切换或清除高亮。
// 多个关键词用空格分开；中文直接按字匹配，不需要分词。
(() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const parseTerms = (q) => [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];

  // 在小写文本里找出所有关键词的位置，按先后排序并去掉重叠，返回 [[开始, 结束], …]
  // 搜索页和文章页用同一套规则计数，所以“第 i 处”能一一对应
  function findHits(lower, terms) {
    const all = [];
    for (const t of terms) {
      for (let i = lower.indexOf(t); i > -1; i = lower.indexOf(t, i + t.length)) all.push([i, i + t.length]);
    }
    all.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const hits = [];
    let end = -1;
    for (const h of all) {
      if (h[0] >= end) {
        hits.push(h);
        end = h[1];
      }
    }
    return hits;
  }

  const params = new URLSearchParams(location.search);
  if (document.querySelector('.search')) searchPage();
  else if (params.get('q')?.trim()) highlightArticle(params.get('q'), Number(params.get('i')) || 0);

  /* ---------------- 搜索页 ---------------- */

  function searchPage() {
    const form = document.querySelector('.search');
    const input = form.querySelector('input');
    const status = document.querySelector('.search-status');
    const list = document.querySelector('.search-results');
    let index = null;

    input.value = params.get('q') || '';

    fetch(form.dataset.index)
      .then((res) => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then((data) => {
        index = data.map((d) => ({
          ...d,
          lowerTitle: d.title.toLowerCase(),
          lowerTags: d.tags.map((t) => t.toLowerCase()),
          lowerText: d.text.toLowerCase(),
        }));
        run();
      })
      .catch(() => {
        status.textContent = '搜索索引加载失败，请刷新页面重试。';
      });

    function run() {
      const q = input.value.trim();
      const url = new URL(location.href);
      if (q) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);

      list.innerHTML = '';
      if (!q) return void (status.textContent = '');
      if (!index) return void (status.textContent = '正在加载…');

      const terms = parseTerms(q);
      const results = [];
      for (const d of index) {
        let score = 0;
        for (const t of terms) {
          const inTitle = d.lowerTitle.includes(t);
          const inTags = d.lowerTags.some((g) => g.includes(t));
          const inText = d.lowerText.includes(t);
          if (!inTitle && !inTags && !inText) {
            score = 0;
            break;
          }
          score += (inTitle ? 10 : 0) + (inTags ? 5 : 0) + (inText ? 1 : 0);
        }
        if (!score) continue;
        const hits = findHits(d.lowerText, terms);
        results.push({ d, hits, score: score + Math.min(hits.length, 20) * 0.05 });
      }
      results.sort((a, b) => b.score - a.score || b.d.date.localeCompare(a.d.date));

      status.innerHTML = results.length
        ? `找到 ${results.length} 篇`
        : `没有找到包含「${esc(q)}」的文章。换个关键词，或者<a href="${esc(form.dataset.tags)}">按标签浏览</a>。`;

      list.innerHTML = results.map(({ d, hits }) => renderResult(d, hits, q, terms)).join('');
    }

    function renderResult(d, hits, q, terms) {
      const link = (i) => {
        const u = new URL(d.url, location.href);
        u.searchParams.set('q', q);
        if (i > 0) u.searchParams.set('i', i);
        return esc(u.pathname + u.search);
      };
      const title = `<a class="result-title" href="${hits.length ? link(0) : esc(d.url)}">${mark(d.title, findHits(d.lowerTitle, terms))}</a>`;

      // 每篇最多列 3 段；相邻的命中合并在同一段里
      const parts = [];
      for (let k = 0; k < hits.length && parts.length < 3; ) {
        const start = Math.max(0, hits[k][0] - 24);
        const end = Math.min(d.text.length, start + 100);
        const first = k;
        while (k < hits.length && hits[k][1] <= end) k++;
        if (k === first) k++;
        parts.push(
          `<a class="result-snippet" href="${link(first)}">${start > 0 ? '…' : ''}${mark(d.text, hits.slice(first, k), start, end)}${end < d.text.length ? '…' : ''}</a>`,
        );
      }
      if (!parts.length) {
        const end = Math.min(d.text.length, 100);
        parts.push(`<p class="result-snippet">${esc(d.text.slice(0, end))}${end < d.text.length ? '…' : ''}</p>`);
      }

      const meta = [
        hits.length > parts.length ? `<span>正文共 ${hits.length} 处匹配</span>` : '',
        d.date ? `<time>${d.date}</time>` : '',
        ...d.tags.map((t) => `<span>#${esc(t)}</span>`),
      ].join('');

      return `<li>\n  ${title}\n  ${parts.join('\n  ')}\n  ${meta ? `<small>${meta}</small>` : ''}\n</li>`;
    }

    // 截取 text[start, end)，给其中的命中套上 <mark>
    function mark(text, hits, start = 0, end = text.length) {
      let out = '';
      let pos = start;
      for (const [s, e] of hits) {
        if (s < pos || e > end) continue;
        out += `${esc(text.slice(pos, s))}<mark>${esc(text.slice(s, e))}</mark>`;
        pos = e;
      }
      return out + esc(text.slice(pos, end));
    }

    // 输入中文时，拼音还没选字不触发搜索
    input.addEventListener('input', (e) => e.isComposing || run());
    input.addEventListener('compositionend', run);
    // 回车直接打开第一条结果
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const first = list.querySelector('a');
      if (first) location.href = first.href;
    });
  }

  /* ---------------- 文章页：高亮并跳到命中位置 ---------------- */

  function highlightArticle(q, target) {
    const root = document.querySelector('.prose');
    if (!root) return;

    // 拼出正文纯文本（跳过标题旁的 # 和脚注返回箭头，与搜索索引一致）
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.anchor, .fn-back') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n; (n = walker.nextNode()); ) {
      nodes.push({ node: n, start: text.length, len: n.data.length });
      text += n.data;
    }

    const hits = findHits(text.toLowerCase(), parseTerms(q));
    if (!hits.length) return;

    // 从后往前包 <mark>，一处命中跨多个元素时会拆成几段
    const groups = hits.map(() => []);
    for (let h = hits.length - 1; h >= 0; h--) {
      const [s, e] = hits[h];
      for (let k = nodes.length - 1; k >= 0; k--) {
        const { node, start, len } = nodes[k];
        if (start >= e || start + len <= s) continue;
        const a = Math.max(s, start) - start;
        const b = Math.min(e, start + len) - start;
        const piece = a > 0 ? node.splitText(a) : node;
        if (b - a < piece.data.length) piece.splitText(b - a);
        const m = document.createElement('mark');
        m.className = 'hit';
        piece.parentNode.insertBefore(m, piece);
        m.appendChild(piece);
        groups[h].unshift(m);
      }
    }

    // 右下角的小条：第几处 / 共几处，上一处、下一处、清除
    const bar = document.createElement('div');
    bar.className = 'hit-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '文中搜索结果');
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    bar.innerHTML = `<span class="hit-term">${esc(q)}</span><span class="hit-count"></span>
      <button type="button" data-step="-1" aria-label="上一处">${icon('M6 15l6-6 6 6')}</button>
      <button type="button" data-step="1" aria-label="下一处">${icon('M6 9l6 6 6-6')}</button>
      <button type="button" data-close aria-label="清除高亮">${icon('M6 6l12 12M18 6L6 18')}</button>`;
    document.body.appendChild(bar);
    const count = bar.querySelector('.hit-count');

    let current = -1;
    function go(i, behavior) {
      groups[current]?.forEach((m) => m.classList.remove('hit-current'));
      current = (i + hits.length) % hits.length;
      const marks = groups[current];
      marks.forEach((m) => m.classList.add('hit-current'));
      for (let d = marks[0].closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
      marks[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior });
      count.textContent = `${current + 1} / ${hits.length}`;
    }

    function clear() {
      for (const m of root.querySelectorAll('mark.hit')) m.replaceWith(...m.childNodes);
      root.normalize();
      bar.remove();
      const url = new URL(location.href);
      url.searchParams.delete('q');
      url.searchParams.delete('i');
      history.replaceState(null, '', url);
    }

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.hasAttribute('data-close')) clear();
      else go(current + Number(btn.dataset.step), 'smooth');
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bar.isConnected) clear();
    });

    go(Math.min(Math.max(target, 0), hits.length - 1), 'instant');
  }
})();
