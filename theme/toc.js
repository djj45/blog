// 目录高亮：滚动时标出当前正在读的小节（读到视口上方约 1/4 处的那个标题）
(() => {
  const items = [...document.querySelectorAll('.toc a[href^="#"]')]
    .map((a) => ({ a, heading: document.getElementById(decodeURIComponent(a.hash.slice(1))) }))
    .filter((item) => item.heading);
  if (!items.length) return;

  const box = document.querySelector('.toc ol');
  let current = null;

  function update() {
    const line = innerHeight * 0.25;
    let active = null;
    for (const item of items) {
      if (item.heading.getBoundingClientRect().top > line) break;
      active = item;
    }
    // 滚到页面底部时，最后几节可能够不到那条线，直接算最后一节
    if (scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) active = items.at(-1);
    if (active === current) return;

    current?.a.removeAttribute('aria-current');
    current = active;
    if (!current) return;
    current.a.setAttribute('aria-current', 'location');

    // 侧栏目录比屏幕还长时，让高亮项保持在可见范围内（只滚目录本身，不动页面）
    if (box.scrollHeight > box.clientHeight) {
      const r = current.a.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (r.top < b.top) box.scrollTop -= b.top - r.top + 16;
      else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 16;
    }
  }

  let ticking = false;
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  update();
})();
