/* mukhayyar.my.id — page logic. Content lives in /data/*.json and /blog. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mobile = matchMedia('(max-width: 760px)');
  const G = window.gsap, ST = window.ScrollTrigger;
  const HT = window.Halftone;
  if (G && ST) G.registerPlugin(ST);
  if (reduced || !G || !ST) root.classList.add('reduced');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ARROW = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M1 6h10M7 2l4 4-4 4"/></svg>';
  const SITE_TITLE = document.title;
  // Keep "·" and "–" glued to the word before them so meta lines never start with a separator.
  const NB = (v) => esc(v).replace(/ · /g, '\u00a0· ').replace(/ – /g, '\u00a0– ');
  const roleOf = (e) => String(e.role || e.company || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const isPart = (e) => /part[-\s]?time/i.test(e.role || '');
  const focusEl = (el) => {
    if (!el || !el.focus) return;
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  const navH = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 64;

  const getJSON = (url, fallback) => fetch(url).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);

  /* ---------------------------------------------------------------- data */
  const DATA = Promise.all([
    getJSON('/data/profile.json', {}),
    getJSON('/data/experience.json', []),
    getJSON('/data/eepisat.json', []),
    getJSON('/data/projects.json', []),
    getJSON('/data/achievements.json', {}),
    getJSON('/data/postits.json', {}),
    getJSON('/blog/posts.json', []),
    getJSON('/data/milestones.json', []),
    getJSON('/data/toolbox.json', []),
  ]).then(([profile, experience, eepisat, projects, achievements, postits, posts, milestones, toolbox]) =>
    ({ profile, experience, eepisat, projects, achievements, postits, posts, milestones, toolbox }));

  /* ------------------------------------------------------------ halftone */
  const engines = new Set();
  function scene(name, ...args) {
    if (!HT || !HT.scenes) return null;
    const s = HT.scenes[name];
    if (!s) return null;
    return typeof s === 'function' ? s(...args) : s;
  }
  function mount(canvas, sc, opts) {
    if (!canvas || !sc) return null;
    try {
      const ht = new HT(canvas, sc, opts || {});
      engines.add(ht);
      return ht;
    } catch (e) { console.warn('halftone', e); return null; }
  }

  /* ---------------------------------------------------------------- render */
  function renderAbout(d) {
    const p = d.profile;
    const now = [...(d.experience || []), ...(d.eepisat || []).map((e) => ({ ...e, company: 'EEPISAT' }))]
      .filter((e) => /present/i.test(e.dates || ''))
      .sort((a, b) => isPart(a) - isPart(b));
    const facts = [];
    if (now.length) facts.push(['Now', now.map((e) => `<dd>${esc(roleOf(e))}<small>${esc(e.company || '')}${isPart(e) ? ' · part-time' : ''}${e.location ? ' · ' + NB(e.location) : ''}</small></dd>`).join('')]);
    if (p.open_to) facts.push(['Open to', `<dd>${esc(p.open_to.charAt(0).toUpperCase() + p.open_to.slice(1))}.</dd>`]);
    if (p.education) facts.push(['Education', p.education.map((e) => `<dd>${esc(e.degree)}<small>${esc(e.school)} · ${NB(e.dates)}</small></dd>`).join('')]);
    if (p.languages) facts.push(['Languages', `<dd>${p.languages.map((l) => `${esc(l.lang)} <span class="muted">(${esc(l.level)})</span>`).join(', ')}</dd>`]);
    $('#about-facts').innerHTML = facts.map(([k, v]) => `<div class="fact" data-reveal><dt class="mono">${k}</dt>${v}</div>`).join('');
    $('#skills').innerHTML = (p.skills || []).map((s) => `<li class="chip">${esc(s)}</li>`).join('');

    const nowEl = $('#footer-now');
    if (nowEl && now.length) nowEl.innerHTML = now.map((e) => `<p><strong>${esc(roleOf(e))}</strong> at ${esc(e.company || '')}${isPart(e) ? ' <span class="muted">(part-time)</span>' : ''}</p>`).join('');
    $$('[data-bind="location"]').forEach((el) => { if (p.location) el.textContent = p.location; });
    if (p.links && p.links.email) {
      $$('a[href^="mailto:"]').forEach((a) => { a.href = 'mailto:' + p.links.email; });
      $$('[data-bind="email"]').forEach((el) => { el.textContent = p.links.email; });
      $$('[data-copy]').forEach((el) => { el.dataset.copy = p.links.email; });
    }
  }

  // Toolbox: every tool logo is drawn in dots (ink in Mono, brand colour in Color).
  function renderToolbox(d) {
    const groups = d.toolbox || [];
    const host = $('#toolbox');
    if (!groups.length || !host) return;
    host.innerHTML = groups.map((g) => `<div class="tool-group">
        <p class="tool-group__label mono"><span>${esc(g.group)}</span><span>${pad((g.items || []).length)}</span></p>
        <ul class="tool-grid">${(g.items || []).map((t) => `<li class="tool" data-icon="${esc(t.icon || '')}" data-hex="${esc(t.hex || '')}" data-short="${esc(t.short || '')}">
            <span class="tool__icon" aria-hidden="true"><canvas></canvas></span>
            <span class="tool__name">${esc(t.name)}</span>
          </li>`).join('')}</ul>
      </div>`).join('');
  }
  function initToolbox() {
    const tools = $$('#toolbox .tool');
    if (!tools.length || !HT || !HT.scenes.logo) return;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const t = e.target, icon = t.dataset.icon;
        const src = icon ? '/assets/icons/tools/' + icon + '.svg' : '';
        mount($('canvas', t), scene('logo', src, t.dataset.hex, t.dataset.short), { interactTarget: t, revealDuration: 0.9 });
      });
    }, { rootMargin: '300px 0px' });
    tools.forEach((t) => io.observe(t));
  }

  function year(s) { const m = String(s).match(/\b(19|20)\d{2}\b/g); return m ? m[m.length - 1] : ''; }

  function renderLog(d) {
    const items = d.milestones || [];
    const email = (d.profile.links && d.profile.links.email) || 'm3g3nz2@gmail.com';
    $('#log-track').innerHTML = items.map((m, i) => `<li class="log__panel" data-art="${esc(m.art || m.title)}">
        <span class="log__year" aria-hidden="true">${esc(m.year)}</span>
        <div class="log__art"><canvas aria-hidden="true"></canvas></div>
        <div class="log__text">
          <p class="log__tag mono"><span>N° ${pad(i + 1)} — ${esc(m.tag || '')}</span><span>${esc(m.year)}</span></p>
          <h3><span class="sr-only">${esc(m.year)}: </span>${esc(m.title)}</h3>
          <p class="log__body">${esc(m.body)}</p>
        </div>
      </li>`).join('') + `<li class="log__panel log__panel--next">
        <span class="log__year">Next<em class="serif">?</em></span>
        <p>Now building <a class="ul" href="https://rekafab.mukhayyar.my.id" target="_blank" rel="noopener">rekafab</a>, PCB design in the browser. Your hard problem could be the next entry.</p>
        <a class="btn" href="mailto:${esc(email)}" data-magnetic><span class="dot dot--live"></span>Start a project</a>
      </li>`;
    const n = items.length;
    $('#log-ticks').innerHTML = items.map((m, i) => `<span style="left:${n > 1 ? (i / (n - 1)) * 100 : 0}%">${esc(m.year)}</span>`).join('');
  }

  function renderWork(d) {
    const row = (e, i, group) => {
      const id = `${group}-${i}`;
      const title = e.company || e.role || '';
      const role = e.company ? (e.role || '') : '';
      const open = i === 0 && group === 'exp';
      const loc = e.location || '';
      const place = /remote/i.test(loc) ? 'Remote' : loc.split(',')[0];
      const dates = String(e.dates || '').split(/\s+[–-]\s+/).map((part, k, all) => `<span class="nw">${esc(part)}${k < all.length - 1 ? ' –' : ''}</span>`).join(' ');
      return `<div class="row${open ? ' is-open' : ''}" data-reveal>
        <button class="row__head" type="button" id="${id}-h" aria-expanded="${open}" aria-controls="${id}">
          <span class="row__date mono">${dates}</span>
          <span class="row__title">${esc(title)}</span>
          <span class="row__role">${esc(role).replace(/\s(\([^)]*\))$/, ' <span class="nw">$1</span>')}</span>
          <span class="row__place mono"${loc ? ` title="${esc(loc)}"` : ''}>${esc(place)}</span>
          <span class="row__toggle" aria-hidden="true"></span>
        </button>
        <div class="row__panel" id="${id}" role="region" aria-labelledby="${id}-h"${open ? '' : ' inert'}><div><div class="row__wins"><ul>${(e.wins || []).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div></div>
      </div>`;
    };
    $('#exp').innerHTML = (d.experience || []).map((e, i) => row(e, i, 'exp')).join('');
    $('#eepisat').innerHTML = (d.eepisat || []).map((e, i) => row(e, i, 'sat')).join('');
    const ys = (d.experience || []).map((e) => year(e.dates)).filter(Boolean).map(Number);
    if (ys.length) $('#work-note').textContent = `${d.experience.length} roles · ${Math.min(...ys)} — now`;

    $$('.row').forEach((r) => {
      const b = $('.row__head', r);
      b.addEventListener('click', () => {
        const open = !r.classList.contains('is-open');
        r.classList.toggle('is-open', open);
        b.setAttribute('aria-expanded', String(open));
        $('.row__panel', r).inert = !open;
        setTimeout(refresh, 650);
      });
    });
  }

  function renderFeature(d) {
    const f = d.projects.find((p) => p.featured);
    const host = $('#feature');
    if (!f || !host) return;
    host.innerHTML = `<article class="feature" data-reveal aria-labelledby="feature-title">
      <div class="feature__media night"><canvas id="pcb-canvas" aria-hidden="true"></canvas>
        <span class="feature__hint mono">Hover a part · click to run checks · drag to tilt</span></div>
      <div class="feature__body">
        <p class="feature__eyebrow mono"><span class="dot dot--live"></span>Now building · Featured</p>
        <h3 class="feature__title" id="feature-title">${esc(f.name)}</h3>
        ${f.tagline ? `<p class="feature__tag">${esc(f.tagline)}</p>` : ''}
        <p class="feature__desc">${esc(f.desc)}</p>
        ${f.caps ? `<ul class="feature__caps mono">${f.caps.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        <p class="feature__tech mono">${esc(f.tech)}</p>
        ${f.url ? `<a class="btn feature__cta" href="${esc(f.url)}" target="_blank" rel="noopener" data-magnetic>Open the studio <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 9l6-6M4.5 3H9v4.5"/></svg></a>` : ''}
      </div>
    </article>`;
  }

  function renderProjects(d) {
    const list = $('#projects-list');
    d.projects = d.projects.filter((p) => !p.featured).concat(d.projects.filter((p) => p.featured));
    const listed = d.projects.filter((p) => !p.featured);
    list.innerHTML = listed.map((p, i) => {
      const tag = p.url ? 'a' : 'div';
      const attrs = p.url ? ` href="${esc(p.url)}" target="_blank" rel="noopener" data-cursor="Visit"` : ' data-cursor="none"';
      return `<li class="proj${p.url ? '' : ' proj--static'}" data-i="${i}" data-reveal>
        <${tag} class="proj__link"${attrs}>
          <span class="proj__art" aria-hidden="true"><canvas></canvas></span>
          <span class="proj__no mono">${pad(i + 1)}</span>
          <span class="proj__name">${esc(p.name)}</span>
          <span class="proj__desc">${esc(p.desc)}</span>
          <span class="proj__arrow" aria-hidden="true">${ARROW}</span>
          <span class="proj__tech mono">${NB(p.tech || '')}</span>
        </${tag}>
      </li>`;
    }).join('');
    $('#projects-note').textContent = `${d.projects.length} projects · firmware → cloud`;
    renderFeature(d);
  }

  function renderNotes(d) {
    const all = [...(d.postits.left || []), ...(d.postits.right || [])];
    const cta = all.filter((n) => n.color === 'cta');
    const rest = all.filter((n) => n.color !== 'cta');
    const ordered = [...cta, ...rest];
    $('#notes').innerHTML = ordered.map((n, i) => {
      const body = esc(n.body);
      const inner = `<span class="note__idx mono"><span>N° ${pad(i + 1)}</span><span>${n.color === 'cta' ? 'Open' : ''}</span></span><span class="note__title">${esc(n.title)}</span><span class="note__body">${body}</span>`;
      if (n.color === 'cta') return `<a class="note note--cta" href="${esc(n.link || '#contact')}" data-reveal data-cursor="Write">${inner}</a>`;
      return `<div class="note" data-reveal>${inner}</div>`;
    }).join('');
  }

  const RANKS = [
    [/1st|first|winner|champion/i, '1st place', 'gold'],
    [/2nd|second/i, '2nd place', 'gold'],
    [/3rd|third/i, '3rd place', 'gold'],
    [/best rocket/i, 'Best rocket', 'gold'],
    [/finalist/i, 'Finalist', 'ink'],
    [/top\s*(\d+)/i, 'Top $1', 'ink'],
    [/best (team )?member/i, 'Best member', 'ink'],
    [/award|best/i, 'Award', 'ink'],
    [/paper/i, 'Paper', 'ink'],
  ];
  function rankOf(title) {
    for (const [re, label, tone] of RANKS) {
      const m = title.match(re);
      if (m) return { label: label.replace('$1', m[1] || ''), tone };
    }
    return null;
  }
  function renderAwards(d) {
    const a = d.achievements || {};
    const group = (label, items, fallback) => {
      if (!items || !items.length) return '';
      return `<div class="awards__group"><p class="awards__label mono"><span>${label}</span><span>${pad(items.length)}</span></p>${items.map((it) => {
        const parts = String(it.title).split(/\s+—\s+/);
        const r0 = rankOf(parts[0]);
        const r = r0 || rankOf(it.title);
        const name = (r0 && parts.length > 1 ? parts.slice(1).join(' — ') : String(it.title)).replace(/\s*\b(19|20)\d{2}\b/g, '').replace(/\s{2,}/g, ' ').trim();
        const meta = String(it.meta || '').replace(/\s*·\s*(19|20)\d{2}\s*$/, '');
        const rank = r || fallback;
        return `<div class="award" data-reveal>
          <span class="award__year mono">${year(it.title + ' ' + it.meta) || '—'}</span>
          <span class="award__rank mono"><span class="award__pips"><i class="${rank.tone === 'gold' ? 'on' : ''}"></i></span>${esc(rank.label)}</span>
          <span class="award__title">${esc(name)}</span>
          <span class="award__meta">${NB(meta)}</span>
        </div>`;
      }).join('')}</div>`;
    };
    $('#awards').innerHTML =
      group('Competitions', a.competitions, { label: 'Award', tone: 'ink' }) +
      group('International stages', a.presentations, { label: 'Speaker', tone: 'ink' }) +
      group('Industry partnerships', a.partnerships, { label: 'Partner', tone: 'ink' });
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (s) => {
    if (!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : String(s);
  };
  function renderPosts(d) {
    const posts = [...(d.posts || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    $('#posts').innerHTML = posts.map((p) => `<li class="post-row" data-reveal><a href="#/blog/${esc(p.slug)}" data-cursor="Read">
      <span class="post-row__date mono">${esc(fmtDate(p.date))}</span>
      <span class="post-row__title">${esc(p.title)}<span class="post-row__excerpt">${esc(p.excerpt)}</span></span>
      <span class="post-row__tags mono">${(p.tags || []).map(esc).join('\u00a0· ')}</span>
      <span class="post-row__arrow" aria-hidden="true">${ARROW}</span>
    </a></li>`).join('');
    $('#writing-note').textContent = `${pad(posts.length)} posts · markdown`;
  }

  /* ---------------------------------------------------------- word split */
  function splitWords(el) {
    if (!el || el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/([ \t\n\r\f]+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((part) => {
            if (!part) return;
            if (/^[ \t\n\r\f]+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  }

  /* ------------------------------------------------------- smooth scroll */
  let lenis = null;
  function initScroll() {
    if (!reduced && window.Lenis && G) {
      lenis = new window.Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
      if (ST) lenis.on('scroll', ST.update);
      G.ticker.add((t) => lenis.raf(t * 1000));
      G.ticker.lagSmoothing(0);
    }
  }
  let loadFig = null;
  function goTo(el, immediate) {
    const y = el.getBoundingClientRect().top + window.scrollY - (el.id === 'top' ? 0 : navH() - 1);
    if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: !!immediate, duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) }); }
    else window.scrollTo({ top: y, behavior: immediate || reduced ? 'auto' : 'smooth' });
  }
  // Anything below the lazily loaded Fig. 01 moves once it mounts, so load it before measuring.
  function scrollToEl(el, immediate) {
    if (!el) return;
    const link = document.getElementById('link'), fig = document.getElementById('fig-link');
    if (loadFig && fig && !fig.childElementCount && link && el !== link && (link.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      Promise.race([loadFig(), new Promise((r) => setTimeout(r, 700))]).then(() => goTo(el, immediate));
      return;
    }
    goTo(el, immediate);
  }
  const refresh = () => { if (ST) ST.refresh(); };

  /* -------------------------------------------------------------- router */
  let articleOpen = false, homeScroll = 0, navSeq = 0, navAbort = null, lastPostLink = null;
  let coverHt = null, articleEngines = [];
  async function route(d, opts = {}) {
    const h = location.hash;
    const m = h.match(/^#\/blog\/([^/?#]+)/);
    if (m) {
      let slug;
      try { slug = decodeURIComponent(m[1]); } catch (e) { slug = m[1]; }
      await openArticle(d, slug);
      return;
    }
    const wasOpen = articleOpen;
    if (wasOpen) { closeArticle(); refresh(); if (lenis) lenis.resize(); }
    const id = h.replace(/^#/, '');
    const target = id && document.getElementById(id);
    if (wasOpen) {
      // Layout is final now: jump straight there (an animated scroll would scrub the pinned log).
      if (target) scrollToEl(target, true);
      else if (lenis) lenis.scrollTo(homeScroll, { immediate: true });
      else window.scrollTo(0, homeScroll);
      requestAnimationFrame(() => focusEl((!target || target.id === 'writing') && lastPostLink && document.contains(lastPostLink) ? lastPostLink : target || $('#main')));
    } else if (target) requestAnimationFrame(() => scrollToEl(target, opts.initial));
  }

  // Share links point at the generated /blog/<slug>/ page, which carries the post's own card.
  function renderShare(post) {
    const row = $('#article-share');
    if (!row) return;
    const url = `${location.origin}/blog/${encodeURIComponent(post.slug)}/`;
    const u = encodeURIComponent(url), t = encodeURIComponent(post.title);
    const links = [
      ['WhatsApp', `https://wa.me/?text=${encodeURIComponent(post.title + ' ' + url)}`],
      ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
      ['X', `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
      ['Telegram', `https://t.me/share/url?url=${u}&text=${t}`],
      ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ];
    row.innerHTML = (navigator.share ? '<button class="share__btn" type="button" data-share>Share…</button>' : '') +
      links.map(([n, h]) => `<a class="share__btn" href="${esc(h)}" target="_blank" rel="noopener">${n}</a>`).join('') +
      '<button class="share__btn" type="button" data-link>Copy link</button>';
    const native = $('[data-share]', row);
    if (native) native.addEventListener('click', () => navigator.share({ title: post.title, text: post.excerpt || '', url }).catch(() => {}));
    const copy = $('[data-link]', row);
    copy.addEventListener('click', async () => {
      clearTimeout(copy._t);
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied ✓'; } catch (e) { copy.textContent = url; }
      copy.classList.add('is-done');
      copy._t = setTimeout(() => { copy.textContent = 'Copy link'; copy.classList.remove('is-done'); }, 1800);
    });
  }

  function dropArticleEngines() {
    if (coverHt) { coverHt.destroy(); engines.delete(coverHt); coverHt = null; }
    articleEngines.forEach((ht) => { ht.destroy(); engines.delete(ht); });
    articleEngines = [];
  }

  async function openArticle(d, slug) {
    const my = ++navSeq;
    if (navAbort) navAbort.abort();
    const ac = navAbort = window.AbortController ? new AbortController() : null;
    if (!articleOpen) {
      homeScroll = window.scrollY;
      const a = document.activeElement;
      lastPostLink = a && a.closest ? a.closest('a[href^="#/blog/"]') : null;
    }
    articleOpen = true;
    root.classList.add('is-article');
    document.body.classList.add('is-article');
    const post = (d.posts || []).find((p) => p.slug === slug);
    const body = $('#article-body'), title = $('#article-title'), meta = $('#article-meta'), cover = $('.article__cover');
    dropArticleEngines();
    if (lenis) { lenis.resize(); lenis.scrollTo(0, { immediate: true }); } else window.scrollTo(0, 0);
    if (!post) {
      if ($('#article-share')) $('#article-share').innerHTML = '';
      title.textContent = 'Post not found';
      meta.innerHTML = '';
      cover.hidden = true;
      body.innerHTML = '<p>No post lives at this address. <a href="#writing">Back to all writing</a>.</p>';
      document.title = 'Post not found — Tsaqif Mukhayyar';
      focusEl(title);
      setTimeout(refresh, 60);
      return;
    }
    cover.hidden = false;
    title.textContent = post.title;
    renderShare(post);
    const metaBase = `<span>${esc(fmtDate(post.date))}</span><span>${(post.tags || []).map(esc).join('\u00a0· ')}</span>`;
    meta.innerHTML = metaBase;
    body.innerHTML = '';
    document.title = post.title + ' — Tsaqif Mukhayyar';
    const sc = post.cover ? scene('image', /^(https?:|\/)/.test(post.cover) ? post.cover : '/' + (post.cover.includes('/') ? post.cover : 'blog/images/' + post.cover)) : scene('projectArt', post.title, (post.tags || []).join(' '));
    coverHt = mount($('#article-cover'), sc);
    try {
      const res = await fetch('/blog/' + encodeURIComponent(slug) + '.md', ac ? { signal: ac.signal } : undefined);
      if (!res.ok) throw new Error('missing');
      const raw = await res.text();
      if (my !== navSeq || !articleOpen) return;
      const md = raw.replace(/!\[([^\]]*)\]\((?!https?:|\/)(?:blog\/)?(?:images\/)?([^)]+)\)/g, '![$1](/blog/images/$2)');
      body.innerHTML = window.marked ? window.marked.parse(md) : `<pre>${esc(md)}</pre>`;
      const words = body.textContent.trim().split(/\s+/).length;
      meta.innerHTML = metaBase + `<span>${Math.max(1, Math.round(words / 220))} min read</span>`;
      halftoneImages(body);
    } catch (e) {
      if (my !== navSeq || (e && e.name === 'AbortError')) return;
      body.innerHTML = '<p>This post could not be loaded. <a href="#writing">Back to all writing</a>.</p>';
    }
    if (my !== navSeq) return;
    focusEl(title);
    if (G && !reduced) G.fromTo(['#article .article__head', '#article .article__cover', '#article .prose'], { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08 });
    setTimeout(refresh, 60);
  }
  function closeArticle() {
    articleOpen = false;
    navSeq++;
    if (navAbort) navAbort.abort();
    root.classList.remove('is-article');
    document.body.classList.remove('is-article');
    document.title = SITE_TITLE;
    dropArticleEngines();
  }
  function halftoneImages(scope) {
    const lone = (img) => {
      const host = img.parentElement && img.parentElement.tagName === 'A' && img.parentElement.children.length === 1 ? img.parentElement : img;
      const p = host.parentElement;
      return p && p.tagName === 'P' && Array.from(p.childNodes).every((n) => n === host || (n.nodeType === 3 && !n.textContent.trim()));
    };
    $$('img', scope).forEach((img) => {
      if (!lone(img)) return; // inline images stay inline
      const fig = document.createElement('figure');
      fig.className = 'ht-img';
      const p = img.closest('p');
      p.replaceWith(fig);
      fig.appendChild(img);
      if (img.alt) { const c = document.createElement('figcaption'); c.textContent = img.alt; fig.appendChild(c); }
      const src = img.getAttribute('src');
      const sc = scene('image', src, { accent: true });
      if (!sc) return;
      const probe = new Image();
      probe.onload = () => {
        const cv = document.createElement('canvas');
        fig.style.setProperty('--ar', `${probe.naturalWidth} / ${probe.naturalHeight}`);
        fig.insertBefore(cv, img);
        fig.classList.add('is-halftone');
        if (!articleOpen) return;
        const ht = mount(cv, sc);
        if (ht) articleEngines.push(ht);
      };
      probe.src = src;
    });
  }

  /* ---------------------------------------------------------- interactions */
  function initNav() {
    const nav = $('#nav'), bar = $('.nav__progress');
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle('is-solid', y > 8);
      const hide = y > 240 && y > lastY + 2 && !$('#sheet').classList.contains('is-open') && !nav.querySelector(':focus-visible');
      if (y < lastY - 2 || y < 240) nav.classList.remove('is-hidden');
      else if (hide) nav.classList.add('is-hidden');
      lastY = y;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    addEventListener('scroll', onScroll, { passive: true });
    nav.addEventListener('focusin', () => { if (nav.querySelector(':focus-visible')) nav.classList.remove('is-hidden'); });
    onScroll();

    const links = $$('.nav__links a, .sheet__links a');
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => {
          if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['top', 'about', 'log', 'work', 'link', 'projects', 'help', 'recognition', 'writing', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });

    // Menu sheet: everything behind it is inert while it is open; focus moves in and comes back.
    const sheet = $('#sheet'), btn = $('.nav__menu');
    const behind = [$('.skip'), $('#main'), $('footer'), $('.nav .brand'), $('.nav__links'), $('.nav__meta .mode'), $('.nav__meta .still-btn'), $('.nav__meta .btn')].filter(Boolean);
    const toggle = (open, restore = true) => {
      sheet.classList.toggle('is-open', open);
      sheet.inert = !open;
      behind.forEach((el) => { el.inert = open; });
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Close' : 'Menu';
      if (lenis) open ? lenis.stop() : lenis.start();
      else root.style.overflow = open ? 'hidden' : '';
      if (open) requestAnimationFrame(() => { const first = $('.sheet__links a'); if (first) first.focus(); });
      else if (restore) btn.focus();
    };
    btn.addEventListener('click', () => toggle(!sheet.classList.contains('is-open')));
    sheet.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false, false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) toggle(false); });
    const mqMenu = matchMedia('(max-width: 1100px)');
    mqMenu.addEventListener('change', (e) => { if (!e.matches && sheet.classList.contains('is-open')) toggle(false, false); });
  }

  function initAnchors(d) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const href = a.getAttribute('href');
      if (href.startsWith('#/')) return;
      if (articleOpen) return;
      const target = href === '#' || href === '#top' ? $('#top') : document.getElementById(href.slice(1));
      if (!target) return;
      e.preventDefault();
      history.pushState(null, '', href === '#top' ? location.pathname : href);
      scrollToEl(target);
      focusEl(target);
    });
    addEventListener('hashchange', () => route(d, { fromArticle: articleOpen && !location.hash }));
  }

  function initClock() {
    const short = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
    const long = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const tick = () => {
      const now = new Date();
      $$('[data-clock="short"]').forEach((el) => { el.textContent = 'SUB ' + short.format(now); });
      $$('[data-clock="long"]').forEach((el) => { el.textContent = long.format(now) + ' WIB'; });
    };
    tick();
    setInterval(tick, 1000);
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }

  // Graphics colour mode: every halftone switches between ink-only and full colour.
  function initMode() {
    const btns = $$('.mode__btn');
    const paint = (mode) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    paint(HT && HT.getMode ? HT.getMode() : 'mono');
    btns.forEach((b) => b.addEventListener('click', () => {
      const mode = HT && HT.setMode ? HT.setMode(b.dataset.mode) : b.dataset.mode;
      try { localStorage.setItem('ht-mode', mode); } catch (e) { /* private mode */ }
      paint(mode);
    }));
  }

  function initCopy() {
    const mac = /Mac|iPhone|iPad/.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
    const status = $('#copy-status');
    $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      clearTimeout(b._t);
      let msg;
      try { await navigator.clipboard.writeText(b.dataset.copy); msg = 'Copied ✓'; }
      catch (e) {
        const m = $('.footer__mail');
        if (m) { const r = document.createRange(); r.selectNodeContents(m); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
        msg = mac ? 'Press ⌘C' : 'Press Ctrl+C';
      }
      b.textContent = msg;
      if (status) status.textContent = msg === 'Copied ✓' ? 'Email address copied' : 'Email address selected — ' + msg.toLowerCase();
      b.classList.add('is-done');
      b._t = setTimeout(() => { b.textContent = 'Copy email'; b.classList.remove('is-done'); }, 1800);
    }));
  }

  // WCAG 2.2.2: a way to stop every looping animation without OS-level reduced motion.
  function initStill() {
    const btns = $$('.still-btn');
    if (!btns.length) return;
    let still = false;
    try { still = localStorage.getItem('ht-still') === '1'; } catch (e) { /* private mode */ }
    const apply = () => {
      if (HT && HT.setStill) HT.setStill(still);
      btns.forEach((b) => {
        b.setAttribute('aria-pressed', String(still));
        const t = $('.still-btn__text', b);
        if (t) t.textContent = still ? 'Play motion' : 'Pause motion';
      });
    };
    apply();
    btns.forEach((b) => b.addEventListener('click', () => {
      still = !still;
      try { localStorage.setItem('ht-still', still ? '1' : '0'); } catch (e) { /* private mode */ }
      apply();
    }));
  }

  function initCursor() {
    if (!fine || reduced || matchMedia('(forced-colors: active)').matches) return;
    const c = $('.cursor'), label = $('span', c);
    root.classList.add('has-cursor');
    let x = -100, y = -100, tx = -100, ty = -100;
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; c.classList.remove('is-hidden'); }, { passive: true });
    document.addEventListener('pointerleave', () => c.classList.add('is-hidden'));
    const loop = () => {
      x += (tx - x) * 0.24; y += (ty - y) * 0.24;
      c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      requestAnimationFrame(loop);
    };
    loop();
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor], a, button, .iso-stage');
      const kind = t ? (t.dataset.cursor || 'link') : '';
      c.classList.toggle('is-label', !!kind && kind !== 'link' && kind !== 'none');
      c.classList.toggle('is-link', kind === 'link');
      label.textContent = kind && kind !== 'link' && kind !== 'none' ? kind : '';
    });
  }

  function initMagnetic() {
    if (!fine || reduced) return;
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.3}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------ halftones */
  function initHero() {
    const hero = $('#top');
    mount($('#hero-canvas'), scene('planet'), { interactTarget: hero, revealDuration: 2.2 });
  }

  function initPi() {
    const cv = $('#pi-canvas');
    const ht = mount(cv, scene('pi'), { revealDuration: 1.8 });
    const labels = $$('.pi-label');
    if (!ht) { labels.forEach((l) => { l.style.display = 'none'; }); return; }
    const place = () => {
      const a = HT.scenes.pi && HT.scenes.pi.anchors ? HT.scenes.pi.anchors(ht.st.w, ht.st.h) : null;
      labels.forEach((l) => {
        const p = a && a[l.dataset.pi];
        if (!p) { l.style.display = 'none'; return; }
        l.style.left = (p[0] / ht.st.w * 100) + '%';
        l.style.top = (p[1] / ht.st.h * 100) + '%';
      });
    };
    ht.onready = place;
    // Hover / focus preview a part; click (or tap) pins it until clicked again.
    let pinned = null;
    const set = (k) => {
      ht.setData({ hover: k });
      labels.forEach((l) => {
        l.classList.toggle('is-on', l.dataset.pi === k);
        l.setAttribute('aria-pressed', String(l.dataset.pi === pinned));
      });
    };
    labels.forEach((l) => {
      const k = l.dataset.pi;
      l.setAttribute('aria-pressed', 'false');
      l.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') set(k); });
      l.addEventListener('pointerleave', () => set(pinned));
      l.addEventListener('focus', () => set(k));
      l.addEventListener('blur', () => set(pinned));
      l.addEventListener('click', () => { pinned = pinned === k ? null : k; set(pinned || (l.matches(':hover') ? k : null)); });
    });
  }

  function initFeature() {
    const cv = $('#pcb-canvas');
    if (!cv) return;
    const f = (HT && HT.scenes.pcb) ? scene('pcb') : scene('projectArt', 'rekafab pcb', 'pcb');
    mount(cv, f, { revealDuration: 1.6 });
  }

  function initProjects(d) {
    const list = $('#projects-list');
    const rows = $$('.proj', list);
    if (!HT || !HT.scenes.projectArt) return;
    const keyOf = HT.scenes.projectArt.keyOf || ((n) => n);

    // Mobile: inline art per row, created lazily.
    const inline = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        const li = e.target.closest('.proj');
        inline.unobserve(e.target);
        const p = d.projects[+li.dataset.i];
        mount($('canvas', e.target), scene('projectArt', p.name, p.tech || ''));
      });
    }, { rootMargin: '200px' });
    const setupInline = () => { if (mobile.matches) rows.forEach((r) => { const art = $('.proj__art', r); if (!art.dataset.on) { art.dataset.on = '1'; inline.observe(art); } }); };
    setupInline();
    mobile.addEventListener('change', setupInline);

    // Desktop: one floating preview that follows the cursor.
    if (!fine) return;
    const prev = $('.preview'), no = $('.preview__no'), tag = $('.preview__tag');
    let ht = null, key = '', on = false, x = 0, y = 0, tx = 0, ty = 0, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      const w = prev.offsetWidth, h = prev.offsetHeight;
      let px = x + 36;
      if (px + w > innerWidth - 16) px = x - 36 - w;
      const py = Math.min(innerHeight - h - 16, Math.max(16, y - h / 2));
      prev.style.translate = `${px.toFixed(1)}px ${py.toFixed(1)}px`;
      raf = on || Math.abs(tx - x) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    list.addEventListener('pointermove', (e) => {
      if (mobile.matches) return;
      tx = e.clientX; ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    rows.forEach((r) => r.addEventListener('pointerenter', (e) => {
      if (mobile.matches) return;
      const p = d.projects[+r.dataset.i];
      const tech = p.tech || '';
      const k = keyOf(p.name, tech) + ':' + r.dataset.i;
      if (!on) { x = tx = e.clientX; y = ty = e.clientY; }
      on = true;
      rows.forEach((o) => o.classList.toggle('is-hover', o === r));
      list.classList.add('is-hovering');
      prev.classList.add('is-on');
      no.textContent = pad(+r.dataset.i + 1);
      tag.textContent = tech.split('·')[0].trim();
      if (!ht) ht = mount($('#preview-canvas'), scene('projectArt', p.name, tech), { revealDuration: 0.7 }); // pointer-events: none, so it plays its own demo
      else if (k !== key) ht.setScene(scene('projectArt', p.name, tech));
      if (ht) ht.resume();
      key = k;
      if (!raf) raf = requestAnimationFrame(loop);
    }));
    list.addEventListener('pointerleave', () => {
      on = false;
      rows.forEach((o) => o.classList.remove('is-hover'));
      list.classList.remove('is-hovering');
      prev.classList.remove('is-on');
      if (ht) setTimeout(() => { if (!on) ht.pause(); }, 400);
    });
  }

  // Fig. 01 is ~75 kB gzipped: load it only when its section approaches.
  function initFigure() {
    const host = document.getElementById('fig-link');
    if (!host) return;
    let figP = null;
    const load = loadFig = () => figP || (figP = import(new URL('/assets/js/fig-link.js', document.baseURI).href)
      .then(() => new Promise((r) => requestAnimationFrame(() => { refresh(); if (lenis) lenis.resize(); r(); })))
      .catch((e) => console.warn('fig-link', e)));
    if (!('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '900px 0px' });
    io.observe(host);
  }

  /* Flight log: pinned horizontal scroll with parallax years (desktop),
     native sideways scroll (reduced motion), vertical timeline (phones). */
  function initLog() {
    const sec = $('#log'), pin = $('.log__pin', sec), track = $('#log-track');
    if (!sec || !track) return;
    const panels = $$('.log__panel', track);
    panels.forEach((p) => {
      const cv = $('canvas', p);
      if (cv) mount(cv, scene('projectArt', p.dataset.art, p.dataset.art), { revealDuration: 1.2 });
    });
    const ticks = $$('#log-ticks span');
    // Each tick sits at the scroll progress where its panel reaches ~1/3 of the viewport.
    let marks = ticks.map((_, i) => (ticks.length > 1 ? i / (ticks.length - 1) : 0));
    const placeTicks = (dist) => {
      if (!dist || !ticks.length) return;
      const x0 = panels[0].offsetLeft;
      marks = ticks.map((t, i) => Math.min(1, Math.max(0, (panels[i].offsetLeft - x0 - innerWidth * 0.3) / dist)));
      // Keep labels in order with a readable gap, measured from the labels themselves.
      const railW = ($('.log__line', sec) || sec).offsetWidth || 1;
      const tw = Math.max(...ticks.map((t) => t.offsetWidth));
      const gap = (tw * 1.25 + 16) / railW;
      for (let i = 1; i < marks.length; i++) marks[i] = Math.max(marks[i], marks[i - 1] + gap);
      for (let i = marks.length - 1; i > 0 && marks[i] > 1; i--) { marks[i] = 1; marks[i - 1] = Math.min(marks[i - 1], 1 - gap); }
      ticks.forEach((t, i) => {
        t.style.left = (marks[i] * 100) + '%';
        t.style.transform = marks[i] <= 0.001 ? 'none' : marks[i] >= 0.999 ? 'translateX(-100%)' : 'translateX(-50%)';
      });
    };
    const setRail = (p) => {
      sec.style.setProperty('--p', p.toFixed(4));
      ticks.forEach((t, i) => t.classList.toggle('is-on', p >= marks[i] - 0.01));
    };
    setRail(0);
    if (!G || !ST || !G.matchMedia) { sec.classList.add(mobile.matches ? 'is-stack' : 'is-scroll'); return; }
    const mm = G.matchMedia();
    mm.add({
      pinned: '(min-width: 761px) and (prefers-reduced-motion: no-preference)',
      scroll: '(min-width: 761px) and (prefers-reduced-motion: reduce)',
      stack: '(max-width: 760px)',
    }, (ctx) => {
      const { pinned, scroll, stack } = ctx.conditions;
      sec.classList.toggle('is-scroll', !!scroll);
      sec.classList.toggle('is-stack', !!stack);
      if (!pinned) return;
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const tween = G.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin, start: 'top top', end: () => '+=' + dist(),
          pin: true, refreshPriority: 1, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (st) => setRail(st.progress),
          onRefresh: (st) => { placeTicks(dist()); setRail(st.progress); },
        },
      });
      panels.forEach((p, i) => {
        const year = $('.log__year', p), art = $('.log__art', p);
        // Panels already on screen at the start begin their drift from rest.
        const onScreen = p.offsetLeft + p.offsetWidth * 0.5 < innerWidth;
        const sc = { trigger: p, containerAnimation: tween, start: onScreen ? 'left left' : 'left right', end: 'right left', scrub: true };
        G.fromTo(year, { xPercent: onScreen ? 0 : 14 }, { xPercent: -14, ease: 'none', scrollTrigger: sc });
        if (art) G.fromTo(art, { yPercent: onScreen ? 0 : 4 }, { yPercent: -4, ease: 'none', scrollTrigger: { ...sc } });
      });
      placeTicks(dist());
      // Tabbing into a panel scrolls the page to it instead of scrolling the clipped pin.
      const onFocus = (e) => {
        // a click on a panel's art focuses its canvas too; only keyboard focus should move the page
        let kb = true;
        try { kb = e.target.matches(':focus-visible'); } catch (err) { /* no :focus-visible support */ }
        if (!kb) return;
        const p = e.target.closest('.log__panel'), st = tween.scrollTrigger;
        if (!p || !st) return;
        const y = st.start + Math.min(dist(), Math.max(0, p.offsetLeft - panels[0].offsetLeft));
        if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
      };
      const unscroll = () => { if (pin.scrollLeft) pin.scrollLeft = 0; };
      track.addEventListener('focusin', onFocus);
      pin.addEventListener('scroll', unscroll);
      return () => {
        track.removeEventListener('focusin', onFocus);
        pin.removeEventListener('scroll', unscroll);
        G.set(track, { clearProps: 'transform' });
        setRail(0);
      };
    });
  }

  // Parallax: the planet sinks slower than the page as the hero scrolls away.
  // (Never transform an ancestor of a mix-blend-mode headline: it would isolate the blend.)
  function initParallax() {
    if (!G || !ST || !G.matchMedia) return;
    G.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
      G.to('#hero-canvas', { yPercent: 16, ease: 'none', scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom top', scrub: true } });
    });
  }

  function initFooter() {
    const cv = $('#night-canvas');
    const ht = mount(cv, scene('nightLaunch'), { data: { word: 'MUKHAYYAR' }, revealDuration: 2.4 });
    if (!ht) return;
    const scn = $('.footer__scene');
    const update = () => {
      const r = scn.getBoundingClientRect();
      const p = 1 - (r.bottom - innerHeight) / Math.max(1, r.height);
      ht.set('progress', Math.min(1, Math.max(0, p)));
    };
    if (ST) ST.create({ trigger: scn, start: 'top bottom', end: 'bottom bottom', onUpdate: (s) => ht.set('progress', s.progress) });
    else { addEventListener('scroll', update, { passive: true }); update(); }
    const counter = $('#dotcount');
    const fmt = new Intl.NumberFormat('en-US');
    let shown = 0;
    setInterval(() => { if (ht.dotCount && ht.dotCount !== shown) { shown = ht.dotCount; counter.textContent = fmt.format(shown); } }, 500);
  }

  /* -------------------------------------------------------------- motion */
  function runPreloader() {
    return new Promise((resolve) => {
      const pre = $('.preloader');
      const seen = (() => { try { return sessionStorage.getItem('ht-seen'); } catch (e) { return null; } })();
      if (!G || reduced || seen) { root.classList.add('is-loaded'); resolve(); return; }
      try { sessionStorage.setItem('ht-seen', '1'); } catch (e) { /* private mode */ }
      const dots = $('.preloader__dots');
      // 5×5 grid that resolves into the T+M monogram (s = small diagonal hint, a = accent).
      const MARK = ['22a22', '1s2s1', '1.2.1', '1.2.1', '1.2.1'].join('');
      const SIZE = { 2: 1, a: 1, 1: 0.86, s: 0.5, '.': 0.14 };
      dots.innerHTML = [...MARK].map((c) => `<i${c === 'a' ? ' class="a"' : ''} data-s="${SIZE[c]}"></i>`).join('');
      const ds = $$('i', dots);
      const count = $('.preloader__count');
      const o = { v: 0 };
      const tl = G.timeline({ onComplete: () => root.classList.add('is-loaded') });
      tl.to(o, { v: 100, duration: 1.1, ease: 'power2.inOut', onUpdate: () => { count.textContent = String(Math.round(o.v)).padStart(3, '0'); } }, 0)
        .to(ds, { scale: (i, el) => +el.dataset.s, duration: 0.55, ease: 'expo.out', stagger: { each: 0.03, from: 'start', grid: [5, 5] } }, 0.05)
        .to(ds, { scale: 0, duration: 0.4, ease: 'expo.in', stagger: { each: 0.018, from: 'end', grid: [5, 5] } }, 1.05)
        .to(count, { opacity: 0, duration: 0.25 }, 1.1)
        .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 0.8, ease: 'expo.inOut' }, 1.3)
        .call(resolve, null, 1.3);
    });
  }

  // The hidden start state is set in CSS (motion-ok only), so nothing paints before the intro.
  function introHero() {
    if (!G || reduced) { root.classList.add('intro-done'); return; }
    const lines = $$('.hero__title .line > span');
    G.fromTo(lines, { yPercent: 108 }, { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.09, clearProps: 'transform' });
    G.fromTo('[data-intro]', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.06, delay: 0.25, clearProps: 'opacity,transform' });
    G.from('.nav__bar > *', { opacity: 0, y: -10, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.1 });
    root.classList.add('intro-done');
  }

  function initReveals() {
    $$('[data-split]').forEach(splitWords);
    if (!G || !ST || reduced) return;
    $$('[data-split]').forEach((el) => {
      G.from($$('.w > span', el), { yPercent: 112, duration: 1.25, ease: 'expo.out', stagger: 0.045, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    ST.batch('[data-reveal]', {
      start: 'top 94%', once: true,
      onEnter: (batch) => G.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06, overwrite: true }),
    });
    $$('.section-head').forEach((h) => {
      G.fromTo(h, { '--head-line': 0 }, { '--head-line': 1, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 92%', once: true } });
    });
  }

  /* --------------------------------------------------------------- boot */
  async function boot() {
    initScroll();
    initNav();
    initClock();
    initCopy();
    initMode();
    initStill();
    initCursor();
    const pre = runPreloader().then(introHero);
    const d = await DATA;
    try { renderAbout(d); } catch (e) { console.warn(e); }
    try { renderToolbox(d); } catch (e) { console.warn(e); }
    try { renderLog(d); } catch (e) { console.warn(e); }
    try { renderWork(d); } catch (e) { console.warn(e); }
    try { renderProjects(d); } catch (e) { console.warn(e); }
    try { renderNotes(d); } catch (e) { console.warn(e); }
    try { renderAwards(d); } catch (e) { console.warn(e); }
    try { renderPosts(d); } catch (e) { console.warn(e); }
    initAnchors(d);
    initMagnetic();
    initLog();
    initReveals();
    initPi();
    initToolbox();
    initProjects(d);
    initFeature();
    initFooter();
    initFigure();
    initParallax();
    await pre;
    initHero();
    root.classList.add('booted');
    await route(d, { initial: true });
    if (document.fonts) document.fonts.ready.then(refresh);
    addEventListener('load', refresh);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
