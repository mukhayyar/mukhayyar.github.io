/* Tool logos as dot icons. Halftone.scenes.logo(src, hex, short)
   - src:   a single-path SVG (Simple Icons) — sampled into a dot grid
   - hex:   brand colour for Color mode (darkened until it reads on paper)
   - short: initials drawn in dots when there is no logo */
(function () {
  'use strict';
  const cache = new Map();
  const load = (src) => {
    if (!cache.has(src)) {
      cache.set(src, new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }));
    }
    return cache.get(src);
  };
  const lum = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Keep the brand hue but make sure it holds ~2.4:1 against the paper (#F1F0EB, L≈0.87).
  const readable = (hex) => {
    if (!hex) return null;
    let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    for (let k = 0; k < 24 && (0.92 / (lum(r, g, b) + 0.05)) < 2.4; k++) { r *= 0.9; g *= 0.9; b *= 0.9; }
    if (lum(r, g, b) < 0.012) return null; // near-black brands use the page ink
    return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
  };

  Halftone.scenes.logo = (src, hex, short) => {
    const brand = readable(hex);
    return {
      pitch: (w) => Math.max(2.2, w / 22),
      layout: 'grid',
      gain: 1.08,
      minR: 0.28,
      interact: 'repel',
      interactRadius: 26,
      animated: false,
      palette: { mono: ['ink', 'faint'], color: [brand || 'ink', 'faint'] },
      fonts: short ? ['600 40px "Geist Mono"'] : undefined,
      label: undefined,
      revealKey(x, y, st) {
        return 0.8 * Math.hypot(x - st.w / 2, y - st.h / 2) / (st.w * 0.7) + 0.2 * Halftone.utils.hash2(x * 3.1, y * 5.7);
      },
      async setup(st, H) {
        const { cols, rows, n, xs, ys } = st.grid;
        this.cov = new Float32Array(n);
        this.rip = 0; this.rx = 0; this.ry = 0;
        const S = 4; // supersampling per dot
        const cv = document.createElement('canvas');
        cv.width = cols * S; cv.height = rows * S;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const p = st.pitch, ox = xs[0], oy = ys[0];
        // grid space: dot (c, r) covers [c*S, (c+1)*S) in the offscreen canvas
        ctx.setTransform(S / p, 0, 0, S / p, S * 0.5 - (ox * S) / p, S * 0.5 - (oy * S) / p);
        const pad = st.w * 0.12, box = st.w - pad * 2;
        if (src) {
          try {
            const img = await load(src);
            ctx.drawImage(img, pad, (st.h - box) / 2, box, box);
          } catch (e) { short = short || '·'; }
        }
        if (!src || short) {
          ctx.fillStyle = '#000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `600 ${(box * 0.62).toFixed(1)}px "Geist Mono", ui-monospace, monospace`;
          ctx.fillText(short || '?', st.w / 2, st.h / 2 + box * 0.03);
        }
        const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let a = 0;
            for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) a += data[(((r * S + yy) * cv.width) + c * S + xx) * 4 + 3];
            this.cov[r * cols + c] = a / (S * S * 255);
          }
        }
      },
      onClick(x, y, st) { this.rip = 1; this.rx = x; this.ry = y; st.busy = true; },
      update(st, dt) {
        if (this.rip > 0) { this.rip = Math.max(0, this.rip - dt * 1.6); st.busy = this.rip > 0; }
      },
      sample(x, y, t, st, out, i) {
        const c = this.cov ? this.cov[i] : 0;
        let d = c > 0.04 ? 0.18 + 0.82 * c : 0;
        if (this.rip > 0) {
          const ring = (1 - this.rip) * st.w * 0.9, dd = Math.hypot(x - this.rx, y - this.ry);
          const k = Math.max(0, 1 - Math.abs(dd - ring) / (st.pitch * 1.6)) * this.rip;
          d = Math.min(1, d * (1 + k * 0.9) + (d === 0 ? k * 0.35 : 0));
        }
        out.d = d;
        out.c = c > 0.04 ? 0 : 1;
      },
    };
  };
})();
