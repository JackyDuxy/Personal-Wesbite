(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Scroll reveal ------------------------------------------------ */
  const revealer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      // Also reveal anything already above the viewport (e.g. after an anchor jump).
      if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
        entry.target.classList.add('is-in');
        revealer.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
  $$('.reveal').forEach((el) => revealer.observe(el));

  /* ---------- Statement: split into words --------------------------------- */
  const statement = $('[data-statement]');
  const words = [];
  if (statement) {
    const p = $('[data-words]', statement);
    const parts = p.textContent.trim().split(/\s+/);
    p.textContent = '';
    parts.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = word;
      words.push(span);
      p.append(span);
      if (i < parts.length - 1) p.append(' ');
    });
  }

  /* ---------- Scroll-linked effects (one rAF-throttled loop) -------------- */
  const nav = $('#nav');
  const hero = $('[data-hero]');
  const timeline = $('[data-timeline]');
  const tlItems = timeline ? $$('.tl', timeline) : [];
  let ticking = false;
  let lastWordState = [];

  // Each timeline dot samples the line's gradient at its own position.
  function layoutTimeline() {
    if (!timeline) return;
    const span = Math.max(1, timeline.offsetHeight - 20);
    tlItems.forEach((li) => {
      const at = (li.offsetTop + 11 - 10) / span;
      li.style.setProperty('--at', clamp(at).toFixed(3));
    });
  }

  function update() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const still = reduceMotion.matches;

    nav.classList.toggle('is-scrolled', y > 4);

    if (hero && !still) {
      const p = clamp(y / (hero.offsetHeight * 0.75));
      hero.style.setProperty('--p', p.toFixed(3));
    }

    if (statement && !still) {
      const rect = statement.getBoundingClientRect();
      const span = rect.height - vh;
      // Finish a little early so the fully-lit text rests before the section unsticks.
      const progress = clamp((-rect.top / span) * 1.18);
      const soft = 5; // how many words are mid-fade at once
      const n = words.length;
      words.forEach((w, i) => {
        const v = clamp((progress * (n + soft) - i) / soft);
        const o = (0.18 + 0.82 * v).toFixed(2);
        if (lastWordState[i] !== o) { w.style.opacity = o; lastWordState[i] = o; }
      });
    }

    if (timeline) {
      const rect = timeline.getBoundingClientRect();
      const line = vh * 0.62;
      timeline.style.setProperty('--tl', clamp((line - rect.top) / rect.height).toFixed(3));
      tlItems.forEach((li) => li.classList.toggle('is-active', li.getBoundingClientRect().top < line));
    }
  }

  function requestUpdate() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', () => { layoutTimeline(); requestUpdate(); });
  reduceMotion.addEventListener?.('change', () => { lastWordState = []; requestUpdate(); });
  layoutTimeline();
  update();
  addEventListener('load', layoutTimeline);

  /* ---------- Scroll-spy (nav highlights the current section) ------------- */
  const links = new Map($$('[data-spy-link]').map((a) => [a.dataset.spyLink, a]));
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = links.get(entry.target.dataset.spy);
      if (link) link.setAttribute('aria-current', entry.isIntersecting ? 'true' : 'false');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('[data-spy]').forEach((section) => spy.observe(section));

  /* ---------- Mobile menu ------------------------------------------------- */
  const menuButton = $('.nav__menu');
  const menu = $('#menu');
  $$('li', menu).forEach((li, i) => li.style.setProperty('--i', i));

  function setMenu(open) {
    if (open === root.classList.contains('is-menu-open')) return;
    root.classList.toggle('is-menu-open', open);
    root.classList.toggle('is-locked', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuButton.addEventListener('click', () => setMenu(!root.classList.contains('is-menu-open')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#sheet').open) closeSheet();
    else setMenu(false);
  });
  matchMedia('(min-width: 834px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  /* ---------- Carousel ---------------------------------------------------- */
  const scroller = $('#scroller');
  const prev = $('#prev');
  const next = $('#next');

  function step() {
    const card = $('.card', scroller);
    const gap = parseFloat(getComputedStyle(scroller).columnGap) || 20;
    return card.getBoundingClientRect().width + gap;
  }
  function syncArrows() {
    const max = scroller.scrollWidth - scroller.clientWidth - 2;
    prev.disabled = scroller.scrollLeft <= 2;
    next.disabled = scroller.scrollLeft >= max;
  }
  const behavior = () => (reduceMotion.matches ? 'auto' : 'smooth');
  prev.addEventListener('click', () => scroller.scrollBy({ left: -step(), behavior: behavior() }));
  next.addEventListener('click', () => scroller.scrollBy({ left: step(), behavior: behavior() }));
  scroller.addEventListener('scroll', syncArrows, { passive: true });
  addEventListener('resize', syncArrows);
  scroller.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
  });
  syncArrows();

  /* ---------- Project sheet ----------------------------------------------- */
  const sheet = $('#sheet');
  const sheetBody = $('#sheet-body');
  let lastTrigger = null;

  function openSheet(card, trigger) {
    lastTrigger = trigger;
    const theme = [...card.classList].find((c) => c.startsWith('theme-'));

    const hero = document.createElement('div');
    hero.className = `sheet__hero ${theme}`;
    hero.append($('.card__text', card).cloneNode(true));

    const body = document.createElement('div');
    body.className = 'sheet__body';
    body.append(...$('.card__more', card).cloneNode(true).childNodes);

    sheetBody.replaceChildren(hero, body);
    sheetBody.scrollTop = 0;
    sheet.setAttribute('aria-label', $('.card__title', card).textContent);

    root.classList.add('is-locked');
    sheet.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
  }

  function closeSheet() {
    if (!sheet.open || !sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    const done = () => {
      sheet.close();
      root.classList.remove('is-locked');
      lastTrigger?.focus({ preventScroll: true });
    };
    if (reduceMotion.matches) done();
    else setTimeout(done, 380);
  }

  $$('.card').forEach((card) => {
    const plus = $('.card__plus', card);
    plus.addEventListener('click', (e) => { e.stopPropagation(); openSheet(card, plus); });
    card.addEventListener('click', () => openSheet(card, plus));
  });
  $('.sheet__close', sheet).addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });   // click on the dimmed backdrop
  sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });      // Esc key

  /* ---------- Appearance: auto / light / dark ----------------------------- */
  const KEY = 'theme';
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const themeMetas = $$('meta[name="theme-color"]');
  const themeMetaDefaults = themeMetas.map((m) => m.content);
  const seg = $('[data-theme-seg]');
  const themeToggle = $('#theme-toggle');

  const readPref = () => {
    try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; }
    catch { return 'auto'; }
  };
  const resolve = (pref) => (pref === 'auto' ? (systemDark.matches ? 'dark' : 'light') : pref);

  function paintTheme(pref) {
    const scheme = resolve(pref);
    if (pref === 'auto') delete root.dataset.theme; else root.dataset.theme = pref;
    root.dataset.resolved = scheme;

    // Keep the browser chrome (mobile address bar) in step with an explicit choice.
    themeMetas.forEach((m, i) => { m.content = pref === 'auto' ? themeMetaDefaults[i] : (scheme === 'dark' ? '#000000' : '#fbfbfd'); });

    seg.dataset.value = pref;
    $$('[data-theme-set]', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === pref)));
    themeToggle.setAttribute('aria-label', scheme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance');
  }

  function setTheme(pref) {
    try { pref === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref); } catch { /* storage unavailable */ }
    const apply = () => paintTheme(pref);
    if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(apply);
    else apply();
  }

  themeToggle.addEventListener('click', () => setTheme(resolve(readPref()) === 'dark' ? 'light' : 'dark'));
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-set]');
    if (btn) setTheme(btn.dataset.themeSet);
  });
  systemDark.addEventListener('change', () => paintTheme(readPref()));   // device switches while in Auto
  paintTheme(readPref());

  /* ---------- Footer year ------------------------------------------------- */
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
