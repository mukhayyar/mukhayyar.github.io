/*!
 * projects.js — halftone art for the PROJECTS index, the flight log and post
 * covers (light theme). Every motif is a small toy: it reacts to the cursor,
 * to clicks / taps, to drags and to the keyboard, and plays a gentle "ghost"
 * demo of its own interaction when nobody is touching it (the desktop hover
 * preview never receives pointer input, so the ghost is what people see there).
 *
 *   Halftone.scenes.projectArt(name, tech) -> scene
 *   Halftone.scenes.projectArt.keyOf(name, tech) -> motif key string
 *   Halftone.scenes.projectArt.keys -> list of motif keys
 *
 * Rendering. A motif paints a static "ink plate" once (cached per project,
 * size and colour mode): an offscreen canvas where R = ink coverage and
 * G = material id, screened per dot cell. Moving parts (a rotating rocket, a
 * steering canopy) are painted per frame into a transparent "dynamic plate"
 * (alpha = occlusion) and composited over the static one, only when their
 * state changed. Fine animation (echo traces, sweeps, ripples) is written per
 * dot, radius-linear (coverage = s*s) so nothing pops between frames.
 *
 * Materials. Each motif lists its materials as [monoKey, colour | [light, mid,
 * dark]]. Mono maps them onto ink / accent / muted exactly as before (one
 * accent, < 8 % of the dot area); colour mode paints each material in its own
 * natural colour, picking the tonal step from the dot's coverage (small lit
 * dots light, big shaded dots dark) like a risograph.
 *
 * One rule set for every motif (the "family"):
 *  - unit = min(h/2, w/2.7), origin at the canvas centre, v down. All art sits
 *    inside |u| <= 1.05, |v| <= 0.72 and spans ~65-70 % of the width.
 *  - Light from the upper left. Volumes ramp from ~0.22 (lit) to ~0.95
 *    (shade); grounded objects cast a soft shadow to the lower right.
 *  - Ink carries the form. Context (grids, rings, axes, water) is muted at
 *    coverage <= 0.45. Strokes are >= 1.2 dots wide.
 *
 * Interaction (per motif, see M.*): cursor/aim (hover, or touch-drag), click /
 * tap, drag ('x' so phones still scroll), keys (arrows + Enter/Space). Springs
 * and timelines run on st.now; ambient motion on st.t (frozen when reduced).
 */
(function () {
  'use strict';
  const HT = window.Halftone;
  if (!HT) return;
  const { clamp, mix, smoothstep, hash2, fbm2, makeNoise, TAU, noise2 } = HT.utils;
  const PI = Math.PI;
  // shared material ids: every motif's material table starts with these four
  const INK = 0, ACC = 1, MUT = 2, SHD = 3, KEEP = 255;
  // family tones
  const T = { lit: 0.22, mid: 0.55, shade: 0.95, crease: 0.9, ctx: 0.42, ctxLo: 0.26, shadow: 0.3 };
  // the ghost takes over IDLE s after the last real input; IDLE_HOLD s instead while
  // the cursor still rests on a graphic it just dragged / clicked (or the keyboard
  // set it), so a pose the visitor chose is not snatched away under their cursor
  const IDLE = 3, IDLE_HOLD = 12, GHOST_DELAY = 0.7;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const angWrap = (a) => a - TAU * Math.round(a / TAU);
  // damped spring { x, v } toward tgt: w angular frequency (rad/s), z damping ratio
  function spring(s, tgt, dt, w, z) {
    if (dt > 0) {
      const n = Math.ceil(dt / 0.008), h = dt / n;
      for (let k = 0; k < n; k++) { s.v += (-w * w * (s.x - tgt) - 2 * z * w * s.v) * h; s.x += s.v * h; }
    }
    const moving = Math.abs(s.x - tgt) > 2e-4 || Math.abs(s.v) > 2e-3;
    if (!moving && dt > 0) { s.x = tgt; s.v = 0; }
    return moving;
  }
  const spr = (x) => ({ x, v: 0 });
  // free rotation with friction (inertia after a drag); returns true while moving
  function coast(s, dt, fr) {
    if (dt <= 0 || Math.abs(s.v) < 1e-3) { s.v = dt > 0 ? 0 : s.v; return false; }
    s.x += s.v * dt; s.v *= Math.exp(-fr * dt);
    return true;
  }

  // ------------------------------------------------------------------ keywords
  const RULES = [
    ['detection', /\bahd\b|detect|yolo|vision/],
    ['ndt', /\bndt\b|opticontrol|ultrason|corrosion|inspection/],
    ['trajectory', /rockethub|trajector|openrocket/],
    ['parafoil', /cansat firmware|paraglid|parafoil/],
    ['rocket', /rocket avionics|avionic|rocket|flight computer/],
    ['radar', /\bgcs\b|ground control|telemetry/],
    ['chart', /petruck|\bai\b|analytic|dashboard|plotly/],
    ['slabs', /infoglobal|migration|legacy|moderni[sz]/],
    ['can', /cansat kit|cansat|cubesat|satellite/],
    ['fish', /hifish|\biot\b|aquacult|fish/],
    ['dish', /ground station|\bwpf\b|\bdish\b/],
    ['antenna', /moxon|yagi|antenna|\brf\b|900 ?mhz/],
  ];
  function keyOf(name, tech) {
    const n = String(name || '').toLowerCase();
    const t = String(tech || '').toLowerCase();
    for (const [k, re] of RULES) if (re.test(n)) return k;
    for (const [k, re] of RULES) if (re.test(t)) return k;
    return 'topo';
  }
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return h >>> 0;
  }

  // ------------------------------------------------------------------ materials
  // [monoKey, colour | [light, mid, dark]] -> engine palette { mono, color } + lookup
  function buildPalette(mats) {
    const mono = [], color = [], base = new Uint16Array(256), nb = new Uint8Array(256);
    mats.forEach(([mk, cl], id) => {
      const cs = Array.isArray(cl) ? cl : [cl];
      base[id] = mono.length; nb[id] = cs.length;
      for (const c of cs) { mono.push(mk); color.push(c); }
    });
    return { mono, color, base, nb };
  }
  const BASE_MATS = [['ink', '#2E2D2A'], ['accent', 'accent'], ['muted', '#9B9A93'], ['ink', '#A29D94']];

  // ------------------------------------------------------------------ geometry helpers
  function isoProj(azDeg, elDeg) {
    const a = azDeg * PI / 180, e = elDeg * PI / 180;
    const sa = Math.sin(a), ca = Math.cos(a), se = Math.sin(e), ce = Math.cos(e);
    return (x, y, z) => [x * sa - y * ca, (x * ca + y * sa) * se - z * ce];
  }
  function fitProj(proj, pts, cu, cv, maxW, maxH) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { const [a, b] = proj(p[0], p[1], p[2]); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
    const k = Math.min(maxW / (x1 - x0), maxH / (y1 - y0));
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const f = (x, y, z) => { const [a, b] = proj(x, y, z); return [cu + (a - mx) * k, cv + (b - my) * k]; };
    f.k = k;
    return f;
  }
  function cumLen(pts) {
    const c = [0];
    for (let k = 1; k < pts.length; k++) c.push(c[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return c;
  }
  function polyDist(pts, cum, u, v) {
    let best = 1e9, bq = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      let s = ((u - ax) * dx + (v - ay) * dy) / L2; s = s < 0 ? 0 : s > 1 ? 1 : s;
      const ex = ax + dx * s - u, ey = ay + dy * s - v, d2 = ex * ex + ey * ey;
      if (d2 < best) { best = d2; bq = cum[k] + (cum[k + 1] - cum[k]) * s; }
    }
    return [Math.sqrt(best), bq / (cum[cum.length - 1] || 1)];
  }
  function catmull(pts, steps) {
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
      for (let j = 0; j < steps; j++) {
        const s = j / steps, s2 = s * s, s3 = s2 * s;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  const wrap01 = (x) => x - Math.floor(x);

  // ------------------------------------------------------------------ painter (ink plate)
  // static plate: opaque white canvas, R = 255 * (1 - coverage), G = material id,
  // B = 0 (so B = 255 * (1 - alpha) after anti-aliasing against the white plate,
  // which lets the reader undo the blend and recover the true id of a fringe pixel).
  // dynamic plate: transparent canvas, same encoding, alpha = occlusion.
  // KEEP shading (cast shadows) darkens without changing the material below.
  function painter(g, L, mode, dyn) {
    const dot = L.p / L.S;
    const enc = (k, a) => {
      if (k === KEEP) return dyn ? `rgba(0,255,255,${clamp(a).toFixed(3)})` : `rgb(${Math.round(255 * (1 - clamp(a)))},255,255)`;
      return `rgb(${Math.round(255 * (1 - clamp(a)))},${k},0)`;
    };
    const P = {
      g, L, dot, enc, mode, dyn, color: mode === 'color',
      m: (k, a) => enc(k, a),
      ink: (a) => enc(INK, a), acc: (a) => enc(ACC, a), mut: (a) => enc(MUT, a), shd: (a) => enc(KEEP, a),
      lin(x0, y0, x1, y1, stops, k = INK) {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        for (const [t, a] of stops) gr.addColorStop(t, enc(k, a));
        return gr;
      },
      rad(x, y, r0, r1, stops, k = INK, x1 = x, y1 = y) {
        const gr = g.createRadialGradient(x, y, r0, x1, y1, r1);
        for (const [t, a] of stops) gr.addColorStop(t, enc(k, a));
        return gr;
      },
      // vertical cylinder lit from the upper left: rim light, highlight, terminator, core shadow
      cyl(x0, x1, k = INK, lo = T.lit) {
        return P.lin(x0, 0, x1, 0, [[0, 0.5], [0.2, lo], [0.45, lo + 0.16], [0.8, 0.86], [1, T.shade]], k);
      },
      path(pts, closed = true) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        if (closed) g.closePath();
      },
      poly(pts, style) { P.path(pts); g.fillStyle = style; g.fill(); },
      stroke(pts, w, style, closed = false) { P.path(pts, closed); g.lineWidth = w; g.strokeStyle = style; g.stroke(); },
      seg(x0, y0, x1, y1, w, style) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineWidth = w; g.strokeStyle = style; g.stroke(); },
      ellipse(x, y, rx, ry, rot, style) { g.beginPath(); g.ellipse(x, y, Math.max(1e-4, rx), Math.max(1e-4, ry), rot, 0, TAU); g.fillStyle = style; g.fill(); },
      circle(x, y, r, style) { g.beginPath(); g.arc(x, y, Math.max(1e-4, r), 0, TAU); g.fillStyle = style; g.fill(); },
      ring(x, y, rx, ry, rot, w, style, a0 = 0, a1 = TAU) { g.beginPath(); g.ellipse(x, y, Math.max(1e-4, rx), Math.max(1e-4, ry), rot, a0, a1); g.lineWidth = w; g.strokeStyle = style; g.stroke(); },
      rrect(x, y, w, h, r, style) {
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); else g.rect(x, y, w, h);
        g.fillStyle = style; g.fill();
      },
      // soft shadow on the floor cast to the right (light from the upper left)
      cast(x, y, len, h, a) {
        g.save(); if (!dyn) g.globalCompositeOperation = 'multiply';
        g.translate(x, y); g.scale(1, h / len);
        const gr = g.createRadialGradient(len * 0.04, 0, 0, len * 0.32, 0, len * 0.72);
        gr.addColorStop(0, enc(KEEP, a)); gr.addColorStop(0.3, enc(KEEP, a * 0.75)); gr.addColorStop(0.65, enc(KEEP, a * 0.3)); gr.addColorStop(1, enc(KEEP, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(len * 0.32, 0, len * 0.72, 0, TAU); g.fill();
        g.restore();
      },
      multiply(fn) { g.save(); if (!dyn) g.globalCompositeOperation = 'multiply'; fn(); g.restore(); },
      colU: (c) => (L.ox + c * L.p - L.cx) / L.S,
      rowV: (r) => (L.oy + r * L.p - L.cy) / L.S,
      colOf: (u) => Math.round((L.cx + u * L.S - L.ox) / L.p),
      rowOf: (v) => Math.round((L.cy + v * L.S - L.oy) / L.p),
    };
    P.su = (u) => P.colU(P.colOf(u));
    P.sv = (v) => P.rowV(P.rowOf(v));
    return P;
  }

  // ------------------------------------------------------------------ plate readback
  const HIST = new Float32Array(256);
  // opaque plate -> coverage D, material C (coverage-weighted vote per dot cell).
  // An anti-aliased fringe pixel is its material blended with the white plate, so
  // its G drifts toward 255 and would vote for a neighbouring id (a stray accent
  // speck, say); B = 255 * (1 - alpha) undoes that blend.
  const sid = (G, B) => {
    if (B === 0) return G;
    const al = 1 - B / 255;
    if (al < 0.04) return G >= 250 ? SHD : G;
    const k = Math.round((G - B) / al);
    return k < 0 ? 0 : k > 255 ? 255 : k;
  };
  function readStatic(data, W, cols, rows, K, D, C) {
    const inv = 1 / (255 * K * K);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let s = 0, best = INK, bw = 0;
      for (let y = r * K; y < r * K + K; y++) {
        let o = (y * W + c * K) * 4;
        for (let x = 0; x < K; x++, o += 4) {
          const a = 255 - data[o];
          if (a === 0) continue;
          s += a;
          const hv = (HIST[sid(data[o + 1], data[o + 2])] += a);
          if (hv > bw) { bw = hv; best = sid(data[o + 1], data[o + 2]); }
        }
      }
      if (s > 0) for (let y = r * K; y < r * K + K; y++) { let o = (y * W + c * K) * 4; for (let x = 0; x < K; x++, o += 4) HIST[sid(data[o + 1], data[o + 2])] = 0; }
      const i = r * cols + c;
      D[i] = s * inv; C[i] = best;
    }
  }
  // transparent plate -> alpha DA, coverage DD, material DC; returns the list of covered dots
  function readDyn(data, W, cols, rows, K, DA, DD, DC, list) {
    const inv = 1 / (255 * K * K);
    let nl = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let sa = 0, s = 0, best = INK, bw = 0;
      for (let y = r * K; y < r * K + K; y++) {
        let o = (y * W + c * K) * 4;
        for (let x = 0; x < K; x++, o += 4) {
          const A = data[o + 3];
          if (A === 0) continue;
          sa += A;
          const ink = (255 - data[o]) * A / 255;
          s += ink;
          const id = data[o + 1] >= 250 ? SHD : data[o + 1];
          const hv = (HIST[id] += ink + A * 0.01);
          if (hv > bw) { bw = hv; best = id; }
        }
      }
      const i = r * cols + c;
      if (sa > 0) {
        for (let y = r * K; y < r * K + K; y++) { let o = (y * W + c * K) * 4; for (let x = 0; x < K; x++, o += 4) HIST[data[o + 1] >= 250 ? SHD : data[o + 1]] = 0; }
        DA[i] = Math.min(1, sa * inv); DD[i] = s * inv; DC[i] = best; list[nl++] = i;
      } else DA[i] = 0;
    }
    return nl;
  }

  // ------------------------------------------------------------------ per-dot helpers (setup time)
  // dots within reach of a polyline -> {idx, prof (0..1 stroke profile), q (0..1 along), len}
  function lineField(F, pts, wDots) {
    const cum = cumLen(pts);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [u, v] of pts) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const half = wDots / 2, m = F.dot * (half + 2);
    const idx = [], prof = [], q = [];
    const c0 = Math.max(0, F.P.colOf(u0 - m)), c1 = Math.min(F.cols - 1, F.P.colOf(u1 + m));
    const r0 = Math.max(0, F.P.rowOf(v0 - m)), r1 = Math.min(F.rows - 1, F.P.rowOf(v1 + m));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * F.cols + c;
      const [d, s] = polyDist(pts, cum, F.U[i], F.V[i]);
      const dd = d / F.dot;
      if (dd < half + 0.6) { idx.push(i); prof.push(smoothstep(half + 0.6, half - 0.4, dd)); q.push(s); }
    }
    return { idx, prof, q, len: cum[cum.length - 1] };
  }
  function forDisc(L, u, v, rDots, fn) {
    const x = L.cx + u * L.S, y = L.cy + v * L.S;
    const c0 = Math.max(0, Math.floor((x - L.ox) / L.p - rDots)), c1 = Math.min(L.cols - 1, Math.ceil((x - L.ox) / L.p + rDots));
    const r0 = Math.max(0, Math.floor((y - L.oy) / L.p - rDots)), r1 = Math.min(L.rows - 1, Math.ceil((y - L.oy) / L.p + rDots));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const dx = (L.ox + c * L.p - x) / L.p, dy = (L.oy + r * L.p - y) / L.p;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd <= rDots) fn(r * L.cols + c, dd, dx, dy);
    }
  }
  // ------------------------------------------------------------------ motifs
  // paint(g, P): static plate. prep(F, name): static per-dot pass, returns
  // state. anim(t, A, state): per-frame touch-ups (radius-linear, enveloped).
  const M = {};


  // 1 — AHD: scene-aware detection --------------------------------------------
  // Three scene contexts (kitchen / street / lab) share one person; the cursor
  // drags the active detection box, which snaps to the nearest object with a
  // spring. A click re-classifies the scene: a scan line sweeps across, the new
  // context's objects + boxes appear behind it (AHD's scene-aware vocabulary).
  const AHD = {
    floor: 0.6, ox: 0.02,
    ctx: [
      { name: 'kitchen', boxes: [[-1.02, -0.205, -0.555, 0.655], [-0.29, -0.585, 0.29, 0.655], [0.69, -0.005, 0.99, 0.305]] },
      { name: 'street', boxes: [[-1.07, 0.15, -0.35, 0.655], [-0.29, -0.585, 0.29, 0.655], [0.73, -0.625, 0.99, 0.655]] },
      { name: 'lab', boxes: [[-1.04, -0.5, -0.6, 0.655], [-0.29, -0.585, 0.29, 0.655], [0.6, -0.03, 1.02, 0.3]] },
    ],
  };
  const DT = { SKIN: 4, SHIRT: 5, LEGS: 6, WOOD: 7, MUG: 8, METAL: 9, CAR: 10, RED: 11, AMBER: 12, GREEN: 13, GLASS: 14, PIP: 15 };
  const CHIP = (() => {
    const w = 12, a = new Float32Array(w * 3).fill(0.92);
    for (const c of [2, 3, 4, 5, 7, 8, 9]) a[w + c] = 0.12;
    return a;
  })();
  M.detection = {
    variants: 3,
    label: 'AHD object detection — move to snap the detection box to an object, click to switch the scene context',
    cursor: 'Detect',
    drag: 'x',
    rest: [0.0, 0.0],
    ghostEvery: 6.0, ghostFirst: 1.8,
    mats: [
      ['ink', '#34332F'], ['accent', 'accent'], ['muted', '#2E9E64'], ['ink', '#B1AB9F'],
      ['ink', ['#E2B898', '#BF8A68', '#8E5E42']], ['ink', ['#94B4D2', '#5180AA', '#2D5079']],
      ['ink', ['#737C88', '#454D58', '#262B33']], ['ink', ['#D8B383', '#A97D4F', '#6F4F30']],
      ['ink', ['#EE9A74', '#C9633C', '#8E3F22']], ['ink', ['#C6CACD', '#899097', '#4B5259']],
      ['ink', ['#A2C7BF', '#5A8F86', '#2F5A54']], ['ink', '#D9452B'], ['ink', '#E9A93B'], ['ink', '#3E9E5F'],
      ['ink', ['#B4D7E6', '#6AA3BF', '#356B87']], ['muted', '#BDB8AE'],
    ],
    person(P, x) {
      const ramp = (k, y0, y1) => P.lin(x - 0.26, y0, x + 0.26, y1, [[0, 0.28], [0.4, 0.62], [1, 0.97]], k);
      P.circle(x, -0.42, 0.09, P.rad(x - 0.035, -0.455, 0, 0.13, [[0, 0.22], [1, 0.9]], DT.SKIN));
      const sh = ramp(DT.SHIRT, -0.52, 0.6), lg = ramp(DT.LEGS, -0.52, 0.6);
      P.seg(x - 0.067, 0.1, x - 0.07, 0.585, 0.09, lg);
      P.seg(x + 0.067, 0.1, x + 0.07, 0.585, 0.09, lg);
      P.rrect(x - 0.135, -0.305, 0.27, 0.43, 0.08, sh);
      P.seg(x - 0.208, -0.235, x - 0.228, 0.075, 0.064, sh);
      P.seg(x + 0.208, -0.235, x + 0.228, 0.075, 0.064, sh);
    },
    sideTable(P, o) {
      const tg = P.lin(0.6 + o, 0.0, 1.0 + o, 0.6, [[0, 0.28], [0.4, 0.62], [1, 0.97]], DT.WOOD);
      P.rrect(0.6 + o, 0.272, 0.42, 0.044, 0.02, tg);
      P.seg(0.81 + o, 0.31, 0.81 + o, 0.585, 0.048, tg);
      P.rrect(0.69 + o, 0.574, 0.24, 0.03, 0.014, tg);
    },
    paint(g, P, v) {
      const fl = AHD.floor, o = AHD.ox, col = P.color;
      const ramp = (k, x0, y0, x1, y1) => P.lin(x0, y0, x1, y1, [[0, 0.28], [0.4, 0.62], [1, 0.97]], k);
      P.cast(0.02 + o, fl, 0.52, 0.055, T.shadow + 0.04);
      if (v === 0) {
        // kitchen: chair, person, side table + mug
        P.cast(-0.8 + o, fl, 0.5, 0.05, T.shadow);
        P.cast(0.8 + o, fl, 0.28, 0.04, T.shadow);
        const cg = ramp(DT.WOOD, -1.03 + o, -0.16, -0.6 + o, 0.6);
        P.rrect(-1.0 + o, -0.16, 0.09, 0.28, 0.042, cg);
        P.seg(-0.955 + o, 0.1, -0.95 + o, 0.3, 0.058, cg);
        P.seg(-0.95 + o, 0.3, -0.975 + o, 0.597, 0.054, cg);
        P.rrect(-0.985 + o, 0.252, 0.4, 0.062, 0.026, cg);
        P.seg(-0.63 + o, 0.3, -0.612 + o, 0.597, 0.054, cg);
        this.person(P, 0.0 + o);
        this.sideTable(P, o);
        P.ring(0.905 + o, 0.165, 0.05, 0.052, 0, 0.03, P.m(DT.MUG, 0.88));
        P.rrect(0.73 + o, 0.06, 0.16, 0.212, 0.028, P.lin(0.73 + o, 0, 0.89 + o, 0, [[0, 0.3], [0.3, 0.42], [1, 0.95]], DT.MUG));
        P.rrect(0.73 + o, 0.06, 0.16, 0.026, 0.012, P.m(DT.MUG, 0.95));
      } else if (v === 1) {
        // street: car, person, traffic light
        P.cast(-0.7 + o, fl, 0.66, 0.05, T.shadow + 0.04);
        P.cast(0.87 + o, fl, 0.24, 0.035, T.shadow);
        const cg = ramp(DT.CAR, -1.05 + o, 0.16, -0.38 + o, 0.6);
        P.poly([[-0.94 + o, 0.35], [-0.84 + o, 0.215], [-0.81 + o, 0.2], [-0.62 + o, 0.2], [-0.585 + o, 0.215], [-0.5 + o, 0.35]], cg);
        P.rrect(-1.05 + o, 0.33, 0.68, 0.18, 0.06, cg);
        const gl = P.lin(-0.9 + o, 0.21, -0.55 + o, 0.34, [[0, 0.16], [1, 0.42]], DT.GLASS);
        P.poly([[-0.895 + o, 0.335], [-0.82 + o, 0.228], [-0.735 + o, 0.228], [-0.735 + o, 0.335]], gl);
        P.poly([[-0.71 + o, 0.335], [-0.71 + o, 0.228], [-0.625 + o, 0.228], [-0.548 + o, 0.335]], gl);
        P.seg(-0.95 + o, 0.43, -0.42 + o, 0.43, P.dot * 0.8, P.m(DT.CAR, 0.9));
        for (const wx of [-0.875, -0.54]) {
          P.circle(wx + o, 0.52, 0.084, P.m(INK, 0.96));
          P.circle(wx + o, 0.52, 0.036, P.rad(wx + o - 0.012, 0.508, 0, 0.05, [[0, 0.12], [1, 0.5]], DT.METAL));
        }
        P.rrect(-0.41 + o, 0.355, 0.035, 0.04, 0.012, P.m(DT.METAL, 0.12));
        this.person(P, 0.0 + o);
        P.rrect(-1.05 + o, 0.355, 0.03, 0.045, 0.01, P.m(DT.RED, col ? 0.9 : 0.85));
        // traffic light: pole, housing, three lamps (the top one lit)
        const lx = 0.86 + o;
        P.seg(lx, -0.14, lx, 0.597, 0.036, P.lin(lx - 0.02, 0, lx + 0.02, 0, [[0, 0.4], [1, 0.95]], DT.METAL));
        P.rrect(lx - 0.07, 0.575, 0.14, 0.028, 0.012, P.m(DT.METAL, 0.85));
        P.rrect(lx - 0.085, -0.6, 0.17, 0.46, 0.05, ramp(INK, lx - 0.09, -0.6, lx + 0.09, -0.14));
        const lamps = [[DT.RED, -0.515], [DT.AMBER, -0.37], [DT.GREEN, -0.225]];
        lamps.forEach(([k, y], j) => {
          const lit = j === 0;
          P.circle(lx, y, 0.048, col ? P.rad(lx - 0.015, y - 0.015, 0, 0.06, lit ? [[0, 0.7], [1, 1]] : [[0, 0.35], [1, 0.62]], k) : P.rad(lx - 0.015, y - 0.015, 0, 0.06, lit ? [[0, 0.04], [1, 0.22]] : [[0, 0.32], [1, 0.55]], INK));
        });
      } else {
        // lab: microscope, person, laptop on a side table
        P.cast(-0.78 + o, fl, 0.42, 0.045, T.shadow);
        P.cast(0.8 + o, fl, 0.28, 0.04, T.shadow);
        const mg = (x0, x1) => P.lin(x0, -0.4, x1, 0.6, [[0, 0.3], [0.45, 0.66], [1, 0.97]], DT.METAL);
        P.rrect(-1.0 + o, 0.535, 0.37, 0.065, 0.03, mg(-1.0 + o, -0.63 + o));
        g.beginPath(); g.moveTo(-0.93 + o, 0.55); g.lineTo(-0.93 + o, 0.08); g.quadraticCurveTo(-0.93 + o, -0.14, -0.79 + o, -0.2);
        g.lineWidth = 0.075; g.strokeStyle = mg(-0.97 + o, -0.75 + o); g.stroke();
        P.rrect(-0.94 + o, 0.255, 0.31, 0.034, 0.012, P.m(INK, 0.92));
        P.rrect(-0.8 + o, 0.236, 0.13, 0.017, 0.006, P.m(DT.GLASS, 0.45));
        P.seg(-0.865 + o, -0.36, -0.75 + o, 0.02, 0.078, P.lin(-0.86 + o, -0.3, -0.76 + o, -0.28, [[0, 0.3], [1, 0.9]], DT.METAL));
        P.seg(-0.885 + o, -0.45, -0.865 + o, -0.37, 0.058, P.m(INK, 0.95));
        P.seg(-0.752 + o, 0.02, -0.744 + o, 0.17, 0.042, P.m(DT.METAL, 0.62));
        P.circle(-0.93 + o, 0.13, 0.055, P.rad(-0.945 + o, 0.115, 0, 0.07, [[0, 0.2], [1, 0.95]], DT.METAL));
        this.person(P, 0.0 + o);
        this.sideTable(P, o);
        P.rrect(0.655 + o, 0.02, 0.31, 0.215, 0.018, P.m(INK, 0.92));
        P.rrect(0.672 + o, 0.036, 0.276, 0.18, 0.008, P.lin(0.67 + o, 0.03, 0.95 + o, 0.22, [[0, 0.12], [1, 0.4]], DT.GLASS));
        for (let k = 0; k < 4; k++) P.seg(0.7 + o + (k % 2) * 0.03, 0.07 + k * 0.038, 0.78 + o + ((k * 7) % 5) * 0.03, 0.07 + k * 0.038, P.dot * 0.9, P.m(INK, 0.7));
        P.poly([[0.64 + o, 0.236], [0.98 + o, 0.236], [0.995 + o, 0.268], [0.625 + o, 0.268]], P.lin(0.62 + o, 0, 1.0 + o, 0, [[0, 0.3], [1, 0.75]], DT.METAL));
      }
    },
    init(I) {
      I.bx = [spr(-0.29 + AHD.ox), spr(-0.585), spr(0.29 + AHD.ox), spr(0.655)];
      I.pip = spr(0); I.wipe = null; I.sel = 1;
    },
    ghost(I, tau) { return [0.86 * Math.sin(tau * 0.5 - 0.5), 0.05]; },
    nearest(ctx, u, v) {
      let best = 1, bd = 1e9;
      AHD.ctx[ctx].boxes.forEach((b, k) => {
        const cu = (b[0] + b[2]) / 2 + AHD.ox, cv = (b[1] + b[3]) / 2;
        const d = Math.abs(u - cu) * (u > b[0] + AHD.ox && u < b[2] + AHD.ox ? 0.4 : 1) + 0.3 * Math.abs(v - cv);
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    },
    click(I) {
      const from = I.variant;
      I.variant = (I.variant + 1) % 3;
      I.wipe = { from, t0: I.now, box: I.bx.map((q) => q.x), sel: I.sel };
    },
    key(I, key) {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        I.sel = clamp(I.sel + (key === 'ArrowLeft' ? -1 : 1), 0, 2);
        const b = AHD.ctx[I.variant].boxes[I.sel];
        I.ru = (b[0] + b[2]) / 2 + AHD.ox; I.rv = (b[1] + b[3]) / 2; I.hasReal = true;
        return true;
      }
      return false;
    },
    step(I, dt) {
      let busy = false;
      const sel = this.nearest(I.variant, I.tu, I.tv);
      I.sel = sel;
      const b = AHD.ctx[I.variant].boxes[sel], o = AHD.ox;
      const tg = [b[0] + o, b[1], b[2] + o, b[3]];
      for (let k = 0; k < 4; k++) busy = spring(I.bx[k], tg[k], dt, 17, 0.58) || busy;
      busy = spring(I.pip, I.variant, dt, 14, 0.7) || busy;
      if (I.wipe) {
        I.wipe.p = clamp((I.now - I.wipe.t0) / (I.reduced ? 0.25 : 1.15));
        if (I.wipe.p >= 1) I.wipe = null; else busy = true;
      }
      return busy;
    },
    anim(t, A, S, I) {
      const { L, cols, rows } = A, o = AHD.ox;
      const cA = A.colF(-1.12), cB = A.colF(1.12);
      let cw = 1e9, from = -1;
      if (I.wipe) {
        from = I.wipe.from;
        cw = mix(cA, cB, easeInOut(I.wipe.p ?? 0));
        const OD = A.B.vD[from], OC = A.B.vC[from];
        // the old scene survives right of the scan line; a 6-column crossfade avoids popping dots
        const c0 = Math.max(0, Math.floor(cw - 3));
        for (let r = 0; r < rows; r++) for (let c = c0; c < cols; c++) {
          const i = r * cols + c, k = smoothstep(cw - 3, cw + 3, c);
          if (k >= 1) { A.D[i] = OD[i]; A.C[i] = OC[i]; continue; }
          const nd = A.D[i], od = OD[i];
          A.D[i] = nd + (od - nd) * k;
          if (od * k > nd * (1 - k)) A.C[i] = OC[i];
        }
        // the scan line: a soft vertical bar of green dots
        const r0 = A.rowF(-0.7), r1 = A.rowF(0.7);
        for (let dc = -2; dc <= 2; dc++) {
          const c = Math.round(cw) + dc, s = clamp(1 - Math.abs(c - cw) / 2.2);
          if (s > 0.05) A.vline(c, r0, r1, 0.75 * s * s, MUT, A.lift);
        }
      }
      const drawBox = (b, active, clipFn) => {
        A.clipC = clipFn;
        const x0 = A.colF(b[0]), y0 = A.rowF(b[1]), x1 = A.colF(b[2]), y1 = A.rowF(b[3]);
        if (active) {
          const arm = 3.6;
          const K = ACC;
          const dash = (c) => ((c & 1) ? 0 : 1);
          A.hline(x0 + arm, x1 - arm, y0, 0.2, K, A.lift, dash); A.hline(x0 + arm, x1 - arm, y1, 0.2, K, A.lift, dash);
          A.vline(x0, y0 + arm, y1 - arm, 0.2, K, A.lift, dash); A.vline(x1, y0 + arm, y1 - arm, 0.2, K, A.lift, dash);
          A.hline(x0, x0 + arm, y0, 1, K, A.set); A.hline(x1 - arm, x1, y0, 1, K, A.set);
          A.hline(x0, x0 + arm, y1, 1, K, A.set); A.hline(x1 - arm, x1, y1, 1, K, A.set);
          A.vline(x0, y0, y0 + arm, 1, K, A.set); A.vline(x0, y1 - arm, y1, 1, K, A.set);
          A.vline(x1, y0, y0 + arm, 1, K, A.set); A.vline(x1, y1 - arm, y1, 1, K, A.set);
          A.stamp(CHIP, 12, 3, x0, y0 - 3.2, INK, A.set);
        } else {
          const cx0 = Math.round(x0), cy0 = Math.round(y0), cx1 = Math.round(x1), cy1 = Math.round(y1), arm = 3;
          const wave = (s) => { const w = 0.5 + 0.5 * Math.sin(s * 0.55 - t * 2.2); const v = 0.34 + 0.32 * w; return v * v / 0.12; };
          A.hline(cx0 + arm, cx1 - arm, cy0, 0.12, MUT, A.lift, (c) => wave(c - cx0));
          A.hline(cx0 + arm, cx1 - arm, cy1, 0.12, MUT, A.lift, (c) => wave(cx1 - c + (cx1 - cx0) + (cy1 - cy0)));
          A.vline(cx1, cy0 + arm, cy1 - arm, 0.12, MUT, A.lift, (r) => wave(r - cy0 + (cx1 - cx0)));
          A.vline(cx0, cy0 + arm, cy1 - arm, 0.12, MUT, A.lift, (r) => wave(cy1 - r + 2 * (cx1 - cx0) + (cy1 - cy0)));
          for (const [ya, yb] of [[cy0, cy0], [cy1, cy1]]) { A.hline(cx0, cx0 + arm - 1, ya, T.ctx, MUT, A.over); A.hline(cx1 - arm + 1, cx1, yb, T.ctx, MUT, A.over); }
          for (const xa of [cx0, cx1]) { A.vline(xa, cy0 + 1, cy0 + arm - 1, T.ctx, MUT, A.over); A.vline(xa, cy1 - arm + 1, cy1 - 1, T.ctx, MUT, A.over); }
        }
        A.clipC = null;
      };
      const offs = (b) => [b[0] + o, b[1], b[2] + o, b[3]];
      const leftOf = (c) => c < cw - 1.5, rightOf = (c) => c > cw + 1.5;
      if (from >= 0) {
        // the old context keeps its boxes (and its active box) until the scan line passes them
        AHD.ctx[from].boxes.forEach((b, k) => { if (k !== I.wipe.sel) drawBox(offs(b), false, rightOf); });
        drawBox(I.wipe.box, true, rightOf);
      }
      AHD.ctx[I.variant].boxes.forEach((b, k) => { if (k !== I.sel) drawBox(offs(b), false, from >= 0 ? leftOf : null); });
      drawBox(I.bx.map((s) => s.x), true, from >= 0 ? leftOf : null);
      // context pips (bottom centre): which of the three scenes the model sees
      const pr = Math.round(A.rowF(0.76)), pc = Math.round(A.colF(0));
      for (let k = 0; k < 3; k++) A.at(pc + (k - 1) * 4, pr, 0.32, DT.PIP, A.set);
      const ca = pc + (I.pip.x - 1) * 4;
      A.hline(ca - 1.1, ca + 1.1, pr, 0.95, INK, A.set);
    },
  };

  // 2 — OptiControl NDT: probe on a corroded plate + live A-scan / C-scan -----
  // The plate is drawn as an engineering section (45° hatch) with two
  // corrosion pits eaten into its back wall. The ultrasonic probe follows the
  // cursor along the plate; the A-scan below is computed live from the wall
  // thickness under the probe (a pit returns an early echo that pierces the
  // gate). Click toggles the A-scan trace and a C-scan wall-loss map.
  const NDT = {
    u0: -1.0, u1: 1.0, vt: -0.34, vb: -0.05, base: 0.66, top: 0.12, pw: 0.115,
    pits: [{ u: 0.34, z: 0, su: 0.13, sz: 0.3, d: 0.52 }, { u: -0.52, z: 0, su: 0.075, sz: 0.2, d: 0.2 }, { u: -0.05, z: 0.62, su: 0.11, sz: 0.2, d: 0.34 }, { u: 0.74, z: -0.6, su: 0.08, sz: 0.16, d: 0.22 }],
    // wall loss (fraction of the thickness) at plate position (u, z)
    loss(u, z) {
      let s = 0;
      for (const p of NDT.pits) { const a = (u - p.u) / p.su, b = (z - p.z) / p.sz; s += p.d * Math.exp(-(a * a + b * b)); }
      return s;
    },
    tIP: -0.88, tW: 0.6, gate: [-0.7, -0.4], gateH: 0.36,
  };
  const ND = { PROBE: 4, CABLE: 5, TRACE: 6, BEAM: 7, HEAT: 8, RUST: 13, GATE: 14, HATCH: 15, STEEL: 16 };
  function ndtEnv(u, c, w0, w1) {
    const x = u - c;
    return x < 0 ? Math.exp(-(x / w0) * (x / w0)) : Math.exp(-Math.pow(x / w1, 1.5));
  }
  M.ndt = {
    label: 'Ultrasonic inspection — move along the plate to scan it with the probe, click to switch between A-scan and C-scan',
    cursor: 'Scan',
    drag: 'x',
    rest: [0.23, -0.4],
    ghostEvery: 4.6, ghostFirst: 2.2,
    mats: [
      ['ink', '#2C3036'], ['accent', '#E0452A'], ['muted', '#A0A7AE'], ['ink', '#AAA59C'],
      ['ink', ['#AEB5BD', '#68737E', '#2E353D']], ['ink', '#33383E'], ['ink', ['#6CC891', '#2E8A57', '#1D5C3A']], ['ink', '#3C8DC2'],
      ['ink', '#2E4F9E'], ['ink', '#2C98C2'], ['ink', '#5DB566'], ['ink', '#E9C43F'], ['ink', '#DD4A2A'],
      ['accent', ['#DA8352', '#B0532B']], ['muted', '#CC962F'], ['muted', '#A9B1B9'], ['ink', '#3B4249'],
    ],
    prep(F) {
      const { n, U, V, D, C, P, dot } = F;
      const { vt, vb } = NDT;
      const fade = (u) => 1 - smoothstep(0.86, 1.04, Math.abs(u));
      const back = (u) => vb - NDT.loss(u, 0) * (vb - vt);
      // section hatch between the surfaces
      for (let i = 0; i < n; i++) {
        const u = U[i], v = V[i], f = fade(u);
        if (f <= 0.01 || v < vt + dot * 0.9 || v > back(u) - dot * 0.9) continue;
        const c = Math.round((u * F.L.S + F.L.cx - F.L.ox) / F.L.p), r = Math.round((v * F.L.S + F.L.cy - F.L.oy) / F.L.p);
        if ((c + r) % 3 === 0) { D[i] = 0.3 * f; C[i] = ND.HATCH; }
      }
      // surfaces: the scanned top face, the back wall with its corrosion pits (rust)
      const top = [], bot = [];
      for (let u = -1.06; u <= 1.0601; u += 0.01) { top.push([u, vt]); bot.push([u, back(u)]); }
      const Lt = lineField(F, top, 1.4), Lb = lineField(F, bot, 1.4);
      for (const [Lf, pts] of [[Lt, top], [Lb, bot]]) {
        for (let k = 0; k < Lf.idx.length; k++) {
          const i = Lf.idx[k], u = U[i], s = Lf.prof[k] * fade(u);
          if (s < 0.05) continue;
          const pit = Lf === Lb && NDT.loss(u, 0) > 0.14;
          D[i] = Math.max(D[i] * (1 - s), 0.92 * s * s); C[i] = pit ? ND.RUST : ND.STEEL;
        }
      }
      // A-scan furniture: baseline, time ruler, columns; C-scan wall-loss field
      const rb = P.rowOf(NDT.base), c0 = P.colOf(NDT.u0), c1 = P.colOf(NDT.u1), rt = P.rowOf(NDT.top);
      for (let c = c0; c <= c1; c++) { const i = rb * F.cols + c; D[i] = 0.78 * (1 - 0.5 * smoothstep(c1 - 3, c1 + 0.5, c)); C[i] = INK; }
      for (let j = 0; j <= 9; j++) {
        const c = P.colOf(-0.88 + j * 0.2);
        if (c > c1) break;
        for (let r = 1; r <= (j % 5 === 0 ? 3 : 2); r++) { const i = (rb + r) * F.cols + c; D[i] = T.ctx; C[i] = MUT; }
      }
      const cols = [];
      for (let c = c0; c <= c1; c++) cols.push({ c, u: P.colU(c), edge: smoothstep(c0 - 0.5, c0 + 3, c) * (1 - smoothstep(c1 - 4, c1 + 0.5, c)) });
      const win = [], wl = [];
      for (let r = rt; r < rb; r++) for (let c = c0; c <= c1; c++) {
        const u = P.colU(c), z = mix(-1, 1, (r - rt) / Math.max(1, rb - 1 - rt));
        win.push(r * F.cols + c);
        wl.push(clamp(NDT.loss(u, z) / 0.52 + 0.06 * fbm2(u * 6 + 3, z * 6 - 1, 3)));
      }
      return { rb, rt, c0, c1, cols, win: Int32Array.from(win), wl: Float32Array.from(wl), back };
    },
    init(I) { I.px = spr(0.23); I.lag = spr(0.23); I.view = spr(0); I.vt = 0; },
    ghost(I, tau) { return [0.78 * Math.sin(tau * 0.36 + 0.35), -0.4]; },
    click(I) { I.vt = I.vt ? 0 : 1; },
    step(I, dt) {
      const tgt = clamp(I.tu, -0.86, 0.86);
      let b = spring(I.px, tgt, dt, 9, 0.85);
      b = spring(I.lag, I.px.x, dt, 5, 0.7) || b;
      b = spring(I.view, I.vt, dt, I.reduced ? 40 : 7.5, 1) || b;
      return b;
    },
    dsig(I) { return [I.px.x, I.lag.x]; },
    dyn(g, P, I) {
      const px = I.px.x, lg = I.lag.x, { vt } = NDT, w = NDT.pw, top = -0.62;
      // cable: out of the connector, arcing right and trailing the motion
      const dx = clamp((lg - px) * 2.4, -0.22, 0.22);
      g.beginPath(); g.moveTo(px, top - 0.06);
      g.bezierCurveTo(px + dx * 0.3, top - 0.1, px + 0.08 + dx * 0.8, -0.71, px + 0.28 + dx * 0.5, -0.705);
      g.lineWidth = P.dot * 1.05; g.strokeStyle = P.lin(px, 0, px + 0.3, 0, [[0, 0.62], [0.55, 0.5], [1, 0.0]], ND.CABLE); g.stroke();
      // connector, body (cylinder), knurled grip ring, wear face
      P.rrect(px - w * 0.36, top - 0.075, w * 0.72, 0.085, 0.014, P.cyl(px - w * 0.36, px + w * 0.36, ND.PROBE, 0.4));
      P.rrect(px - w, top, 2 * w, vt - top - 0.02, 0.04, P.cyl(px - w, px + w, ND.PROBE));
      P.rrect(px - w, top + 0.05, 2 * w, 0.045, 0.004, P.lin(px - w, 0, px + w, 0, [[0, 0.78], [0.3, 0.62], [1, 1]], ND.PROBE));
      P.rrect(px - w * 1.05, vt - 0.036, w * 2.1, 0.034, 0.012, P.m(INK, 0.97));
    },
    anim(t, A, S, I) {
      const { D, C, cols, U, V, dot } = A, px = I.px.x, { vt } = NDT;
      // --- the beam: wavefronts running down to the reflector and back
      const per = 1.15, ph = wrap01(t / per);
      const refl = (u) => S.back(u);
      const dR = refl(px) - vt;
      const yw = vt + dR * (ph < 0.5 ? ph * 2 : 2 - ph * 2);
      const env = Math.sin(PI * ph) * 0.6 + 0.4;
      const c0 = Math.floor(A.colF(px - NDT.pw)), c1 = Math.ceil(A.colF(px + NDT.pw));
      const r0 = Math.floor(A.rowF(vt)), r1 = Math.ceil(A.rowF(NDT.vb + 0.01));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= cols || r >= A.rows) continue;
        const i = r * cols + c, u = U[i], v = V[i];
        const lim = refl(u);
        if (v < vt + dot * 0.9 || v > lim - dot * 0.6) continue;
        const depth = clamp((v - vt) / (NDT.vb - vt));
        const half = NDT.pw * (0.62 + 0.25 * depth);
        const across = 1 - smoothstep(half * 0.7, half * 1.15, Math.abs(u - px));
        const curve = yw + 0.3 * (u - px) * (u - px) / NDT.pw;
        const s = smoothstep(1.7, 0.4, Math.abs(v - curve) / dot) * across * env;
        if (s > 0.08) A.over(i, Math.max(0.95 * s * s, 0.2), ND.BEAM);
        else if (across > 0.2) A.set(i, 0.2 * across, ND.BEAM);
      }
      // --- echoes from the wall under the probe (beam-averaged)
      let lossMax = 0, cover = 0;
      for (let k = -2; k <= 2; k++) { const l = NDT.loss(px + k * NDT.pw * 0.4, 0); lossMax = Math.max(lossMax, l); cover += smoothstep(0.03, 0.2, l) / 5; }
      const bw = 1 - 0.75 * cover;
      const ech = [
        { u: NDT.tIP, a: 1.16, w0: 0.035, w1: 0.17, k: ND.TRACE, ph: 0, f: 1.05 },
        { u: NDT.tIP + NDT.tW * (1 - lossMax), a: 0.95 * cover, w0: 0.04, w1: 0.06, k: ACC, ph: 1.3, f: 1.15 },
        { u: NDT.tIP + NDT.tW, a: 0.82 * bw, w0: 0.05, w1: 0.11, k: ND.TRACE, ph: 2.1, f: 1.1 },
        { u: NDT.tIP + 2 * NDT.tW, a: 0.48 * bw, w0: 0.05, w1: 0.1, k: ND.TRACE, ph: 0.7, f: 1.2 },
        { u: NDT.tIP + 3 * NDT.tW, a: 0.24 * bw, w0: 0.045, w1: 0.08, k: ND.TRACE, ph: 1.9, f: 1.2 },
      ];
      const view = clamp(I.view.x), rt = S.rt, rb = S.rb;
      const split = rt + (rb - rt) * view; // rows above: C-scan, below: A-scan
      const hScale = (NDT.base - NDT.top) / 1.16;
      if (view < 0.999) {
        for (let j = 0; j < S.cols.length; j++) {
          const { c, u, edge } = S.cols[j];
          let best = 0, bk = ND.TRACE;
          for (let e = 0; e < ech.length; e++) {
            const E = ech[e];
            if (E.a < 0.01) continue;
            const h = ndtEnv(u, E.u, E.w0, E.w1) * E.a * (0.5 + 0.5 * Math.abs(Math.cos((u - E.u) / dot * E.f + E.ph))) * (1 + 0.04 * Math.sin(t * (1.1 + 0.37 * e) + e * 2.1 + c * 0.05));
            if (h > best) { best = h; bk = E.k; }
          }
          const grass = (0.4 + 1.5 * Math.pow(0.5 + 0.5 * noise2(c * 0.43, t * 0.55), 2)) * edge * dot / hScale;
          if (grass > best) { best = grass; bk = ND.TRACE; }
          const hD = best * hScale / dot;
          const kmax = Math.min(rb - rt, Math.ceil(hD) + 1);
          for (let k = 1; k <= kmax; k++) {
            const r = rb - k;
            if (r < split) break;
            const f = clamp(hD - k + 1);
            if (f <= 0) break;
            const tone = mix(0.3, 1.0, Math.pow(Math.min(1, k / Math.max(hD, 1)), 1.5));
            A.set(r * cols + c, tone * f * f, bk);
          }
        }
        // gate: a bracket the flaw echo has to pierce; it lights up when it does
        const aG = 0.5, rG = Math.round(A.rowF(NDT.base - aG * hScale)), ga = Math.round(A.colF(NDT.gate[0])), gb = Math.round(A.colF(NDT.gate[1]));
        const hit = smoothstep(aG * 0.95, aG * 1.2, ech[1].a);
        if (rG >= split) {
          A.hline(ga, gb, rG, T.ctx, ND.GATE, A.lift, (c) => ((c - ga) % 2 ? 0 : 1));
          A.vline(ga, rG + 1, rG + 2, T.ctx, ND.GATE, A.lift);
          A.vline(gb, rG + 1, rG + 2, T.ctx, ND.GATE, A.lift);
          // flaw alarm: an accent pip at the gate's end
          if (hit > 0.02) A.disc(A.colU(gb + 2), A.rowV(rG), 0.9, Math.sqrt(hit), ACC);
        }
      }
      if (view > 0.001) {
        // C-scan: wall-loss map of the whole plate; probe column + section line
        const color = I.mode === 'color', JIT = A.B.JIT, pc = A.colF(px), sr = (rt + rb - 1) / 2;
        for (let k = 0; k < S.win.length; k++) {
          const i = S.win[k], r = Math.floor(i / cols), c = i - r * cols;
          if (r >= split) continue;
          const wv = S.wl[k];
          let d = color ? 0.4 + 0.42 * wv : 0.025 + 0.92 * smoothstep(0.06, 0.95, wv);
          let m = color ? ND.HEAT + clamp(Math.floor(wv * 4.6 + JIT[i] * 3), 0, 4) : INK;
          if (Math.abs(c - pc) < 0.5 && (r & 1) === 0) { d = 0.92; m = INK; }
          else if (r === Math.round(sr) && (c % 2) === 0 && d < T.ctx) { d = T.ctx; m = MUT; }
          A.set(i, d, m);
        }
      }
      if (view > 0.001 && view < 0.999) A.hline(S.c0 - 0.5, S.c1 + 0.5, split, 0.6, INK, A.lift);
    },
  };
  // 3 — RocketHub: flight arc + curtain over a perspective ground grid ---------
  const TRJ = (() => {
    const f = 1.25, hc = 1.0, vh = -0.1;
    const pr = (X, Y, Z) => [f * X / Z, vh + f * (hc - Y) / Z];
    const L0 = [-1.75, 2.55], L1 = [3.75, 5.2], Ha = 2.3, pa = 0.42;
    const arcAt = (p) => {
      const w = Math.pow(p, 1.3);
      const X = mix(L0[0], L1[0], w), Z = mix(L0[1], L1[1], w);
      const Y = p < pa ? Ha * (1 - Math.pow(1 - p / pa, 2.1)) : Ha * (1 - Math.pow((p - pa) / (1 - pa), 1.9));
      return [X, Y, Z];
    };
    return { f, hc, vh, pr, arcAt, pa, period: 12 };
  })();
  M.trajectory = {
    paint(g, P) {
      const { pr, vh } = TRJ;
      // distant ridge on the horizon
      let prev = null;
      for (let u = -1.0; u <= 1.0; u += 0.01) {
        const q = [u, vh - 0.01 - 0.07 * (0.5 + 0.5 * fbm2(u * 1.8 + 4.2, 1.7, 4)) * (1 - smoothstep(0.35, 1.0, Math.abs(u - 0.35)))];
        if (prev) P.seg(prev[0], prev[1], q[0], q[1], P.dot * 1.2, P.mut(0.34 * (1 - smoothstep(0.7, 1.0, Math.abs(u)))));
        prev = q;
      }
      const [X0, , Z0] = TRJ.arcAt(0), [X1, , Z1] = TRJ.arcAt(1);
      const pd = pr(X0, 0, Z0), ld = pr(X1, 0, Z1);
      P.ellipse(pd[0], pd[1], 0.075, 0.022, 0, P.ink(0.92));
      P.ring(ld[0], ld[1], 0.055, 0.015, 0, P.dot * 1.1, P.ink(0.85));
    },
    prep(F) {
      const { n, U, V, D, C, dot } = F;
      const { f, hc, vh, pr } = TRJ;
      // curtain table: for each p, screen u, arc v, ground v
      const tab = [];
      for (let k = 0; k <= 400; k++) { const [X, Y, Z] = TRJ.arcAt(k / 400); const a = pr(X, Y, Z), b = pr(X, 0, Z); tab.push([a[0], a[1], b[1]]); }
      const s = 0.5;
      for (let i = 0; i < n; i++) {
        const u = U[i], v = V[i];
        let val = 0;
        // perspective grid, anti-aliased in screen space
        if (v > vh + 0.01) {
          const Z = f * hc / (v - vh), X = u * Z / f;
          const dZd = dot * Z * Z / (f * hc), dXd = dot * Z / f;
          const dz = Math.abs(Z - Math.round(Z / s) * s) / dZd;
          const lz = smoothstep(1.0, 0.25, dz) * smoothstep(2.6, 6, s / dZd);
          const X0 = Math.round(X / s) * s, sl = Math.sqrt(1 + (X0 / hc) * (X0 / hc));
          const dx = Math.abs(X - X0) / dXd / sl;
          const lx = smoothstep(1.0, 0.25, dx) * smoothstep(2.6, 6, s / dXd / sl);
          const fade = (1 - smoothstep(0.52, 0.7, v)) * (1 - smoothstep(0.8, 1.04, Math.abs(u))) * (1 - smoothstep(6.5, 11, Z));
          val = 0.36 * Math.max(lx, lz) * fade;
        }
        // ground track (the arc's footprint), muted
        if (u > tab[0][0] && u < tab[400][0]) {
          let lo = 0, hi = 400;
          while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m][0] < u) lo = m; else hi = m; }
          const w = (u - tab[lo][0]) / (tab[hi][0] - tab[lo][0] || 1);
          const vg = mix(tab[lo][2], tab[hi][2], w);
          val = Math.max(val, T.ctx * smoothstep(1.3, 0.3, Math.abs(v - vg) / dot));
        }
        if (val > 0.02) { D[i] = val; C[i] = MUT; }
      }
      // altitude stems from the arc to its ground track (muted, dotted); the apogee stem is firmer
      const [Xa, Ya, Za] = TRJ.arcAt(TRJ.pa);
      const ap = pr(Xa, Ya, Za);
      for (let k = 1; k <= 13; k++) {
        const p = k / 14, isA = Math.abs(p - TRJ.pa) < 0.036;
        const [X, Y, Z] = TRJ.arcAt(isA ? TRJ.pa : p), a = pr(X, Y, Z), b = pr(X, 0, Z);
        const c = F.P.colOf(a[0]), r0 = F.P.rowOf(a[1]) + (isA ? 5 : 2), r1 = F.P.rowOf(b[1]) - 1;
        for (let r = r0; r <= r1; r += 2) { const i = r * F.cols + c; const val = isA ? 0.5 : 0.3; if (D[i] < val) { D[i] = val; C[i] = MUT; } }
      }
      // arc line (ink) — base tone; the flight brightens it
      const pts = [];
      for (let k = 0; k <= 240; k++) { const [X, Y, Z] = TRJ.arcAt(k / 240); pts.push(pr(X, Y, Z)); }
      const Lf = lineField(F, pts, 1.5);
      for (let k = 0; k < Lf.idx.length; k++) { const i = Lf.idx[k], val = 0.78 * Lf.prof[k] * Lf.prof[k]; if (val > 0.02) { D[i] = Math.max(val, C[i] === MUT ? 0 : D[i]); C[i] = INK; } }
      // apogee (accent): solid disc + hairline ring
      F.ring(ap[0], ap[1], 3.6, 1.0, 0.5, ACC);
      F.disc(ap[0], ap[1], 2.1, 1, ACC);
      return { L: Lf, pts };
    },
    anim(t, A, S) {
      const L = S.L, P = TRJ.period;
      const tf = wrap01(t / P) * P;
      const amp = smoothstep(0, 0.8, tf) * (1 - smoothstep(9.2, 11.2, tf));
      const x = clamp(tf / 9.6);
      const head = x * x * (3 - 2 * x) * 0.6 + x * 0.4;
      const lenD = L.len / A.dot;
      for (let k = 0; k < L.idx.length; k++) {
        const i = L.idx[k];
        if (A.C[i] === ACC) continue;
        const dq = (head - L.q[k]) * lenD;
        const tr = amp * (dq >= 0 ? Math.exp(-dq / 30) : smoothstep(-2.5, 0, dq));
        const s = mix(Math.sqrt(0.78), 1.0, tr) * L.prof[k];
        A.put(i, s * s, INK);
      }
      if (amp > 0.01) {
        const p = S.pts[Math.min(S.pts.length - 1, Math.round(head * (S.pts.length - 1)))];
        A.bead(p[0], p[1], 2.1, amp, INK);
      }
    },
  };


  // 4 — CanSat firmware: a parafoil steering for its landing target ----------
  // The rig (canopy, lines, the CanSat payload) glides toward the cursor and
  // banks into the turn (the firmware's PID steering). Click releases the
  // canopy: it collapses, the payload drops, the canopy snaps open again and
  // catches it.
  const PFL = { cx: -0.2, cy: -0.21, Ru: 0.8, Rv: 0.4, phiM: 1.12, N: 9, pay: [-0.2, 0.34], tgt: [0.74, 0.58], piv: [-0.2, -0.45] };
  const PF = { RED: 4, WHITE: 5, LINES: 6, GRASS: 7, TGT: 8 };
  M.parafoil = {
    label: 'CanSat paraglider — it steers toward your cursor; click to release and re-deploy the canopy',
    cursor: 'Steer',
    drag: 'x',
    rest: [0.05, -0.1],
    ghostEvery: 6.0, ghostFirst: 1.8,
    mats: [
      ['ink', '#2F2E2B'], ['accent', 'accent'], ['muted', '#9A9E96'], ['ink', '#A9A49A'],
      ['ink', ['#EE6A4E', '#D23A26', '#97261A']], ['ink', ['#E6E2D8', '#C3BDB0', '#8D877B']], ['ink', '#4B4945'],
      ['muted', ['#B5D1A0', '#86AE70', '#5E8A50']], ['muted', '#C9503A'],
    ],
    at(phi, th, k) {
      const { cx, cy, Ru } = PFL, Rv = PFL.Rv * mix(1.5, 1, clamp(k));
      const pm = PFL.phiM * mix(0.32, 1, k);
      const tk = 0.26 * mix(0.55, 1, clamp(k)) * (1 - 0.38 * Math.pow(phi / pm, 2));
      const s = Math.sin(phi), c = Math.cos(phi);
      let nx = -s / Ru, ny = c / Rv; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      return [cx + Ru * s + nx * tk * th, cy - Rv * c + ny * tk * th];
    },
    paint(g, P) {
      const [tx, ty] = PFL.tgt;
      if (P.color) {
        // a patch of field round the landing target
        P.ellipse(tx - 0.02, ty + 0.01, 0.34, 0.085, 0, P.rad(tx - 0.02, ty + 0.01, 0, 0.34, [[0, 0.42], [0.6, 0.3], [1, 0]], PF.GRASS));
      }
      P.ring(tx, ty, 0.15, 0.048, 0, P.dot * 1.2, P.m(PF.TGT, T.ctx));
      P.ring(tx, ty, 0.075, 0.024, 0, P.dot * 1.0, P.m(PF.TGT, T.ctxLo + 0.08));
      P.ellipse(tx, ty, 0.026, 0.011, 0, P.ink(0.95));
    },
    init(I) { I.x = spr(0); I.y = spr(0); I.bank = spr(0); I.k = spr(1); I.dep = null; },
    ghost(I, tau) { return [0.12 + 0.5 * Math.sin(tau * 0.34) + 0.12 * Math.sin(tau * 0.83 + 1), -0.1 + 0.3 * Math.sin(tau * 0.5)]; },
    click(I) { if (!I.dep || I.now - I.dep.t0 > 0.9) I.dep = { t0: I.now }; },
    step(I, dt) {
      const tx = clamp(I.tu - 0.05, -0.12, 0.5), ty = clamp((I.tv + 0.1) * 0.22, -0.08, 0.1);
      let b = spring(I.x, tx, dt, 2.1, 0.9);
      let dropT = 0, kt = 1;
      if (I.dep) {
        const e = I.now - I.dep.t0, sp = I.reduced ? 3 : 1;
        if (e * sp < 0.22) { kt = 0.12; dropT = 0.2; }
        else if (e * sp < 0.42) { kt = 0.12; dropT = 0.2; }
        else { kt = 1; dropT = 0; }
        if (e * sp > 2.2) I.dep = null; else b = true;
      }
      b = spring(I.k, kt, dt, kt < 1 ? 16 : 9, kt < 1 ? 0.9 : 0.42) || b;
      b = spring(I.y, ty + dropT, dt, dropT ? 5 : 3.2, dropT ? 1 : 0.55) || b;
      b = spring(I.bank, clamp(I.x.v * 0.55, -0.42, 0.42), dt, 5, 0.75) || b;
      return b;
    },
    dsig(I, t) { return [I.x.x, I.y.x, I.bank.x, I.k.x, Math.round(t * 30) / 30]; },
    dyn(g, P, I, S, t) {
      const { N, pay, tgt, piv } = PFL, k = Math.max(0.05, I.k.x), X = I.x.x, Y = I.y.x, beta = I.bank.x;
      const at = (phi, th) => this.at(phi, th, k);
      const pm = PFL.phiM * mix(0.32, 1, k);
      // glide path from the payload to the target (muted, dashes drifting toward it)
      const c = Math.cos(beta), s = Math.sin(beta);
      const rot = (x, y) => [piv[0] + X + (x - piv[0]) * c - (y - piv[1]) * s, piv[1] + Y + (x - piv[0]) * s + (y - piv[1]) * c];
      const p0 = rot(pay[0], pay[1] + 0.12);
      const [tx, ty] = tgt;
      if (k > 0.5) {
        g.save();
        g.setLineDash([P.dot * 0.9, P.dot * 1.7]); g.lineDashOffset = -t * 0.06;
        g.beginPath(); g.moveTo(p0[0] + 0.03, p0[1] + 0.02);
        g.quadraticCurveTo(mix(p0[0], tx, 0.55), p0[1] + 0.02 + 0.03, tx - 0.06, ty - 0.03);
        g.lineWidth = P.dot * 1.1; g.strokeStyle = P.mut(T.ctx * clamp((k - 0.5) * 2)); g.stroke();
        g.restore();
      }
      g.save();
      g.translate(piv[0] + X, piv[1] + Y); g.rotate(beta); g.translate(-piv[0], -piv[1]);
      // payload hangs a little lower while it falls
      const conf = [[pay[0] - 0.055, pay[1] - 0.14], [pay[0] + 0.055, pay[1] - 0.14]];
      const wob = (1 - clamp(k)) * 0.03;
      for (let j = 0; j <= N; j++) {
        if (j % 2 && j !== 0 && j !== N) continue;
        const phi = -pm + (2 * pm * j) / N;
        const a = at(phi, 1), cf = phi < 0 ? conf[0] : conf[1];
        P.seg(a[0] + wob * Math.sin(j * 2.1 + t * 13), a[1], cf[0], cf[1], P.dot * 0.85, P.m(PF.LINES, 0.58));
      }
      P.seg(conf[0][0], conf[0][1], pay[0] - 0.035, pay[1] - 0.05, P.dot * 1.2, P.m(PF.LINES, 0.8));
      P.seg(conf[1][0], conf[1][1], pay[0] + 0.035, pay[1] - 0.05, P.dot * 1.2, P.m(PF.LINES, 0.8));
      // canopy cells: shaded tubes lit from the upper left, red / white panels in colour
      const dphi = (2 * pm) / N, gap = P.dot * 0.7;
      for (let j = 0; j < N; j++) {
        const pa = -pm + j * dphi, pb = pa + dphi, pmid = (pa + pb) / 2;
        const sn = Math.sin(pmid), cs = Math.cos(pmid);
        let nx = sn / PFL.Ru, ny = -cs / PFL.Rv; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
        const lam = clamp(-0.55 * nx - 0.83 * ny);
        const tone = P.color ? mix(0.98, 0.5, lam) : mix(0.84, 0.3, lam);
        const ga = gap / PFL.Ru / 2;
        const crumple = (1 - clamp(k)) * 0.5 * Math.sin(j * 2.3 + t * 9);
        const outer = [], inner = [];
        for (let q = 0; q <= 12; q++) {
          const ph = mix(pa + ga, pb - ga, q / 12);
          const bulge = Math.sin((q / 12) * PI) * (0.12 * clamp(k) + crumple * 0.1);
          outer.push(at(ph, -bulge)); inner.push(at(ph, 1));
        }
        const o = at(pmid, 0), ii = at(pmid, 1);
        const mat = j % 2 ? PF.WHITE : PF.RED;
        P.poly(outer.concat(inner.reverse()), P.lin(o[0], o[1], ii[0], ii[1], [[0, tone * 0.62], [0.5, tone], [1, Math.min(1, tone + 0.3)]], mat));
        const mouth = [];
        for (let q = 0; q <= 18; q++) { const a = q / 18 * TAU; mouth.push(at(pmid + Math.cos(a) * dphi * 0.27, 0.74 + Math.sin(a) * 0.15)); }
        P.poly(mouth, P.color ? P.m(PF.LINES, 0.86) : P.ink(0.82));
      }
      // payload (accent): the CanSat under the risers
      const pw = 0.068, ph = 0.16;
      P.rrect(pay[0] - pw, pay[1] - 0.06, pw * 2, ph, 0.02, P.cyl(pay[0] - pw, pay[0] + pw, ACC, 0.45));
      P.ellipse(pay[0], pay[1] - 0.06, pw, 0.02, 0, P.acc(0.3));
      g.restore();
    },
  };

  // 5 — Rocket avionics: pitch it, light it ----------------------------------
  // Drag pitches the rocket about its centre of mass (inertia, soft limits);
  // click ignites the motor: a flickering flame, a short push along the axis,
  // a shudder and smoke puffs that drift and dissolve. The avionics bay is the
  // accent (in colour, a window onto a green flight computer).
  const RKT = { R: 0.15, cy: 0, tail: -0.92, nose0: 0.42, tip: 1.0, sc: 0.9, Lp: [-0.3, 0], W: [-0.25, 0.04], rest: -0.17, lim: [-0.6, 0.25], burn: 1.7 };
  const RK = { BODY: 4, FIN: 5, AVI: 6, FLAME: 7, SMOKE: 8, CORE: 9 };
  M.rocket = {
    label: 'Rocket — drag to pitch it, click to ignite the motor',
    cursor: 'Ignite',
    drag: 'x',
    rest: [0.2, 0],
    ghostEvery: 5.6, ghostFirst: 1.6,
    mats: [
      ['ink', '#2A2C30'], ['accent', 'accent'], ['muted', '#A3A39C'], ['ink', '#AAA59B'],
      ['ink', ['#D6D9DC', '#9CA4AC', '#58616A']], ['ink', ['#E8604A', '#C2341F', '#83221A']],
      ['accent', ['#63B582', '#2F7D4F', '#1C5434']], ['accent', ['#F6B941', '#EE7A2A', '#D0451C']],
      ['muted', ['#D2CDC3', '#ABA599', '#837D72']], ['accent', '#F9DC6A'],
    ],
    radius(u) {
      const { R, nose0, tip } = RKT;
      if (u <= nose0) return R;
      if (u >= tip) return 0;
      const x = (u - nose0) / (tip - nose0);
      return R * Math.pow(1 - x * x, 0.62);
    },
    init(I) { I.th = spr(RKT.rest); I.push = spr(0); I.ign = null; I.puffs = []; I.pk = 0; I.drag0 = 0; },
    ghost(I, tau) { return [0.2, 0]; },
    // world pose: pivot, angle, axis
    pose(I) {
      const th = I.th.x, ax = Math.cos(th), ay = Math.sin(th);
      let sh = 0;
      if (I.ign) { const e = I.now - I.ign.t0; if (e < RKT.burn && !I.reduced) sh = 0.004 * Math.sin(e * 230) * (1 - e / RKT.burn); }
      return { th, ax, ay, x: RKT.W[0] + ax * I.push.x - ay * sh, y: RKT.W[1] + ay * I.push.x + ax * sh };
    },
    toWorld(I, lx, ly) {
      const p = this.pose(I), s = RKT.sc, rx = (lx - RKT.Lp[0]) * s, ry = (ly - RKT.Lp[1]) * s;
      return [p.x + rx * p.ax - ry * p.ay, p.y + rx * p.ay + ry * p.ax];
    },
    click(I) {
      if (I.ign && I.now - I.ign.t0 < RKT.burn * 0.7) return;
      I.ign = { t0: I.now }; I.pk = 0;
    },
    key(I, key) {
      if (key === 'ArrowUp' || key === 'ArrowLeft') { I.th.v -= 1.6; return true; }
      if (key === 'ArrowDown' || key === 'ArrowRight') { I.th.v += 1.6; return true; }
      return false;
    },
    dragMove(I, du, dv, pu, pv) {
      // angular drag about the pivot: the part you hold follows the pointer
      const p = this.pose(I), rx = pu - p.x, ry = pv - p.y, r2 = Math.max(0.04, rx * rx + ry * ry);
      let dth = (rx * dv - ry * du) / r2;
      const [a, b] = RKT.lim, th = I.th.x;
      if ((th < a && dth < 0) || (th > b && dth > 0)) dth *= 0.25;
      I.th.x += dth; if (I.dt > 0 && dth) I.th.v = dth / I.dt;
    },
    // fling: angular velocity of the release about the centre of mass (engine-smoothed pointer velocity)
    release(I, vu, vv, pu, pv) {
      const p = this.pose(I), rx = pu - p.x, ry = pv - p.y, r2 = Math.max(0.04, rx * rx + ry * ry);
      I.th.v = clamp((rx * vv - ry * vu) / r2, -4, 4);
    },
    step(I, dt) {
      let b = false;
      const [a, lb] = RKT.lim, th = I.th;
      if (!I.dragging) {
        // inertia with friction, rubber-band limits, the ghost rocks it gently
        let tgt = null;
        if (th.x < a) tgt = a; else if (th.x > lb) tgt = lb;
        if (I.idle > 0.01) {
          const g = RKT.rest + 0.2 * Math.sin(I.tau * 0.55) - 0.08 * Math.sin(I.tau * 1.3 + 1);
          tgt = mix(th.x, g, I.idle);
          b = spring(th, tgt, dt, 2.2, 0.8) || b;
        } else if (tgt !== null) b = spring(th, tgt, dt, 9, 0.8) || b;
        else b = coast(th, dt, 3.2) || b;
      } else b = true;
      let push = 0;
      if (I.ign) {
        const e = I.now - I.ign.t0;
        push = e < RKT.burn ? 0.11 * Math.min(1, e / 0.25) : 0;
        // smoke puffs while the motor burns
        if (e < RKT.burn && !I.reduced) {
          const want = Math.floor(e / 0.055);
          while (I.pk <= want) {
            const k = I.pk++, tE = I.ign.t0 + k * 0.055;
            const nz = this.toWorld(I, RKT.tail - 0.1, 0), p = this.pose(I);
            const j1 = hash2(k * 13 + 3, 7) - 0.5, j2 = hash2(k * 7 + 1, 19);
            I.puffs.push({ t0: tE, x: nz[0], y: nz[1], vx: -p.ax * (0.32 + 0.2 * j2) + j1 * 0.12, vy: -p.ay * (0.32 + 0.2 * j2) + 0.05 + j1 * 0.05, r: 0.05 + 0.04 * j2 });
          }
        }
        if (e > RKT.burn + 2.8) { I.ign = null; I.puffs = []; } else b = true;
      }
      I.puffs = I.puffs.filter((q) => I.now - q.t0 < 2.6);
      b = spring(I.push, push, dt, push ? 7 : 4, push ? 0.9 : 0.6) || b;
      return b;
    },
    dsig(I, t) {
      const p = this.pose(I);
      return [p.th, p.x, p.y, I.ign ? I.now : -1, Math.round(t * 20) / 20];
    },
    dyn(g, P, I, S, t) {
      const { R, cy, tail, nose0, tip, sc, Lp } = RKT, p = this.pose(I), d = P.dot;
      const burnE = I.ign ? I.now - I.ign.t0 : 1e9, burning = burnE < RKT.burn;
      // smoke (world space, behind the rocket)
      for (const q of I.puffs) {
        const e = I.now - q.t0, k = clamp(e / 2.6);
        const x = q.x + q.vx * (1 - Math.exp(-e * 1.6)) / 1.6, y = q.y + q.vy * (1 - Math.exp(-e * 1.6)) / 1.6 - 0.03 * e;
        const r = q.r + 0.12 * Math.sqrt(k), a = 0.55 * (1 - k) * smoothstep(0, 0.08, e);
        P.circle(x, y, r, P.rad(x - r * 0.3, y - r * 0.3, 0, r, [[0, a * 0.7], [0.55, a], [1, 0]], RK.SMOKE));
      }
      g.save();
      g.translate(p.x, p.y); g.rotate(p.th); g.scale(sc, sc); g.translate(-Lp[0], -Lp[1]);
      // speed lines (muted dashes streaming back; faster while the motor burns)
      const sp = burning ? 1.1 : 0.12;
      g.save(); g.setLineDash([d * 1.2 / sc, d * 2.4 / sc]); g.lineDashOffset = -t * sp;
      for (const sg of [-1, 1]) {
        const vv = cy + sg * (R + 0.13);
        g.beginPath(); g.moveTo(0.86, vv); g.lineTo(-0.6, vv);
        g.lineWidth = d * 1.1 / sc; g.strokeStyle = P.lin(0.86, 0, -0.6, 0, [[0, 0], [0.2, T.ctx], [0.8, T.ctx], [1, 0]], MUT); g.stroke();
      }
      g.restore();
      // flame (behind the nozzle)
      if (burning) {
        const grow = Math.min(1, burnE / 0.12), fade = 1 - smoothstep(RKT.burn * 0.6, RKT.burn, burnE);
        const fl = (0.36 + 0.06 * Math.sin(t * 37) + 0.04 * Math.sin(t * 23 + 1)) * grow * fade;
        const x0 = tail - 0.07;
        if (fl > 0.01) {
          const pts = [];
          for (let q = 0; q <= 20; q++) { const a = q / 20, w = R * 0.62 * Math.sin(PI * Math.pow(a, 0.55)) * (1 - 0.25 * a); pts.push([x0 - fl * a, cy - w]); }
          for (let q = 20; q >= 0; q--) { const a = q / 20, w = R * 0.62 * Math.sin(PI * Math.pow(a, 0.55)) * (1 - 0.25 * a); pts.push([x0 - fl * a, cy + w + 0.006 * Math.sin(q + t * 30)]); }
          P.poly(pts, P.lin(x0, 0, x0 - fl, 0, [[0, 0.95], [0.5, 0.8], [1, 0.25]], RK.FLAME));
          P.ellipse(x0 - fl * 0.22, cy, fl * 0.24, R * 0.26, 0, P.rad(x0 - fl * 0.12, cy, 0, fl * 0.3, [[0, 0.5], [1, 0.75]], RK.CORE));
        }
      }
      // body
      const body = (k = RK.BODY) => P.lin(0, cy - R, 0, cy + R, [[0, 0.56], [0.17, T.lit - 0.04], [0.42, 0.36], [0.78, 0.86], [1, 0.97]], k);
      const fh = 0.26;
      P.poly([[tail + 0.02, cy - R], [tail + 0.32, cy - R], [tail + 0.08, cy - R - fh], [tail - 0.1, cy - R - fh]], P.lin(0, cy - R - fh, 0, cy - R, [[0, 0.26], [1, 0.58]], RK.FIN));
      P.poly([[tail + 0.02, cy + R], [tail + 0.32, cy + R], [tail + 0.08, cy + R + fh], [tail - 0.1, cy + R + fh]], P.lin(0, cy + R, 0, cy + R + fh, [[0, 0.95], [1, 0.82]], RK.FIN));
      P.poly([[tail + 0.005, cy - R * 0.72], [tail - 0.07, cy - R * 0.5], [tail - 0.07, cy + R * 0.5], [tail + 0.005, cy + R * 0.72]], P.ink(0.95));
      P.rrect(tail, cy - R, nose0 - tail + 0.01, 2 * R, 0.012, body());
      const prof = [];
      for (let k = 0; k <= 40; k++) { const u = mix(nose0, tip, k / 40); prof.push([u, cy - this.radius(u)]); }
      for (let k = 40; k >= 0; k--) { const u = mix(nose0, tip, k / 40); prof.push([u, cy + this.radius(u)]); }
      P.poly(prof, body(P.color ? RK.FIN : RK.BODY));
      P.rrect(tail + 0.02, cy - 0.014, 0.3, 0.028, 0.01, P.m(RK.FIN, 0.92));
      const b0 = 0.04, b1 = 0.2;
      P.rrect(b0, cy - R - 0.004, b1 - b0, 2 * R + 0.008, 0.008, body(RK.AVI));
      P.circle(b0 + 0.05, cy - 0.06, 0.017, P.ink(0.88));
      P.circle(b0 + 0.11, cy - 0.06, 0.017, P.ink(0.88));
      P.seg(-0.42, cy - R + 0.004, -0.42, cy + R - 0.004, d * 0.7 / sc, P.ink(1));
      P.seg(nose0, cy - R + 0.004, nose0, cy + R - 0.004, d * 0.7 / sc, P.ink(1));
      P.rrect(-0.68, cy + R - 0.002, 0.04, 0.03, 0.008, P.ink(0.9));
      P.rrect(-0.16, cy + R - 0.002, 0.04, 0.03, 0.008, P.ink(0.9));
      g.restore();
    },
  };

  // 6 — Portable GCS: a handheld ground-control unit with a radar scope -----
  // The sweep turns on its own; point into the unit and it slews to your
  // bearing. Click drops a telemetry waypoint that pulses and is re-painted
  // each time the sweep passes it. In colour the scope is a phosphor CRT.
  const GCS = {
    box: [-0.98, -0.4, 1.96, 1.02, 0.13], bevel: 1.9,
    scope: { c: [-0.4, 0.11], r: 0.42 },
    tgt: [0.58, -0.78], minor: [[0.55, 2.2], [0.78, 0.5], [0.4, -2.4]],
    knobs: [[0.43, 0.38, 0.1], [0.75, 0.38, 0.1]],
    ant: [[0.7, -0.4], [0.79, -0.685]],
  };
  const RD = { HOUSE: 4, FIELD: 5, GRID: 6, PH1: 7, PH2: 8, LEDG: 9, LEDA: 10, KNOB: 11 };
  const scAt = (rho, phi) => [GCS.scope.c[0] + GCS.scope.r * rho * Math.cos(phi), GCS.scope.c[1] + GCS.scope.r * rho * Math.sin(phi)];
  M.radar = {
    label: 'Ground-control radar — point into the scope to slew the sweep, click to drop a waypoint',
    cursor: 'Waypoint',
    drag: 'x',
    rest: [-0.4, 0.11],
    ghostEvery: 4.2, ghostFirst: 1.2,
    mats: [
      ['ink', '#2E322F'], ['accent', 'accent'], ['muted', '#9AA39C'], ['ink', '#ABA69C'],
      ['ink', ['#A9B0AA', '#626B64', '#353B36']], ['ink', '#143021'], ['ink', '#2C7448'],
      ['ink', ['#2E8F55', '#46C477']], ['ink', '#A6F8C2'], ['ink', '#46D27A'], ['ink', '#F2B23C'], ['ink', ['#7C837E', '#3F4540', '#1D2120']],
    ],
    paint(g, P) {
      const d = P.dot, [bx, by, bw, bh, br] = GCS.box, bv = GCS.bevel * d, col = P.color;
      const { c: [sx, sy], r: sr } = GCS.scope;
      P.cast(bx + bw * 0.42, by + bh + 0.005, bw * 0.62, 0.06, 0.24);
      const [a0, a1] = GCS.ant;
      P.seg(a0[0], a0[1] + 0.04, a1[0], a1[1], d * 2.2, P.lin(a0[0] - 0.03, 0, a0[0] + 0.05, 0, [[0, 0.5], [1, 0.95]], RD.KNOB));
      P.circle(a1[0], a1[1], d * 1.25, P.ink(0.95));
      P.rrect(a0[0] - 0.05, a0[1] - 0.05, 0.1, 0.06, 0.015, P.cyl(a0[0] - 0.05, a0[0] + 0.05, RD.HOUSE));
      // housing: bevelled frame lit from the upper left, flat face
      P.rrect(bx, by, bw, bh, br, P.lin(bx, by, bx + bw * 0.55, by + bh * 1.4, [[0, 0.24], [0.5, 0.6], [1, 0.95]], RD.HOUSE));
      P.rrect(bx + bv, by + bv, bw - 2 * bv, bh - 2 * bv, br - bv * 0.6, col ? P.m(RD.HOUSE, 0.08) : P.ink(0));
      // scope recess: dark upper-left lip, light lower-right
      P.circle(sx, sy, sr + bv * 0.9, P.lin(sx - sr, sy - sr, sx + sr, sy + sr, [[0, 0.95], [0.5, 0.6], [1, 0.22]], RD.HOUSE));
      P.circle(sx, sy, sr, col ? P.m(RD.FIELD, 0.86) : P.ink(0));
      const G = (a) => (col ? P.m(RD.GRID, Math.min(1, a + 0.45)) : P.mut(a));
      for (const k of [0.36, 0.7]) P.ring(sx, sy, sr * k, sr * k, 0, d * 1.2, G(T.ctx * 0.85));
      g.setLineDash([d, d]);
      P.seg(sx - sr * 0.94, sy, sx + sr * 0.94, sy, d, G(T.ctxLo));
      P.seg(sx, sy - sr * 0.94, sx, sy + sr * 0.94, d, G(T.ctxLo));
      g.setLineDash([]);
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * TAU, maj = k % 6 === 0;
        const p0 = scAt(0.98, a), p1 = scAt(maj ? 0.86 : 0.92, a);
        P.seg(p0[0], p0[1], p1[0], p1[1], d, maj ? (col ? P.m(RD.PH1, 0.95) : P.ink(0.75)) : G(T.ctx));
      }
      const tr = [];
      for (let k = 0; k <= 30; k++) { const s = k / 30; tr.push(scAt(mix(0.1, GCS.tgt[0] + 0.5, s), mix(2.9, GCS.tgt[1], s))); }
      g.setLineDash([d * 0.8, d * 1.5]);
      P.stroke(tr.reverse().slice(0, 24), d * 1.1, G(T.ctx * 0.75));
      g.setLineDash([]);
      P.circle(sx, sy, d * 1.0, col ? P.m(RD.PH2, 0.9) : P.ink(0.9));
      for (const [kx, ky, kr] of GCS.knobs) {
        P.cast(kx + 0.02, ky + kr * 0.9, kr * 1.6, kr * 0.35, 0.22);
        P.circle(kx, ky, kr, P.lin(kx - kr, ky - kr, kx + kr, ky + kr, [[0, 0.3], [0.5, 0.62], [1, 0.97]], RD.KNOB));
        P.circle(kx, ky, kr - d * 1.5, P.rad(kx - kr * 0.35, ky - kr * 0.4, 0, kr * 1.1, [[0, 0.04], [1, 0.3]], RD.KNOB));
        P.seg(kx + kr * 0.12, ky - kr * 0.62, kx + kr * 0.04, ky - kr * 0.2, d * 1.2, P.ink(0.95));
      }
    },
    prep(F, name, mode) {
      const { P, D, C } = F;
      const set = (c, r, d, k) => { const i = r * F.cols + c; D[i] = d; C[i] = k; };
      const g0 = P.colOf(0.26), g1 = P.colOf(0.92), r0 = P.rowOf(-0.2), r1 = P.rowOf(0.08);
      for (let r = r0; r <= r1; r++) for (let c = g0; c <= g1; c++) if (((c - g0) + (r - r0)) % 2 === 0) set(c, r, 0.62, RD.KNOB);
      const col = mode === 'color';
      for (let k = 0; k < 3; k++) F.disc(0.29 + k * 0.07, -0.28, 0.9, k === 0 ? 0.95 : 0.4, col ? (k === 0 ? RD.LEDG : k === 1 ? RD.LEDA : RD.KNOB) : INK);
      const tp = scAt(GCS.tgt[0], GCS.tgt[1]);
      F.ring(tp[0], tp[1], 3.6, 1.0, 0.6, ACC);
      F.disc(tp[0], tp[1], 2.1, 1, ACC);
      const { n, U, V } = F, [sx, sy] = GCS.scope.c, sr = GCS.scope.r;
      const idx = [], aux = [], base = [];
      for (let i = 0; i < n; i++) {
        const du = U[i] - sx, dv = V[i] - sy, rho = Math.hypot(du, dv) / sr;
        if (rho < 0.83 && rho > 0.04 && F.C[i] !== ACC) { idx.push(i); aux.push(Math.atan2(dv, du), rho); }
      }
      return { idx, aux: Float32Array.from(aux), minor: GCS.minor.map(([r, p]) => [scAt(r, p), p]) };
    },
    init(I) { I.sw = { x: -2.0, v: 0.5 }; I.wps = []; },
    ghost(I, tau) { return [-0.4 + 0.3 * Math.cos(tau * 0.5), 0.11 + 0.3 * Math.sin(tau * 0.5)]; },
    ghostClick(I, tau, k) { const a = hash2(k * 17 + 5, 3) * TAU, r = 0.35 + 0.4 * hash2(k * 5 + 1, 11); return scAt(r, a); },
    // arrows turn the bearing 30° at a time (the aim moves round the scope)
    key(I, key) {
      const s = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[key];
      if (!s) return false;
      const a = Math.round(I.sw.x / (PI / 6)) * (PI / 6) + s * PI / 6;
      [I.ru, I.rv] = scAt(0.6, a); I.hasReal = true;
      return true;
    },
    click(I, u, v) {
      const [sx, sy] = GCS.scope.c, sr = GCS.scope.r;
      let du = u - sx, dv = v - sy, rho = Math.hypot(du, dv) / sr;
      if (rho > 0.8) { const a = I.sw.x; du = Math.cos(a) * sr * 0.62; dv = Math.sin(a) * sr * 0.62; rho = 0.62; }
      I.wps.push({ u: sx + du, v: sy + dv, a: Math.atan2(dv, du), t0: I.now });
      if (I.wps.length > 4) I.wps.shift();
    },
    step(I, dt) {
      const [sx, sy] = GCS.scope.c;
      // track the pointer's bearing while it is over the unit, otherwise rotate
      const track = (I.real || (I.hasReal && I.now - I.last < 2.5)) && I.idle < 0.5;
      let b = false;
      if (track) {
        const tgt = I.sw.x + angWrap(Math.atan2(I.tv - sy, I.tu - sx) - I.sw.x);
        b = spring(I.sw, tgt, dt, 8, 0.85);
      } else if (!I.reduced) {
        I.sw.v += (0.5 - I.sw.v) * (1 - Math.exp(-dt * 2.5));
        I.sw.x += I.sw.v * dt;
      }
      I.wps = I.wps.filter((w) => I.now - w.t0 < 14);
      return b || I.wps.length > 0;
    },
    anim(t, A, S, I) {
      const [sx, sy] = GCS.scope.c;
      const th = I.sw.x, ex = Math.cos(th), ey = Math.sin(th), dot = A.dot, col = I.mode === 'color';
      for (let k = 0; k < S.idx.length; k++) {
        const i = S.idx[k], phi = S.aux[2 * k], rho = S.aux[2 * k + 1];
        const dl = wrap01((th - phi) / TAU) * TAU;
        const du = A.U[i] - sx, dv = A.V[i] - sy;
        let s = 0;
        if (du * ex + dv * ey > 0) s = 0.97 * smoothstep(1.6, 0.3, Math.abs(du * ey - dv * ex) / dot);
        const trail = (col ? 0.7 : 0.82) * Math.exp(-dl * (col ? 0.75 : 0.95)) * smoothstep(0.04, 0.16, rho) * smoothstep(0.83, 0.72, rho);
        if (trail > s) s = trail;
        if (col) { if (s > 0.12) A.set(i, Math.max(A.D[i] / A.TX[i], 0.5 + 0.5 * s), s > 0.62 ? RD.PH2 : RD.PH1); }
        else if (s > 0.06) A.lift(i, s * s, INK);
      }
      for (const [[u, v], p] of S.minor) {
        const dl = wrap01((th - p) / TAU) * TAU;
        if (col) A.disc(u, v, 1.2, 0.6 + 0.4 * Math.exp(-dl * 1.1), Math.exp(-dl * 1.1) > 0.4 ? RD.PH2 : RD.PH1);
        else A.bead(u, v, 1.4, 0.32 + 0.62 * Math.exp(-dl * 1.1), INK);
      }
      // waypoints: a marker, a first accent pulse, then a re-paint as the sweep passes
      for (const w of I.wps) {
        const e = I.now - w.t0, life = 1 - smoothstep(11, 14, e);
        const dl = wrap01((th - w.a) / TAU) * TAU, paint = Math.exp(-dl * 1.4);
        const pop = e < 0.25 ? easeOut(e / 0.25) * (1 + 0.4 * Math.sin(e * 25) * (1 - e / 0.25)) : 1;
        A.disc(w.u, w.v, 1.5 * pop, (0.75 + 0.25 * paint) * life, col ? RD.PH2 : INK);
        const pe = e % 1.6, amp = (e < 1.6 ? 0.95 : 0.55 * paint) * life * Math.sin(PI * clamp(pe / 1.2));
        if (pe < 1.2 && amp > 0.05) A.halo(w.u, w.v, 1.5 + pe * 5, amp, e < 1.6 ? ACC : (col ? RD.PH1 : MUT), A.over);
      }
    },
  };

  // 7 — Petruck AI analytics: ask in plain words, get a chart ----------------
  // A natural-language prompt sits above a bar chart. Hovering highlights the
  // nearest bar (accent) with a value tick to the axis. Click re-queries: the
  // prompt retypes a new question, then the bars spring to the new dataset
  // (NL -> SQL -> chart).
  const CHT = {
    u0: -0.95, u1: 0.95, vb: 0.62, Hc: 0.98, N: 12, p0: -0.7, p1: -0.5,
    sets: [
      [0.22, 0.3, 0.27, 0.38, 0.35, 0.48, 0.56, 0.52, 0.66, 0.78, 0.95, 0.83],
      [0.62, 0.7, 0.58, 0.45, 0.4, 0.52, 0.66, 0.78, 0.71, 0.55, 0.48, 0.6],
      [0.92, 0.8, 0.72, 0.62, 0.66, 0.55, 0.47, 0.5, 0.42, 0.37, 0.31, 0.27],
      [0.3, 0.55, 0.86, 0.6, 0.35, 0.27, 0.4, 0.7, 0.93, 0.66, 0.38, 0.3],
    ],
    words: [[4, 7, 3, 5, 6], [5, 3, 8, 4, 3], [6, 4, 5, 3, 7], [3, 6, 4, 7, 2, 4]],
  };
  const CH = { BAR: 4, GRID: 5, TEXT: 6, FRAME: 7 };
  M.chart = {
    label: 'AI analytics — hover the bars to read values, click to ask a new question',
    cursor: 'Query',
    drag: 'x',
    rest: [0.6, 0.2],
    ghostEvery: 5.4, ghostFirst: 2.0,
    mats: [
      ['ink', '#2C3440'], ['accent', 'accent'], ['muted', '#A2ACB6'], ['ink', '#A8A398'],
      ['ink', ['#79A3D4', '#3A6FB0']], ['muted', '#B7C3CF'], ['ink', '#3A4656'], ['muted', '#9AA7B5'],
    ],
    prep(F) {
      const { P, D, C } = F;
      const set = (c, r, d, k) => { if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) return; const i = r * F.cols + c; D[i] = d; C[i] = k; };
      const rb = P.rowOf(CHT.vb), c0 = P.colOf(CHT.u0), c1 = P.colOf(CHT.u1);
      // bar layout on whole dot columns
      const Nc = c1 - c0 + 1, gap = Nc > 70 ? 2 : 1, bw = Math.floor((Nc - 11 * gap) / 12), lead = Math.floor((Nc - (12 * bw + 11 * gap)) / 2);
      const bars = [];
      for (let k = 0; k < 12; k++) { const a = c0 + lead + k * (bw + gap); bars.push([a, a + bw - 1]); }
      // gridlines (dotted), baseline, ticks
      for (const f of [1 / 3, 2 / 3, 1]) { const r = P.rowOf(CHT.vb - f * CHT.Hc * 0.95); for (let c = c0; c <= c1; c++) if ((c - c0) % 2 === 0) set(c, r, T.ctxLo, CH.GRID); }
      for (let c = c0 - 1; c <= c1 + 1; c++) set(c, rb, 0.78, INK);
      bars.forEach(([a, b], k) => { if (k % 2 === 0) { const c = Math.round((a + b) / 2); set(c, rb + 1, T.ctx, MUT); set(c, rb + 2, T.ctx, MUT); } });
      // prompt field: rounded outline, a chevron, a run key
      const rp0 = P.rowOf(CHT.p0), rp1 = P.rowOf(CHT.p1), rm = Math.round((rp0 + rp1) / 2);
      for (let c = c0 + 1; c <= c1 - 1; c++) { set(c, rp0, T.ctx, CH.FRAME); set(c, rp1, T.ctx, CH.FRAME); }
      for (let r = rp0 + 1; r <= rp1 - 1; r++) { set(c0, r, T.ctx, CH.FRAME); set(c1, r, T.ctx, CH.FRAME); }
      set(c0 + 2, rm - 1, 0.8, CH.TEXT); set(c0 + 3, rm, 0.8, CH.TEXT); set(c0 + 2, rm + 1, 0.8, CH.TEXT);
      for (let r = rm - 1; r <= rm + 1; r++) for (let c = c1 - 4; c <= c1 - 2; c++) set(c, r, r === rm && c === c1 - 3 ? 0.2 : 0.85, CH.TEXT);
      return { rb, c0, c1, bars, bw, rm, tx0: c0 + 6, tx1: c1 - 7 };
    },
    init(I) {
      I.set = 0; I.h = CHT.sets[0].map((v) => spr(v)); I.hl = new Float32Array(12); I.q = null; I.sel = -1;
    },
    ghost(I, tau) { return [0.82 * Math.sin(tau * 0.42 - 0.6), 0.2]; },
    click(I) { if (I.q && I.now - I.q.t0 < 0.9) return; I.q = { t0: I.now, from: I.set }; I.set = (I.set + 1) % CHT.sets.length; },
    key(I, key) {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const k = clamp((I.sel < 0 ? 6 : I.sel) + (key === 'ArrowLeft' ? -1 : 1), 0, 11);
        I.ru = mix(CHT.u0, CHT.u1, (k + 0.5) / 12); I.rv = 0.2; I.hasReal = true;
        return true;
      }
      return false;
    },
    step(I, dt) {
      let b = false;
      const sel = clamp(Math.floor((I.tu - CHT.u0) / (CHT.u1 - CHT.u0) * 12), 0, 11);
      const show = I.real || I.idle > 0.3 || I.hasReal;
      I.sel = show ? sel : 10;
      const ka = 1 - Math.exp(-dt * 14);
      for (let k = 0; k < 12; k++) { const tg = k === I.sel ? 1 : 0; I.hl[k] += (tg - I.hl[k]) * (dt > 0 ? ka : 1); if (Math.abs(I.hl[k] - tg) > 0.01) b = true; }
      const delay = I.q ? (I.reduced ? 0.05 : 0.75) : 0;
      for (let k = 0; k < 12; k++) {
        const go = !I.q || I.now - I.q.t0 > delay + k * 0.045;
        const tgt = go ? CHT.sets[I.set][k] : CHT.sets[I.q.from][k];
        b = spring(I.h[k], tgt, dt, 11, 0.5) || b;
      }
      if (I.q) { if (I.now - I.q.t0 > 2.4) I.q = null; else b = true; }
      return b;
    },
    anim(t, A, S, I) {
      const { rb, bars, c0, rm } = S, dot = A.dot, Hd = CHT.Hc / dot;
      // bars: flat ink with a lit left column; the selected one in accent
      bars.forEach(([a, bEnd], k) => {
        const hD = Math.max(0, I.h[k].x) * Hd, on = I.hl[k] > 0.5, mat = on ? ACC : CH.BAR;
        const full = Math.floor(hD), fr = hD - full;
        for (let c = a; c <= bEnd; c++) {
          const cov = on ? (c === a ? 0.42 : 0.7) : (c === a ? 0.5 : 0.84);
          for (let j = 1; j <= full + 1; j++) {
            const r = rb - j, f = j <= full ? 1 : fr;
            if (r < 0 || f <= 0.02) continue;
            A.set(r * A.cols + c, cov * f * f, mat);
          }
        }
        if (I.hl[k] > 0.02) {
          // value tick: a dashed line from the bar top to the axis + a value chip
          const s = I.hl[k], rt = rb - hD - 0.5, top = Math.round(rt);
          A.hline(c0 - 1, a - 1.2, rt, 0.5 * s * s, INK, A.lift, (c) => ((c - c0) % 2 ? 0 : 1));
          for (let c = a - 1; c <= bEnd + 1; c++) for (let r = top - 4; r <= top - 3; r++) A.at(c, r, (r === top - 4 && c > a && c < bEnd ? 0.15 : 0.9) * s * s, INK, A.set);
        }
      });
      // the prompt: words type in after a click; the caret blinks
      const q = I.q, words = CHT.words[I.set], prev = q ? CHT.words[q.from] : null;
      let shown = 1e9, erase = 0;
      if (q) {
        const e = I.now - q.t0;
        if (e < 0.18) erase = e / 0.18; else shown = (e - 0.18) / (I.reduced ? 0.001 : 0.022);
      }
      const ws = erase > 0 ? prev : words;
      let c = S.tx0, n = 0, end = S.tx0;
      for (const L of ws) {
        for (let j = 0; j < L; j++, c++, n++) {
          if (c > S.tx1) break;
          let s = 1;
          if (erase > 0) s = clamp((1 - erase) * 30 - (c - S.tx0) * 0.6 + 6);
          else s = clamp(shown - n);
          if (s > 0.02) A.at(c, rm, 0.66 * s * s, CH.TEXT, A.set);
          if (s > 0.5) end = c + 1;
        }
        c++;
      }
      const bl = I.reduced ? 1 : clamp(0.5 + 0.7 * Math.sin(t * 4.2)), cv = 0.75 * bl * bl;
      if (cv > 0.02) for (let r = rm - 1; r <= rm + 1; r++) A.at(end + 1, r, cv, ACC, A.set);
    },
  };

  // 8 — Infoglobal migration: a monolith that breaks into services ------------
  // A legacy monolith built from a 3 x 2 grid of modules (seams on its lid and
  // walls). Hovering pulls the module under the cursor up out of the block: its
  // lid turns accent, its walls show and it shades its neighbour. Click breaks
  // the monolith apart: the modules hop out into separate services (in colour
  // they turn from legacy slate to service blue); a second click packs them
  // back into one block. Faces are strict three-tone (lid lit, left mid, right
  // shade) with one hairline round each lid — no creases.
  const SLB = (() => {
    const NX = 3, NY = 2, Wx = 1.5, Dy = 0.9, H = 0.32, gap = 0.15, lift = 0.17, sh = 0.62;
    const mw = Wx / NX, md = Dy / NY, zt = H + lift;
    const az = 54, el = 30, ca = Math.cos(az * PI / 180), sa = Math.sin(az * PI / 180);
    // fitted on the packed monolith (+ a lifted module); the exploded services spread a little wider
    const pr = fitProj(isoProj(az, el), [[0, 0, 0], [Wx, 0, 0], [0, Dy, 0], [Wx, Dy, 0], [0, 0, zt], [Wx, 0, H], [0, Dy, H], [Wx, Dy, H]], 0.0, -0.05, 1.84, 1.3);
    return { NX, NY, Wx, Dy, H, gap, lift, sh, mw, md, ca, sa, pr, hero: 1 };
  })();
  const SB = { TOP: 4, LEFT: 5, RIGHT: 6, TOP2: 7, LEFT2: 8, RIGHT2: 9 };
  function boxFaces(pr, x, y, z, w, d, h) {
    return {
      top: [pr(x, y, z + h), pr(x + w, y, z + h), pr(x + w, y + d, z + h), pr(x, y + d, z + h)],
      left: [pr(x, y + d, z), pr(x + w, y + d, z), pr(x + w, y + d, z + h), pr(x, y + d, z + h)],
      right: [pr(x + w, y, z), pr(x + w, y + d, z), pr(x + w, y + d, z + h), pr(x + w, y, z + h)],
    };
  }
  function inPoly(pts, u, v) {
    let c = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, ya] = pts[a], [xb, yb] = pts[b];
      if ((ya > v) !== (yb > v) && u < (xb - xa) * (v - ya) / (yb - ya) + xa) c = !c;
    }
    return c;
  }
  M.slabs = {
    label: 'Legacy migration — hover a module to lift it out of the monolith, click to break the monolith into services',
    cursor: 'Explode',
    drag: 'x',
    rest: [0.6, -0.3],
    ghostEvery: 5.2, ghostFirst: 2.0,
    mats: [
      ['ink', '#26303B'], ['accent', 'accent'], ['muted', '#A1AAB4'], ['ink', '#A8A49B'],
      // legacy slate (packed monolith)
      ['ink', ['#E4E4E0', '#C9CAC7', '#AAADAC']], ['ink', ['#AEB4BA', '#8A929B', '#6A737D']], ['ink', ['#5D6773', '#46505B', '#313942']],
      // service blue (exploded)
      ['ink', ['#DDE9F6', '#BAD1EA', '#95B5D9']], ['ink', ['#8BB1DD', '#5F8BC2', '#416FA8']], ['ink', ['#3A6398', '#2A4E7C', '#1C375C']],
    ],
    init(I) {
      I.et = 0; I.eT0 = -1e9; I.mods = [];
      for (let iy = 0; iy < SLB.NY; iy++) for (let ix = 0; ix < SLB.NX; ix++) {
        const k = I.mods.length;
        I.mods.push({ ix, iy, k, lift: spr(k === SLB.hero ? 1 : 0), e: spr(0) });
      }
      I.hov = -1; I.hero = SLB.hero;
    },
    ghost(I, tau) { const a = tau * 0.42; return [0.05 + 0.62 * Math.sin(a), -0.02 + 0.16 * Math.sin(a * 1.7 + 0.5)]; },
    click(I) { I.et = I.et ? 0 : 1; I.eT0 = I.now; },
    // module box at the current explode state (lift: 0 = sitting, 1 = pulled out)
    geo(I, m, noLift) {
      const { NX, NY, mw, md, H, gap, lift } = SLB, e = Math.max(-0.03, m.e.x);
      const hop = I.reduced ? 0 : 0.07 * Math.sin(PI * clamp(e));
      const x = m.ix * mw + (m.ix - (NX - 1) / 2) * gap * e, y = m.iy * md + (m.iy - (NY - 1) / 2) * gap * e;
      return { m, x, y, z: hop + (noLift ? 0 : lift * m.lift.x), w: mw, d: md, h: H };
    },
    // painter's order: far to near along the view (grid cells never overlap)
    order(I, noLift) {
      const { mw, md, ca, sa } = SLB;
      return I.mods.map((m) => this.geo(I, m, noLift)).sort((a, b) => (a.m.ix * mw * ca + a.m.iy * md * sa) - (b.m.ix * mw * ca + b.m.iy * md * sa));
    },
    hit(o, u, v) { const f = boxFaces(SLB.pr, o.x, o.y, o.z, o.w, o.d, o.h); return inPoly(f.top, u, v) || inPoly(f.left, u, v) || inPoly(f.right, u, v); },
    // the module under (u, v): whole prism (lid + both walls), nearest first; the
    // lifted module keeps the hover while the pointer is on it; else the nearest lid
    pick(I, u, v) {
      if (I.hov >= 0) { const o = this.geo(I, I.mods[I.hov]); if (this.hit(o, u, v)) return I.hov; }
      const list = this.order(I, true);
      for (let j = list.length - 1; j >= 0; j--) if (this.hit(list[j], u, v)) return list[j].m.k;
      let best = -1, bd = 0.6;
      for (const o of list) {
        const c = SLB.pr(o.x + o.w / 2, o.y + o.d / 2, o.z + o.h), dd = Math.hypot(c[0] - u, c[1] - v);
        if (dd < bd) { bd = dd; best = o.m.k; }
      }
      return best;
    },
    key(I, key) {
      // arrows walk the grid, Enter / Space explode (handled by the default)
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
      if (!mv) return false;
      const cur = I.mods[I.hov >= 0 ? I.hov : I.hero];
      const ix = clamp(cur.ix + mv[0], 0, SLB.NX - 1), iy = clamp(cur.iy + mv[1], 0, SLB.NY - 1);
      const o = this.geo(I, I.mods[iy * SLB.NX + ix], true), c = SLB.pr(o.x + o.w / 2, o.y + o.d / 2, o.z + o.h);
      I.ru = c[0]; I.rv = c[1]; I.hasReal = true; I.keyHov = iy * SLB.NX + ix;
      return true;
    },
    step(I, dt) {
      let b = false;
      const t0 = I.eT0, cx = (SLB.NX - 1) / 2, cy = (SLB.NY - 1) / 2;
      for (const m of I.mods) {
        const delay = 0.07 * Math.hypot(m.ix - cx, m.iy - cy);
        b = spring(m.e, I.now - t0 > delay || I.reduced ? I.et : 1 - I.et, dt, I.reduced ? 30 : 8, I.reduced ? 1 : 0.5) || b;
      }
      const show = I.real || I.idle > 0.3 || I.kAim;
      if (I.kAim && I.keyHov != null && I.idle < 0.3) I.hov = I.keyHov;
      else { I.keyHov = null; I.hov = show ? this.pick(I, I.tu, I.tv) : -1; }
      const hero = I.hov >= 0 ? I.hov : SLB.hero;
      for (const m of I.mods) b = spring(m.lift, m.k === hero ? 1 : 0, dt, I.reduced ? 30 : 10, I.reduced ? 1 : 0.6) || b;
      I.hero = hero;
      return b;
    },
    dsig(I) { const a = [I.hero]; for (const m of I.mods) a.push(m.lift.x, m.e.x); return a; },
    // soft shadow on the plane z: from x0 (dense) to x1 (fading), rows y..y+d
    shadow(P, x0, x1, y, d, z, a) {
      const pr = SLB.pr, n = 4;
      if (x1 <= x0 || a <= 0.004) return;
      for (let j = 0; j < n; j++) {
        const xe = mix(x0 + (x1 - x0) * 0.3, x1, j / (n - 1));
        P.poly([pr(x0, y, z), pr(xe, y, z), pr(xe, y + d, z), pr(x0, y + d, z)], P.shd(a / n * 1.4));
      }
    },
    dyn(g, P, I) {
      const { pr, sh } = SLB, d = P.dot, col = P.color;
      const list = this.order(I);
      // floor shadows (light from the upper left: cast toward +x), softer when lifted
      for (const o of list) {
        const zb = o.z, ztp = o.z + o.h;
        this.shadow(P, o.x + zb * sh, o.x + o.w + ztp * sh, o.y + 0.01, o.d - 0.02, 0, 0.3 * (1 - 0.45 * clamp(zb / 0.3)));
      }
      for (let j = 0; j < list.length; j++) {
        const o = list[j], m = o.m, f = boxFaces(pr, o.x, o.y, o.z, o.w, o.d, o.h);
        const svc = m.e.x > 0.5, hero = m.k === I.hero && m.lift.x > 0.3;
        const [kT, kL, kR] = svc ? [SB.TOP2, SB.LEFT2, SB.RIGHT2] : [SB.TOP, SB.LEFT, SB.RIGHT];
        // pulled out of the packed block: the socket under it is a dark cavity
        const sock = (1 - clamp(m.e.x * 5)) * clamp(m.lift.x * 4);
        if (sock > 0.02 && o.z > 0.004) {
          const fs = boxFaces(pr, o.x, o.y, 0, o.w, o.d, Math.min(o.z, o.h));
          P.poly(fs.left, P.m(kR, 0.5 + 0.45 * sock)); P.poly(fs.right, P.m(kR, 0.6 + 0.37 * sock));
        }
        P.poly(f.left, P.m(kL, 0.5));
        P.poly(f.right, P.m(kR, 0.93));
        const lid = col ? 0.3 : 0.12;
        P.poly(f.top, P.m(kT, lid));
        // shade cast on this lid by a module standing proud behind it (opaque, the
        // lid's own material darkened toward the caster, fading away from it)
        const zr = o.z + o.h;
        if (!hero) {
          for (let q = 0; q < j; q++) {
            const s = list[q], zs = s.z + s.h;
            if (zs < zr + 0.01) continue;
            const x0 = s.x + Math.max(0, s.z - zr) * sh, x1 = s.x + s.w + (zs - zr) * sh, ym = s.y + s.d / 2;
            const p0 = pr(x0, ym, zr), p1 = pr(x1, ym, zr), a = 0.36 * clamp((zs - zr) / 0.12);
            g.save(); P.path(f.top); g.clip();
            P.poly([pr(x0, s.y, zr), pr(x1, s.y, zr), pr(x1, s.y + s.d, zr), pr(x0, s.y + s.d, zr)], P.lin(p0[0], p0[1], p1[0], p1[1], [[0, lid + a], [0.4, lid + a * 0.7], [1, lid]], kT));
            g.restore();
          }
        }
        // seams with the neighbours while packed: lighter joints down the walls
        const seam = 1 - clamp(m.e.x * 6);
        g.lineCap = 'butt';
        if (seam > 0.02 && m.ix > 0) P.seg(f.left[0][0], f.left[0][1], f.left[3][0], f.left[3][1], d * 1.1, P.m(kL, 0.5 - 0.4 * seam));
        if (seam > 0.02 && m.iy > 0) P.seg(f.right[0][0], f.right[0][1], f.right[3][0], f.right[3][1], d * 1.1, P.m(kR, 0.93 - 0.55 * seam));
        g.lineCap = 'round';
        // the one hairline: round the lid; the lifted module carries an accent tile inside it
        P.stroke(f.top, d * 0.9, P.ink(col ? 0.5 : 0.62), true);
        if (hero) {
          const ix = Math.min(o.w * 0.2, d * 2.6), iy = Math.min(o.d * 0.2, d * 2.6), zl = o.z + o.h;
          P.poly([pr(o.x + ix, o.y + iy, zl), pr(o.x + o.w - ix, o.y + iy, zl), pr(o.x + o.w - ix, o.y + o.d - iy, zl), pr(o.x + ix, o.y + o.d - iy, zl)], P.acc(col ? 0.5 : 0.45));
        }
      }
    },
  };

  // 9 — CanSat kit: a can you can spin and open ------------------------------
  // Drag spins the can about its axis (the label band and its logo, the camera
  // window, the port, the lid screws and the antenna travel round the
  // cylinder; inertia on release). Click opens a cutaway onto the flight
  // stack inside: three boards on standoffs over the battery, in a dark
  // cavity, their chips turning with the can.
  const CAN = { cx: -0.36, r: 0.4, e: 0.12, top: -0.27, bot: 0.58, antR: 0.375, boards: [-0.13, 0.11, 0.35], batt: [0.45, 0.535], cut0: -0.2, cutW: 1.32 };
  const CN = { BODY: 4, BAND: 5, LID: 6, GLASS: 7, PCB: 8, CHIP: 9, INNER: 10, BATT: 11, ANT: 12, EDGE: 13 };
  M.can = {
    label: 'CanSat kit — drag to spin the can, click to open a cutaway of the flight boards',
    cursor: 'Spin',
    drag: 'x',
    rest: [0.3, 0],
    ghostEvery: 5.6, ghostFirst: 2.0,
    mats: [
      ['ink', '#2B2E33'], ['accent', 'accent'], ['muted', '#A7ABAE'], ['ink', '#A59F95'],
      ['ink', ['#DADDE0', '#A3AAB1', '#5F666E']], ['ink', ['#6E9BDB', '#2D5DA8', '#1A3A70']], ['ink', ['#E3E6E8', '#B3B9BF', '#767D85']],
      ['ink', ['#6F8FA8', '#2A3E4E']], ['ink', ['#7CC496', '#3C8C5C', '#22603C']], ['ink', '#1E2226'], ['ink', ['#5E646A', '#3A3F45', '#1F2327']],
      ['muted', ['#EAC65E', '#C3952F']], ['ink', '#26292D'], ['ink', '#1B4A2E'],
    ],
    paint(g, P) {
      const { cx, r, e, top, bot } = CAN, d = P.dot;
      P.multiply(() => {
        const sx0 = cx + r * 0.2, len = 0.92;
        g.beginPath();
        g.ellipse(cx, bot, r, e, 0, -PI / 2, PI / 2, false);
        g.lineTo(cx + len, bot + e * 0.55); g.lineTo(cx + len + 0.02, bot - e * 0.5); g.closePath();
        g.fillStyle = P.lin(sx0, 0, cx + len, 0, [[0, 0.32], [0.6, 0.16], [1, 0.0]], KEEP);
        g.fill();
        P.seg(cx + len - 0.08, bot + 0.0, cx + len + 0.3, bot - 0.012, d * 1.2, P.lin(cx + len - 0.08, 0, cx + len + 0.3, 0, [[0, 0.1], [0.4, 0.2], [1, 0.0]], KEEP));
      });
      P.cast(cx + 0.02, bot + 0.005, 0.5, 0.06, 0.26);
      g.beginPath();
      g.moveTo(cx - r, top); g.lineTo(cx - r, bot);
      g.ellipse(cx, bot, r, e, 0, PI, 0, true);
      g.lineTo(cx + r, top); g.closePath();
      g.fillStyle = P.cyl(cx - r, cx + r, CN.BODY); g.fill();
      P.ellipse(cx, top, r, e, 0, P.rad(cx - 0.13, top - 0.035, 0, r * 1.25, [[0, 0.08], [1, 0.36]], CN.LID));
      P.ring(cx, top, r - d * 0.35, e - d * 0.3, 0, d * 0.9, P.ink(0.95), 0.12, PI - 0.12);
    },
    init(I) { I.th = { x: 0, v: 0 }; I.cut = spr(0); I.ct = 0; },
    click(I) { I.ct = I.ct ? 0 : 1; },
    key(I, key) {
      if (key === 'ArrowLeft') { I.th.v -= 2.2; return true; }
      if (key === 'ArrowRight') { I.th.v += 2.2; return true; }
      return false;
    },
    dragMove(I, du) { const d = du / CAN.r; I.th.x += d; if (I.dt > 0 && d) I.th.v = d / I.dt; },
    // fling: the surface speed under the finger becomes spin (engine-smoothed velocity)
    release(I, vu) { I.th.v = clamp(vu / CAN.r, -9, 9); },
    step(I, dt) {
      let b = false;
      if (!I.dragging) {
        if (I.idle > 0.01) {
          // the ghost turns it slowly
          I.th.v += (0.6 * I.idle - I.th.v) * (1 - Math.exp(-dt * 1.5));
          I.th.x += I.th.v * dt;
          b = true;
        } else b = coast(I.th, dt, 2.4) || b;
      } else b = true;
      b = spring(I.cut, I.ct, dt, I.reduced ? 30 : 7, 0.72) || b;
      return b;
    },
    dsig(I) { return [I.th.x, I.cut.x]; },
    dyn(g, P, I) {
      const { cx, r, e, top, bot } = CAN, d = P.dot, th = I.th.x;
      const front = (phi) => Math.cos(phi);
      const X = (phi) => cx + r * Math.sin(phi);
      // label band: a printed band round the body (four dot rows) with a logo that travels round
      // (in colour a blue band; in mono a pale printed label between two ink rims, so it
      // reads against the dark body)
      const mono = !P.color, b0 = P.sv(0.12) - d * (mono ? 2 : 1.5), b1 = b0 + d * (mono ? 5 : 4);
      g.beginPath();
      g.ellipse(cx, b0, r + 0.002, e, 0, PI, 0, true);
      g.lineTo(cx + r + 0.002, b1);
      g.ellipse(cx, b1, r + 0.002, e, 0, 0, PI, false);
      g.closePath();
      g.fillStyle = mono ? P.lin(cx - r, 0, cx + r, 0, [[0, 0.26], [0.18, 0.04], [0.5, 0.08], [0.82, 0.28], [1, 0.44]], CN.BAND) : P.cyl(cx - r, cx + r, CN.BAND, 0.55);
      g.fill();
      if (mono) for (const yb of [b0, b1]) { g.beginPath(); g.ellipse(cx, yb, r, e, 0, 0.03, PI - 0.03); g.lineWidth = d * 0.9; g.strokeStyle = P.m(CN.BAND, 0.95); g.stroke(); }
      for (let k = 0; k < 8; k++) {
        const phi = angWrap(k * TAU / 8 + th + 0.2), c = front(phi);
        if (c < 0.15 || k % 4 === 0) continue;
        const x = X(phi), yy = (b0 + b1) / 2 + e * c;
        P.seg(x, yy - d * 0.6, x, yy + d * 0.6, d * 0.8 * Math.sqrt(c), mono ? P.m(CN.BAND, 0.62) : P.m(CN.LID, 0.06));
      }
      const pl = angWrap(0.95 + th), cl = front(pl);
      if (cl > 0.05) {
        const x = X(pl), yy = (b0 + b1) / 2 + e * cl;
        P.rrect(x - 0.06 * cl, yy - d * 1.3, 0.12 * cl, d * 2.6, 0.012 * cl, P.acc(0.95));
      }
      // camera window + port slot (on the body, foreshortened toward the limbs)
      const pw = angWrap(-0.6 + th), cw = front(pw);
      if (cw > 0.02) {
        const x = X(pw), y = -0.07 + e * 0.15 * cw;
        P.ellipse(x, y, 0.05 * cw, 0.054, 0, P.ink(0.96));
        P.ellipse(x, y, 0.028 * cw, 0.032, 0, P.rad(x - 0.012 * cw, y - 0.012, 0, 0.04, [[0, 0.05], [1, 0.5]], CN.GLASS));
      }
      const ps = angWrap(1.9 + th), cs = front(ps);
      if (cs > 0.02) P.rrect(X(ps) - 0.0425 * cs, 0.36 + e * 0.1 * cs, 0.085 * cs, 0.034, 0.012 * cs, P.ink(0.96));
      // cutaway onto the flight stack
      const cut = clamp(I.cut.x, 0, 1.1);
      if (cut > 0.01) {
        const p0 = CAN.cut0, p1 = p0 + CAN.cutW * cut, yt = top + 0.06, yb = bot - 0.06;
        const win = [];
        for (let q = 0; q <= 16; q++) { const p = mix(p0, p1, q / 16); win.push([X(p), yt + e * Math.cos(p)]); }
        for (let q = 16; q >= 0; q--) { const p = mix(p0, p1, q / 16); win.push([X(p), yb + e * Math.cos(p)]); }
        g.save();
        P.path(win); g.clip();
        // dark cavity, a little lighter toward the lit right-hand wall
        P.rrect(cx - r, top - 0.1, 2 * r, bot - top + 0.2, 0, P.lin(cx - r, 0, cx + r, 0, [[0, 0.95], [0.6, 0.86], [1, 0.7]], CN.INNER));
        // battery on the floor, standoffs through the stack, then the boards bottom-up
        const [ba, bb] = CAN.batt;
        P.ellipse(cx, bb, r * 0.7, e * 0.7, 0, P.m(CN.BATT, 0.7));
        P.rrect(cx - r * 0.7, ba, r * 1.4, bb - ba, 0, P.lin(cx - r * 0.7, 0, cx + r * 0.7, 0, [[0, 0.22], [0.5, 0.3], [1, 0.62]], CN.BATT));
        P.ellipse(cx, ba, r * 0.7, e * 0.7, 0, P.m(CN.BATT, 0.14));
        for (const a of [0.75, 2.4]) {
          const aa = a + th, c = Math.cos(aa);
          if (c < -0.2) continue;
          const x = cx + r * 0.8 * Math.sin(aa), dy = e * 0.8 * c;
          P.seg(x, CAN.boards[0] + dy, x, ba + dy, d * 1.1, P.m(CN.LID, 0.34));
        }
        for (let j = CAN.boards.length - 1; j >= 0; j--) {
          const yb0 = CAN.boards[j], R = r * 0.74, E = e * 0.74;
          P.ellipse(cx, yb0 + d * 1.5, R, E, 0, P.m(CN.EDGE, 0.96));
          P.ellipse(cx, yb0, R, E, 0, P.lin(cx - R, yb0, cx + R, yb0, [[0, 0.16], [1, 0.34]], CN.PCB));
          // chips: an MCU, a radio, a sensor, a connector — they turn with the can
          for (let k = 0; k < 4; k++) {
            const a = k * 1.6 + j * 1.1 + th, rr = R * (0.28 + 0.4 * hash2(k + j * 4, 7));
            const x = cx + rr * Math.sin(a), y = yb0 + E * (rr / R) * Math.cos(a);
            const s = 0.05 + 0.035 * hash2(k, j);
            P.rrect(x - s / 2, y - s * 0.18 - d * 0.7, s, s * 0.36 + d * 0.7, 0.006, P.m(CN.CHIP, 0.95));
          }
        }
        g.restore();
        // the cut faces of the shell: light rims along the window
        g.save(); P.path(win); g.lineWidth = d * 1.3; g.strokeStyle = P.m(CN.LID, 0.14); g.stroke(); g.restore();
      }
      // lid: screws on a bolt circle and the antenna, turning with the can
      for (const a of [0.5, 2.0, 3.6, 5.1]) P.circle(cx + Math.cos(a + th) * r * 0.72, top + Math.sin(a + th) * e * 0.72, 0.016, P.ink(0.85));
      const aa = th, ax = cx + Math.cos(aa) * r * CAN.antR, ay = top + 0.008 + Math.sin(aa) * e * CAN.antR;
      P.ellipse(ax, ay, 0.036, 0.013, 0, P.m(CN.ANT, 0.95));
      P.seg(ax, ay - 0.008, ax, ay - 0.43, d * 1.15, P.m(CN.ANT, 0.95));
      P.circle(ax, ay - 0.43, 0.026, P.acc(1));
    },
  };

  // 10 — HiFish IoT: a pond with a sensor buoy -------------------------------
  // The big fish swims toward the cursor (it turns, its tail beats faster
  // when it hurries). Click drops a feed pellet: rings spread on the surface,
  // the pellet sinks, the fish goes for it and eats it. The sensor buoy bobs
  // and rocks as the rings reach it.
  const FSH = { wl: -0.06, buoy: [0.36, -0.24], rip: 0.22, sv: -0.14, box: [-0.78, 0.15, 0.8, 0.5] };
  const FS = { FISH: 4, FISH2: 5, WATER: 6, RIPPLE: 7, BUOY: 8, METAL: 9, PELLET: 10, LINE: 11, BUBBLE: 12 };
  function fishShape(g, P, L, tones, mat, wag) {
    // local frame: nose at x = 0, tail at x = 1, facing -x; caller transforms
    g.save(); g.scale(L, L);
    P.poly([[0.34, -0.2], [0.5, -0.36], [0.62, -0.17]], P.m(mat, tones[0] * 0.95));
    P.poly([[0.54, 0.15], [0.63, 0.27], [0.69, 0.11]], P.m(mat, tones[1]));
    g.save(); g.translate(0.8, 0); g.rotate(wag); g.translate(-0.8, 0);
    g.beginPath();
    g.moveTo(0.8, -0.04); g.quadraticCurveTo(0.9, -0.12, 1.0, -0.25);
    g.quadraticCurveTo(0.93, -0.04, 0.95, 0); g.quadraticCurveTo(0.93, 0.04, 1.0, 0.25);
    g.quadraticCurveTo(0.9, 0.12, 0.8, 0.04); g.closePath();
    g.fillStyle = P.lin(0.8, 0, 1.0, 0, [[0, tones[0]], [1, tones[1] * 0.9]], mat); g.fill();
    g.restore();
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(0.04, -0.16, 0.28, -0.24, 0.48, -0.21);
    g.bezierCurveTo(0.66, -0.18, 0.76, -0.08, 0.83, -0.045);
    g.lineTo(0.83, 0.045);
    g.bezierCurveTo(0.72, 0.12, 0.5, 0.2, 0.3, 0.18);
    g.bezierCurveTo(0.12, 0.16, 0.02, 0.09, 0, 0);
    g.closePath();
    g.fillStyle = P.lin(0, -0.22, 0, 0.2, [[0, tones[0]], [0.5, (tones[0] + tones[1]) / 2], [1, tones[1]]], mat); g.fill();
    const lw = P.dot / L;
    g.beginPath(); g.arc(0.06, 0.0, 0.16, -0.75, 0.75); g.lineWidth = lw * 0.9; g.strokeStyle = P.m(mat, tones[1] * 0.35); g.stroke();
    P.poly([[0.24, 0.04], [0.38, 0.13], [0.33, 0.01]], P.m(mat, tones[1] * 0.5));
    P.circle(0.1, -0.045, 0.038, P.ink(0));
    P.circle(0.095, -0.045, 0.018, P.ink(1));
    g.restore();
  }
  M.fish = {
    label: 'HiFish pond — the fish follows your cursor; click to drop feed',
    cursor: 'Feed',
    drag: 'x',
    rest: [-0.62, 0.3],
    ghostEvery: 4.8, ghostFirst: 1.2,
    mats: [
      ['ink', '#2A2E33'], ['accent', 'accent'], ['muted', '#9DA6AE'], ['ink', '#A8A39A'],
      ['ink', ['#F6AE6E', '#E2742E', '#A94A19']], ['ink', ['#B4C5D2', '#7E95A8', '#4F677B']], ['muted', ['#B2D6E8', '#78AFCD', '#4683AA']],
      ['muted', ['#86BEDB', '#4B93BD']], ['accent', ['#F7DA6C', '#E6AE2E', '#B5821B']], ['ink', ['#BDC3C8', '#7F888F', '#4A5258']],
      ['ink', '#7A5230'], ['ink', '#2F4D63'], ['muted', '#8CC3DE'],
    ],
    paint(g, P) {
      const { wl } = FSH, d = P.dot;
      const wv = [];
      for (let u = -1.0; u <= 1.0001; u += 0.01) wv.push([u, wl + 0.016 * Math.sin(u * 26)]);
      P.stroke(wv, d * 1.2, P.lin(-1.0, 0, 1.0, 0, [[0, 0], [0.1, 0.72], [0.9, 0.72], [1, 0]], FS.LINE));
    },
    prep(F, name, mode) {
      const { n, U, V, D, C, dot } = F;
      const col = mode === 'color';
      const idx = [], aux = [];
      for (let i = 0; i < n; i++) {
        const u = U[i], v = V[i];
        if (v > FSH.wl + dot * 1.2) {
          // water body: tint deepening with depth (fuller in colour)
          const fu = 1 - smoothstep(0.5, 0.98, Math.abs(u));
          const tint = col ? (0.1 + 0.3 * smoothstep(FSH.wl, 0.62, v)) * (1 - smoothstep(0.42, 0.68, v)) * fu
            : 0.15 * smoothstep(FSH.wl + 0.02, FSH.wl + 0.16, v) * (1 - smoothstep(0.2, 0.66, v)) * fu;
          if (tint > 0.02 && D[i] < tint) { D[i] = tint; C[i] = FS.WATER; }
          continue;
        }
        if (v > FSH.wl - dot * 1.4 || v < -0.62 || Math.abs(u) > 1.02) continue;
        const fade = (1 - smoothstep(0.78, 1.02, Math.abs(u))) * (1 - smoothstep(FSH.wl - dot * 3.2, FSH.wl - dot * 1.4, v)) * smoothstep(-0.62, -0.45, v);
        if (fade > 0.01) { idx.push(i); aux.push(fade); }
        // the pond's surface, seen at a grazing angle: a faint band that thins toward the far bank
        const sf = smoothstep(-0.44, FSH.wl - dot, v) * (1 - smoothstep(0.55, 1.0, Math.abs(u) + 0.25 * smoothstep(FSH.wl, -0.44, v)));
        const tint = (col ? 0.13 : 0.06) * sf;
        if (tint > 0.015 && D[i] < tint) { D[i] = tint; C[i] = col ? FS.WATER : MUT; }
      }
      return { idx: Int32Array.from(idx), fade: Float32Array.from(aux) };
    },
    init(I) {
      I.f = { x: -0.62, y: 0.3, vx: 0, vy: 0, face: spr(-1), ph: 0, pitch: 0 };
      I.f2 = { x: 0.72, y: 0.46, face: spr(1), ph: 0 };
      I.food = []; I.rips = []; I.bub = []; I.bob = spr(0); I.fk = 0;
    },
    ghost(I, tau) { return [0.55 * Math.sin(tau * 0.31 + 2.2), 0.28 + 0.14 * Math.sin(tau * 0.53)]; },
    ghostClick(I, tau, k) { return [mix(-0.6, 0.6, hash2(k * 7 + 2, 5)), FSH.wl - 0.1]; },
    click(I, u, v) {
      u = clamp(u, -0.8, 0.8);
      const depth = v > FSH.wl + 0.05 ? clamp(v, 0.16, 0.46) : 0.22 + 0.18 * hash2(I.fk * 3 + 1, 9);
      I.food.push({ u, v: FSH.wl, tv: depth, t0: I.now, k: I.fk++ });
      I.rips.push({ u, t0: I.now });
      if (I.food.length > 3) I.food.shift();
      if (I.rips.length > 4) I.rips.shift();
    },
    step(I, dt) {
      const f = I.f, [x0, y0, x1, y1] = FSH.box;
      // target: the nearest pellet, else the cursor (clamped to the water)
      let tx = clamp(I.tu, x0, x1), ty = clamp(I.tv, y0 + 0.04, y1 - 0.04), hungry = false;
      let best = 1e9;
      for (const p of I.food) { const d = Math.hypot(p.u - f.x, p.v - f.y); if (d < best && p.v > FSH.wl + 0.03) { best = d; tx = p.u; ty = p.v; hungry = true; } }
      // the nose leads: aim the mouth (at f.x, f.y) at the target
      const dx = tx - f.x, dy = ty - f.y, dist = Math.hypot(dx, dy);
      const vmax = hungry ? 0.75 : 0.42;
      const want = dist > 0.03 ? Math.min(vmax, dist * 2.2) : 0;
      const ax = (dist > 1e-4 ? dx / dist * want : 0) - f.vx, ay = (dist > 1e-4 ? dy / dist * want : 0) - f.vy;
      const ka = 1 - Math.exp(-dt * 3);
      f.vx += ax * ka; f.vy += ay * ka;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.x = clamp(f.x, x0, x1); f.y = clamp(f.y, y0, y1);
      const sp = Math.hypot(f.vx, f.vy);
      if (Math.abs(f.vx) > 0.04) f.dir = f.vx > 0 ? 1 : -1;
      spring(f.face, f.dir || -1, dt, 7, 0.9);
      f.ph += dt * (4 + 16 * sp);
      f.pitch += (clamp(Math.atan2(f.vy, Math.abs(f.vx) + 0.12) * 0.5, -0.28, 0.28) - f.pitch) * (1 - Math.exp(-dt * 4));
      // eat
      I.food = I.food.filter((p) => {
        const mx = f.x + f.face.x * 0.26;
        if (Math.hypot(p.u - mx, p.v - f.y) < 0.1 && p.v > FSH.wl + 0.06) {
          for (let k = 0; k < 3; k++) I.bub.push({ u: mx + (k - 1) * 0.02, v: f.y - 0.04, t0: I.now + k * 0.12 });
          return false;
        }
        return I.now - p.t0 < 14;
      });
      for (const p of I.food) {
        const e = I.now - p.t0;
        p.v = mix(FSH.wl, p.tv, 1 - Math.exp(-e * 1.7));
        p.uu = p.u + 0.012 * Math.sin(e * 2.3 + p.k);
      }
      // the small fish wanders on its own
      const f2 = I.f2, tt = I.now * 0.22;
      const nx = 0.62 + 0.2 * Math.sin(tt * 1.3), ny = 0.44 + 0.04 * Math.sin(tt * 2.1);
      const ovx = (nx - f2.x);
      f2.x += (nx - f2.x) * (1 - Math.exp(-dt * 1.5)); f2.y += (ny - f2.y) * (1 - Math.exp(-dt * 1.5));
      if (Math.abs(ovx) > 0.002) f2.dir = ovx > 0 ? 1 : -1;
      spring(f2.face, f2.dir || 1, dt, 6, 0.9);
      f2.ph += dt * 6;
      I.rips = I.rips.filter((r) => I.now - r.t0 < 4);
      I.bub = I.bub.filter((b) => I.now - b.t0 < 1.6);
      // buoy: a gentle swell, kicked by passing rings
      let kick = 0;
      for (const r of I.rips) { const e = I.now - r.t0, R = 0.05 + e * 0.32, dd = Math.abs(FSH.buoy[0] - r.u); kick += 0.03 * Math.exp(-Math.pow((R - dd) / 0.06, 2)) * (1 - e / 4); }
      const bobbing = spring(I.bob, kick, dt, 8, 0.25);
      // settle (and let the frame loop stop) under reduced motion / pause once nothing moves
      return !I.reduced || bobbing || Math.hypot(f.vx, f.vy) > 0.004 || Math.abs(f.face.v) > 1e-3 || I.food.length > 0 || I.rips.length > 0 || I.bub.length > 0;
    },
    dsig: null,
    dyn(g, P, I, S, t) {
      const d = P.dot;
      const red = I.reduced;
      // the small fish, then the big one
      const drawFish = (f, L, tones, mat, swing) => {
        const wag = red ? 0 : Math.sin(f.ph) * swing;
        g.save();
        g.translate(f.x, f.y);
        g.rotate((f.pitch || 0) * f.face.x);
        g.scale(-(f.face.x < 0 ? -1 : 1) * Math.max(0.28, Math.abs(f.face.x)), 1);
        g.translate(-0.45 * L, 0);
        fishShape(g, P, L, tones, mat, wag);
        g.restore();
      };
      drawFish(I.f2, 0.34, [0.66, 0.24], FS.FISH2, 0.3);
      drawFish(I.f, 0.62, [0.95, 0.32], FS.FISH, 0.22 + 0.25 * clamp(Math.hypot(I.f.vx, I.f.vy) * 2));
      // pellets + bubbles
      for (const p of I.food) P.circle(p.uu ?? p.u, p.v, d * 0.75, P.m(FS.PELLET, 0.95));
      for (const b of I.bub) {
        const e = I.now - b.t0;
        if (e < 0) continue;
        const v = b.v - e * 0.16, a = 1 - e / 1.6;
        if (v < FSH.wl + 0.02) continue;
        P.ring(b.u + 0.01 * Math.sin(e * 9), v, d * 0.8, d * 0.8, 0, d * 0.5, P.m(FS.BUBBLE, 0.8 * a));
      }
      // sensor buoy: probe on its cable, mast + antenna, the float (accent)
      const bob = (red ? 0 : 0.012 * Math.sin(t * 1.7)) + I.bob.x, tilt = (red ? 0 : 0.05 * Math.sin(t * 1.3 + 0.4)) + I.bob.x * 3;
      const bx = FSH.buoy[0], by = FSH.buoy[1] + bob;
      const sway = red ? 0 : 0.015 * Math.sin(t * 0.9);
      P.seg(bx, by + 0.05, bx + sway, 0.36, d * 1.1, P.m(FS.METAL, 0.7));
      P.rrect(bx + sway - 0.026, 0.35, 0.052, 0.13, 0.024, P.cyl(bx + sway - 0.026, bx + sway + 0.026, FS.METAL, 0.4));
      P.rrect(bx + sway - 0.026, 0.39, 0.052, 0.017, 0.006, P.m(FS.METAL, 0.12));
      g.save(); g.translate(bx, by); g.rotate(tilt);
      P.seg(0, -0.03, 0, -0.4, d * 1.15, P.ink(0.95));
      P.seg(-0.045, -0.29, 0.045, -0.29, d * 1.1, P.ink(0.8));
      P.circle(0, -0.405, 0.02, P.ink(1));
      P.ellipse(0, 0, 0.1, 0.068, 0, P.rad(-0.035, -0.035, 0, 0.12, [[0, 0.45], [1, 1]], FS.BUOY));
      g.restore();
    },
    anim(t, A, S, I) {
      const dot = A.dot, q = FSH.rip, [bx, by] = FSH.buoy;
      const rings = [];
      // ambient rings round the buoy, plus the rings of every pellet drop
      if (!I.reduced) for (let j = 0; j < 3; j++) { const ph = wrap01(t / 7.5 + j / 3); rings.push([bx, by, 0.12 + ph * 0.86, Math.sin(PI * ph), 1]); }
      for (const r of I.rips) { const e = I.now - r.t0; for (let j = 0; j < 3; j++) { const ee = e - j * 0.28; if (ee <= 0) continue; rings.push([r.u, FSH.sv, 0.03 + ee * 0.32, Math.pow(1 - ee / 4, 1.5) * smoothstep(0, 0.15, ee), 1.4]); } }
      const col = I.mode === 'color';
      for (let k = 0; k < S.idx.length; k++) {
        const i = S.idx[k], u = A.U[i], v = A.V[i];
        let s = 0;
        for (const [cu, cv, R, amp, w] of rings) {
          const du = u - cu, dv = (v - cv) / q, r = Math.hypot(du, dv);
          if (r < 0.03 || r > 1.0) continue;
          const gm = Math.hypot(du, dv / q) / r;
          const dd = Math.abs(r - R) / gm / dot;
          const val = smoothstep(1.5 * w, 0.25, dd) * amp * (1 - smoothstep(0.62, 0.98, r));
          if (val > s) s = val;
        }
        s *= S.fade[k] * Math.sqrt(col ? 0.6 : T.ctx);
        if (s > 0.05) A.lift(i, s * s, FS.RIPPLE);
      }
    },
  };

  // 11 — Ground station: a tracking dish -------------------------------------
  // The dish slews to follow the cursor: azimuth turns its boresight, and the
  // nearer the cursor, the more it tips toward you (the rim opens up). Click
  // transmits: a burst of wavefronts leaves the feed along the boresight and
  // the TX lamp on the pedestal blinks. In colour it stands on grass under a
  // pale sky.
  const DISH = { c: [-0.2, -0.07], Ra: 0.58, fd: 0.46, base: [0.02, 0.6], rest: [-0.64, 0.465] };
  const DS = { DISH: 4, MOUNT: 5, SKY: 6, GRASS: 7, WAVE: 8, LED: 9 };
  M.dish = {
    label: 'Ground-station dish — it tracks your cursor; click to transmit',
    cursor: 'Transmit',
    drag: 'x',
    rest: [0.6, -0.65],
    ghostEvery: 4.6, ghostFirst: 1.4,
    mats: [
      ['ink', '#2B2F34'], ['accent', 'accent'], ['muted', '#9EA7AF'], ['ink', '#A6A9A6'],
      ['ink', ['#E6E9EC', '#B2BAC2', '#717D89']], ['ink', ['#C5CACF', '#89929C', '#4C555E']], ['muted', ['#C6DFF0', '#A3C8E5']],
      ['muted', ['#B2CF96', '#80A867']], ['muted', ['#86B6DB', '#4F8DC0']], ['ink', '#3FC777'],
    ],
    paint(g, P) {
      const [px, base] = DISH.base;
      if (P.color) {
        // a pale sky field behind everything (soft edges, cut at the horizon), grass at the foot
        g.save();
        g.beginPath(); g.rect(-3, -3, 6, base - 0.02 + 3); g.clip();
        P.ellipse(-0.1, -0.12, 1.25, 0.95, 0, P.rad(-0.1, -0.12, 0, 1.25, [[0, 0.3], [0.6, 0.24], [1, 0]], DS.SKY));
        g.restore();
        P.ellipse(px + 0.05, base + 0.02, 0.62, 0.075, 0, P.rad(px + 0.05, base + 0.02, 0, 0.62, [[0, 0.5], [0.7, 0.36], [1, 0]], DS.GRASS));
      }
      P.cast(px, base + 0.01, 0.95, 0.075, T.shadow);
      P.ellipse(px, base, 0.3, 0.066, 0, P.m(DS.MOUNT, 0.9));
      P.ellipse(px, base - 0.032, 0.3, 0.066, 0, P.lin(px - 0.3, 0, px + 0.3, 0, [[0, 0.14], [1, 0.42]], DS.MOUNT));
      P.rrect(px - 0.07, 0.12, 0.14, base - 0.15, 0.02, P.cyl(px - 0.07, px + 0.07, DS.MOUNT));
      P.rrect(px - 0.03, 0.3, 0.06, 0.05, 0.01, P.m(DS.MOUNT, 0.95));
    },
    prep(F) {
      // candidate dots for the wavefronts (everything above the pedestal top)
      const { n, U, V } = F, idx = [];
      for (let i = 0; i < n; i++) if (V[i] > -0.74 && V[i] < 0.3 && Math.abs(U[i]) < 1.1) idx.push(i);
      return { idx: Int32Array.from(idx) };
    },
    init(I) { I.az = spr(DISH.rest[0]); I.ra = spr(DISH.rest[1]); I.tx = []; },
    ghost(I, tau) { return [0.55 * Math.cos(tau * 0.33) + 0.05, -0.55 + 0.18 * Math.sin(tau * 0.47)]; },
    click(I) { I.tx.push(I.now); if (I.tx.length > 3) I.tx.shift(); },
    axis(I) {
      const ps = I.az.x, ra = clamp(I.ra.x, 0.22, 0.75), k = Math.sqrt(1 - ra * ra) / 0.885;
      return { ps, ra, ax: Math.cos(ps), ay: Math.sin(ps), k };
    },
    step(I, dt) {
      const [cx, cy] = DISH.c;
      const dx = I.tu - cx, dy = Math.min(I.tv - cy, -0.05), dist = Math.hypot(dx, dy);
      let tgt = Math.atan2(dy, dx);
      tgt = clamp(tgt, -PI + 0.25, -0.15);
      const tr = clamp(0.62 - 0.32 * smoothstep(0.25, 1.2, dist), 0.3, 0.62);
      let b = spring(I.az, I.az.x + angWrap(tgt - I.az.x), dt, 4.2, 0.8);
      b = spring(I.ra, tr, dt, 4.2, 0.8) || b;
      I.tx = I.tx.filter((t0) => I.now - t0 < 1.6);
      return b || I.tx.length > 0;
    },
    dsig(I) { return [I.az.x, I.ra.x, I.tx.length ? I.now : 0]; },
    dyn(g, P, I) {
      const [cx, cy] = DISH.c, Ra = DISH.Ra, { ps, ra, ax, ay, k } = this.axis(I), Rb = Ra * ra;
      const rot = ps + PI / 2, [px] = DISH.base, d = P.dot;
      // yoke arm from the pedestal head to the back of the dish
      const bk = [cx - ax * 0.13 * k, cy - ay * 0.13 * k];
      P.seg(px, 0.14, bk[0] + 0.02, bk[1] + 0.06, 0.072, P.m(DS.MOUNT, 0.88));
      P.circle(px, 0.12, 0.056, P.m(DS.MOUNT, 0.95));
      P.circle(px - 0.013, 0.108, 0.02, P.m(DS.MOUNT, 0.3));
      // dish back, face (lit from the upper left), rim
      P.ellipse(cx - ax * 0.085 * k, cy - ay * 0.085 * k, Ra, Rb * 1.08 + 0.01, rot, P.m(DS.DISH, 0.92));
      const face = P.rad(cx + 0.12, cy + 0.06, 0.02, Ra * 1.15, [[0, 0.06], [0.55, 0.3], [1, 0.8]], DS.DISH, cx + 0.05, cy + 0.02);
      P.ellipse(cx, cy, Ra, Rb, rot, face);
      P.ring(cx + ax * 0.02 * k, cy + ay * 0.02 * k, Ra * 0.66, Rb * 0.66, rot, d * 0.8, P.m(DS.DISH, 0.36));
      P.ring(cx + ax * 0.035 * k, cy + ay * 0.035 * k, Ra * 0.33, Rb * 0.33, rot, d * 0.8, P.m(DS.DISH, 0.36));
      P.ring(cx, cy, Ra, Rb, rot, d * 1.2, P.ink(0.95));
      const fdk = DISH.fd * k, Fp = [cx + ax * fdk, cy + ay * fdk];
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const a of [PI / 2 + 0.3, PI * 1.5 - 0.3, PI * 0.03]) {
        const ex = Ra * Math.cos(a), ey = Rb * Math.sin(a);
        P.seg(cx + ex * c - ey * s, cy + ex * s + ey * c, Fp[0] - ax * 0.04, Fp[1] - ay * 0.04, d * 1.0, P.ink(0.85));
      }
      // feed horn (accent): flared cone toward the dish + LNB body
      const nn = [-ay, ax];
      const h0 = [Fp[0] - ax * 0.07, Fp[1] - ay * 0.07], h1 = [Fp[0] + ax * 0.03, Fp[1] + ay * 0.03];
      P.poly([[h0[0] + nn[0] * 0.064, h0[1] + nn[1] * 0.064], [h1[0] + nn[0] * 0.03, h1[1] + nn[1] * 0.03], [h1[0] - nn[0] * 0.03, h1[1] - nn[1] * 0.03], [h0[0] - nn[0] * 0.064, h0[1] - nn[1] * 0.064]],
        P.lin(h0[0] + nn[0] * 0.06, h0[1] + nn[1] * 0.06, h0[0] - nn[0] * 0.06, h0[1] - nn[1] * 0.06, [[0, 0.5], [1, 1]], ACC));
      const h2 = [Fp[0] + ax * 0.1, Fp[1] + ay * 0.1];
      P.seg(h1[0], h1[1], h2[0], h2[1], 0.05, P.acc(0.95));
      // TX lamp on the pedestal
      const on = I.tx.length && I.now - I.tx[I.tx.length - 1] < 0.6 && Math.sin((I.now - I.tx[I.tx.length - 1]) * 30) > -0.5;
      P.circle(px, 0.24, 0.018, on ? P.m(ACC, 1) : P.m(DS.LED, P.color ? 0.5 : 0.3));
    },
    anim(t, A, S, I) {
      const [cx, cy] = DISH.c, { ax, ay, k } = this.axis(I), wq = A.dot, col = I.mode === 'color';
      const fp = [cx + ax * DISH.fd * k, cy + ay * DISH.fd * k];
      const tx = I.tx.map((t0) => I.now - t0);
      for (let q = 0; q < S.idx.length; q++) {
        const i = S.idx[q], du = A.U[i] - fp[0], dv = A.V[i] - fp[1];
        const r = Math.hypot(du, dv);
        if (r < 0.15 || r > 1.4) continue;
        const cs = (du * ax + dv * ay) / r;
        if (cs < 0.8) continue;
        // ambient: slow receive wavefronts, short range
        let s = 0;
        if (!I.reduced && r < 0.5) {
          const fade = smoothstep(0.84, 0.95, cs) * (1 - smoothstep(0.38, 0.5, r));
          for (let j = 0; j < 3; j++) {
            const ph = wrap01(t / 4.5 + j / 3);
            const v = smoothstep(wq * 1.5, wq * 0.25, Math.abs(r - (0.16 + ph * 0.34))) * Math.sin(PI * ph) * fade;
            if (v > s) s = v;
          }
          s *= Math.sqrt(T.ctx);
          if (s > 0.05) A.lift(i, s * s, col ? DS.WAVE : MUT);
        }
        // transmit: a burst of three fronts racing out along the boresight
        for (const e of tx) {
          for (let j = 0; j < 3; j++) {
            const R = 0.16 + (e - j * 0.09) * 1.25;
            if (R < 0.16) continue;
            const fade = smoothstep(0.86, 0.96, cs) * (1 - smoothstep(0.9, 1.35, R)) * (1 - e / 1.6);
            const v = smoothstep(wq * 1.7, wq * 0.3, Math.abs(r - R)) * fade * (j === 0 ? 1 : 0.7);
            if (v > 0.06) A.over(i, v * v, j === 0 ? ACC : (col ? DS.WAVE : INK));
          }
        }
      }
    },
  };

  // 12 — Moxon–Yagi on its mast, and the pattern it makes -----------------
  // Seen from above at an angle, the antenna as it was built: on one PVC boom,
  // TWO complete Moxon rectangles one behind the other — the rear one is the
  // REFLECTOR, the front one the DRIVEN element (fed at the middle of its
  // front bar) — each a pair of facing U's whose bent tips stop short of each
  // other, leaving the Moxon's two small gaps; then FIVE straight dipole
  // directors ahead, each a little shorter than the one before (the Yagi
  // taper). Every element is taped to the boom, which sits on the mast at its
  // balance point. Round the mast an azimuth dial; in the antenna's horizontal
  // plane, its radiation pattern: a long, narrow main lobe (≈ 11 dBi) from the
  // feed out past the directors, two small side lobes and a small back lobe
  // behind the reflector. The far end of the 4 km link is a CanSat coming down
  // under its parachute, tied by a drop line to its ground track on the rim (the
  // bearing to find); its meter shows the link it gets (three bars, the third only
  // when the beam is right on it). Each Moxon
  // rectangle carries a faint tint, so its two U's read as one box at any size
  // and angle. Drag turns the antenna and its pattern (azimuth, with inertia;
  // left end-on it eases onto the nearest readable view); click sends a pulse
  // out along the main lobe; inside the half-power beam it reaches the CanSat's
  // ground track, climbs the drop line and rings round the CanSat. The ghost aims,
  // hits, swings off and misses, then re-aims and hits.
  const MOX = {
    // rest: nearly side-on, the beam a little up and to the right toward the station,
    // so the boom lies along the dot rows, both Moxon rectangles show square-on and
    // the directors stand as a ladder of rungs
    c: [-0.03, 0.03], sE: 0.74, R: 0.98, rest: -0.06, st: -0.36, mast: 0.58,
    ML: PI / 3.6, // main-lobe half-width to its nulls (50°)
    Rp: 1.1, // pattern scale: 0 dB, measured from the feed (the peak stays inside the rim)
    // the link it makes: a pulse pings the station only inside the half-power beam
    // (gain > 0.55, ±23°); the bars fill one by one, the third only within ≈ ±12°
    ping: 0.55, bars: [[0.28, 0.4], [0.55, 0.67], [0.84, 0.9]],
    // a pulse's front runs out from the feed at v (art units / s) and carries on past
    // the lobe's tip to the station's range (reach), where it climbs the drop line to
    // the CanSat (climb, s) and rings round it; life: how long a pulse is kept
    v: 1.1, reach: 1.25, climb: 0.22, life: 2.3,
    // views where both rectangles read (within 58° of side-on); a slow antenna left
    // end-on settles into the nearest one, like a rotator easing onto a detent
    view: 1.01,
    BK: 0.14, // back lobe (F/B ≈ 26 dB on a 30 dB plot), measured from the reflector
    // pattern radius vs angle off boresight, as on a dB polar plot (30 dB range):
    // the narrow main lobe (HPBW ≈ 48°), first side lobes (≈ -24 dB) and the back lobe
    gain(th) {
      const a = Math.abs(th);
      const main = a < MOX.ML ? Math.pow(Math.cos(th * 1.8), 2) : 0;
      const side = a > 0.98 && a < 1.7 ? 0.22 * Math.pow(Math.sin((a - 0.98) / 0.72 * PI), 2) : 0;
      const back = a > PI - 0.6 ? MOX.BK * Math.pow(Math.cos((PI - a) / 0.6 * PI / 2), 2) : 0;
      return Math.max(main, side, back);
    },
  };
  // the antenna in its own frame: boresight +x, lateral +y, art units, origin at the
  // mast clamp. Built in wavelengths (915 MHz, λ ≈ 328 mm: each Moxon 0.37 λ wide,
  // the two rectangles 0.15 λ apart, directors 0.425 → 0.385 λ spaced 0.15 → 0.17 λ,
  // boom ≈ 1.4 λ) then scaled by s. The rectangles are drawn deeper (0.2 λ, not
  // 0.14 λ) and their tip gaps wider than life, so each reads as a rectangle with
  // its two gaps through the dot screen; and the space between the two boxes is
  // drawn wider than their depth (0.21 λ), so on a coarse screen the four bars
  // still pair up as two boxes rather than four evenly spaced brackets.
  const ANT = (() => {
    const s = 1.0, piv = 0.815, X = (l) => (l - piv) * s;
    // Moxon: width A, reflector tails D, tip gap C, driven tails Bt, depth E. The
    // tails stay > 2 dots long even on the phone screen, so the short ones of the
    // driven element survive a slightly turned antenna
    const A = 0.37 * s / 2, D = 0.08, C = 0.055, Bt = 0.077, E = D + C + Bt, G = 0.21, fg = 0.016;
    const xR = 0, xD = E + G, xF = xD + E; // back bars of the two rectangles; the feed
    const dx = [], dl = [0.425, 0.415, 0.405, 0.395, 0.385];
    let x = xF;
    for (const sp of [0.15, 0.155, 0.16, 0.165, 0.17]) { x += sp; dx.push(x); }
    // one complete Moxon rectangle at x0: its rear U (back bar, tails bent forward)
    // and its front U (front bar, tails bent back), the two gaps between the tips;
    // on the driven rectangle the front bar is split at the feed
    const moxon = (x0, k, fed) => {
      const r = { k, pts: [[X(x0 + D), -A], [X(x0), -A], [X(x0), A], [X(x0 + D), A]] };
      const f0 = X(x0 + E - Bt), f1 = X(x0 + E);
      return fed
        ? [r, { k, pts: [[f0, -A], [f1, -A], [f1, -fg]] }, { k, pts: [[f0, A], [f1, A], [f1, fg]] }]
        : [r, { k, pts: [[f0, -A], [f1, -A], [f1, A], [f0, A]] }];
    };
    const els = [...moxon(xR, 'REF', false), ...moxon(xD, 'DRV', true)];
    dx.forEach((l, j) => { const h = dl[j] * s / 2; els.push({ k: 'DIR', pts: [[X(l), -h], [X(l), h]] }); });
    return {
      els, half: dl[0] * s / 2, back: X(xR), feed: X(xF), tip: X(dx[4]), A,
      // the two rectangles (antenna frame): rear and front bar, for their tint
      boxes: [[X(xR), X(xR + E)], [X(xD), X(xD + E)]],
      // where each element is taped to the boom (the fed bar sits on its feed block)
      tape: [X(xR), X(xR + E), X(xD), ...dx.map(X)],
      boom: [X(-0.035), X(dx[4] + 0.035)],
    };
  })();
  // material ids. The moving parts are painted into an anti-aliased plate, where an
  // edge over another part blends the two ids. So the ids run in paint order: the pale
  // lobes, the main lobe (whose id the paper halos under the hardware also carry), then
  // the hardware side by side — every edge can only read as a neighbouring grey part,
  // never as copper on the reflector, the accent pulse or the green link bars (those
  // two are painted per dot, never blended)
  // two never blended either: the faint tints inside the two rectangles (per dot)
  const MX = { LOBE2: 4, LOBE: 5, ELEM: 6, TAPE: 7, BOOM: 8, MAST: 9, DRIVEN: 10, GRID: 11, PULSE: 12, BAR: 13, RBOX: 14, DBOX: 15, CANOPY: 16, PANEL: 17, CANS: 18 };
  // plane (x, y) -> screen, for an antenna turned by th (the antenna frame, origin at the mast)
  const moxProj = (th) => {
    const c = Math.cos(th), s = Math.sin(th), [cx, cy] = MOX.c, sE = MOX.sE;
    return (x, y) => [cx + x * c - y * s, cy + (x * s + y * c) * sE];
  };
  const moxStation = () => [MOX.c[0] + MOX.R * Math.cos(MOX.st), MOX.c[1] + MOX.R * Math.sin(MOX.st) * MOX.sE];
  // the CanSat over its ground track: can half-size, its height above the rim, the
  // suspension lines, the canopy's half-width and dome height (art units)
  const MCS = { up: 0.22, cw: 0.03, ch: 0.04, lines: 0.12, rx: 0.17, ry: 0.13 };
  const moxCanSat = () => { const [sx, sy] = moxStation(); return [sx, sy - MCS.up]; };
  // the station in the plane, relative to the mast
  const MOXS = [MOX.R * Math.cos(MOX.st), MOX.R * Math.sin(MOX.st)];
  // the ghost operator, a 3-pulse cycle locked to the ghost clicks (every 4.6 s from
  // phase 0): on the station -> hit; swing the beam 46° off -> the bars drop, the next
  // pulse misses; hunt back past the station and settle -> hit again. (phase, offset
  // from the station bearing), eased between keys
  const MOXG = [[0, 0], [1.3, 0], [3.4, 0.8], [5.7, 0.8], [7.3, -0.16], [8.5, 0], [10.6, 0], [12.2, 0.09], [13.8, 0]];
  const moxGhost = (ph) => {
    if (ph < 0) return MOX.st;
    ph %= MOXG[MOXG.length - 1][0];
    let k = 0;
    while (k < MOXG.length - 2 && ph > MOXG[k + 1][0]) k++;
    const [p0, a0] = MOXG[k], [p1, a1] = MOXG[k + 1];
    return MOX.st + mix(a0, a1, easeInOut((ph - p0) / (p1 - p0)));
  };
  // bearing and range from the feed (which turns with the antenna) to the station
  const moxToStation = (th) => {
    const fx = ANT.feed * Math.cos(th), fy = ANT.feed * Math.sin(th);
    const dx = MOXS[0] - fx, dy = MOXS[1] - fy;
    return [Math.atan2(dy, dx), Math.hypot(dx, dy)];
  };
  M.antenna = {
    label: 'Moxon–Yagi antenna: two Moxon rectangles (reflector and driven element) and five directors — drag to turn it and its radiation pattern toward the CanSat, click to send a pulse',
    cursor: 'Drag',
    drag: 'x',
    rest: [0.6, -0.1],
    ghostEvery: 4.6, ghostFirst: 1.5,
    mats: [
      ['ink', '#2A2D31'], ['accent', 'accent'], ['muted', '#A9B0B6'], ['ink', '#A8A39A'],
      ['muted', ['#F5DA8C', '#E9A54A', '#C9772E']], ['muted', ['#F6CF62', '#EE8A38', '#CF4A22']], ['ink', ['#B9C1C9', '#7F8A95', '#46505A']],
      ['ink', '#2B2F34'], ['muted', '#9AA2AA'], ['muted', ['#C4CAD0', '#8C959E', '#535C66']], ['ink', ['#E2A36C', '#B8713A', '#86491F']],
      ['muted', '#B7C0C8'], ['accent', '#2C6FD0'], ['ink', '#3E9E5F'], ['muted', '#BCC4CC'], ['muted', '#E8BE98'],
      ['ink', ['#EE6A4E', '#D23A26', '#97261A']], ['ink', ['#F6D27A', '#E9AE3C', '#B9802A']], ['ink', ['#D5DADF', '#9CA4AD', '#5D656E']],
    ],
    paint(g, P) {
      const [cx, cy] = MOX.c, R = MOX.R, sE = MOX.sE, d = P.dot;
      const G = (a) => P.m(MX.GRID, a);
      const at = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r * sE];
      // the azimuth dial: spokes every 30°, three rings, compass ticks outside the rim
      for (let k = 0; k < 12; k++) { const a = k * PI / 6, p0 = at(a, R * 0.56), p1 = at(a, R); P.seg(p0[0], p0[1], p1[0], p1[1], d * 0.9, G(0.15)); }
      for (const k of [1 / 3, 2 / 3, 1]) P.ring(cx, cy, R * k, R * k * sE, 0, d * 1.15, G(k === 1 ? 0.36 : 0.24));
      for (let k = 0; k < 36; k++) {
        const a = k * PI / 18, maj = k % 9 === 0, p = at(a, R);
        let nx = Math.cos(a) * sE, ny = Math.sin(a); const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
        const r0 = d * 1.7, r1 = d * (maj ? 4.4 : 2.9);
        P.seg(p[0] + nx * r0, p[1] + ny * r0, p[0] + nx * r1, p[1] + ny * r1, d * (maj ? 1.1 : 0.9), maj ? P.ink(0.7) : G(T.ctx));
      }
      // the mast: a tube down from the clamp to its foot, with a soft shadow
      const mb = cy + MOX.mast, mw = 0.03;
      P.cast(cx + 0.01, mb + 0.004, 0.5, 0.05, T.shadow);
      P.ellipse(cx, mb, 0.1, 0.028, 0, P.m(MX.MAST, 0.92));
      P.rrect(cx - mw, cy + 0.03, mw * 2, MOX.mast - 0.03, 0.012, P.cyl(cx - mw, cx + mw, MX.MAST, 0.3));
      P.rrect(cx - mw * 1.5, mb - 0.07, mw * 3, 0.03, 0.01, P.cyl(cx - mw * 1.5, cx + mw * 1.5, MX.MAST, 0.4));
      // the far end of the link: the CanSat coming down under its parachute, tied by a
      // drop line to its ground track on the rim (the bearing the antenna has to find)
      const [sx, sy] = moxStation(), [kx, ky] = moxCanSat(), { cw, ch, rx, ry } = MCS;
      const rim = ky - ch - MCS.lines, top = rim - ry;
      P.ellipse(sx, sy, 0.036, 0.013, 0, P.ink(0.92));
      P.seg(sx, sy - 0.035, kx, ky + ch + 0.03, d * 1.05, G(0.34));
      // suspension lines, from the hem to the top of the can
      for (const f of [-0.94, -0.4, 0.4, 0.94]) P.seg(kx + rx * f, rim - 0.004, kx + cw * 0.6 * Math.sign(f), ky - ch, d * 0.75, P.ink(f * f > 0.5 ? (P.color ? 0.4 : 0.5) : (P.color ? 0.24 : 0.3)));
      // the canopy: a dome with a scalloped hem, lit from the upper left (red / gold gores in colour)
      const dome = [];
      for (let j = 0; j <= 28; j++) { const a = PI + PI * j / 28; dome.push([kx + Math.cos(a) * rx, rim + Math.sin(a) * ry]); }
      for (let j = 1; j < 30; j++) { const q = j / 30; dome.push([kx + rx - 2 * rx * q, rim - 0.034 * Math.abs(Math.sin(q * PI * 3))]); }
      if (P.color) {
        g.save(); P.path(dome); g.clip();
        for (let j = 0; j < 6; j++) {
          const x0 = kx - rx + (2 * rx * j) / 6, x1 = x0 + (2 * rx) / 6, lam = 1 - j / 5;
          // gores fan out from above the apex; the clip gives the dome its silhouette
          const t0 = kx + (x0 - kx) * 0.4, t1 = kx + (x1 - kx) * 0.4;
          P.poly([[t0, top - 0.06], [t1, top - 0.06], [x1 + 0.004, rim + 0.01], [x0 - 0.004, rim + 0.01]], P.lin(kx, top, kx, rim, [[0, mix(0.5, 0.74, 1 - lam)], [1, mix(0.7, 0.95, 1 - lam)]], j % 2 ? MX.PANEL : MX.CANOPY));
        }
        g.restore();
      } else P.poly(dome, P.lin(kx - rx * 0.7, top, kx + rx, rim, [[0, 0.55], [0.55, 0.8], [1, 0.97]], INK));
      // the can, a little cylinder
      P.rrect(kx - cw, ky - ch, cw * 2, ch * 2, 0.008, P.cyl(kx - cw, kx + cw, MX.CANS, 0.4));
    },
    prep(F) {
      // every dot near the dial, in plane coordinates about the mast
      const { n, U, V } = F, [cx, cy] = MOX.c, sE = MOX.sE, idx = [], aux = [];
      for (let i = 0; i < n; i++) {
        // the static plate paints only ink, the dial and the mast (feed, lobe peak and
        // pulses are all drawn live). A faint cell at an edge can decode to a stray id
        // (an ink tick over the grey ring blends through the accent id; a near-white
        // fringe pixel decodes noisily), so anything else is handed back to the dial
        const c = F.C[i];
        if (c !== INK && c !== SHD && c !== MX.GRID && c !== MX.MAST && c < MX.CANOPY) F.C[i] = F.D[i] > 0.5 ? INK : MX.GRID;
        const du = U[i] - cx, dv = (V[i] - cy) / sE;
        if (du * du + dv * dv > 1.25 * 1.25) continue;
        idx.push(i); aux.push(du, dv);
      }
      return { idx: Int32Array.from(idx), aux: Float32Array.from(aux) };
    },
    init(I) { I.th = { x: MOX.rest, v: 0 }; I.pulses = []; I.link = spr(MOX.gain(angWrap(moxToStation(MOX.rest)[0] - MOX.rest))); },
    ghost() { return [0.6, -0.1]; },
    click(I) { I.pulses.push({ t0: I.now, th: I.th.x }); if (I.pulses.length > 3) I.pulses.shift(); },
    key(I, key) {
      if (key === 'ArrowLeft' || key === 'ArrowUp') { I.th.v -= 2.4; return true; }
      if (key === 'ArrowRight' || key === 'ArrowDown') { I.th.v += 2.4; return true; }
      return false;
    },
    dragMove(I, du, dv, pu, pv) {
      // angular drag about the mast, measured in the antenna's plane
      const sE = MOX.sE, rx = pu - MOX.c[0], ry = (pv - MOX.c[1]) / sE, r2 = Math.max(0.03, rx * rx + ry * ry);
      const dth = (rx * dv / sE - ry * du) / r2;
      I.th.x += dth; if (I.dt > 0 && dth) I.th.v = dth / I.dt;
    },
    // fling: angular velocity of the release about the mast, from the engine's smoothed pointer velocity
    release(I, vu, vv, pu, pv) {
      const sE = MOX.sE, rx = pu - MOX.c[0], ry = (pv - MOX.c[1]) / sE, r2 = Math.max(0.03, rx * rx + ry * ry);
      I.th.v = clamp((rx * vv / sE - ry * vu) / r2, -8, 8);
    },
    step(I, dt) {
      let b = false;
      if (!I.dragging) {
        if (I.idle > 0.01) {
          // the ghost aims, misses and re-aims (see MOXG), staying in the views where
          // the elements lie across the dot grid
          const g = moxGhost(I.tau - M.antenna.ghostFirst);
          const s = { x: I.th.x, v: I.th.v };
          spring(s, I.th.x + angWrap(g - I.th.x) * I.idle, dt, 3.2, 0.9);
          I.th.x = s.x; I.th.v = s.v; b = true;
        } else {
          b = coast(I.th, dt, 2.6) || b;
          // left (nearly) still end-on: ease onto the nearest view where the two
          // rectangles read; a fling or a key press still carries straight through
          const a = angWrap(I.th.x), fa = Math.abs(a), side = fa < PI / 2 ? fa : PI - fa;
          if (side > MOX.view && Math.abs(I.th.v) < 0.9) {
            const tg = Math.sign(a || 1) * (fa < PI / 2 ? MOX.view : PI - MOX.view);
            const s = { x: I.th.x, v: I.th.v };
            spring(s, I.th.x + angWrap(tg - a), dt, 2.6, 1);
            I.th.x = s.x; I.th.v = s.v; b = true;
          }
        }
      } else b = true;
      b = spring(I.link, MOX.gain(angWrap(moxToStation(I.th.x)[0] - I.th.x)), dt, 9, 0.9) || b;
      I.pulses = I.pulses.filter((p) => I.now - p.t0 < MOX.life);
      return b || I.pulses.length > 0;
    },
    dsig(I) { return [I.th.x]; },
    dyn(g, P, I) {
      const d = P.dot, col = P.color, Rp = MOX.Rp, th = I.th.x, pr = moxProj(th), fx = ANT.feed;
      // pattern: the main lobe (from the feed) warms toward its tip; the side lobes
      // (from the feed) and the back lobe (from the reflector) are small and pale
      const lobe = (lo, hi, close, ox) => {
        const pts = [];
        for (let j = 0; j <= 160; j++) { const a = mix(lo, hi, j / 160), r = MOX.gain(a) * Rp; pts.push(pr(ox + Math.cos(a) * r, Math.sin(a) * r)); }
        if (close) pts.push(pr(ox, 0));
        return pts;
      };
      const o = pr(fx, 0), tip = pr(fx + Rp, 0), main = lobe(-MOX.ML, MOX.ML, false, fx);
      P.poly(main, P.lin(o[0], o[1], tip[0], tip[1], col ? [[0, 0.06], [0.55, 0.16], [0.82, 0.5], [1, 0.8]] : [[0, 0.03], [0.6, 0.07], [0.85, 0.2], [1, 0.32]], MX.LOBE));
      P.stroke(main, d * 1.1, P.m(MX.LOBE, col ? 0.75 : 0.72), true);
      for (const [lo, hi, ox] of [[0.98, 1.7, fx], [-1.7, -0.98, fx], [PI - 0.6, PI + 0.6, ANT.back]]) {
        const pts = lobe(lo, hi, true, ox);
        P.poly(pts, P.m(MX.LOBE2, col ? 0.24 : 0.12));
        P.stroke(pts, d * 1.1, P.m(MX.LOBE2, 0.72), true);
      }
      // the antenna: boom, the reflector and driven Moxon rectangles, five directors
      // (rods stroked in screen space)
      const rod = (pts, w, style, cap) => { g.lineCap = cap || 'round'; P.stroke(pts.map(([x, y]) => pr(x, y)), w, style); g.lineCap = 'round'; };
      const mat = { REF: MX.ELEM, DRV: MX.DRIVEN, DIR: MX.ELEM };
      // paper halos knock the lobes and the dial out from under the hardware
      for (const e of ANT.els) rod(e.pts, d * 2.9, P.m(MX.LOBE, 0), 'round');
      rod([[ANT.boom[0], 0], [ANT.boom[1], 0]], d * 3.3, P.m(MX.LOBE, 0));
      rod([[ANT.boom[0], 0], [ANT.boom[1], 0]], d * 2.0, P.m(MX.BOOM, col ? 0.75 : 0.6));
      // the Moxon rods a touch heavier than the directors, so the two rectangles lead;
      // in mono the directors also print a step lighter, so even end-on (when every
      // element is a rung) the two boxes stand apart from the ladder
      for (const e of ANT.els) rod(e.pts, d * (e.k === 'DIR' ? 1.35 : 1.5), P.m(mat[e.k], e.k === 'DIR' && !col ? 0.75 : 1), 'butt');
      // the tape bands that hold each element on the boom
      for (const x of ANT.tape) { const p = pr(x, 0); P.circle(p[0], p[1], d * 1.05, P.m(MX.TAPE, 1)); }
      // the clamp on the mast; the feed point (SMA pigtail) on the driven element
      const cp = pr(0, 0);
      P.circle(cp[0], cp[1], d * 1.45, P.m(MX.MAST, 0.95));
      P.circle(o[0], o[1], d * 1.3, P.acc(1));
      // main-lobe peak
      P.circle(tip[0], tip[1], d * 1.35, P.acc(1));
    },
    anim(t, A, S, I) {
      const th0 = I.th.x, wq = A.dot, Rp = MOX.Rp, col = I.mode === 'color';
      const ct = Math.cos(th0), sn = Math.sin(th0), fx = ANT.feed;
      const half = ANT.half + wq * 1.6, x0 = ANT.back - wq * 1.6, x1 = ANT.tip + wq * 1.6;
      const bA = ANT.A, bx1 = ANT.boxes[1][1] + wq, bS = Math.sqrt(col ? 0.26 : 0.24);
      const pul = I.pulses.map((p) => [I.now - p.t0, p.th, Math.cos(p.th), Math.sin(p.th)]);
      for (let k = 0; k < S.idx.length; k++) {
        const px = S.aux[2 * k], py = S.aux[2 * k + 1], i = S.idx[k];
        // on the antenna's footprint only paper dots may light up, so the rods stay crisp
        const ax = px * ct + py * sn, ay = -px * sn + py * ct;
        const onAnt = ax > x0 && ax < x1 && Math.abs(ay) < half;
        // a faint tint inside each Moxon rectangle (common region): its two facing
        // U's read as one box at any size and any angle
        if (onAnt && ax < bx1 && Math.abs(ay) < bA + wq) {
          for (let q = 0; q < 2; q++) {
            const din = Math.min(ax - ANT.boxes[q][0], ANT.boxes[q][1] - ax, bA - Math.abs(ay));
            if (din > -wq) {
              // owns the paper (and any faint lobe / dial fringe) inside; hardware keeps its dots
              const f = smoothstep(-0.5 * wq, 0.7 * wq, din) * bS, v = f * f * A.TX[i];
              if (f > 0.12 && v > A.D[i]) { A.D[i] = v; A.C[i] = q ? MX.DBOX : MX.RBOX; }
            }
          }
        }
        // ambient: two slow rings breathing out along the main lobe, beyond the directors
        const qx = ax - fx, r = Math.hypot(qx, ay), ph = Math.atan2(ay, qx);
        if (!I.reduced && !onAnt && Math.abs(ph) < MOX.ML) {
          const lim = MOX.gain(ph) * Rp, r0 = ANT.tip - fx;
          if (r < lim - wq * 1.8 && r > r0) {
            let s = 0;
            for (let j = 0; j < 2; j++) {
              const p = wrap01(t / 3.6 + j / 2), Rr = r0 + p * (Rp - r0);
              const v = smoothstep(wq * (col ? 1.6 : 1.2), wq * 0.2, Math.abs(r - Rr)) * Math.sin(PI * p);
              if (v > s) s = v;
            }
            s *= smoothstep(0, 0.08, lim - r) * (col ? 0.72 : 0.5);
            if (s > 0.05) A.lift(i, s * s, MX.LOBE);
          }
        }
        // pulses: a bright front racing out from the feed, through the directors and
        // along the main lobe it was sent on
        for (const [e, pth, pc, ps] of pul) {
          const bx = px * pc + py * ps - fx, by = -px * ps + py * pc;
          const rr = Math.hypot(bx, by), pp = Math.atan2(by, bx);
          if (Math.abs(pp) > MOX.ML) continue;
          const gn = MOX.gain(pp);
          for (let j = 0; j < 3; j++) {
            const Rq = 0.04 + (e - j * 0.1) * MOX.v;
            if (Rq < 0.04 || Rq > MOX.reach) continue;
            const v = smoothstep(wq * 2.2, wq * 0.35, Math.abs(rr - Rq)) * Math.pow(gn, 0.6) * (1 - smoothstep(0.92, 1, Rq / MOX.reach)) * smoothstep(0, 0.06, e) * (j ? 0.62 : 1);
            if (v < 0.06) continue;
            const cv = Math.min(1, v * v * 1.15), mk = j ? MX.LOBE : MX.PULSE;
            // between the rods (paper or pale lobe) the front owns the dot; rods keep theirs
            if (!onAnt) A.over(i, cv, mk);
            else if (A.D[i] < 0.4 && cv * 0.85 > A.D[i]) A.set(i, cv * 0.85, mk);
          }
        }
      }
      // the CanSat's link meter: three bars on the dot grid, 2 dots wide and 2 / 4 / 6
      // tall, each filling from the bottom as the gain toward the CanSat rises
      const [sx, sy] = moxStation(), [kx, ky] = moxCanSat(), L = clamp(I.link.x);
      const bc = Math.round(A.colF(kx + MCS.cw)) + 3, br = Math.round(A.rowF(ky + MCS.ch));
      for (let k = 0; k < 3; k++) {
        const h = 2 + 2 * k, lv = smoothstep(MOX.bars[k][0], MOX.bars[k][1], L) * h;
        for (let j = 0; j < h; j++) {
          const f = clamp(lv - j), on = f > 0.5;
          for (let c = 0; c < 2; c++) A.at(bc + 3 * k + c, br - j, mix(0.2, 0.9, f * f), on ? (col ? MX.BAR : INK) : MX.GRID, A.set);
        }
      }
      // a pulse inside the half-power beam reaches the CanSat's ground track, climbs the
      // drop line and rings round the CanSat (accent; in colour the pulse's blue)
      const pc = col ? MX.PULSE : ACC;
      for (const [e, pth] of pul) {
        const [bs, rs] = moxToStation(pth), pe = e - (rs - 0.04) / MOX.v, gs = MOX.gain(angWrap(bs - pth));
        if (pe <= 0 || gs <= MOX.ping) continue;
        const amp = smoothstep(MOX.ping, MOX.ping + 0.2, gs);
        if (pe < MOX.climb) A.disc(sx, mix(sy - 0.035, ky + MCS.ch, easeOut(pe / MOX.climb)), 1.25, amp, pc);
        const pq = pe - MOX.climb * 0.55;
        if (pq > 0 && pq < 0.9) A.halo(kx, ky - 0.05, 2.4 + pq * 8, amp * Math.sin(PI * pq / 0.9), pc, A.over);
      }
    },
  };

  // Fallback — a topographic map plate seeded from the project name ----------
  // Light hill-shading lit from the upper left, ink contours with firmer index
  // lines, the summit contour + spot height in accent. Drag pans the map
  // (inertia, soft edges); click raises a new peak where you click, its
  // contours rippling outward as it grows. Colour mode tints by elevation,
  // greens through browns.
  const TOPO = { mu: 0.97, mv: 0.62, lv: 11, M: 26 };
  const TP = { H0: 4, H1: 5, H2: 6, H3: 7, LINE: 8, IDX: 9 };
  M.topo = {
    label: 'Topographic map — drag to pan, click to raise a peak',
    cursor: 'Raise',
    drag: 'x',
    rest: [0, 0],
    ghostEvery: 5.2, ghostFirst: 1.6,
    mats: [
      ['ink', '#2E2A24'], ['accent', 'accent'], ['muted', '#A39F95'], ['ink', '#A39E94'],
      ['muted', ['#B8D3A0', '#86AE70', '#5D8A52']], ['muted', ['#D2D69C', '#ABB46A', '#828C46']], ['muted', ['#E3C99A', '#C7A26A', '#9B7646']], ['muted', ['#D7BDA5', '#A9866A', '#7A5A44']],
      ['ink', '#6B5338'], ['ink', '#4A3824'],
    ],
    prep(F, name) {
      const seed = strHash(name || 'project');
      const nz = makeNoise(seed);
      const R = (k) => hash2((seed & 0xffff) + k * 7919, (seed >>> 16) + k * 104729 + 13);
      const { mu, mv, M: Mg } = TOPO;
      const nh = 2 + Math.floor(R(1) * 3);
      const hills = [];
      for (let k = 0; k < nh; k++) {
        hills.push({ x: mix(-0.7, 0.7, R(10 + k)), y: mix(-0.38, 0.38, R(20 + k)), sx: mix(0.25, 0.6, R(30 + k)), sy: mix(0.18, 0.45, R(40 + k)), rot: R(50 + k) * PI, a: k === 0 ? 1 : mix(0.35, 0.8, R(60 + k)) });
      }
      const ox = R(70) * 40, oy = R(71) * 40, ra = R(72) * PI, rc = Math.cos(ra), rs = Math.sin(ra);
      const hf = (x, y) => {
        let h = 0;
        for (const H of hills) {
          const c = Math.cos(H.rot), s = Math.sin(H.rot), dx = x - H.x, dy = y - H.y;
          const px = (dx * c + dy * s) / H.sx, py = (-dx * s + dy * c) / H.sy;
          h += H.a * Math.exp(-(px * px + py * py));
        }
        const qx = x * rc + y * rs, qy = -x * rs + y * rc;
        const rg = 1 - Math.abs(nz.n2(qx * 0.75 + ox, qy * 1.3 + oy));
        return h + 0.15 * rg * rg * rg + 0.05 * nz.n2(x * 2.6 - oy, y * 2.6 + ox);
      };
      const { D, C, dot, P } = F;
      const c0 = P.colOf(-mu), c1 = P.colOf(mu), r0 = P.rowOf(-mv), r1 = P.rowOf(mv);
      // heights on an extended dot grid (the pan range), normalised on the home view
      const gw = c1 - c0 + 1 + 2 * Mg, gh = r1 - r0 + 1 + 2 * Mg, Hg = new Float32Array(gw * gh);
      let hmin = 1e9, hmax = -1e9;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const u = P.colU(c0 - Mg + x), v = P.rowV(r0 - Mg + y), h = hf(u, v);
        Hg[y * gw + x] = h;
        if (x >= Mg && y >= Mg && x < gw - Mg && y < gh - Mg) { if (h < hmin) hmin = h; if (h > hmax) hmax = h; }
      }
      const span = hmax - hmin || 1;
      for (let k = 0; k < Hg.length; k++) Hg[k] = (Hg[k] - hmin) / span;
      // plate frame + graticule ticks (muted)
      const set = (c, r, d) => { if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) return; const i = r * F.cols + c; D[i] = d; C[i] = MUT; };
      for (let c = c0 - 2; c <= c1 + 2; c++) { set(c, r0 - 2, T.ctx); set(c, r1 + 2, T.ctx); }
      for (let r = r0 - 2; r <= r1 + 2; r++) { set(c0 - 2, r, T.ctx); set(c1 + 2, r, T.ctx); }
      for (let k = -3; k <= 3; k++) { const c = P.colOf(k * 0.25); set(c, r0 - 3, T.ctx); set(c, r1 + 3, T.ctx); }
      for (let k = -2; k <= 2; k++) { const r = P.rowOf(k * 0.25); set(c0 - 3, r, T.ctx); set(c1 + 3, r, T.ctx); }
      return { c0, c1, r0, r1, gw, gh, Hg, Mg, dotU: dot, seed };
    },
    init(I) { I.px = { x: 0, v: 0 }; I.py = { x: 0, v: 0 }; I.peaks = []; I.pk = 0; },
    ghost(I, tau) { return [0, 0]; },
    ghostClick(I, tau, k) { return [mix(-0.7, 0.7, hash2(k * 3 + 1, 17)), mix(-0.4, 0.4, hash2(k * 5 + 2, 23))]; },
    click(I, u, v) {
      if (Math.abs(u) > TOPO.mu || Math.abs(v) > TOPO.mv) return;
      // terrain coordinates in art units (pan-independent)
      const d = I.dot;
      I.peaks.push({ u: u + I.px.x * d, v: v + I.py.x * d, a: spr(0), sig: 5 + 4 * hash2(I.pk * 7 + 3, 1), k: I.pk++, t0: I.now });
      if (I.peaks.length > 4) I.peaks[0].dead = true;
    },
    key(I, key) {
      const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
      if (m) { I.px.v += m[0] * 14; I.py.v += m[1] * 14; return true; }
      if (key === 'Enter' || key === ' ') { this.click(I, 0.1 * Math.sin(I.pk * 2.1), 0.1 * Math.cos(I.pk * 1.7)); return true; }
      return false;
    },
    dragMove(I, du, dv) { const d = I.dot; I.px.x -= du / d; I.py.x -= dv / d; if (I.dt > 0 && (du || dv)) { I.px.v = -du / d / I.dt; I.py.v = -dv / d / I.dt; } },
    // fling: pan velocity (dots/s) from the engine's smoothed pointer velocity
    release(I, vu, vv) { I.px.v = clamp(-vu / I.dot, -60, 60); I.py.v = clamp(-vv / I.dot, -60, 60); },
    step(I, dt) {
      const Mg = TOPO.M - 2;
      let b = false;
      for (const s of [I.px, I.py]) {
        if (I.dragging) { b = true; continue; }
        if (I.idle > 0.01 && s === I.px) {
          const g = 9 * Math.sin(I.tau * 0.21);
          const sp = { x: s.x, v: s.v }; spring(sp, mix(s.x, g, I.idle), dt, 1.6, 1); s.x = sp.x; s.v = sp.v; b = true;
        } else if (I.idle > 0.01) {
          const g = 4 * Math.sin(I.tau * 0.27 + 1);
          const sp = { x: s.x, v: s.v }; spring(sp, mix(s.x, g, I.idle), dt, 1.6, 1); s.x = sp.x; s.v = sp.v; b = true;
        } else if (Math.abs(s.x) > Mg) b = spring(s, clamp(s.x, -Mg, Mg), dt, 8, 0.9) || b;
        else b = coast(s, dt, 3) || b;
      }
      for (const p of I.peaks) b = spring(p.a, p.dead ? 0 : 0.42, dt, p.dead ? 4 : 5.5, p.dead ? 1 : 0.42) || b;
      I.peaks = I.peaks.filter((p) => !(p.dead && p.a.x < 0.005));
      return b;
    },
    anim(t, A, S, I) {
      const { c0, c1, r0, r1, gw, gh, Hg, Mg } = S, { lv } = TOPO, dot = A.dot, col = I.mode === 'color';
      const ox = I.px.x, oy = I.py.x;
      const pks = I.peaks.filter((p) => p.a.x > 0.002);
      const W = c1 - c0 + 1, Hh = r1 - r0 + 1;
      const hs = new Float32Array(W * Hh), gxs = new Float32Array(W * Hh), gys = new Float32Array(W * Hh);
      const samp = (x, y) => {
        x = clamp(x, 0, gw - 1.001); y = clamp(y, 0, gh - 1.001);
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, o = yi * gw + xi;
        return Hg[o] * (1 - fx) * (1 - fy) + Hg[o + 1] * fx * (1 - fy) + Hg[o + gw] * (1 - fx) * fy + Hg[o + gw + 1] * fx * fy;
      };
      let top = -1e9, tk = 0;
      const pu0 = A.colU(c0) / dot + ox, pv0 = A.rowV(r0) / dot + oy;
      for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) {
        const x = c + Mg + ox, y = r + Mg + oy;
        let h = samp(x, y), gx = (samp(x + 1, y) - samp(x - 1, y)) / 2, gy = (samp(x, y + 1) - samp(x, y - 1)) / 2;
        for (const p of pks) {
          const dx = c + pu0 - p.u / dot, dy = r + pv0 - p.v / dot, e = p.a.x * Math.exp(-(dx * dx + dy * dy) / (p.sig * p.sig));
          h += e; gx += -2 * dx / (p.sig * p.sig) * e; gy += -2 * dy / (p.sig * p.sig) * e;
        }
        const k = r * W + c;
        hs[k] = h; gxs[k] = gx / dot; gys[k] = gy / dot;
        if (h > top) { top = h; tk = k; }
      }
      const lx = -0.6, ly = -0.6, lz = 0.53, exg = 0.55;
      const sr = Math.floor(tk / W), sc = tk - sr * W;
      const inner = smoothstep(1, 4, Math.min(sc, sr, W - 1 - sc, Hh - 1 - sr));
      const pkLevel = inner > 0.5 ? Math.floor(top * lv - 1e-6) : -1;
      for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) {
        const k = r * W + c, i = (r0 + r) * A.cols + (c0 + c);
        const h = hs[k], gx = gxs[k], gy = gys[k];
        const nx = -gx * exg, ny = -gy * exg, nl = Math.hypot(nx, ny, 1);
        const lam = (nx * lx + ny * ly + lz) / nl;
        const shade = 0.3 * clamp((lz - lam) * 2.2);
        const band = clamp(Math.floor(h * 4 + A.B.JIT[i] * 1.5), 0, 3);
        let val = col ? 0.2 + 0.1 * h + shade * 1.25 : shade, kk = col ? TP.H0 + band : MUT;
        const x = h * lv, fl = Math.round(x), gm = Math.hypot(gx, gy) * dot;
        if (fl > 0) {
          const dd = Math.abs(x - fl) / lv / Math.max(gm, 1e-5);
          const major = fl % 5 === 0, hw = major ? 0.75 : 0.5;
          const sm = smoothstep(hw + 0.55, hw - 0.3, dd);
          const cv = (major ? 0.9 : 0.5) * sm * sm;
          if (sm > 0.2 && cv > val * 0.6) { val = Math.max(cv, val * (1 - sm)); kk = fl === pkLevel ? ACC : col ? (major ? TP.IDX : TP.LINE) : INK; }
        }
        A.set(i, val, kk);
      }
      // summit spot height (only for a real summit, not a slope cut by the frame)
      if (inner > 0.05) A.disc(A.colU(c0 + sc), A.rowV(r0 + sr), 1.6, inner, ACC);
    },
  };

  // ------------------------------------------------------------------ build + cache
  const pitchOf = (w) => Math.max(4, Math.min(6.4, w / 94.5));
  const CACHE = new Map();
  const KS = 5, KD = 4; // plate supersampling: static, dynamic

  function layoutOf(st) {
    const { cols, rows, xs, ys } = st.grid;
    return { S: Math.min(st.h / 2, st.w / 2.7), cx: st.w / 2, cy: st.h / 2, ox: xs[0], oy: ys[0], p: st.pitch, cols, rows, w: st.w, h: st.h };
  }
  function plateTransform(g, L, K) {
    const s = L.S * K / L.p;
    g.setTransform(s, 0, 0, s, (L.cx - (L.ox - L.p / 2)) * K / L.p, (L.cy - (L.oy - L.p / 2)) * K / L.p);
    g.lineJoin = 'round'; g.lineCap = 'round';
  }

  function build(st, motif, name, mode) {
    const { n, xs, ys, cols, rows } = st.grid;
    const L = layoutOf(st);
    const U = new Float32Array(n), V = new Float32Array(n);
    for (let i = 0; i < n; i++) { U[i] = (xs[i] - L.cx) / L.S; V[i] = (ys[i] - L.cy) / L.S; }
    const nv = motif.variants || 1, vD = [], vC = [];
    let cvs = null, g = null;
    for (let v = 0; v < nv; v++) {
      const D = new Float32Array(n), C = new Uint8Array(n);
      if (motif.paint) {
        if (!cvs) { cvs = document.createElement('canvas'); cvs.width = cols * KS; cvs.height = rows * KS; g = cvs.getContext('2d', { willReadFrequently: true }); }
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
        g.fillStyle = '#fff'; g.fillRect(0, 0, cvs.width, cvs.height);
        plateTransform(g, L, KS);
        motif.paint(g, painter(g, L, mode, false), v);
        readStatic(g.getImageData(0, 0, cvs.width, cvs.height).data, cvs.width, cols, rows, KS, D, C);
      }
      vD.push(D); vC.push(C);
    }
    const D = vD[0], C = vC[0];
    const dot = L.p / L.S;
    const F = {
      n, cols, rows, U, V, D, C, P: painter(null, L, mode, false), L, dot, mode,
      // opaque soft disc
      disc(u, v, rDots, cov, k) {
        forDisc(L, u, v, rDots + 1, (i, dd) => { const s = smoothstep(rDots + 0.6, rDots - 0.4, dd); if (s > 0.05) { D[i] = cov * s * s + D[i] * (1 - s); C[i] = s > 0.4 ? k : C[i]; } });
      },
      ring(u, v, rDots, wDots, cov, k) {
        forDisc(L, u, v, rDots + wDots + 1, (i, dd) => { const s = smoothstep(wDots / 2 + 0.6, wDots / 2 - 0.4, Math.abs(dd - rDots)); if (s > 0.05 && cov * s * s > D[i] * 0.6) { D[i] = cov * s * s; C[i] = k; } });
      },
      stroke(pts, wDots, cov, k) {
        const Lf = lineField(F, pts, wDots);
        for (let j = 0; j < Lf.idx.length; j++) { const i = Lf.idx[j], s = Lf.prof[j]; if (s > 0.05 && C[i] !== ACC) { D[i] = cov * s * s + D[i] * (1 - s); C[i] = s > 0.4 ? k : C[i]; } }
      },
    };
    const state = motif.prep ? motif.prep(F, name, mode) : null;
    // printed texture: gentle fbm modulation + grain (also applied to animated dots)
    const TX = new Float32Array(n), JIT = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      TX[i] = 1 + 0.1 * fbm2(x * 0.021 + 11.3, y * 0.021 - 4.1, 3) + (hash2(x * 13.7, y * 7.3) - 0.5) * 0.06;
      JIT[i] = (hash2(x * 5.3 + 1, y * 9.1 + 7) - 0.5) * 0.12;
    }
    for (const DD of vD) for (let i = 0; i < n; i++) { const d = DD[i]; DD[i] = d < 0.012 ? 0 : clamp(d * TX[i]); }
    return { D, C, vD, vC, U, V, L, dot, state, TX, JIT, n };
  }

  function getBuild(st, motif, key, name, tech, mode) {
    const ck = [key, name, tech, st.w + 'x' + st.h + '@' + st.pitch, mode].join('\u0001');
    let B = CACHE.get(ck);
    if (!B || B.n !== st.grid.n) {
      B = build(st, motif, name, mode);
      CACHE.set(ck, B);
      if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value);
    }
    return B;
  }

  function projectArt(name, tech) {
    const key = keyOf(name, tech);
    const motif = M[key];
    const PAL = buildPalette(motif.mats || BASE_MATS);
    const nm = String(name || ''), tc = String(tech || '');
    let B = null, FD = null, FC = null, A = null, DY = null;
    // interaction state (survives resizes; everything in art units)
    const I = {
      t0: null, last: -1e9, idle: 0, idleT0: 0, wasIdle: false, gk: -1,
      tu: 0, tv: 0, ru: 0, rv: 0, hasReal: false, real: false, dragging: false, kAim: false, kx: 0, ky: 0, manip: false,
      now: 0, reduced: false, mode: 'mono', variant: 0, S: 1, dot: 0.03,
    };
    if (motif.rest) { I.tu = I.ru = motif.rest[0]; I.tv = I.rv = motif.rest[1]; }
    if (motif.init) motif.init(I);

    function paintDyn(t) {
      const { g, W, H } = DY;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setLineDash([]);
      plateTransform(g, B.L, KD);
      motif.dyn(g, DY.P, I, B.state, t);
      DY.nl = readDyn(g.getImageData(0, 0, W, H).data, W, B.L.cols, B.L.rows, KD, DY.DA, DY.DD, DY.DC, DY.list);
    }
    function frame(t) {
      const v = I.variant || 0;
      FD.set(B.vD[v]); FC.set(B.vC[v]);
      if (DY) {
        const sig = motif.dsig ? motif.dsig(I, t) : null;
        let ch = !DY.sig || !sig || sig.length !== DY.sig.length;
        if (!ch) for (let k = 0; k < sig.length; k++) if (Math.abs(sig[k] - DY.sig[k]) > 1e-4) { ch = true; break; }
        if (ch) { paintDyn(t); DY.sig = sig; }
        const { DA, DD, DC, list, nl } = DY, TX = B.TX;
        for (let k = 0; k < nl; k++) {
          const i = list[k], cd = DD[i] * TX[i], under = FD[i] * (1 - DA[i]);
          FD[i] = cd + under > 1 ? 1 : cd + under;
          if (cd >= under) FC[i] = DC[i];
        }
      }
      if (motif.anim) motif.anim(t, A, B.state, I);
    }

    const scene = {
      key,
      pitch: (w) => pitchOf(w),
      layout: 'grid',
      gain: 1.06,
      palette: { mono: PAL.mono, color: PAL.color },
      animated: true,
      interact: 'none',
      drag: motif.drag || undefined,
      cursor: motif.cursor || 'Play',
      label: motif.label || 'Project illustration',
      setup(st) {
        I.mode = st.mode;
        B = getBuild(st, motif, key, nm, tc, st.mode);
        const n = st.grid.n, L = B.L, TX = B.TX;
        FD = new Float32Array(n); FC = new Uint8Array(n);
        I.S = L.S; I.dot = B.dot;
        if (motif.dyn) {
          const cv = document.createElement('canvas');
          cv.width = L.cols * KD; cv.height = L.rows * KD;
          const g = cv.getContext('2d', { willReadFrequently: true });
          DY = { g, W: cv.width, H: cv.height, P: painter(g, L, st.mode, true), DA: new Float32Array(n), DD: new Float32Array(n), DC: new Uint8Array(n), list: new Int32Array(n), nl: 0, sig: null };
        }
        const inb = (c, r) => c >= 0 && r >= 0 && c < L.cols && r < L.rows;
        const set = (i, d, c) => { FD[i] = Math.min(1, d * TX[i]); FC[i] = c; };
        const lift = (i, d, c) => { const v = d * TX[i]; if (v <= FD[i]) return; if (FD[i] < 0.03) FC[i] = c; FD[i] = Math.min(1, v); };
        const over = (i, d, c) => { const v = d * TX[i]; if (v < FD[i] * 0.5) return; FD[i] = Math.min(1, Math.max(v, FD[i] * 0.5)); FC[i] = c; };
        const at = (c, r, d, k, fn) => { if (inb(c, r) && (!A.clipC || A.clipC(c, r))) (fn || over)(r * L.cols + c, d, k); };
        A = {
          dot: B.dot, D: FD, C: FC, U: B.U, V: B.V, n, cols: L.cols, rows: L.rows, L, TX, B, set, put: set, lift, over, at,
          clipC: null,
          colF: (u) => (L.cx + u * L.S - L.ox) / L.p,
          rowF: (v) => (L.cy + v * L.S - L.oy) / L.p,
          colU: (c) => (L.ox + c * L.p - L.cx) / L.S,
          rowV: (r) => (L.oy + r * L.p - L.cy) / L.S,
          // soft radius-linear bead: s = amp * (1 - dd/r) -> d = s*s
          bead(u, v, rDots, amp, c) {
            forDisc(L, u, v, rDots + 0.8, (i, dd) => { const s = amp * clamp((rDots + 0.8 - dd) / (rDots * 0.7)); if (s > 0.05 && FC[i] !== ACC) lift(i, Math.min(1, s * s), c); });
          },
          // solid soft disc that owns its dots
          disc(u, v, rDots, amp, c) {
            forDisc(L, u, v, rDots + 1, (i, dd) => { const s = amp * smoothstep(rDots + 0.6, rDots - 0.4, dd); if (s > 0.05) over(i, s * s, c); });
          },
          // expanding ring, radius-linear profile
          halo(u, v, rDots, amp, c, fn) {
            forDisc(L, u, v, rDots + 1.6, (i, dd) => { const s = amp * smoothstep(1.4, 0.2, Math.abs(dd - rDots)); if (s > 0.05) (fn || lift)(i, s * s, c); });
          },
          // anti-aliased axis-aligned strokes in fractional dot coordinates (radius-linear)
          hline(c0, c1, r, cov, k, fn, dash) {
            const rf = Math.floor(r), fr = r - rf;
            for (let c = Math.ceil(c0 - 0.5); c <= Math.floor(c1 + 0.5); c++) {
              const ex = clamp(Math.min(c - c0 + 0.5, c1 - c + 0.5));
              const dm = dash ? dash(c) : 1;
              if (dm <= 0 || ex <= 0) continue;
              let s = ex * (1 - fr); if (s > 0.03) at(c, rf, cov * dm * s * s, k, fn);
              s = ex * fr; if (s > 0.03) at(c, rf + 1, cov * dm * s * s, k, fn);
            }
          },
          vline(c, r0, r1, cov, k, fn, dash) {
            const cf = Math.floor(c), fc = c - cf;
            for (let r = Math.ceil(r0 - 0.5); r <= Math.floor(r1 + 0.5); r++) {
              const ex = clamp(Math.min(r - r0 + 0.5, r1 - r + 0.5));
              const dm = dash ? dash(r) : 1;
              if (dm <= 0 || ex <= 0) continue;
              let s = ex * (1 - fc); if (s > 0.03) at(cf, r, cov * dm * s * s, k, fn);
              s = ex * fc; if (s > 0.03) at(cf + 1, r, cov * dm * s * s, k, fn);
            }
          },
          // bilinear stamp of a small coverage template (tw x th, row-major) at a fractional dot offset
          stamp(tpl, tw, th, c0, r0, k, fn) {
            const cf = Math.floor(c0), rf = Math.floor(r0), fx = c0 - cf, fy = r0 - rf;
            const g = (x, y) => (x < 0 || y < 0 || x >= tw || y >= th ? 0 : tpl[y * tw + x]);
            for (let y = 0; y <= th; y++) for (let x = 0; x <= tw; x++) {
              const s = g(x, y) * (1 - fx) * (1 - fy) + g(x - 1, y) * fx * (1 - fy) + g(x, y - 1) * (1 - fx) * fy + g(x - 1, y - 1) * fx * fy;
              if (s > 0.03) at(cf + x, rf + y, s, k, fn);
            }
          },
        };
        if (motif.setup) motif.setup(I, B.state, A);
        // settle derived state (selection, hero module …) before the first paint
        if (motif.step) { I.now = st.now; motif.step(I, 0, B.state); }
        DY && (DY.sig = null);
        frame(st.t || 0);
      },
      update(st, dt) {
        if (!B) return;
        const P = st.pointer, now = st.now, L = B.L;
        I.now = now; I.dt = dt; I.reduced = !!(st.reduced || st.still); I.mode = st.mode;
        if (I.t0 === null) { I.t0 = now; I.last = now - IDLE + GHOST_DELAY; }
        const pu = (P.x - L.cx) / L.S, pv = (P.y - L.cy) / L.S;
        const real = P.down || (P.inside && P.x > -1e3);
        if (real) {
          // a key press owns the aim until the pointer really moves (a resting
          // pointer — e.g. right after the click that focused the canvas — must
          // not overwrite it every frame)
          if (I.kAim && !P.down && Math.abs(P.x - I.kx) + Math.abs(P.y - I.ky) < 3) {
            // keep the key-set aim
          } else {
            I.kAim = false;
            if (P.down || Math.abs(pu - I.ru) > 1e-3 || Math.abs(pv - I.rv) > 1e-3) I.last = now;
            I.ru = pu; I.rv = pv; I.hasReal = true;
          }
        }
        I.real = real;
        if (P.down && P.moved) I.manip = true;
        else if (!real) I.manip = false;
        const idle = !I.reduced && now - I.last > ((I.manip && real) || I.kAim ? IDLE_HOLD : IDLE);
        if (idle && !I.wasIdle) { I.idleT0 = now; I.gk = -1; }
        I.wasIdle = idle;
        I.idle += ((idle ? 1 : 0) - I.idle) * (1 - Math.exp(-dt * (idle ? 1.1 : 6)));
        if (I.idle < 1e-3 && !idle) I.idle = 0;
        const tau = now - I.idleT0;
        I.tau = tau;
        const gp = motif.ghost ? motif.ghost(I, tau) : [0.8 * Math.sin(tau * 0.42), 0.25 * Math.sin(tau * 0.61 + 1.2)];
        const bu = I.hasReal ? I.ru : (motif.rest ? motif.rest[0] : 0), bv = I.hasReal ? I.rv : (motif.rest ? motif.rest[1] : 0);
        I.tu = mix(bu, gp[0], I.idle); I.tv = mix(bv, gp[1], I.idle);
        // ghost clicks, on a schedule while idle
        if (idle && motif.ghostEvery && motif.click && I.idle > 0.6) {
          const k = Math.floor((tau - (motif.ghostFirst || 1.6)) / motif.ghostEvery);
          if (k >= 0 && k > I.gk) { I.gk = k; const c = motif.ghostClick ? motif.ghostClick(I, tau, k) : gp; motif.click(I, c[0], c[1], true); }
        }
        // drags
        if (P.down && P.moved) {
          if (!I.dragging && motif.dragStart) motif.dragStart(I, pu, pv);
          I.dragging = true;
          if (motif.dragMove) motif.dragMove(I, P.dx / L.S, P.dy / L.S, pu, pv);
        } else if (I.dragging && !P.down) {
          // the move that arrived with the release still counts, then hand over the
          // engine's smoothed release velocity (zeroed when the pointer was held still)
          if ((P.dx || P.dy) && motif.dragMove) motif.dragMove(I, P.dx / L.S, P.dy / L.S, pu, pv);
          I.dragging = false;
          if (motif.release) motif.release(I, P.vx / L.S, P.vy / L.S, pu, pv);
        }
        const busy = motif.step ? motif.step(I, dt, B.state) : false;
        if (busy || (I.idle > 0 && I.idle < 0.999)) st.busy = true;
      },
      onClick(x, y, st) {
        if (!B || !motif.click) return;
        I.last = st.now; I.manip = true;
        motif.click(I, (x - B.L.cx) / B.L.S, (y - B.L.cy) / B.L.S, false);
      },
      onKey(key, st) {
        if (!B) return false;
        I.last = st.now; I.now = st.now;
        // from now on the keyboard owns the aim until the pointer moves away from here
        I.kAim = true; I.kx = st.pointer.x; I.ky = st.pointer.y;
        if (motif.key && motif.key(I, key)) return true;
        const step = 0.14;
        const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
        if (mv) {
          if (!I.hasReal || I.idle > 0.3) { I.ru = I.tu; I.rv = I.tv; }
          I.ru = clamp(I.ru + mv[0], -1.05, 1.05); I.rv = clamp(I.rv + mv[1], -0.72, 0.72); I.hasReal = true;
          return true;
        }
        if ((key === 'Enter' || key === ' ') && motif.click) { motif.click(I, I.hasReal ? I.ru : I.tu, I.hasReal ? I.rv : I.tv, false); return true; }
        return false;
      },
      onMode(mode, st) { if (st.grid) scene.setup(st); },
      sample(x, y, t, st, out, i) {
        if (i === 0) frame(t);
        const d = FD[i], m = FC[i], nb = PAL.nb[m];
        out.d = d;
        if (nb < 2) { out.c = PAL.base[m]; return; }
        const e = d + B.JIT[i];
        out.c = PAL.base[m] + (nb === 2 ? (e > 0.5 ? 1 : 0) : e < 0.34 ? 0 : e < 0.68 ? 1 : 2);
      },
      revealKey(x, y, st) {
        return 0.55 * (x / st.w) + 0.15 * (y / st.h) + 0.3 * hash2(x * 3.1, y * 1.7);
      },
    };
    return scene;
  }

  projectArt.keyOf = keyOf;
  projectArt.keys = Object.keys(M);
  HT.scenes.projectArt = projectArt;
})();
