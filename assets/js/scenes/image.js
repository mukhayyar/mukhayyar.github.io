/* Any picture → halftone. Halftone.scenes.image(src, { pitch, contrast, gamma, accent }) */
(function () {
  'use strict';
  const cache = new Map();
  const load = (src) => {
    if (!cache.has(src)) {
      cache.set(src, new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        if (/^https?:/i.test(src) && !src.startsWith(location.origin)) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }));
    }
    return cache.get(src);
  };

  Halftone.scenes.image = (src, opts = {}) => ({
    pitch: (w) => opts.pitch || Math.max(4, Math.round(w / 120)),
    layout: 'grid',
    interact: 'repel',
    interactRadius: 120,
    palette: ['ink', 'accent', 'muted'],
    revealKey(x, y, st) {
      const H = Halftone.utils;
      return 0.75 * (Math.hypot(x - st.w / 2, y - st.h / 2) / Math.hypot(st.w / 2, st.h / 2)) + 0.25 * H.hash2(x, y);
    },
    async setup(st) {
      const { cols, rows, xs, ys, n } = st.grid;
      this.cov = new Float32Array(n);
      this.col = new Uint8Array(n);
      let img;
      try { img = await load(src); } catch (e) { this.failed = true; return; }
      const cv = document.createElement('canvas');
      cv.width = cols; cv.height = rows;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // object-fit: cover in CSS px, mapped into one pixel per dot.
      const s = Math.max(st.w / img.naturalWidth, st.h / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      const dx = (st.w - dw) / 2, dy = (st.h - dh) / 2;
      const ox = xs[0], oy = ys[0], p = st.pitch;
      const rowStep = rows > 1 ? ys[cols] - ys[0] : p;
      ctx.setTransform(1 / p, 0, 0, 1 / rowStep, 0.5 - ox / p, 0.5 - oy / rowStep);
      ctx.drawImage(img, dx, dy, dw, dh);
      let data;
      try { data = ctx.getImageData(0, 0, cols, rows).data; } catch (e) { this.failed = true; return; }
      const contrast = opts.contrast ?? 1.15, gamma = opts.gamma ?? 1;
      for (let i = 0; i < n; i++) {
        const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255, a = data[i * 4 + 3] / 255;
        let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        l = 1 - (1 - l) * a;
        let c = Math.pow(1 - l, gamma);
        c = Math.min(1, Math.max(0, (c - 0.5) * contrast + 0.5));
        this.cov[i] = c;
        if (opts.accent) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
          if (sat > 0.5 && r === mx && g < 0.62 * r + 0.1) this.col[i] = 1;
        }
      }
    },
    sample(x, y, t, st, out, i) {
      out.d = this.cov ? this.cov[i] : 0;
      out.c = this.col ? this.col[i] : 0;
    },
  });
})();
