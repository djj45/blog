/**
 * 页面模板 —— 每个函数返回一段完整 HTML。直接改这里就能调整页面结构。
 *
 * ctx = {
 *   site:    blog.config.js 里的配置
 *   url(p):  站内路径 → 带 base 的网址，如 url('tags/') → '/tags/'
 *   esc(s):  HTML 转义
 *   tagUrl(t) / tagId(t): 标签页链接 / 锚点
 * }
 */

// 夜间模式：默认跟随系统；点按钮切换并记住。切到与系统一致的模式时清除记录，恢复跟随系统。
// 放在 <head> 里同步执行，避免页面先闪一下浅色。
const THEME_SCRIPT = `<script>
  (() => {
    const root = document.documentElement;
    const dark = matchMedia('(prefers-color-scheme: dark)');
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch {}
    const apply = () => (root.dataset.theme = saved || (dark.matches ? 'dark' : 'light'));
    apply();
    dark.addEventListener('change', () => saved || apply());
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-toggle')) return;
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      saved = next === (dark.matches ? 'dark' : 'light') ? null : next;
      try { saved ? localStorage.setItem('theme', saved) : localStorage.removeItem('theme'); } catch {}
      apply();
    });
  })();
  </script>`;

const THEME_BUTTON = `<button class="theme-toggle" type="button" aria-label="切换夜间模式" title="切换夜间模式">
        <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6z"/></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>
      </button>`;

function layout(ctx, { title, description, path = '', body, scripts = [], article = null, noindex = false }) {
  const { site, url, esc } = ctx;
  const here = url(path);
  const canonical = noindex ? '' : ctx.canonical(path);
  const pageTitle = title ? `${title} - ${site.title}` : site.title;
  const summary = description || site.description;
  const nav = site.nav
    .map((n) => {
      const href = url(n.link);
      const current = href === here ? ' aria-current="page"' : '';
      return `<a href="${esc(href)}"${current}>${esc(n.text)}</a>`;
    })
    .join('\n      ');

  // 页脚：版权 + 备案号（blog.config.js 里的 icp / police）
  const police = site.police
    ? `<a href="https://beian.mps.gov.cn/#/query/webSearch?code=${esc(site.police.replace(/\D/g, ''))}" target="_blank" rel="noopener">${
        site.policeIcon ? `<img src="${url(site.policeIcon)}" alt="" width="18" height="20">` : ''
      }${esc(site.police)}</a>`
    : '';
  const footer = [
    site.footer && `<span>${site.footer}</span>`,
    site.icp && `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${esc(site.icp)}</a>`,
    police,
  ]
    .filter(Boolean)
    .join('\n    ');

  return `<!doctype html>
<html lang="${esc(site.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(summary)}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
  ${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n  <meta property="og:url" content="${esc(canonical)}">` : ''}
  <meta property="og:type" content="${article ? 'article' : 'website'}">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(summary)}">
  <meta property="og:site_name" content="${esc(site.title)}">
  <meta property="og:locale" content="${esc(site.lang.replace('-', '_'))}">
  ${article ? `<meta property="article:published_time" content="${esc(article.date.toISOString())}">` : ''}
  ${site.author ? `<meta name="author" content="${esc(site.author)}">` : ''}
  ${THEME_SCRIPT}
  <link rel="stylesheet" href="${esc(ctx.asset('style.css'))}">
  <link rel="icon" href="${url('favicon.svg')}" type="image/svg+xml">
  ${scripts.map((s) => `<script src="${esc(ctx.asset(s))}" ${s === 'search.js' ? 'type="module"' : 'defer'}></script>`).join('\n  ')}
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="${url()}">${esc(site.title)}</a>
    <nav>
      ${nav}
      ${THEME_BUTTON}
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer class="site-footer">
    ${footer}
  </footer>
</body>
</html>
`;
}

const draftBadge = (p) => (p.draft ? '<span class="badge">草稿</span>' : '');

/** 文章列表行：日期 + 标题 */
function postRows(ctx, posts, { short = false } = {}) {
  const { url, esc } = ctx;
  return posts
    .map(
      (p) => `      <li>
        <time datetime="${p.dateStr}">${short ? p.dateStr.slice(5) : p.dateStr}</time>
        <a href="${url(p.path)}">${esc(p.title)}${draftBadge(p)}</a>
      </li>`,
    )
    .join('\n');
}

/* ---------- 首页：按年份归档 ---------- */

export function home(ctx, posts) {
  const { site, esc } = ctx;
  const years = new Map();
  for (const p of posts) {
    const y = p.date.getFullYear();
    (years.get(y) || years.set(y, []).get(y)).push(p);
  }

  const archive = [...years]
    .map(
      ([year, list]) => `  <section class="year">
    <h2>${year}</h2>
    <ul class="post-list">
${postRows(ctx, list, { short: true })}
    </ul>
  </section>`,
    )
    .join('\n');

  const body = `${site.description ? `  <p class="intro">${esc(site.description)}</p>\n` : ''}${
    posts.length ? archive : '  <p class="empty">还没有文章。运行 <code>npm run new "标题"</code> 写第一篇。</p>'
  }`;
  return layout(ctx, { body, path: '' });
}

/* ---------- 文章页 ---------- */

export function post(ctx, p) {
  const { url, esc, tagUrl } = ctx;

  const tags = p.tags.map((t) => `<a href="${tagUrl(t)}">#${esc(t)}</a>`).join('');
  // 目录：宽屏时由 CSS 放到正文右侧并跟随滚动，窄屏时显示在正文上方
  const toc = p.toc.length
    ? `
      <nav class="toc" aria-label="目录">
        <ol>
${p.toc.map((h) => `          <li class="toc-h${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join('\n')}
        </ol>
      </nav>`
    : '';

  const link = (q, rel, label) =>
    q ? `<a class="${rel}" href="${url(q.path)}" rel="${rel}"><small>${label}</small>${esc(q.title)}</a>` : '<span></span>';
  const pager =
    p.older || p.newer
      ? `
    <nav class="pager" aria-label="更多文章">
      ${link(p.older, 'prev', '上一篇')}
      ${link(p.newer, 'next', '下一篇')}
    </nav>`
      : '';

  const body = `  <article>
    <header class="post-header">
      <h1>${esc(p.title)}${draftBadge(p)}</h1>
      <p class="post-meta"><time datetime="${p.date.toISOString()}">${p.dateStr}</time>${tags}</p>
    </header>
    <div class="post-body">${toc}
      <div class="prose">
${p.html}
      </div>
    </div>${pager}
  </article>`;
  // search.js：从搜索结果点进来时（网址带 ?q=）高亮并跳到命中位置
  const scripts = toc ? ['toc.js', 'search.js'] : ['search.js'];
  return layout(ctx, { title: p.title, description: p.description, path: p.path, body, scripts, article: p, noindex: p.draft });
}

/* ---------- 独立页面（pages/ 目录） ---------- */

export function page(ctx, p) {
  const { esc } = ctx;
  const body = `  <article>
    <header class="post-header">
      <h1>${esc(p.title)}${draftBadge(p)}</h1>
    </header>
    <div class="prose">
${p.html}
    </div>
  </article>`;
  return layout(ctx, { title: p.title, description: p.description, path: p.path, body, scripts: ['search.js'], noindex: p.draft });
}

/* ---------- 标签页 ---------- */

export function tags(ctx, tagList) {
  const { esc, tagId } = ctx;
  const cloud = tagList
    .map(([t, list]) => `<a href="#${encodeURIComponent(tagId(t))}">${esc(t)}<span>${list.length}</span></a>`)
    .join('\n      ');
  const sections = tagList
    .map(
      ([t, list]) => `  <section class="tag-group" id="${esc(tagId(t))}">
    <h2>${esc(t)}</h2>
    <ul class="post-list">
${postRows(ctx, list)}
    </ul>
  </section>`,
    )
    .join('\n');

  const body = tagList.length
    ? `  <h1 class="page-title">标签</h1>
  <p class="tag-cloud">
      ${cloud}
  </p>
${sections}`
    : '  <h1 class="page-title">标签</h1>\n  <p class="empty">还没有标签。在文章开头写 <code>tags: [随笔]</code> 即可。</p>';
  return layout(ctx, { title: '标签', path: 'tags/', body });
}

/* ---------- 搜索页（逻辑在 theme/search.js） ---------- */

export function search(ctx) {
  const { url } = ctx;
  const body = `  <h1 class="page-title">搜索</h1>
  <form class="search" role="search" data-index="${ctx.esc(ctx.asset('search.json'))}" data-tags="${url('tags/')}">
    <input type="search" name="q" placeholder="搜索标题、标签或正文" aria-label="搜索文章" autocomplete="off" autofocus>
  </form>
  <p class="search-status" aria-live="polite"></p>
  <ol class="search-results"></ol>
  <noscript><p class="empty">搜索需要浏览器开启 JavaScript。</p></noscript>`;
  return layout(ctx, { title: '搜索', path: 'search/', body, scripts: ['search.js'], noindex: true });
}

/* ---------- 404 ---------- */

export function notFound(ctx) {
  const body = `  <div class="not-found">
    <h1 class="page-title">404</h1>
    <p>这个页面不存在，可能已被移动或删除。<a href="${ctx.url()}">回到首页</a></p>
  </div>`;
  return layout(ctx, { title: '页面不存在', path: '404.html', body, noindex: true });
}
