/* mukhayyar.my.id — booking links (a[data-cal]) open cal.com's popup on the page.
   Shared by / and /me/. Without it (or before cal.com has loaded) they are plain links. */
(function () {
  'use strict';
  // Booking links are plain links (new tab). Once the visitor shows intent (hover, focus, touch)
  // cal.com's embed loads; after it has loaded, a click opens the booking popup on the page instead.
  function initCal() {
    const links = [...document.querySelectorAll('a[data-cal]')];
    if (!links.length) return;
    let state = 0; // 0 idle, 1 loading, 2 ready
    const load = () => {
      if (state) return;
      state = 1;
      (function (C, A, L) { const p = function (a, ar) { a.q.push(ar); }; const d = C.document; C.Cal = C.Cal || function () { const cal = C.Cal; const ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; const s = d.head.appendChild(d.createElement('script')); s.src = A; s.onload = () => { state = 2; }; s.onerror = () => { state = 3; }; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const ns = ar[1]; api.q = api.q || []; if (typeof ns === 'string') { cal.ns[ns] = cal.ns[ns] || api; p(cal.ns[ns], ar); p(cal, ['initNamespace', ns]); } else p(cal, ar); return; } p(cal, ar); }; })(window, 'https://app.cal.com/embed/embed.js', 'init');
      window.Cal('init', 'intro', { origin: 'https://cal.com' });
      window.Cal.ns.intro('ui', { hideEventTypeDetails: false, layout: 'month_view', cssVarsPerTheme: { light: { 'cal-brand': '#0E0E0C' }, dark: { 'cal-brand': '#ECEAE3' } } });
    };
    links.forEach((a) => {
      ['pointerenter', 'focus', 'touchstart'].forEach((ev) => a.addEventListener(ev, load, { passive: true, once: true }));
      a.addEventListener('click', (e) => {
        if (state !== 2 || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        const link = a.getAttribute('href').replace(/^https:\/\/cal\.com\//, '');
        try { window.Cal.ns.intro('modal', { calLink: link, config: { layout: 'month_view' } }); e.preventDefault(); } catch (err) { /* follow the link */ }
      });
    });
  }
  initCal();
})();
