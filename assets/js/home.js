/* mukhayyar.my.id — home: the short page. /me/ (main.js) is the long one. */
(function () {
  'use strict';
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const HT = window.Halftone;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('booted');

  function mount(canvas, sc, opts) {
    if (!HT || !canvas || !sc) return null;
    try { return new HT(canvas, sc, opts || {}); } catch (e) { console.warn('halftone', e); return null; }
  }
  const scene = (name, ...args) => {
    const s = HT && HT.scenes && HT.scenes[name];
    return !s ? null : typeof s === 'function' ? s(...args) : s;
  };

  /* ------------------------------------------------------------ reveal */
  function initReveal() {
    const lines = $$('.h-hero__title .line > span');
    lines.forEach((s, i) => s.style.setProperty('--d', (0.08 + i * 0.09).toFixed(2) + 's'));
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('intro-done')));
    const els = $$('.rv');
    if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((es) => {
      const on = es.filter((e) => e.isIntersecting).map((e) => e.target);
      on.forEach((el, i) => { el.style.setProperty('--rv-d', (i * 0.07).toFixed(2) + 's'); el.classList.add('is-in'); io.unobserve(el); });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* ------------------------------------------------------- pictograms */
  // data-map rows: '#' dot, '+' mid dot, 'a' accent, '.' faint speck, ' ' empty.
  function initPicts() {
    $$('svg.pict[data-map]').forEach((svg) => {
      const rows = svg.dataset.map.split('|');
      const S = 10, R = { '#': 3.9, '+': 2.9, a: 3.9, '.': 1.25 };
      svg.setAttribute('viewBox', `0 0 ${rows[0].length * S} ${rows.length * S}`);
      svg.innerHTML = rows.map((row, y) => [...row].map((c, x) => {
        if (!R[c]) return '';
        const cls = c === 'a' ? ' class="p-a"' : c === '.' ? ' class="p-f"' : '';
        return `<circle${cls} cx="${x * S + S / 2}" cy="${y * S + S / 2}" r="${R[c]}" style="--d:${((x + y) * 0.025).toFixed(3)}s"/>`;
      }).join('')).join('');
    });
  }

  /* ------------------------------------------------- shipped carousel */
  const SHOW = [
    { name: 'Petruck AI Analytics', tech: 'LLMs · Dynamic SQL · Plotly.js', tag: 'AI analytics', text: 'Ask in plain language, get SQL and live charts — for Petruck.id.' },
    { name: 'AHD — Adaptive Hierarchical Detection', tech: 'Python · CLIP', tag: 'Edge computer vision', text: 'Scene-aware detection on a Raspberry Pi 5, no cloud. IEEE GCCE ’26.' },
    { name: 'OptiControl NDT GUI', tech: 'Python · PySide6', tag: 'Industrial software', text: 'Ultrasonic inspection for OptiControl — FPGA data every 3 ms.' },
    { name: 'Infoglobal Migration', tech: 'FastAPI · React', tag: 'Modernization', text: 'A defense-sector legacy app rebuilt — page load cut by 90%.' },
    { name: 'Portable GCS', tech: 'Flutter-pi · RPi', tag: 'Mobile & embedded UI', text: 'A Flutter ground-control app on a Raspberry Pi for live telemetry.' },
  ];
  function initShow() {
    const card = $('.h-show'), cv = $('#show-canvas');
    if (!card || !cv || !HT || !HT.scenes.projectArt) return;
    const dots = $('#show-dots'), idx = $('#show-i'), tag = $('#show-tag'), text = $('#show-text');
    $('#show-n').textContent = String(SHOW.length).padStart(2, '0');
    dots.innerHTML = SHOW.map((s, i) => `<button type="button" class="h-show__dot" role="tab" aria-selected="${i === 0}" aria-label="${s.tag}"></button>`).join('');
    const ds = $$('.h-show__dot', dots);
    let i = 0, timer = 0, hold = false, visible = true;
    const ht = mount(cv, scene('projectArt', SHOW[0].name, SHOW[0].tech), { revealDuration: 1.1 });
    const go = (n) => {
      i = (n + SHOW.length) % SHOW.length;
      const s = SHOW[i];
      ds.forEach((d, k) => d.setAttribute('aria-selected', String(k === i)));
      idx.textContent = String(i + 1).padStart(2, '0');
      card.classList.add('is-swap');
      setTimeout(() => { tag.textContent = s.tag; text.textContent = s.text; card.classList.remove('is-swap'); }, 260);
      if (ht) ht.setScene(scene('projectArt', s.name, s.tech));
      arm();
    };
    const arm = () => {
      clearTimeout(timer);
      if (reduced || hold || !visible) return;
      timer = setTimeout(() => go(i + 1), 7000);
    };
    ds.forEach((d, k) => d.addEventListener('click', () => go(k)));
    $('#show-prev').addEventListener('click', () => go(i - 1));
    $('#show-next').addEventListener('click', () => go(i + 1));
    // playing with the picture or reading it holds the slide
    card.addEventListener('pointerenter', () => { hold = true; clearTimeout(timer); });
    card.addEventListener('pointerleave', () => { hold = false; arm(); });
    card.addEventListener('focusin', () => { hold = true; clearTimeout(timer); });
    card.addEventListener('focusout', () => { hold = false; arm(); });
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; arm(); }).observe(card);
    arm();
  }

  /* ------------------------------------------------ other dot pictures */
  function lazyMount(canvas, make, opts, done) {
    if (!canvas) return;
    const run = () => { const ht = mount(canvas, make(), opts); if (done && ht) done(ht); };
    if (!('IntersectionObserver' in window)) { run(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '400px 0px' });
    io.observe(canvas);
  }
  function initArt() {
    lazyMount($('#pcb-canvas'), () => (HT && HT.scenes.pcb) ? scene('pcb') : scene('projectArt', 'rekafab pcb', 'pcb'), { revealDuration: 1.6 });
    lazyMount($('#long-canvas'), () => scene('planet'), { revealDuration: 2 });
  }

  /* ------------------------------------------------------------ footer */
  function initFooter() {
    const cv = $('#night-canvas'), scn = $('.footer__scene');
    if (!cv || !scn) return;
    lazyMount(cv, () => scene('nightLaunch'), { data: { word: 'MUKHAYYAR' }, revealDuration: 2.4 }, (ht) => {
      // the main rocket launches as the footer scrolls into view
      const update = () => {
        const r = scn.getBoundingClientRect();
        ht.set('progress', Math.min(1, Math.max(0, 1 - (r.bottom - innerHeight) / Math.max(1, r.height))));
      };
      addEventListener('scroll', update, { passive: true });
      addEventListener('resize', update);
      update();
      const counter = $('#dotcount'), fmt = new Intl.NumberFormat('en-US');
      let shown = 0;
      setInterval(() => { if (ht.dotCount && ht.dotCount !== shown) { shown = ht.dotCount; counter.textContent = fmt.format(shown); } }, 500);
    });
  }

  /* -------------------------------------------------------------- chrome */
  function initNav() {
    const nav = $('#nav');
    let lastY = scrollY;
    const onScroll = () => {
      const y = scrollY;
      nav.classList.toggle('is-solid', y > 8);
      if (y < lastY - 2 || y < 240) nav.classList.remove('is-hidden');
      else if (y > 240 && y > lastY + 2 && !nav.querySelector(':focus-visible')) nav.classList.add('is-hidden');
      lastY = y;
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const links = $$('.nav__links a');
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => (a.getAttribute('href') === '#' + e.target.id ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    }), { rootMargin: '-45% 0px -50% 0px' });
    ['top', 'services', 'process', 'shipped', 'pricing', 'faq', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
  function initMode() {
    const btns = $$('.mode__btn');
    const paint = (m) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    paint(HT && HT.getMode ? HT.getMode() : (root.getAttribute('data-ht-mode') || 'mono'));
    btns.forEach((b) => b.addEventListener('click', () => {
      const m = HT && HT.setMode ? HT.setMode(b.dataset.mode) : b.dataset.mode;
      if (!HT) root.setAttribute('data-ht-mode', m);
      try { localStorage.setItem('ht-mode', m); } catch (e) { /* private mode */ }
      paint(m);
    }));
  }
  function initStill() {
    const btns = $$('.still-btn');
    let still = false;
    try { still = localStorage.getItem('ht-still') === '1'; } catch (e) { /* private mode */ }
    const apply = () => {
      if (HT && HT.setStill) HT.setStill(still);
      btns.forEach((b) => { b.setAttribute('aria-pressed', String(still)); const t = $('.still-btn__text', b); if (t) t.textContent = still ? 'Play motion' : 'Pause motion'; });
    };
    apply();
    btns.forEach((b) => b.addEventListener('click', () => { still = !still; try { localStorage.setItem('ht-still', still ? '1' : '0'); } catch (e) { /* private mode */ } apply(); }));
  }
  function initClock() {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const tick = () => $$('[data-clock="long"]').forEach((el) => { el.textContent = fmt.format(new Date()) + ' WIB'; });
    tick(); setInterval(tick, 1000);
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }
  function initCopy() {
    const status = $('#copy-status');
    $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      clearTimeout(b._t);
      let ok = true;
      try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) { ok = false; }
      b.textContent = ok ? 'Copied ✓' : b.dataset.copy;
      if (status) status.textContent = ok ? 'Email address copied' : 'Copy the address: ' + b.dataset.copy;
      b.classList.toggle('is-done', ok);
      b._t = setTimeout(() => { b.textContent = 'Copy email'; b.classList.remove('is-done'); }, 1800);
    }));
  }

  initPicts();
  initReveal();
  initNav();
  initMode();
  initStill();
  initClock();
  initCopy();
  initShow();
  initArt();
  initFooter();
})();
