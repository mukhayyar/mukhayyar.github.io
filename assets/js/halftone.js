/*!
 * halftone.js — a tiny dot-rendering engine.
 * Every picture on this site is a field of dots: a scene returns ink coverage
 * (0..1) per grid point and the engine turns coverage into dot radius.
 *
 * Scene contract (all fields optional except sample):
 *   pitch       number | (w, h) => number   dot spacing in CSS px
 *   layout      'grid' | 'hex'
 *   gain        max radius as a fraction of pitch/2 (default 1)
 *   palette     ['ink', 'accent', 'muted']  -> CSS vars --ht-ink, --ht-accent ...
 *               or per mode: { mono: [...], color: [...] } — same length, one entry per
 *               "material" index; entries are CSS var keys or literal colours ('#2f7d4f').
 *               st.mode is 'mono' | 'color' (site-wide, Halftone.setMode()).
 *   animated    true if sample() depends on time
 *   interact    'repel' | 'lens' | 'none'
 *   interactRadius  px
 *   fonts       ['700 100px Geist']  awaited before setup
 *   setup(st, H)            precompute; may return a Promise
 *   sample(x, y, t, st, out, i)   set out.d (coverage 0..1) and out.c (palette index)
 *   revealKey(x, y, st)     0..1 order in which dots appear (default: noisy bottom-up)
 *
 * Interaction (all optional):
 *   update(st, dt, H)       once per frame before sampling (springs, inertia, timelines)
 *   onClick(x, y, st, H)    a tap/click (< 6 px travel, < 500 ms); also pushed to st.clicks
 *   onKey(key, st, H)       canvas becomes focusable; return true to consume the key
 *   onMode(mode, st, H)     after the site-wide colour mode changes
 *   drag        'x' | 'xy'  enables drag on touch (touch-action pan-y / none)
 *   cursor      label for the custom cursor while over the canvas ('Drag', 'Launch' …)
 *   label       accessible name when the canvas is focusable
 * Pointer state: st.pointer = { x, y, inside, down, moved, dx, dy (this frame), vx, vy (px/s),
 *   downX, downY }. st.now = seconds of wall time (advances even under reduced motion while
 *   frames run). Set st.busy = true from update() to keep frames coming (e.g. inertia).
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  const hash2 = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------- simplex noise (Gustavson), seeded ----------
  function makeNoise(seed) {
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    let s = (seed >>> 0) || 1;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const g = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3 = 1 / 6;

    function n2(xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, gi;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { gi = (p[ii + p[jj]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x0 + g[gi + 1] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { gi = (p[ii + i1 + p[jj + j1]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x1 + g[gi + 1] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { gi = (p[ii + 1 + p[jj + 1]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x2 + g[gi + 1] * y2); }
      return 70 * n;
    }

    function n3(xin, yin, zin) {
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let n = 0, tt, gi;
      tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (tt > 0) { gi = (p[ii + p[jj + p[kk]]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x0 + g[gi + 1] * y0 + g[gi + 2] * z0); }
      tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (tt > 0) { gi = (p[ii + i1 + p[jj + j1 + p[kk + k1]]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x1 + g[gi + 1] * y1 + g[gi + 2] * z1); }
      tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (tt > 0) { gi = (p[ii + i2 + p[jj + j2 + p[kk + k2]]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x2 + g[gi + 1] * y2 + g[gi + 2] * z2); }
      tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (tt > 0) { gi = (p[ii + 1 + p[jj + 1 + p[kk + 1]]] % 12) * 3; tt *= tt; n += tt * tt * (g[gi] * x3 + g[gi + 1] * y3 + g[gi + 2] * z3); }
      return 32 * n;
    }
    return { n2, n3 };
  }

  const N = makeNoise(20260627);
  const noise2 = N.n2, noise3 = N.n3;
  function fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * noise2(x * f, y * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  function fbm3(x, y, z, oct = 4, lac = 2, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * noise3(x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  function ridged2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(noise2(x * f, y * f)); s += a * n * n; norm += a; a *= gain; f *= lac; }
    return s / norm;
  }

  /**
   * Rasterise text once and return a sampler (x, y) => alpha 0..1 in CSS px.
   * opts: { text, font: '700 {size}px Geist', w, h, x, y, width (fit), size,
   *         align: 'left'|'center'|'right', baseline: 'alphabetic'|'middle'|..., letterSpacing: '-0.04em' }
   * Returns sampler with .box = {x, y, w, h, size} (ink bounds after fit).
   */
  function textMask(opts) {
    const w = Math.max(1, Math.ceil(opts.w)), h = Math.max(1, Math.ceil(opts.h));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const fontFor = (size) => (opts.font || '700 {size}px Geist').replace('{size}', size.toFixed(2));
    let size = opts.size || 100;
    if ('letterSpacing' in ctx && opts.letterSpacing) ctx.letterSpacing = opts.letterSpacing;
    ctx.font = fontFor(size);
    if (opts.width) {
      const m = ctx.measureText(opts.text);
      const ink = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width);
      size = size * (opts.width / ink);
      ctx.font = fontFor(size);
      if ('letterSpacing' in ctx && opts.letterSpacing && /em$/.test(opts.letterSpacing)) {
        ctx.letterSpacing = (parseFloat(opts.letterSpacing) * size).toFixed(2) + 'px';
        const m2 = ctx.measureText(opts.text);
        const ink2 = (m2.actualBoundingBoxLeft || 0) + (m2.actualBoundingBoxRight || m2.width);
        size = size * (opts.width / ink2);
        ctx.font = fontFor(size);
        ctx.letterSpacing = (parseFloat(opts.letterSpacing) * size).toFixed(2) + 'px';
      }
    }
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillStyle = '#fff';
    const m = ctx.measureText(opts.text);
    let x = opts.x || 0;
    if ((opts.align || 'left') === 'left') x += m.actualBoundingBoxLeft || 0;
    ctx.fillText(opts.text, x, opts.y == null ? h * 0.8 : opts.y);
    const data = ctx.getImageData(0, 0, w, h).data;
    const sampler = (sx, sy) => {
      const ix = sx | 0, iy = sy | 0;
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) return 0;
      return data[(iy * w + ix) * 4 + 3] / 255;
    };
    const left = x - (m.actualBoundingBoxLeft || 0);
    const top = (opts.y == null ? h * 0.8 : opts.y) - (m.actualBoundingBoxAscent || 0);
    sampler.box = {
      x: left, y: top,
      w: (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width),
      h: (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0),
      size,
    };
    return sampler;
  }

  const H = { TAU, clamp, mix, smoothstep, hash2, noise2, noise3, fbm2, fbm3, ridged2, makeNoise, textMask };

  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const isColour = (k) => /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(k);
  const instances = new Set();
  let still = false; // site-wide "pause motion": freezes scene time, keeps direct manipulation
  const initialMode = () => {
    const m = document.documentElement.getAttribute('data-ht-mode');
    return m === 'color' ? 'color' : 'mono';
  };

  class Halftone {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} scene  see contract at top of file
     * @param {object} opts   { autoplay=true, revealDuration=1.6, data={}, interactTarget=canvas, maxDpr=2 }
     */
    constructor(canvas, scene, opts = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ autoplay: true, revealDuration: 1.6, data: {}, maxDpr: 2, interactTarget: canvas }, opts);
      this.st = { w: 0, h: 0, t: 0, now: 0, progress: 0, reveal: this.o.autoplay && !reduceMotion.matches ? 0 : 1,
        mx: -1e4, my: -1e4, mk: 0, data: this.o.data, grid: null, pitch: 8, reduced: reduceMotion.matches,
        mode: initialMode(), busy: false, clicks: [],
        pointer: { x: -1e4, y: -1e4, inside: false, down: false, moved: false, dx: 0, dy: 0, vx: 0, vy: 0, downX: 0, downY: 0, downT: 0, lastT: 0 } };
      this.out = { d: 0, c: 0 };
      this.mouse = { x: -1e4, y: -1e4, inside: false };
      this.visible = false;
      this.running = false;
      this.ready = false;
      this.dotCount = 0;
      this.colors = [];
      this.last = 0;
      this._frame = this._frame.bind(this);
      this.scene = scene;
      instances.add(this);
      this._bind();
      this._decorate();
    }

    /** Canvas affordances that depend on the scene (focus, touch-action, cursor label). */
    _decorate() {
      const c = this.c, sc = this.scene;
      if (!this.o.autoplay) return;
      c.style.touchAction = sc.drag === 'xy' ? 'none' : sc.drag === 'x' ? 'pan-y' : '';
      if (sc.cursor) c.dataset.cursor = sc.cursor; else if (c.dataset.cursor && !this._ownCursor) delete c.dataset.cursor;
      if (sc.onKey) {
        c.tabIndex = 0;
        c.setAttribute('role', 'img');
        if (sc.label) c.setAttribute('aria-label', sc.label);
        c.removeAttribute('aria-hidden');
      }
    }

    _bind() {
      const tgt = this.o.interactTarget, c = this.c, P = this.st.pointer;
      const ac = this._ac = window.AbortController ? new AbortController() : null;
      const on = (el, type, fn, extra) => el.addEventListener(type, fn, Object.assign(ac ? { signal: ac.signal } : {}, extra || {}));
      const rel = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      if (this.o.autoplay) {
        on(tgt, 'pointermove', (e) => {
          if (e.pointerType === 'touch' && !P.down) return;
          const [x, y] = rel(e);
          const now = performance.now();
          if (P.down) {
            const ddx = x - P.x, ddy = y - P.y, dt = Math.max(8, now - P.lastT);
            P.dx += ddx; P.dy += ddy;
            P.vx = P.vx * 0.5 + (ddx / dt) * 1000 * 0.5;
            P.vy = P.vy * 0.5 + (ddy / dt) * 1000 * 0.5;
            if (Math.hypot(x - P.downX, y - P.downY) > 6) P.moved = true;
          }
          P.x = x; P.y = y; P.lastT = now; P.inside = x >= 0 && y >= 0 && x <= this.st.w && y <= this.st.h;
          this.mouse.x = x; this.mouse.y = y; this.mouse.inside = true;
          if (this.st.mk < 0.01) { this.st.mx = x; this.st.my = y; }
          this.wake();
        }, { passive: true });
        on(tgt, 'pointerleave', () => { this.mouse.inside = false; if (!P.down) P.inside = false; this.wake(); }, { passive: true });
        on(c, 'pointerdown', (e) => {
          const sc = this.scene;
          if (!(sc.update || sc.onClick) || (e.button && e.button !== 0)) return;
          const [x, y] = rel(e);
          Object.assign(P, { down: true, moved: false, x, y, downX: x, downY: y, downT: performance.now(), lastT: performance.now(), vx: 0, vy: 0, inside: true });
          try { c.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
          this.wake();
        });
        const up = (e) => {
          if (!P.down) return;
          P.down = false;
          const [x, y] = rel(e);
          if (performance.now() - P.lastT > 90) { P.vx = 0; P.vy = 0; }
          if (!P.moved && performance.now() - P.downT < 500 && e.type === 'pointerup') {
            this.st.clicks.push({ x, y, t: this.st.t, now: this.st.now });
            if (this.st.clicks.length > 16) this.st.clicks.shift();
            if (this.scene.onClick) this.scene.onClick(x, y, this.st, H);
          }
          this.wake();
        };
        on(c, 'pointerup', up);
        on(c, 'pointercancel', up);
        on(c, 'keydown', (e) => {
          if (this.scene.onKey && this.scene.onKey(e.key, this.st, H)) { e.preventDefault(); this.wake(); }
        });
        this.io = new IntersectionObserver((es) => {
          for (const e of es) { this.visible = e.isIntersecting; if (this.visible) this.wake(); }
        }, { rootMargin: '120px' });
        this.io.observe(this.c);
      }
      this.ro = new ResizeObserver(() => { clearTimeout(this._rt); this._rt = setTimeout(() => this.resize(), this.ready ? 120 : 0); });
      this.ro.observe(this.c);
    }

    readColors() {
      const cs = getComputedStyle(this.c);
      let pal = this.scene.palette || ['ink', 'accent', 'muted'];
      if (!Array.isArray(pal)) pal = pal[this.st.mode] || pal.mono || Object.values(pal)[0];
      this.colors = pal.map((k) => (isColour(k) ? k : (cs.getPropertyValue('--ht-' + k) || '').trim() || '#111'));
    }

    setMode(mode) {
      if (mode !== 'color') mode = 'mono';
      if (this.st.mode === mode) return this;
      this.st.mode = mode;
      this.readColors();
      if (this.scene.onMode) this.scene.onMode(mode, this.st, H);
      if (this.ready) { this.draw(); this.wake(); }
      return this;
    }

    async resize() {
      const r = this.c.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h || this._dead) return;
      if (w === this.st.w && h === this.st.h && this.ready) return;
      const dpr = Math.min(window.devicePixelRatio || 1, this.o.maxDpr);
      this.dpr = dpr;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = this.st;
      st.w = w; st.h = h;
      this.readColors();
      this._grid();
      if (this.scene.fonts && document.fonts) {
        try { await Promise.all(this.scene.fonts.map((f) => document.fonts.load(f))); } catch (e) { /* fall back to system font */ }
      }
      if (this.scene.setup) await this.scene.setup(st, H);
      if (this._dead) return;
      this._thresholds();
      this.ready = true;
      this.draw();
      this.wake();
      if (this.onready) this.onready(this);
    }

    _grid() {
      const st = this.st, sc = this.scene;
      const pitch = typeof sc.pitch === 'function' ? sc.pitch(st.w, st.h) : (sc.pitch || 8);
      const hex = sc.layout === 'hex';
      const rowStep = hex ? pitch * 0.8660254 : pitch;
      const cols = Math.ceil(st.w / pitch) + 1, rows = Math.ceil(st.h / rowStep) + 1;
      const n = cols * rows;
      const xs = new Float32Array(n), ys = new Float32Array(n);
      const ox = (st.w - (cols - 1) * pitch) / 2, oy = (st.h - (rows - 1) * rowStep) / 2;
      let i = 0;
      for (let r = 0; r < rows; r++) {
        const off = hex && (r & 1) ? pitch / 2 : 0;
        for (let c = 0; c < cols; c++, i++) { xs[i] = ox + c * pitch + off; ys[i] = oy + r * rowStep; }
      }
      st.pitch = pitch;
      st.grid = { n, xs, ys, cols, rows };
      this.maxR = pitch * 0.5 * (sc.gain || 1);
    }

    _thresholds() {
      const st = this.st, { n, xs, ys } = st.grid;
      const thr = new Float32Array(n);
      const key = this.scene.revealKey;
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i];
        thr[i] = key ? clamp(key(x, y, st)) : clamp(0.62 * (1 - y / st.h) + 0.38 * hash2(x * 7.1, y * 3.3));
      }
      this.thr = thr;
    }

    set(key, val) { if (this.st[key] !== val) { this.st[key] = val; this.wake(); } return this; }
    setData(obj) { Object.assign(this.st.data, obj); this.wake(); return this; }

    async setScene(scene, { reveal = true } = {}) {
      this.scene = scene;
      this._decorate();
      this.ready = false;
      this.st.w = 0; this.st.h = 0;
      if (reveal && !this.st.reduced) this.st.reveal = 0;
      await this.resize();
    }

    pause() { this.paused = true; return this; }
    resume() { this.paused = false; this.wake(); return this; }

    wake() {
      if (!this.ready || this.running || !this.o.autoplay || this.paused) return;
      if (!this.visible) return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this._frame);
    }

    _frame(now) {
      if (!this.visible || !this.ready || this.paused || this._dead) { this.running = false; return; }
      const st = this.st, m = this.mouse, P = st.pointer;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      st.now += dt;
      st.still = still;
      if (this.scene.animated && !st.reduced && !still) st.t += dt;
      st.busy = false;
      if (this.scene.update) this.scene.update(st, dt, H);
      P.dx = 0; P.dy = 0;
      if (st.reveal < 1) st.reveal = Math.min(1, st.reveal + dt / this.o.revealDuration);
      const target = m.inside && !st.reduced ? 1 : 0;
      st.mk += (target - st.mk) * 0.09;
      if (m.inside) { st.mx += (m.x - st.mx) * 0.2; st.my += (m.y - st.my) * 0.2; }
      this.draw();
      const settling = Math.abs(target - st.mk) > 0.002 || (m.inside && (Math.abs(m.x - st.mx) > 0.3 || Math.abs(m.y - st.my) > 0.3));
      if ((this.scene.animated && !st.reduced && !still) || st.reveal < 1 || settling || st.busy || P.down) requestAnimationFrame(this._frame);
      else this.running = false;
    }

    /** Deterministic render for screenshots / tests. */
    renderAt(t = 0, extra = {}) {
      Object.assign(this.st, { t, reveal: 1 }, extra);
      if (extra.mouse) { this.st.mx = extra.mouse[0]; this.st.my = extra.mouse[1]; this.st.mk = 1; }
      if (this.scene.update) this.scene.update(this.st, 0, H);
      this.draw();
    }

    draw() {
      const st = this.st, sc = this.scene, ctx = this.ctx, out = this.out;
      if (!st.grid) return;
      const { n, xs, ys } = st.grid;
      const thr = this.thr, maxR = this.maxR, t = st.t;
      const mode = st.reduced ? 'none' : (sc.interact || 'repel');
      const R = sc.interactRadius || 150, R2 = R * R;
      const mk = st.mk, mx = st.mx, my = st.my;
      const revealing = st.reveal < 1;
      const rv = st.reveal * 1.35;
      const paths = this.colors.map(() => new Path2D());
      const minR = sc.minR == null ? 0.32 : sc.minR;
      const square = sc.shape === 'square';
      let count = 0;
      ctx.clearRect(0, 0, st.w, st.h);
      for (let i = 0; i < n; i++) {
        let x = xs[i], y = ys[i];
        out.d = 0; out.c = 0;
        sc.sample(x, y, t, st, out, i);
        let r = maxR * Math.sqrt(out.d > 1 ? 1 : out.d);
        if (mk > 0.002 && mode !== 'none') {
          const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1, f = 1 - d / R, f2 = f * f * mk;
            if (mode === 'repel') { const k = f2 * R * 0.32; x += (dx / d) * k; y += (dy / d) * k; r *= 1 - f2 * 0.25; }
            else if (mode === 'lens') { r = Math.max(r * (1 + f2 * 0.9), maxR * 0.42 * f2 * f); }
          }
        }
        if (revealing) {
          const s = clamp((rv - thr[i]) / 0.35);
          r *= s * s * (3 - 2 * s);
        }
        if (r < minR) continue;
        const p = paths[out.c] || paths[0];
        if (square) p.rect(x - r, y - r, r * 2, r * 2);
        else { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
        count++;
      }
      for (let k = 0; k < paths.length; k++) { ctx.fillStyle = this.colors[k]; ctx.fill(paths[k]); }
      this.dotCount = count;
    }

    destroy() {
      this._dead = true;
      this._ac && this._ac.abort();
      clearTimeout(this._rt);
      this.io && this.io.disconnect();
      this.ro && this.ro.disconnect();
      this.running = false; this.visible = false; this.ready = false;
      this.st.grid = null; this.thr = null;
      instances.delete(this);
    }
  }

  Halftone.utils = H;
  Halftone.instances = instances;
  /** Site-wide colour mode: 'mono' (ink + one accent) or 'color' (each material in its own colour). */
  Halftone.getMode = initialMode;
  Halftone.isStill = () => still;
  Halftone.setStill = (v) => {
    still = !!v;
    document.documentElement.toggleAttribute('data-ht-still', still);
    instances.forEach((ht) => ht.wake());
    return still;
  };
  Halftone.setMode = (mode) => {
    mode = mode === 'color' ? 'color' : 'mono';
    document.documentElement.setAttribute('data-ht-mode', mode);
    instances.forEach((ht) => ht.setMode(mode));
    window.dispatchEvent(new CustomEvent('ht:mode', { detail: mode }));
    return mode;
  };
  Halftone.scenes = Halftone.scenes || {};
  window.Halftone = Halftone;
})();
