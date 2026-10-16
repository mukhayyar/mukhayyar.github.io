/*!
 * night.js — Halftone.scenes.nightLaunch
 * Footer centrepiece: Bromo–Tengger–Semeru before dawn, a giant wordmark rising behind the far
 * caldera wall like a monument, a rocket that launches as the footer scrolls in — and a valley
 * that is alive: jeep convoys crawling over the sand sea with paired headlights, a launch tower
 * blinking at the pad, hikers' headlamps, warung lanterns and fireflies on the viewpoint,
 * shooting stars, the Milky Way, Semeru's ash and Bromo's steam.
 *
 * Two looks (st.mode; each is built once per size and cached, the other one is pre-built in the
 * background a moment after setup, so the toggle swaps instantly and repaints in a sweep):
 *   mono   night ink + one accent (the flame, the top beacon, lava, the launch reticle): minimal.
 *   color  a Bromo sunrise painted in dots (Seurat at Penanjakan): indigo → violet → rose → gold
 *          sky; the name eclipses the rising sun (it sits behind one letter, a gold corona hugs
 *          the letter outlines, rays fan out above the cap line, a warm rim runs along the whole
 *          crest); Semeru a periwinkle cone with a pink-lit plume; the backlit Tengger wall a dark
 *          sparse silhouette with mist at its foot; Bromo grey-brown with a lit peach rim, a dark
 *          bowl and a tall white steam column; Batok's sunlit ribs yellow-green over deep gullies;
 *          a sea of cloud in dome-lit billows (peach toward the sun, lavender away) wrapping the
 *          cone bases; ochre sand in shadow; a green viewpoint with a sunlit crest.
 *          Form comes from dot size (sunlit = big, shadow = sparse so the CSS gradient behind the
 *          canvas shows through); colours are dithered only between near-equal values; every
 *          light (headlights, lanterns, fireflies) has a dark collar so it reads.
 *
 * Depth planes, far → near (each has a parallax factor for the camera pan):
 *   sky (stars, Milky Way, glow / dawn, moon, sun) · Semeru (+ ash plume) · wordmark ·
 *   Tengger far wall · Bromo (crater, steam) · Batok (ribbed cone) · sea of cloud on the sand
 *   (jeeps) · [launch pad + tower] · near ridge (hikers, lanterns)
 * One wind drives everything that drifts (ash, steam, exhaust), all leaning left.
 *
 * Interaction (anatomy-style toy):
 *   click the sky      a tap ring + a target reticle answer at once, the pad flashes, and a rocket
 *                      launches toward the click: gravity turn, flame, smoke trail, staging
 *                      sparkle, the spent stage tumbling away; the reticle flares when it arrives
 *                      (≤ 5 at once)
 *   click a volcano    Bromo (or Batok's neighbour) / Semeru erupts: lava fountain + ash burst
 *   click the sand     the jeep convoys flash long high beams
 *   drag ←→            the camera pans with parallax (stars least, near ridge most), rubber-bands
 *                      softly past its range and springs back
 *   keys               Space / Enter / ↑ launch · ← → pan · E erupt
 *   cursor             the label says what a click does right there: Launch / Erupt / Beams,
 *                      Drag while dragging (data-cursor + a re-dispatched pointerover, as pi.js)
 *   idle               jeeps crawl, the beacon blinks, lanterns flicker, fireflies, shooting
 *                      stars; a ghost demo (with a visible tap ring / drag so touch users learn
 *                      the moves) only when nobody is playing: no input for 9 s (3.5 s before the
 *                      first ever touch), no user rocket / eruption alive, the pointer outside or
 *                      still for 12 s (no autonomous motion under reduced motion or pause)
 *
 * st.progress 0..1  main rocket: on the pad (hidden) → ignition → gravity turn → nose ≈ 0.13h
 * st.data.word      wordmark text (default 'MUKHAYYAR')
 * scene.hint        touch-gesture hint text for the page (optional to display)
 * Colour mode looks right on the footer gradient
 *   linear-gradient(180deg, #15163C 0%, #2B2660 38%, #2A2F52 52%, #173229 74%, #0D1F17 100%)
 */
(function () {
  'use strict';
  if (!window.Halftone) return;
  const U = Halftone.utils;
  const { TAU, clamp, mix, smoothstep, hash2, noise2, noise3, fbm2 } = U;

  // ------------------------------------------------------------------ materials
  // Mono only ever uses 0–3. Colour paints with 4+ (each entry maps to a sensible mono tone too).
  const INK = 0, ACC = 1, MUT = 2, FNT = 3;
  const SK0 = 4, SK1 = 5, SK2 = 6, SK3 = 7, SK4 = 8, SUN = 9, STAR = 10;
  const WCR = 11, WGD = 12, HZ1 = 13, HZ2 = 14, PLP = 15, PLG = 16;
  const G0 = 17, G1 = 18, G2 = 19, G3 = 20, ASH = 21, ASD = 22, STM = 23;
  const CLD = 24, CLS = 25, SND = 26, SDD = 27, FLM = 28, FCR = 29, LAV = 30;
  const HED = 31, TAL = 32, RKW = 33, RKS = 34, SMH = 35, SML = 36;
  const GD = 37, HZ0 = 38, CLV = 39, PCH = 40, VSH = 41;
  const LIT = 42, BMS = 43, SMD = 44, GL = 45, RSE = 46;
  const PALETTE = {
    mono: [
      'ink', 'accent', 'muted', 'faint',
      'faint', 'faint', 'muted', 'muted', 'muted', 'ink', 'ink',
      'ink', 'ink', 'muted', 'muted', 'ink', 'muted',
      'faint', 'muted', 'muted', 'ink', 'muted', 'faint', 'ink',
      'ink', 'muted', 'muted', 'faint', 'accent', 'ink', 'accent',
      'ink', 'accent', 'ink', 'muted', 'ink', 'muted',
      'faint', 'muted', 'muted', 'ink', 'faint',
      'ink', 'muted', 'muted', 'ink', 'muted',
    ],
    color: [
      '#F3ECDD', '#FF6A2B', '#9C93A8', '#4A4560',
      // sky: indigo → violet → orchid → rose → gold, sun, star
      '#2C3172', '#5B4BA8', '#A267B2', '#F2899A', '#FFC572', '#FFF3CF', '#EEEBFF',
      // wordmark cream / gold, far haze, plume pink / mauve
      '#FFF4DE', '#F6CF86', '#5A62AF', '#9D98D9', '#F8BCCB', '#AE95C2',
      // greens (deep → sunlit), Bromo ash lit / dark, steam
      '#215640', '#2F8250', '#5FA557', '#9CC968', '#B39C88', '#6F5D52', '#F8F5EF',
      // cloud white-pink / shadow, sand ochre / dark, flame, flame core, lava
      '#FDEEF0', '#D3BEDA', '#E0B476', '#AD885C', '#FF8A2B', '#FFE7A2', '#FF6A24',
      // headlights, tail lights, rocket white / shade, smoke lit / shade
      '#FFD66B', '#FF3B30', '#FFFFFF', '#A4A2BF', '#F8ECEF', '#BBAAC2',
      // forest shadow (teal-green), slate haze, cloud shadow, sunlit peach, violet shadow
      '#18403A', '#3B3F80', '#A79FD2', '#FFD3A8', '#3D3366',
      // lights (warm white), beam-lit sand, smoke shadow, sun-kissed grass tips, rose haze
      '#FFF3CF', '#F4DDAB', '#6C5E96', '#CFE08A', '#E7A2B4',
    ],
  };
  // effect materials per mode. Mono keeps the accent for the hero details only: the flame, lava,
  // the top tower beacon and the launch reticle; every other light is ink with a muted glow.
  const FXM = { plHi: INK, plLo: MUT, stHi: INK, stLo: MUT, smHi: INK, smLo: MUT, smDk: MUT, ashHi: INK, ashLo: MUT,
    flame: ACC, core: INK, rkLit: INK, rkShade: MUT, light: ACC, head: INK, tail: MUT, lava: ACC, lavaHot: INK,
    star: INK, starLo: MUT, tower: MUT, beacon: ACC, beacon2: MUT, beam: MUT, beamHi: INK, spark: INK, lamp: INK,
    lampLo: MUT, rimHi: INK, lantern: INK, glow: MUT, fly: INK, ret: ACC, retLo: MUT, tap: INK };
  const FXC = { plHi: PLP, plLo: PLG, stHi: STM, stLo: CLS, smHi: SMH, smLo: SML, smDk: SMD, ashHi: ASH, ashLo: ASD,
    flame: FLM, core: FCR, rkLit: RKW, rkShade: RKS, light: FLM, head: LIT, tail: TAL, lava: LAV, lavaHot: FCR,
    star: STAR, starLo: STAR, tower: RKS, beacon: TAL, beacon2: TAL, beam: BMS, beamHi: LIT, spark: FCR, lamp: LIT,
    lampLo: HED, rimHi: G3, lantern: LIT, glow: HED, fly: FCR, ret: FCR, retLo: SK4, tap: LIT };

  // depth kinds, far → near
  const SKY = 0, SEM = 1, WORD = 2, WALL = 3, BROMO = 4, BATOK = 5, FLOOR = 6, FG = 7, RIM = 8;
  const PX = [0.05, 0.14, 0.2, 0.3, 0.46, 0.53, 0.68, 1];   // parallax per plane (near ridge = 1)
  const PX_PAD = 0.86;                                        // the pad sits just behind the near ridge

  // faint tones are screened stochastically (sparse specks) instead of a grid of pinpricks
  const fm = (d, hh, T) => (d >= T ? d : hh < d / T ? T : 0);

  const P_IGN = 0.04;   // progress at which the engines light
  const ALT_EXP = 1.1;  // altitude grows a little faster than progress (the rocket accelerates)
  const TURN_EXP = 2.4; // gravity turn: downrange ∝ altitude^TURN_EXP

  // click rockets: hold-down, ease of the climb, staging point (path fraction), coast between stages
  const HOLD = 0.1, SEXP = 1.4, S_ST = 0.5, COAST = 0.22, MAX_R = 5, MAX_E = 4;
  // ghost demo etiquette (s): quiet time after input, before the first ever touch, pointer still
  const G_QUIET = 9, G_FIRST = 3.5, G_STILL = 12, G_EVERY = 10;
  const TR_DUR = 0.95;  // mode-change repaint sweep

  // moonlight / sunlight: azimuth (0 = toward the viewer, − = left) and elevation
  const LAZ = -1.2, LCE = Math.cos(0.45), LSE = Math.sin(0.45);
  const lambert = (az, el) => Math.max(0, Math.cos(el) * LCE * Math.cos(az - LAZ) + Math.sin(el) * LSE);

  const newI = () => ({ cam: 0, camV: 0, raw: 0, drag: false, t0: null, px: -1e4, py: -1e4,
    lastIn: -1e9, lastMove: -1e9, ever: false, rockets: [], erupt: [], taps: [], nR: 0, nE: 0,
    ghostK: 0, ghostNext: 0, gq: null, gd: null, flash: -1e9, userFlash: false, trT: -1e9, trX: 0, trY: 0 });

  const scene = {
    palette: PALETTE,
    layout: 'grid',
    animated: true,
    interact: 'lens',
    interactRadius: 170,
    drag: 'x',
    cursor: 'Launch',
    label: 'Bromo at night — click the sky to launch a rocket',
    // a quiet line the page may show to touch visitors (no cursor there): what the gestures do
    hint: 'Tap the sky · tap a volcano · drag',
    fonts: ['800 100px Geist'],
    horizon: 0.77,
    skyline: 0.44,
    // dot spacing follows the width, but the dot count is capped so tall / very wide footers
    // (1440×900, 2560×890) stay inside the frame budget
    pitch(w, h) { return Math.max(clamp(w / 240, 4.6, 7.2), Math.sqrt(w * h / 26000)); },
    setup(st) { setup(this, st); },
    onMode(mode, st) { switchMode(this, mode, st); },
    update(st, dt) { update(this, st, dt); },
    onClick(x, y, st) { click(this, x, y, st); },
    onKey(key, st) { return keyDown(this, key, st); },
    sample(x, y, t, st, out, i) {
      const S = this, B = S.B, L = S.L;
      if (i === 0) frame(S, st, t);
      const X = S.X, CM = L.CM;
      const D = S.D, k = S.K[i];
      let d = D[i], c = S.C[i];
      if (!S.pan && k === SKY) {
        const tw = B.twA[i];
        if (tw > 0) d *= 1 - tw * (0.5 + 0.5 * Math.sin(t * B.twF[i] + B.twP[i]));
      }

      // Semeru ash plume (far: behind the wordmark): discrete eruption puffs + a thin ash ribbon
      if (k <= SEM) {
        let ip = i;
        if (S.shSem) { const cc = (i % L.cols) - S.shSem; ip = cc >= 0 && cc < L.cols ? i - S.shSem : -1; }
        const pe = ip >= 0 ? B.plE[ip] : 0;
        if (pe > 0) {
          const al = B.plA[ip], b = B.plB[ip];
          const T = L.plLam / L.plV, k0 = Math.floor(t / T);
          let v = 0, top = 0;
          for (let j = 0; j < L.plK; j++) {
            const id = k0 - j;
            const te = id * T + T * 0.3 * (hash2(id, 5) - 0.5);
            const aj = L.plV * (t - te);
            if (aj < -L.plR0 || aj > L.plLen) continue;
            const rj = L.plR0 + L.plGrow * Math.max(0, aj);
            const da = al - aj;
            const q = (da * da * 0.55 + b * b) / (rj * rj);
            if (q > 4) continue;
            const Ij = (0.78 + 0.22 * hash2(id, 9)) * (1 - Math.pow(Math.max(0, aj) / L.plLen, 1.6));
            const pv = Ij * Math.exp(-q);
            if (pv > v) { v = pv; top = b < -rj * 0.25 ? 1 : 0; }
          }
          const rw = L.plR0 * 0.5 + L.plGrow * 0.5 * al;
          const ribbon = 0.24 * Math.exp(-(b * b) / (rw * rw));
          v = Math.max(v, ribbon);
          if (v > 0.02) {
            const fx = x - S.offs[SEM] + L.plV * t;
            const nz = noise3(fx * 0.03, y * 0.045, t * 0.03) + 0.5 * noise3(fx * 0.075, y * 0.09, 4 + t * 0.05);
            v = pe * v * (0.78 + 0.5 * nz);
            if (v > 0.5) v = 0.5;
            v = fm(v, hash2(i, 41), 0.07);
            if (CM) { if (v > 0.05) { if (v * 1.15 > d) d = v * 1.15; c = top && v > 0.2 ? X.plHi : v > 0.12 ? X.plLo : SK2; } }
            else if (v > d) { d = v; c = top && v > 0.26 ? X.plHi : X.plLo; }
          }
        }
      }
      // Bromo steam: a column rising out of the crater, lying over in the wind. Bromo stands in
      // front of the wall and the wordmark, so over the letters the steam is a veil that dims them.
      if (k <= BROMO) {
        let is = i;
        if (S.shBr) { const cc = (i % L.cols) - S.shBr; is = cc >= 0 && cc < L.cols ? i - S.shBr : -1; }
        const se = is >= 0 ? B.stE[is] : 0;
        if (se > 0) {
          const a = B.stA[is];
          const wd = B.stW[is] * (0.85 + 0.3 * noise2(a * 0.03 - t * 0.35, 1.3));
          const q = (B.stB[is] + wd * 0.45 * noise2(a * 0.02 - t * 0.22, 8.1)) / wd;
          if (q * q < 5) {
            const nz = noise3(a * L.stF - t * 0.55, B.stB[is] * 0.06, t * 0.07) + 0.45 * noise3(x * 0.09, y * 0.09, 3 + t * 0.12);
            let v = se * Math.exp(-q * q) * (0.62 + 0.62 * nz);
            if (v > 0.03) {
              if (k === WORD && D[i] > 0.1) { d *= 1 - (CM ? 0.14 : 0.5) * Math.min(1, v / (CM ? 0.6 : 0.4)); }
              else if (CM) {
                // a tall white column; where it drifts in front of the sun it glows warm
                if (v > 0.7) v = 0.7;
                v = fm(v, hash2(i, 53), 0.07);
                if (v > 0.05) {
                  if (v * 1.25 > d) d = v * 1.25;
                  const sk = B.stS[is];
                  c = v > 0.28 ? (sk > 0.45 ? LIT : X.stHi) : v > 0.13 ? (sk > 0.3 ? PCH : CLD) : X.stLo;
                }
              } else {
                if (v > 0.42) v = 0.42;
                v = fm(v, hash2(i, 53), 0.07);
                if (v > d) { d = v; c = v > 0.2 ? X.stHi : X.stLo; }
              }
            }
          }
        }
      }
      // rockets, flames, smoke, ash, lava, lights, jeeps, lamps, meteors
      const m = B.fxM[i];
      if (m) {
        const f = B.fxD[i];
        if (m !== 2) { d = f; c = B.fxC[i]; }
        else if (k === WORD && D[i] > 0.1) { d *= 1 - (B.fxS[i] ? 0.45 : 0.8) * Math.min(1, f / 0.5); }
        else if (CM) {
          // colour: smoke is a body with volume against the dense painted sky — its shadowed side
          // may be smaller than the sky dots it covers, its sunlit side bigger
          if (f > 0.05) { const o = f > 0.3 ? 1 : (f - 0.05) * 4; d += (f - d) * o; c = B.fxC[i]; }
        }
        else if (f > d) { d = f; c = B.fxC[i]; }
      }
      // mode change: the new palette repaints in a sweep (from the sun in colour, the moon in mono)
      if (S.trOn) {
        const dx = x - S.trX, dy = y - S.trY;
        const g = (S.tr * S.trR - Math.sqrt(dx * dx + dy * dy)) / (S.trR * 0.22) + 0.6 * (hash2(i, 97) - 0.5);
        d *= g >= 1 ? 1 : g <= 0 ? 0.18 : 0.18 + 0.82 * g * g * (3 - 2 * g);
      }
      out.d = d; out.c = c;
    },
  };

  // ------------------------------------------------------------------ build cache / mode switch
  // Each mode's layers are built once per (size, word) and kept, so a toggle is a swap. The mode
  // that is not showing is pre-built a few ms per frame in the background (a generator), so the
  // first toggle does not stall either.
  const KEYS = ['L', 'X', 'Y', 'B', 'D0', 'C0', 'K0', 'Dd', 'Cd', 'Kd', 'cBase', 'cFrac', 'cTop', 'offs', 'horizon', 'skyline'];
  function install(S, T) {
    for (const k of KEYS) S[k] = T[k];
    S.D = T.D0; S.C = T.C0; S.K = T.K0; S.oPad = 0; S.pan = false; S.shSem = 0; S.shBr = 0;
  }
  function buildNow(S, st, CM) {
    const T = {};
    const g = buildGen(S, st, CM, T);
    while (!g.next().done) { /* run to completion */ }
    return T;
  }
  function setup(S, st) {
    S.xs = st.grid.xs; S.ys = st.grid.ys;
    if (!S.I) S.I = newI();
    const key = st.w + 'x' + st.h + '@' + st.pitch + '|' + ((st.data && st.data.word) || '');
    S.cache = { key, mono: null, color: null };
    S.pre = null;
    const T = buildNow(S, st, st.mode === 'color');
    S.cache[st.mode === 'color' ? 'color' : 'mono'] = T;
    install(S, T);
    S.preAt = (st.now || 0) + 3;
    idleBuild(S, st);
  }
  function switchMode(S, mode, st) {
    if (!st.grid || !S.L || !S.cache) return;
    const md = mode === 'color' ? 'color' : 'mono';
    let T = S.cache[md];
    if (!T) {
      if (S.pre && S.pre.mode === md) { while (!S.pre.g.next().done) { /* finish */ } T = S.pre.T; }
      else T = buildNow(S, st, md === 'color');
      S.cache[md] = T;
    }
    S.pre = null;
    install(S, T);
    const I = S.I, L = S.L;
    if (!st.reduced && !st.still) {
      I.trT = st.now;
      I.trX = md === 'color' ? L.sunX : L.moX; I.trY = md === 'color' ? L.sunY : L.moY;
    }
  }
  // step the background build for at most `ms`; true when the other mode is ready
  function prebuild(S, st, ms) {
    if (!S.cache) return true;
    const other = st.mode === 'color' ? 'mono' : 'color';
    if (S.cache[other]) return true;
    if (!S.pre || S.pre.mode !== other) { const T = {}; S.pre = { mode: other, T, g: buildGen(S, st, other === 'color', T) }; }
    const t0 = performance.now();
    let r;
    do { r = S.pre.g.next(); } while (!r.done && performance.now() - t0 < ms);
    if (r.done) { S.cache[other] = S.pre.T; S.pre = null; }
    return r.done;
  }
  // ...also in idle time, so it completes when no frames run (reduced motion, a still footer)
  function idleBuild(S, st) {
    const ric = window.requestIdleCallback;
    if (typeof ric !== 'function') return;
    const cache = S.cache;
    const step = (dl) => {
      if (S.cache !== cache || !st.grid) return;
      if (!prebuild(S, st, Math.max(1, Math.min(6, dl.timeRemaining() - 1)))) ric(step, { timeout: 1500 });
    };
    setTimeout(() => ric(step, { timeout: 1500 }), 3200);
  }

  // ------------------------------------------------------------------ layout
  function measureInk(m, w, h) {
    const b = m.box;
    const y0 = Math.max(0, Math.floor(b.y) - 3), y1 = Math.min(h - 1, Math.ceil(b.y + b.h) + 3);
    let l = w, r = 0, tp = h, bt = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < w; x++) {
        if (m(x + 0.5, y + 0.5) > 0.5) {
          if (x < l) l = x; if (x > r) r = x;
          if (y < tp) tp = y; if (y > bt) bt = y;
        }
      }
    }
    if (r < l) return { l: 0, r: w, t: b.y, b: b.y + b.h };
    return { l, r: r + 1, t: tp, b: bt + 1 };
  }

  function makeWord(st, L) {
    const w = st.w, h = st.h;
    const text = String((st.data && st.data.word) || 'MUKHAYYAR').toUpperCase();
    const font = '800 {size}px Geist';
    const base = { text, font, w, h, x: (w - L.wordW) / 2, y: h * 0.92, letterSpacing: '-0.04em' };
    let m = U.textMask(Object.assign({}, base, { width: L.wordW }));
    let ink = measureInk(m, w, h);
    // measured ink can differ from measureText (tracking): refit to the exact width,
    // and cap the height so short words never swallow the scene
    let fit = L.wordW / Math.max(1, ink.r - ink.l);
    const capNow = (ink.b - ink.t) * fit;
    if (capNow > L.maxCap) fit *= L.maxCap / capNow;
    if (Math.abs(fit - 1) > 0.003) {
      m = U.textMask(Object.assign({}, base, { width: L.wordW * fit }));
      ink = measureInk(m, w, h);
    }
    const iw = ink.r - ink.l, ih = ink.b - ink.t;
    const dx = (w - iw) / 2 - ink.l, dy = L.wordTop - ink.t;
    // glyph centres (screen px): the wall dips under U, Bromo sits under a letter gap
    const glyphs = [];
    try {
      const cv = document.createElement('canvas').getContext('2d');
      const size = m.box.size;
      cv.font = font.replace('{size}', size.toFixed(2));
      const ls = -0.04 * size;
      if ('letterSpacing' in cv) cv.letterSpacing = ls.toFixed(2) + 'px';
      const whole = cv.measureText(text);
      const x0 = base.x + (whole.actualBoundingBoxLeft || 0) + dx;
      for (let k = 0; k < text.length; k++) {
        const a0 = cv.measureText(text.slice(0, k)).width, a1 = cv.measureText(text.slice(0, k + 1)).width - ls;
        glyphs.push({ ch: text[k], x: x0 + (a0 + a1) / 2, w: a1 - a0 });
      }
    } catch (e) { /* no glyph info: plain skyline */ }
    return { m, dx, dy, left: ink.l + dx, right: ink.r + dx, top: L.wordTop, cap: ih, glyphs };
  }

  function* buildGen(S, st, CM, T) {
    const w = st.w, h = st.h, p = st.pitch;
    const { n, xs, ys, cols, rows } = st.grid;
    const a = clamp((w / h - 0.9) / (2.57 - 0.9)); // 0 = phone, 1 = wide desktop
    const L = { a, w, h, p, cols, rows, ox: xs[0], oy: ys[0], CM };
    T.L = L;
    T.X = CM ? FXC : FXM;
    const ox = L.ox, oy = L.oy;

    // ---- camera pan range (a real parallax reveal on phones too), and the extended grid every
    //      plane is painted on so a pan reveals more; the drag rubber-bands up to ≈ 1.35× the range
    L.camMax = clamp(w * 0.1, 60, 150);
    L.camRb = L.camMax * 0.35;
    const M = Math.ceil((L.camMax * 1.42) / p) + 2, colsE = cols + 2 * M, nE = rows * colsE;
    L.M = M; L.colsE = colsE;
    const xOf = (cE) => ox + (cE - M) * p;
    const yOf = (r) => oy + r * p;
    const rowOf = (y) => Math.round((y - oy) / p);

    // ---- wordmark (sets the skyline); the text raster is shared by both modes
    L.wordW = w * mix(0.95, 0.946, a);
    L.wordTop = h * mix(0.36, 0.24, a);
    L.maxCap = h * mix(0.2, 0.34, a);
    const wkey = w + 'x' + h + '|' + ((st.data && st.data.word) || '');
    if (!S.wordCache || S.wordCache.key !== wkey) S.wordCache = { key: wkey, W: makeWord(st, L) };
    const W = S.wordCache.W;
    L.word = W;
    yield;
    // the rim's level: ~a quarter of the letters hidden on desktop (just enough of Y's stem and R's
    // leg survive to read), less on a phone where the letters are only ~8 dots tall
    const yS = W.top + W.cap * mix(0.86, 0.765, Math.sqrt(a));
    L.yS = yS;
    const G = W.glyphs;
    const gapNear = (tx) => {
      let best = 1e9, gx = tx;
      for (let k = 0; k + 1 < G.length; k++) {
        const x = (G[k].x + G[k].w * 0.5 + G[k + 1].x - G[k + 1].w * 0.5) * 0.5;
        if (Math.abs(x - tx) < best) { best = Math.abs(x - tx); gx = x; }
      }
      return best < w * 0.1 ? gx : tx;
    };

    // ---- Tengger far wall: a nearly level rim with broad cols where a letter needs its foot to be
    //      read (A's crossbar, U's bowl …). Each col drops the rim just enough to show that part
    //      plus the one empty row that parts the letters from the crest.
    const NEED = { A: 0.74, U: 0.8, J: 0.82, G: 0.74, Q: 0.8, Z: 0.8, S: 0.72, O: 0.7, C: 0.7, D: 0.68, B: 0.7, E: 0.7, Y: 0.79, V: 0.79 };
    // on a phone the letters are only ~10 dots tall: U (and J) must show their whole bowl or the
    // name reads "MLIKHAYYAR"
    if (a < 0.6) { NEED.U = NEED.J = mix(0.99, 0.8, a / 0.6); NEED.O = NEED.Q = mix(0.9, 0.7, a / 0.6); }
    const cols_ = G.filter((g) => NEED[g.ch]).map((g, k) => {
      const deep = W.top + W.cap * NEED[g.ch] + p * 1.05;
      return { x: g.x + (hash2(k, 77) - 0.5) * 0.2 * g.w, s: g.w * 0.72, d: Math.max(0, deep - yS), sk: 0.75 + 0.5 * hash2(k, 78) };
    });
    const wallY = (x) => {
      let dip = 0;
      for (const q of cols_) {
        const u = (x - q.x) / (q.s * (x < q.x ? q.sk : 2 - q.sk));   // a little asymmetric
        dip = Math.max(dip, q.d * Math.exp(-u * u));
      }
      return yS + dip + h * 0.008 * fbm2(x * 0.006 + 1.3, 11.3, 3) + h * 0.004 * noise2(x * 0.03, 5.2)
        - h * 0.03 * smoothstep(0.1 * w, 0, x) - h * 0.018 * smoothstep(0.9 * w, w, x);
    };

    // ---- Semeru (far cone behind the letters, concave flanks, small flat summit)
    const semX = w * mix(0.58, 0.635, a);
    const semPeak = h * mix(0.19, 0.13, a);
    const semH = (yS - semPeak) * 1.5;
    const semHalf = w * mix(0.36, 0.25, a);    // half-width at the skyline
    const semR = semHalf / 0.476;
    const semFlat = p * 0.9;
    Object.assign(L, { semX, semPeak, semH, semR });
    L.semY = (x) => semY(x);
    const semY = (x) => {
      const dx = Math.abs(x - semX);
      const u = Math.min(1, Math.max(0, dx - semFlat) / semR);
      let y = semPeak + semH * (1 - Math.pow(1 - u, 1.7));
      y += semH * 0.018 * fbm2(x * 0.02, 3.1, 3) * smoothstep(0.03, 0.2, u);
      return y;
    };

    // ---- the sea of cloud over the sand: its surface sits well below the wall's crest
    const seaBase = yS + h * mix(0.165, 0.19, a);
    L.seaBase = seaBase;

    // ---- Bromo: a broad truncated ash cone with an open crater, under a letter gap
    const brX = gapNear(w * mix(0.3, 0.37, a));
    const brRw = w * mix(0.1, 0.05, a);        // crater half-width
    const brRy = brRw * 0.32;                     // crater seen in perspective
    const brYc = yS + h * mix(0.075, 0.072, a);  // crater centre
    const brS = mix(0.5, 0.44, a);               // flank slope
    Object.assign(L, { brX, brRw, brRy, brYc, brS });
    const bromoY = (x) => {
      const dx = Math.abs(x - brX);
      let y;
      if (dx < brRw) { const q = dx / brRw; y = brYc - brRy * Math.sqrt(1 - q * q); }
      else { const e = dx - brRw; y = brYc + e * brS * (1 - 0.2 * Math.min(1, e / (2.5 * brRw))); }
      return y + h * 0.004 * noise2(x * 0.05, 3.3) * smoothstep(brRw * 0.85, brRw * 1.3, dx);
    };

    // ---- Batok: the ribbed cone, in front of Bromo's right flank
    const btX = w * mix(0.64, 0.485, a);
    const btHalf = w * mix(0.17, 0.108, a);
    const btApex = yS + h * mix(0.026, 0.02, a);
    const btHt = h * mix(0.19, 0.205, a);
    const btRt = btHalf * 0.08;
    Object.assign(L, { btX, btHalf, btApex, btHt });
    L.batokY = (x) => batokY(x);
    const BT_EXP = 1.3;
    const batokY = (x) => {
      const dx = x - btX;
      const u = (Math.sqrt(dx * dx + btRt * btRt) - btRt) / btHalf;
      return btApex + btHt * (u < 1 ? 1 - Math.pow(1 - u, BT_EXP) : 1 + (u - 1) * 0.3);
    };

    // ---- sea top: undulating, lapping up the cone skirts in lobes
    // (colour: the cloud climbs the cone skirts higher and pools in the gap between them, so the
    //  sea wraps the volcanoes instead of lying under them like a stripe)
    const lk = CM ? 2.1 : 1;
    const lobes = [
      { x: btX - btHalf * 0.95, s: w * 0.035, d: 0.016 * lk }, { x: btX + btHalf * 1.05, s: w * 0.04, d: 0.016 * lk },
      { x: brX - (brRw + (seaBase - brYc) / brS) * 0.8, s: w * 0.04, d: 0.016 * lk }, { x: w * 0.9, s: w * 0.06, d: 0.014 * (CM ? 1.6 : 1) },
    ];
    if (CM) {
      lobes.push({ x: (brX + brRw + btX - btHalf) * 0.5, s: w * 0.03, d: 0.03 });
      lobes.push({ x: brX + (brRw + (seaBase - brYc) / brS) * 0.9, s: w * 0.025, d: 0.022 });
      lobes.push({ x: w * 0.05, s: w * 0.05, d: 0.024 });
    }
    const seaTop = (x) => {
      let y = seaBase + h * 0.016 * fbm2(x * 0.0045, 2.2, 2) + h * 0.005 * noise2(x * 0.025, 8.8);
      for (const q of lobes) { const u = (x - q.x) / q.s; y -= h * q.d * Math.exp(-u * u); }
      return y;
    };

    // ---- launch site (behind the near ridge) and the rocket's path
    const rocketL = Math.max(p * 8, h * mix(0.085, 0.105, a));
    const rocketW = p * mix(2.2, 2.3, a);
    const fgBase = h * mix(0.735, 0.79, a);
    const fg0 = (x) => {
      const u = x / w;
      return fgBase + h * 0.02 * fbm2(x / (w * 0.18 + 60), 2.7, 3) + h * 0.006 * fbm2(x * 0.03, 9.1, 2)
        - h * mix(0.05, 0.085, a) * Math.pow(smoothstep(0.42, 0, u), 1.6)    // the viewpoint's own slope, left
        + h * 0.012 * Math.exp(-((u - 0.42) * (u - 0.42)) / 0.02);           // gentle saddle mid-frame
    };
    const padX = w * mix(0.7, 0.78, a);
    const padY = fg0(padX) + p * 0.6;                 // nozzle at rest, just below the ridge line
    const noseTop = h * mix(0.15, 0.13, a);
    const kd = mix(0.2, 0.22, a);                      // downrange per unit of climb
    const climbH = padY - noseTop - rocketL / Math.hypot(TURN_EXP * kd, 1);
    const downrange = climbH * kd;
    Object.assign(L, { padX, padY, rocketL, rocketW, climbH, downrange });
    // near ridge with a shoulder that hides the parked rocket
    const need = padY - rocketL - p * 1.4;
    const shW = w * mix(0.2, 0.12, a);
    const shH = Math.max(0, fg0(padX) - need);
    const fgY = (x) => {
      const u = (x - padX - shW * 0.2) / shW;
      return fg0(x) - shH * Math.exp(-u * u * (u < 0 ? 0.8 : 1.3));
    };
    L.crestPad = fgY(padX);
    L.fgY = fgY;

    // ---- launch tower beside the pad: a lattice mast whose head (and beacon) clears the shoulder
    {
      const c = Math.round((padX + rocketW * 1.25 + p * 0.6 - ox) / p);
      L.towerX = ox + c * p;
      const crest = fgY(L.towerX);
      L.towerTop = oy + Math.round((Math.min(padY - rocketL * 1.12, crest - p * mix(5.5, 7.5, a)) - oy) / p) * p;
      L.towerBot = padY + p;
    }

    // ---- moon (thin waning crescent; lit limb toward the sun below the horizon)
    const moX = w * mix(0.16, 0.085, a), moY = h * mix(0.15, 0.135, a);
    const moR = Math.max(p * 3.6, h * mix(0.036, 0.04, a)) * (CM ? 0.8 : 1);
    const moSx = -0.55, moSy = 0.835;
    Object.assign(L, { moX, moY });

    // ---- sun (colour). Desktop: the name eclipses it — the disc sits on the cap line behind one
    //      letter left of Bromo (K for MUKHAYYAR): its upper half rises above the name, the letter
    //      hides the rest and a corona hugs the letter's outline. Phone: the letters are small, so
    //      the sun rises in a letter gap behind the crest and shows whole.
    const glyphNear = (tx) => {
      let best = 1e9, gx = tx;
      for (const g of G) if (Math.abs(g.x - tx) < best) { best = Math.abs(g.x - tx); gx = g.x; }
      return best < w * 0.1 ? gx : tx;
    };
    const ecl = a > 0.3;    // letters big next to the sun: eclipse layout
    L.ecl = ecl;
    const sunX = ecl ? glyphNear(w * 0.32) : gapNear(w * mix(0.17, 0.215, a));
    const sunR = Math.max(p * 4.2, h * mix(0.05, 0.088, a));
    const sunY = ecl ? W.top - sunR * 0.05 : yS + sunR * 0.15;
    Object.assign(L, { sunX, sunY, sunR });

    // ---- Milky Way: a diagonal band with a dark dust rift
    const mwA = { x: w * mix(1.12, 1.04, a), y: h * mix(0.44, 0.36, a) };
    const mwB = { x: w * mix(0.3, 0.6, a), y: h * mix(-0.08, -0.12, a) };
    const mwLx = mwB.x - mwA.x, mwLy = mwB.y - mwA.y, mwLen = Math.hypot(mwLx, mwLy);
    const mwUx = mwLx / mwLen, mwUy = mwLy / mwLen;
    const mwBw = Math.min(w, h) * mix(0.1, 0.09, a);
    const milky = (x, y) => {
      const rx = x - mwA.x, ry = y - mwA.y;
      const al = rx * mwUx + ry * mwUy, dp = -rx * mwUy + ry * mwUx;
      if (dp > mwBw * 4.2 || dp < -mwBw * 4.2) return 0;   // well outside the band (< 1e-4)
      const bw = mwBw * (0.7 + 0.6 * (0.5 + 0.5 * fbm2(al * 0.005, 1.9, 2)));
      let v = Math.exp(-(dp * dp) / (bw * bw));
      const riftOff = bw * 0.22 * fbm2(al * 0.007, 6.6, 2);
      const rq = (dp - riftOff) / (bw * (0.14 + 0.1 * (0.5 + 0.5 * noise2(al * 0.012, 2.2))));
      v *= 1 - 0.85 * Math.exp(-rq * rq) * smoothstep(0.08 * mwLen, 0.3 * mwLen, al);
      v *= smoothstep(-0.05 * mwLen, 0.2 * mwLen, al);
      return v;
    };

    // ---- per-plane layers on the extended grid
    const LD = [], LC = [];
    for (let k = 0; k <= FG; k++) { LD.push(new Float32Array(nE)); LC.push(new Uint8Array(nE).fill(FNT)); }
    const Y = {
      LD, LC, rim: new Uint8Array(nE), crat: new Uint8Array(nE),
      twA: new Float32Array(nE), twF: new Float32Array(nE), twP: new Float32Array(nE),
      wordCov: new Float32Array(nE), halo: new Uint8Array(nE), cor: new Uint8Array(nE),
      tFg: new Float32Array(colsE), tSea: new Float32Array(colsE), tBt: new Float32Array(colsE),
      tBr: new Float32Array(colsE), tWall: new Float32Array(colsE), tSem: new Float32Array(colsE),
      btBot: btApex + btHt * 1.4, brBot: seaBase + p,
    };
    T.Y = Y;

    // column-wise terrain tops
    const cSem = new Float32Array(colsE), cWall = new Float32Array(colsE), cWallS = new Float32Array(colsE);
    const cBr = new Float32Array(colsE), cBt = new Float32Array(colsE), cFg = new Float32Array(colsE), cFgS = new Float32Array(colsE);
    const cSea = new Float32Array(colsE);
    for (let c = 0; c < colsE; c++) {
      const x = xOf(c);
      cSem[c] = semY(x); cWall[c] = wallY(x); cBr[c] = bromoY(x); cBt[c] = batokY(x); cFg[c] = fgY(x); cSea[c] = seaTop(x);
      cWallS[c] = (wallY(x + p * 0.5) - wallY(x - p * 0.5)) / p;
      cFgS[c] = (fgY(x + p * 0.5) - fgY(x - p * 0.5)) / p;
    }

    yield;
    // wordmark coverage per dot (supersampled over each cell = the true halftone of the letters)
    const SS = 4;
    const wl = W.left - p, wr = W.right + p, wt = W.top - p, wb = W.top + W.cap + p;
    for (let r = 0; r < rows; r++) {
      const y = yOf(r);
      if (y < wt || y > wb) continue;
      for (let cE = 0; cE < colsE; cE++) {
        const x = xOf(cE);
        if (x < wl || x > wr) continue;
        let s = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
          s += W.m(x - W.dx + ((sx + 0.5) / SS - 0.5) * p, y - W.dy + ((sy + 0.5) / SS - 0.5) * p);
        }
        Y.wordCov[r * colsE + cE] = s / (SS * SS);
      }
    }
    yield;
    // halo: one empty ring of dots around the letters so they never touch what is behind
    for (let r = 0; r < rows; r++) for (let c = 0; c < colsE; c++) {
      const j = r * colsE + c;
      if (Y.wordCov[j] > 0.08) continue;
      let near = 0;
      for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= colsE) continue;
        if (Y.wordCov[rr * colsE + cc] > 0.3) { near = 1; break; }
      }
      Y.halo[j] = near;
    }

    // ---- the sea of cloud: three banks, far → near, each a row of rounded billow tops with one
    //      lit rim row that fades into an unlit body; troughs between the banks stay empty (sand)
    const yV = yS - h * 0.04;
    const banks = [];
    const xL0 = -M * p, xR0 = w + M * p;
    for (let k = 0; k < 3; k++) {
      const base = seaBase + h * [0.0, 0.052, 0.115][k];
      const sc = (base - yV) / (seaBase - yV);
      // typical lobe half-width (colour paints the far bank as big cauliflower billows)
      const lw = p * mix(3.6, 4.4, a) * sc * (CM ? [1.9, 1.2, 1.0][k] : 1);
      const lb = [];
      let x = xL0 - lw * (1 + 2 * hash2(k, 1)), m = 0;
      while (x < xR0 + lw * 3) {
        const hw = lw * (0.55 + 0.95 * hash2(m, k * 7 + 1));
        // (colour: the far bank's cauliflower tops vary a lot, so the sea's skyline never reads as a line)
        const ht = hw * (0.34 + 0.22 * hash2(m, k * 7 + 2)) * (CM && k === 0 ? 1.1 + 1.1 * Math.pow(hash2(m, 91), 2) : 1);
        const bx = x + hw;
        const by = base + (k === 0 ? seaTop(bx) - seaBase : h * 0.012 * fbm2(bx * 0.004, k * 3.1, 2)) + (hash2(m, k * 7 + 3) - 0.5) * hw * 0.3;
        lb.push({ x: bx, y: by, hw, ht });
        x += hw * (1.15 + 0.55 * hash2(m, k * 7 + 4));
        m++;
      }
      banks.push({ base, lobes: lb, fade: [1, 0.82, 0.62][k], top: new Float32Array(colsE), sl: new Float32Array(colsE), li: new Int16Array(colsE).fill(-1) });
    }
    yield;
    let topLobe = -1;
    const bankTopAt = (bk, x) => {
      let top = bk.base + h * 0.02;
      topLobe = -1;
      for (let q = 0; q < bk.lobes.length; q++) {
        const o = bk.lobes[q], u = (x - o.x) / o.hw;
        if (u * u < 1) { const yy = o.y - o.ht * Math.sqrt(1 - u * u); if (yy < top) { top = yy; topLobe = q; } }
      }
      return top;
    };
    for (const bk of banks) {
      for (let c = 0; c < colsE; c++) {
        const x = xOf(c);
        bk.top[c] = bankTopAt(bk, x);
        bk.li[c] = topLobe;
        bk.sl[c] = (bankTopAt(bk, x + p * 0.5) - bankTopAt(bk, x - p * 0.5)) / p;
      }
    }
    let seaK = 0, seaE = 0, seaLit = 0, seaU = 0, seaH = 1;
    const seaAt = (c, x, y, tol) => {
      for (let k = banks.length - 1; k >= 0; k--) {
        const bk = banks[k];
        const e = y - bk.top[c];
        if (e < -p * tol) continue;
        const sl = clamp(bk.sl[c], -2.5, 2.5);
        const lit = clamp(0.62 - 0.55 * sl, 0.2, 1.15);           // edges facing up-left catch the light
        const q = (e - p * 0.22) / (p * 0.5);
        const rim = Math.exp(-q * q) * (0.24 + 0.2 * lit);
        const body = 0.1 * lit * Math.exp(-Math.max(0, e) / (p * 1.3));
        seaK = k; seaE = e; seaLit = lit;
        const o = bk.li[c] >= 0 ? bk.lobes[bk.li[c]] : null;
        seaU = o ? clamp((x - o.x) / o.hw, -1, 1) : 0; seaH = o ? o.ht : p;
        return (rim + body) * bk.fade;
      }
      return -1;
    };

    yield;
    // membership tops (the compositor tests y against these)
    let fgMin = 1e9, fgMax = -1e9, seaMin = 1e9, seaMax = -1e9, wallMin = 1e9, wallMax = -1e9, brMin = 1e9, semMin = 1e9;
    for (let c = 0; c < colsE; c++) {
      let st_ = 1e9;
      for (const bk of banks) st_ = Math.min(st_, bk.top[c]);
      Y.tFg[c] = cFg[c] - p * 0.15; Y.tSea[c] = st_ - p * 0.2; Y.tBt[c] = cBt[c]; Y.tBr[c] = cBr[c];
      Y.tWall[c] = cWall[c]; Y.tSem[c] = cSem[c];
      fgMin = Math.min(fgMin, cFg[c]); fgMax = Math.max(fgMax, cFg[c]);
      seaMin = Math.min(seaMin, st_); seaMax = Math.max(seaMax, cSea[c]);
      wallMin = Math.min(wallMin, cWall[c]); wallMax = Math.max(wallMax, cWall[c]);
      brMin = Math.min(brMin, cBr[c]); semMin = Math.min(semMin, cSem[c]);
    }

    const glowTop = yS - h * 0.16;
    const BT_N = 22, BT_BETA = 0.62;   // Batok: gullies around the cone, facet tilt
    const BR_N = 40, BR_BETA = 0.4;
    const hS = (c, r) => hash2(c * 7 + 3, r * 13 + 1), hB = (c, r) => hash2(c * 3 + 11, r * 5 + 7);
    const band = (y0, y1) => [Math.max(0, rowOf(y0) - 2), Math.min(rows - 1, rowOf(y1) + 2)];

    // ----- near ridge: (mono) almost empty, crisp moonlit rim · (colour) green slope, sunlit crest
    {
      const [r0] = band(fgMin - p * 2, fgMax);
      for (let r = r0; r < rows; r++) {
        if ((r & 7) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          const hs = hS(c, r), hb = hB(c, r);
          const fy = cFg[cE], sl = cFgS[cE];
          if (y < fy - p * 1.6) continue;
          const nrm = Math.sqrt(1 + sl * sl);
          const dist = (y - fy) / nrm;
          const lit = clamp((sl * -0.6 + 0.8) / nrm);   // outward normal (sl,-1)/nrm · light (-0.6,-0.8)
          const tuft = 0.85 + 0.3 * noise2(x * 0.018, 1.1);
          const l3 = lit * lit * lit;
          let d = 0, col = FNT;
          const q = (dist - p * 0.2) / (p * 0.62);
          const line = Math.exp(-q * q);
          if (dist < p * 3.2) Y.rim[j] = 1;
          if (!CM) {
            if (dist < p * 3.2) {
              const tail = Math.exp(-Math.max(0, dist) / (p * 1.1));
              d = clamp((0.16 + 0.8 * l3) * tuft * line + 0.16 * l3 * tail);
              col = line > 0.35 ? INK : MUT;
              if (d < 0.06) d = fm(d, hs, 0.06);
            } else {
              d = hs < 0.05 ? 0.03 + 0.05 * hb : 0;
              col = FNT;
            }
          } else {
            // the viewpoint's slope faces us, away from the low sun: shadowed greens, shrubs as
            // clumps of mid-green whose tops catch the light, violet in the shadows (Seurat's
            // complementary), a sunlit yellow-green crest; it thins out toward the page below
            const depth = clamp((y - fy) / (h * 0.24));
            const cl = fbm2(x * 0.017, y * 0.027, 3);
            const shrub = smoothstep(0.1, 0.36, cl);
            const top = smoothstep(0.0, 0.16, cl - fbm2(x * 0.017, (y + p * 1.6) * 0.027, 3));   // clump tops
            const near = 1 - smoothstep(0, p * 7, dist);                 // just under the crest
            const fade = 1 - smoothstep(0.2, 1, depth);                   // thins toward the page below
            const sunL = Math.exp(-Math.abs(x - sunX) / (w * 0.45));
            const body = (0.02 + 0.5 * shrub * (0.45 + 0.55 * top) + 0.08 * near) * fade * fade * smoothstep(-p * 0.2, p * 0.9, dist);
            const crest = (0.34 + 0.56 * l3) * tuft * line;
            if (crest > body && line > 0.2) { d = Math.max(crest, body) * 0.92; col = l3 > 0.5 || (l3 > 0.25 && hb < 0.35) ? (hs < 0.2 * sunL ? GL : G3) : G2; }
            else {
              d = fm(body, hs, 0.13);
              col = shrub > 0.5 ? (top > 0.45 ? (hb < sunL * 0.7 ? G2 : G1) : G0) : hb < 0.3 * shrub + 0.25 ? G0 : GD;
              if (hs > 0.955) col = VSH;                                // violet in the shadows
            }
          }
          LD[FG][j] = d; LC[FG][j] = col;
        }
      }
    }

    yield;
    // ----- the sea of cloud resting on the sand: lit billow crests; troughs empty (mono) / sand (colour)
    {
      const [r0, r1] = band(seaMin - p * 1.5, fgMax + p);
      for (let r = r0; r <= r1; r++) {
        if ((r & 3) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          const hs = hS(c, r), hb = hB(c, r);
          const sea = seaAt(cE, x, y, 1.2);
          if (sea < 0) continue;
          const fy = cFg[cE];
          let d, col;
          if (!CM) {
            let v = sea * (0.85 + 0.3 * noise2(x * 0.011, y * 0.02));
            v *= smoothstep(0, h * 0.06, fy - y);                     // the near ridge's rim stands against black
            d = v;
            col = d > 0.26 ? INK : MUT;
            if (d < 0.06) d = hs < 0.01 ? 0.06 : 0;                   // a few wisps in the creases
          } else {
            // cloud: billows with white-pink sunlit tops and lavender undersides; the far bank is a
            // thick sea filling the valley, the nearer ones lie on the sand as thinning wisps
            const e = seaE;
            const thick = [p * 6.5, p * 2.4, p * 1.5][seaK] * (0.35 + 1.3 * Math.pow(0.5 + 0.5 * fbm2(x * 0.006, seaK * 3.3 + 0.7, 2), 1.5) * 1.6);
            const rip = 0.5 + 0.4 * noise2(x * 0.012, y * 0.16) + 0.2 * fbm2(x * 0.05, y * 0.08, 2);
            const sunK = Math.exp(-Math.abs(x - sunX) / (w * 0.3));     // warm toward the sun, cool away
            // the caldera floor is still in the wall's shadow at sunrise: ochre ripples, sparse, so
            // the jeeps' lights and beams read against it
            const sand = (shade) => {
              const crest = smoothstep(0.42, 0.85, rip);
              d = (0.03 + 0.24 * crest) * (0.85 + 0.3 * hb) * (1 - 0.45 * shade) * (0.85 + 0.3 * sunK);
              col = crest > 0.45 + 0.3 * shade - 0.15 * sunK ? SND : SDD;
              d = fm(d, hs, 0.12);
            };
            if (e < thick) {
              // each billow is a dome: dot size carries it — the sunlit crown and sun-side (left)
              // shoulder are big pink-white / peach dots, it turns lavender as it rounds toward us,
              // and the crease under each roll is small sparse periwinkle so the dark shows through
              const brk = 0.5 + 0.5 * noise2(x * 0.03, seaK * 4.7 + y * 0.01);
              const vv = clamp(Math.max(0, e) / (seaH * 1.5 + p * 1.6));
              const dome = (1 - vv) * (0.68 - 0.32 * seaU) + 0.14 * (brk - 0.5) + 0.06 * (hb - 0.5);
              const dm = clamp(dome);
              d = (0.04 + 0.88 * Math.pow(dm, 1.25)) * (0.92 + 0.16 * noise2(x * 0.02, y * 0.05)) * smoothstep(-p * 0.7, p * 0.2, e);
              if (seaK === 0) {
                if (dm > 0.6) col = hb < sunK * 0.8 ? PCH : CLD;
                else if (dm > 0.4) col = hb < (0.6 - dm) * 4.5 ? CLS : hb > 1 - sunK * 0.3 ? PCH : CLD;
                else if (dm > 0.2) col = hb < (0.4 - dm) * 3 + (1 - sunK) * 0.3 ? CLV : CLS;
                else col = hb < 0.55 * (1 - sunK) ? HZ1 : CLV;
                d = fm(d, hs, 0.1);
              } else {
                // the nearer banks are wisps lying on the sand: thin, broken
                const wisp = smoothstep(0.3, 0.68, brk + 0.25 * (hb - 0.5)) * smoothstep(-0.1, 0.5, dome);
                d *= (seaK === 1 ? 0.85 : 0.72) * wisp;
                col = dm > 0.62 && hb < 0.6 ? (hb < sunK * 0.5 ? PCH : CLD) : dm > 0.36 ? CLS : CLV;
                if (d < 0.08) sand(0.3); else d = fm(d, hs, 0.1);   // sand shows through
              }
            } else sand(smoothstep(thick + p * 2.5, thick, e));
            d *= 0.6 + 0.4 * smoothstep(0, h * 0.03, fy - y);
          }
          LD[FLOOR][j] = d; LC[FLOOR][j] = col;
        }
      }
    }

    yield;
    // ----- Batok: regular radial gullies converging on the summit, lit from the left
    {
      const [r0, r1] = band(btApex - p, Y.btBot);
      for (let r = r0; r <= r1; r++) {
        if ((r & 7) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          if (y < cBt[cE] - p * 1.6) continue;
          const hs = hS(c, r), hb = hB(c, r);
          const sT = cSea[cE];
          const veil = y < sT ? Math.exp((y - sT) / (h * 0.022)) : 1;   // mist the cone bases sink into
          const dx = x - btX;
          const v = clamp((y - btApex) / btHt);
          const uu = 1 - Math.pow(1 - Math.min(v, 0.999), 1 / BT_EXP);
          const halfW = Math.max(p * 0.5, uu * btHalf + btRt * 0.6);
          const sx = clamp(dx / halfW, -1, 1);
          const phi = Math.asin(sx);
          const el = mix(0.72, 1.12, v);                             // steep top, gentler skirt
          const ph = phi * BT_N / TAU + 0.3 + 0.07 * noise2(phi * 2.2, v * 2.5);
          const fr = ph - Math.floor(ph);
          const sn = Math.sin(TAU * fr);
          const del = BT_BETA * Math.sign(sn) * Math.pow(Math.abs(sn), 0.35);
          const spacing = halfW * (TAU / BT_N) * Math.max(0.05, Math.cos(phi));
          const ribAmt = smoothstep(1.5 * p, 2.8 * p, spacing) * smoothstep(0.06, 0.26, v);
          const gq = (fr - 0.5) / 0.085;
          const gully = Math.exp(-gq * gq);
          const l0 = lambert(phi, el), l1 = lambert(phi + del, el) * (1 - 0.8 * gully);
          const lum = mix(l0, l1, ribAmt);
          const edge = y - cBt[cE];
          let d, col;
          if (!CM) {
            d = 0.015 + 0.62 * Math.pow(lum, 1.55);
            col = d > 0.3 ? INK : MUT;
            if (edge < p * 0.9) {                                      // the cone's skyline
              if (dx < 0) { d = Math.max(d, 0.44); col = INK; }
              else { d = Math.max(d, 0.13); }
            }
            d = d * (1 - 0.6 * veil) + fm(0.1 * veil, hs, 0.07) * (d < 0.1 ? 1 : 0);
            if (veil > 0.5 && d < 0.2) col = MUT;
          } else {
            // layered greens, form by dot size: sunlit ribs big yellow-green dots, the gullies and
            // the shadowed east side small deep greens with the dark showing through
            const tone = Math.pow(lum, 1.15) + 0.1 * (hb - 0.5);
            d = 0.04 + 0.74 * Math.pow(lum, 1.5);
            col = tone > 0.74 ? (hs < 0.14 ? GL : G3) : tone > 0.52 ? G2 : tone > 0.32 ? G1 : tone > 0.14 ? G0 : GD;
            d = fm(d, hs, 0.1);
            if (edge < p * 0.9) { d = Math.max(d, dx < 0 ? 0.6 : 0.2); col = dx < 0 ? G3 : G0; }
            if (veil > 0.3) {                                         // its skirt sinks into the cloud
              const mv = smoothstep(0.3, 1, veil);
              if (hs < mv * 0.9) { d = 0.22 + 0.4 * mv * (0.7 + 0.6 * hb); col = mv > 0.55 ? (dx < 0 && hb < 0.4 ? PCH : CLD) : CLS; }
            }
          }
          LD[BATOK][j] = d; LC[BATOK][j] = col;
        }
      }
    }

    yield;
    // ----- Bromo: ash cone with an open crater (lit far lip, dark interior, near lip)
    {
      const [r0, r1] = band(brMin - p, Y.brBot);
      for (let r = r0; r <= r1; r++) {
        if ((r & 7) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          if (y < cBr[cE] - p * 1.6) continue;
          const hs = hS(c, r), hb = hB(c, r);
          const sT = cSea[cE];
          const veil = y < sT ? Math.exp((y - sT) / (h * 0.022)) : 1;
          const dx = x - brX, adx = Math.abs(dx);
          const q = adx / brRw;
          const inCr = q < 1;
          const nearLip = inCr ? brYc + brRy * Math.sqrt(1 - q * q) : 0;
          // outer flanks: gullied, lit on the west
          const below = Math.max(0, y - brYc);
          const halfW = brRw + below / brS;
          const sx = clamp(dx / halfW, -1, 1);
          const phi = Math.asin(sx);
          const ph = phi * BR_N / TAU + 0.35 * fbm2(phi * 3, y * 0.015, 2);
          const fr = ph - Math.floor(ph);
          const sn = Math.sin(TAU * fr);
          const spacing = halfW * (TAU / BR_N) * Math.max(0.05, Math.cos(phi));
          const ribAmt = smoothstep(1.5 * p, 2.6 * p, spacing) * smoothstep(0, brRy * 2, below);
          const del = BR_BETA * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5) * ribAmt;
          const lum = lambert(phi + del, 1.0);
          let d, col;
          if (!CM) { d = 0.02 + 0.36 * Math.pow(lum, 1.4); col = MUT; }
          else {
            // grey-brown ash: the sunlit west gullies big warm dots (peach-grey), the shadowed
            // east flank small dark ash and violet, sparse
            const tone = lum + 0.12 * (hb - 0.5);
            d = 0.05 + 0.62 * Math.pow(lum, 1.5);
            col = tone > 0.72 ? (hs < 0.3 ? PCH : ASH) : tone > 0.42 ? ASH : tone > 0.2 ? ASD : VSH;
            d = fm(d, hs, 0.1);
          }
          const e = y - cBr[cE];
          if (inCr && y < nearLip + p * 1.5) {
            // the crater as mono draws it: a lit far rim, a dark sparse bowl, a near lip
            const nl = y - nearLip;
            const side = clamp(dx / brRw, -1, 1);
            if (e < p * 0.85) {                                       // far lip, lit
              d = 0.5 - 0.12 * side; col = CM ? (side < 0.25 ? (hb < 0.45 ? WCR : PCH) : PCH) : INK; Y.crat[j] = 1;
              if (CM) d += 0.26;
            } else if (nl < -p * 0.55) {                              // looking into the crater
              d = CM ? 0.035 + 0.05 * hb : 0.012; col = CM ? (hs < 0.45 ? VSH : ASD) : MUT; Y.crat[j] = 1;
            } else {                                                  // near lip (two rows)
              d = (nl < p * 0.45 ? 0.38 : 0.2) - 0.1 * side;
              col = CM ? (d > 0.26 ? (side < -0.3 ? PCH : ASH) : ASD) : d > 0.26 ? INK : MUT;
              if (CM) d += 0.08;
            }
          } else if (e < p * 0.9) {                                   // flank skyline, lit on the west
            d = Math.max(d, dx < 0 ? (CM ? 0.5 : 0.34) : 0.12);
            if (dx < 0) col = CM ? PCH : INK;
          }
          if (!CM) d = d * (1 - 0.6 * veil) + fm(0.1 * veil, hs, 0.07) * (d < 0.1 ? 1 : 0);
          else if (veil > 0.3) {                                      // the cloud sea wraps its foot
            const mv = smoothstep(0.3, 1, veil);
            if (hs < mv * 0.9) { d = 0.22 + 0.4 * mv * (0.7 + 0.6 * hb); col = mv > 0.55 ? (dx < 0 && hb < 0.45 ? PCH : CLD) : CLS; }
          }
          LD[BROMO][j] = d; LC[BROMO][j] = col;
        }
      }
    }

    yield;
    // ----- Tengger far wall: (mono) near-black, one moonlit crest row · (colour) blue-violet haze
    //       over layered greens, a gold sunlit rim
    {
      const [r0, r1] = band(wallMin - p, seaMax + p * 2);
      for (let r = r0; r <= r1; r++) {
        if ((r & 7) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          if (y < cWall[cE] - p * 1.6) continue;
          const hs = hS(c, r), hb = hB(c, r);
          const sT = cSea[cE];
          const veil = y < sT ? Math.exp((y - sT) / (h * 0.022)) : 1;
          const e = y - cWall[cE];
          const sunK = Math.exp(-Math.abs(x - sunX) / (w * 0.35));
          const q = (e - p * 0.3) / (p * (CM ? 0.46 + 0.36 * sunK : 0.46));
          const crest = Math.exp(-q * q);
          const sl = cWallS[cE];
          const flute = Math.pow(0.5 + 0.5 * noise2(x * 0.045, e * 0.012 + 0.7), 3);
          let d, col;
          if (!CM) {
            const face = clamp(0.92 - 1.6 * sl, 0.7, 1.12);            // slopes facing up-left catch more moon
            const cI = mix(0.46, 0.21, smoothstep(0.08 * w, 0.92 * w, x)) * face * (0.9 + 0.2 * noise2(x * 0.02, 6.1));
            d = cI * crest;
            col = d > 0.3 ? INK : MUT;
            // erosion flutes, barely there, and the mist gathering at the foot
            const body = 0.03 * flute * smoothstep(p * 1.5, p * 4, e) + 0.1 * veil;
            if (d < 0.06) { d = fm(body, hs, 0.06); col = MUT; }
          } else {
            // backlit escarpment: a gold / rose rim where the sun is behind it, then the wall in its
            // own shadow: violet haze up high, forested flutes going green lower down, mist at the foot
            // the escarpment stands against the sun: a warm rim runs along the whole crest (gold
            // and two dots deep at the sun, rose then orchid with distance), the face below is in
            // its own shadow — small sparse dark dots, the forested flutes a little bigger — and
            // the valley mist thickens toward the foot (rose near the sun, lavender away)
            const rimI = (0.58 + 0.38 * sunK) * crest * (0.9 + 0.2 * noise2(x * 0.02, 6.1));
            const span = Math.max(p * 4, cSea[cE] - cWall[cE]);
            const depth = clamp(e / span);
            const fl = fbm2(x * 0.032, e * 0.016 + 0.7, 2);                  // flutes: blobby ribs
            const rib = smoothstep(0.0, 0.32, fl);
            const lit = clamp(0.5 - 1.4 * sl);                                // flute faces turned to the sun
            const mist = smoothstep(0.32, 1.0, depth + 0.3 * fbm2(x * 0.008, 2.2, 3));
            const body = ((0.04 + 0.1 * rib * (0.6 + 0.8 * lit)) * (1 - mist) + (0.08 + 0.34 * mist) * mist * (0.75 + 0.5 * hb)) * smoothstep(-p * 0.1, p * 1.0, e);
            if (rimI > body && crest > 0.3) {
              d = Math.max(rimI, body);
              col = sunK > 0.62 ? (e < p * 0.4 && hb < 0.6 ? LIT : SK4) : sunK > 0.3 ? SK4 : sunK > 0.13 ? SK3 : RSE;
            } else {
              d = fm(body, hs, 0.1);
              if (mist > 0.3) col = hb < sunK * 0.55 ? RSE : hb < 0.55 ? CLV : HZ1;
              else col = rib > 0.55 ? (hb < 0.3 * lit ? G1 : hb < 0.82 ? G0 : HZ0) : (hb < 0.25 ? VSH : GD);   // forest in shadow
            }
            if (veil > 0.3) {
              const mv = smoothstep(0.3, 1, veil);
              if (hs < mv * 0.9) { d = 0.22 + 0.34 * mv * (0.7 + 0.6 * hb); col = mv > 0.55 ? (hb < sunK * 0.6 ? PCH : CLD) : CLS; }
            }
          }
          LD[WALL][j] = d; LC[WALL][j] = col;
        }
      }
    }

    yield;
    // ----- wordmark: dense bright dots, top-lit, a little haze just above the cut
    for (let r = 0; r < rows; r++) {
      const y = yOf(r);
      if (y < wt || y > wb) continue;
      if ((r & 3) === 0) yield;
      for (let cE = 0; cE < colsE; cE++) {
        const j = r * colsE + cE, x = xOf(cE);
        const cv = Y.wordCov[j];
        if (cv <= 0.0) continue;
        const ty = (y - W.top) / W.cap;
        const haze = smoothstep(yS - W.cap * 0.35, yS + W.cap * 0.1, y);
        const lum = 0.95 - 0.06 * ty - 0.05 * haze + 0.05 * fbm2(x * 0.018, y * 0.018, 2);
        LD[WORD][j] = smoothstep(0.06, 0.94, cv) * lum;
        if (!CM) LC[WORD][j] = INK;
        else {
          // cream; the lower edges (a glyph's underside, and the last rows above the crest) catch
          // the gold of the horizon, and the letters around the sun warm through
          const b1 = r + 1 < rows ? Y.wordCov[j + colsE] : 0, b2 = r + 2 < rows ? Y.wordCov[j + 2 * colsE] : 0;
          const edge = b1 < 0.3 ? 1 : b2 < 0.3 ? 0.5 : 0;
          const cut = smoothstep(cWall[cE] - p * 3.4, cWall[cE] - p * 1.3, y);
          const sk = Math.exp(-Math.hypot(x - sunX, (y - sunY) * 1.4) / (w * 0.07 + sunR));
          const warm = Math.max(edge * 0.9, cut * 0.8) * (0.45 + 0.55 * sk);
          LC[WORD][j] = hB(cE - M, r) < warm ? WGD : WCR;
          // the letters in front of the sun are backlit: their faces fall into violet shadow (small
          // dots), their outlines blaze — the name eclipses the sunrise
          // the edges of the letters facing the sun catch its light (a gold rim, hottest at the sun)
          const bl = Math.exp(-Math.max(0, Math.hypot(x - sunX, y - sunY) - sunR) / (sunR * 1.4 + w * 0.015));
          if (bl > 0.12 && cv > 0.3) {
            const sx = sunX - x, sy = sunY - y;
            const toward = (sx < -p && Y.wordCov[j - 1] < 0.3) || (sx > p && Y.wordCov[j + 1] < 0.3) || (sy < 0 && r > 0 && Y.wordCov[j - colsE] < 0.3);
            if (toward) LC[WORD][j] = bl > 0.3 ? WGD : (hB(cE - M, r) < bl * 3 ? WGD : LC[WORD][j]);
          }
        }
      }
    }
    // ----- colour: the corona — light spilling round the letters that eclipse the sun, two or
    //       three dots wide outside the one empty ring that parts the letters from the sky, gold
    //       at the sun fading to rose. It lives on the wordmark's plane so it pans with the letters.
    if (CM) {
      const R_ = 3, R2 = R_ * R_ + 0.6;
      for (let r = Math.max(0, rowOf(wt) - R_); r <= Math.min(rows - 1, rowOf(wb) + R_); r++) {
        if ((r & 7) === 0) yield;
        const y = yOf(r);
        for (let cE = R_; cE < colsE - R_; cE++) {
          const j = r * colsE + cE, x = xOf(cE);
          if (x < wl - R_ * p || x > wr + R_ * p) continue;
          if (Y.wordCov[j] > 0.04 || y > cWall[cE] - p * 1.5) continue;
          const ds = Math.hypot(x - sunX, (y - sunY) * 1.15);
          const prox = Math.exp(-Math.max(0, ds - sunR * 1.2) / (sunR * 1.6 + w * 0.02));
          if (prox < 0.1 || Y.halo[j]) continue;
          let best = 99;
          for (let dr = -R_; dr <= R_; dr++) {
            const rr = r + dr;
            if (rr < 0 || rr >= rows) continue;
            for (let dc = -R_; dc <= R_; dc++) {
              const q = dr * dr + dc * dc;
              if (q < best && Y.wordCov[rr * colsE + cE + dc] > 0.3) best = q;
            }
          }
          if (best > R2) continue;
          const v = Math.min(1, prox * Math.exp(-(Math.sqrt(best) - 2) / 0.9));
          if (v < 0.12) continue;
          LD[WORD][j] = Math.min(0.95, 0.3 + 0.62 * v);
          LC[WORD][j] = v > 0.4 ? SK4 : v > 0.2 ? SK3 : RSE;
          Y.cor[j] = 1;
        }
      }
    }
    yield;

    yield;
    // ----- Semeru: distant, low contrast, ravines radiating from the summit
    {
      const [r0, r1] = band(semMin - p, wallMax + p);
      for (let r = r0; r <= r1; r++) {
        if ((r & 7) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          if (y < cSem[cE] - p * 1.6) continue;
          const hs = hS(c, r), hb = hB(c, r);
          const dx = x - semX;
          const u = clamp(Math.abs(dx) / semR);
          const ang = Math.atan2(dx, Math.max(2, y - semPeak + semR * 0.05));
          const g = U.ridged2(ang * 9, (y - semPeak) * 0.012, 3);
          const side = dx < 0 ? 1 : 0.5;
          const lum = side * (0.4 + 0.6 * g * g) * (1 - 0.4 * u);
          const sky = y - cSem[cE];
          const foot = smoothstep(glowTop + h * 0.05, yS, y);
          let d, col;
          if (!CM) {
            d = 0.05 + 0.34 * lum;
            if (dx < semFlat) d += 0.14 * Math.exp(-sky / (p * 1.1)); // moonlit western skyline
            d *= 0.92 + 0.16 * hb;
            d *= 1 - 0.45 * foot;                                     // its foot dissolves into the glow
            col = MUT;
          } else {
            // a periwinkle cone in the haze, ravines lavender on the sunward side, its skylines
            // rim-lit (rose-gold to the west, orchid to the east), its foot dissolving into the glow
            const rimK = Math.exp(-sky / (p * 1.1));
            const west = dx < semFlat;
            const ft = smoothstep(semPeak + 0.3 * (yS - semPeak), yS, y);
            d = (0.26 + 0.3 * lum) * (1 - 0.25 * ft) + (west ? 0.24 : 0.12) * rimK;
            d *= 0.92 + 0.16 * hb;
            col = rimK > 0.4 ? (west ? (sky < p * 0.6 ? SK4 : SK3) : SK2) : lum > 0.42 ? (hb < 0.35 ? HZ2 : HZ1) : hb < lum * 1.6 ? HZ1 : HZ0;
            if (hs < ft * 0.8) col = hs < ft * 0.3 ? SK4 : hs < ft * 0.6 ? SK3 : SK2;   // rose-gold haze at its foot
          }
          LD[SEM][j] = d; LC[SEM][j] = col;
        }
      }
    }

    yield;
    // ----- sky
    {
      const r1 = Math.min(rows - 1, rowOf(wallMax) + 2);
      const sunGlowR = h * mix(0.34, 0.3, a);
      // stratus streaks depend on x only: one lookup per column instead of noise per dot
      const strY = [new Float32Array(colsE), new Float32Array(colsE)], strC = [new Float32Array(colsE), new Float32Array(colsE)];
      if (CM) {
        for (let cE = 0; cE < colsE; cE++) {
          const x = xOf(cE);
          for (let s = 0; s < 2; s++) {
            strY[s][cE] = yS - h * [0.075, 0.15][s] + h * 0.012 * fbm2(x * 0.003, s * 4.1, 2);
            strC[s][cE] = smoothstep(0.05, 0.35, fbm2(x * 0.0025 + s * 7, s * 3.3, 3));
          }
        }
      }
      for (let r = 0; r <= r1; r++) {
        if (CM || (r & 3) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          const hs = hS(c, r), hb = hB(c, r);
          let d = 0, col = MUT;
          const mw = milky(x, y);
          if (!CM) {
            const starP = 0.009 + 0.07 * mw;
            const edge = smoothstep(0, h * 0.05, y);              // fade into the page above
            if (hs < starP) {
              const br = Math.pow(hb, 5);
              d = (0.05 + 0.5 * br) * edge;
              col = d > 0.15 ? INK : MUT;
              Y.twA[j] = d > 0.12 ? 0.6 : 0.35;
              Y.twF[j] = 0.6 + 2.2 * hash2(c, r * 3 + 1);
              Y.twP[j] = TAU * hash2(c * 5 + 2, r);
            } else {
              const clump = clamp(0.4 + 0.9 * fbm2(x * 0.026, y * 0.026, 3));
              const dust = mw * clump;
              d = dust > 0.06 && hs < 0.2 + 0.8 * dust ? (0.04 + 0.16 * dust * dust * (0.5 + hb)) * edge : 0;
              col = MUT;
            }
            // pre-dawn glow along the horizon: it shows between the letters and in their counters,
            // so the dark wall reads as terrain standing in front of a lit sky
            const gz = smoothstep(glowTop, yS + p, y);
            if (gz > 0) {
              const gv = 0.03 * gz + 0.2 * Math.pow(gz, 1.5) * (0.85 + 0.3 * fbm2(x * 0.004, y * 0.012, 2)) * mix(1.06, 0.86, x / w);
              const gs = fm(gv, hb, 0.085);
              if (gs > d) { d = gs; col = MUT; Y.twA[j] = 0; }
            }
          } else {
            // dawn painted in dots: indigo at the zenith through violet and rose to gold at the
            // horizon, the sun's glow and soft rays spreading from behind the wall
            const gy = clamp(y / Math.max(1, W.top + W.cap * 0.55));       // dawn reaches up past the letters
            const sdx = x - sunX, sdy = y - sunY;
            const sr = Math.hypot(sdx, sdy * (L.ecl ? 1.05 : 1.3));
            const glow = Math.exp(-sr / sunGlowR), core = Math.exp(-sr / (sunR * 2.3));
            const tex = fbm2(x * 0.006, y * 0.016, 3);
            // crepuscular rays: lit and shadowed wedges fanning up from behind the letters, reaching
            // well above the cap line — lit wedges big warm dots, shadow wedges thin and cool
            let ray = 0;
            if (sdy < -sunR * 0.3) {
              const ang = Math.atan2(-sdy, sdx);
              const wv = 0.5 + 0.5 * Math.cos(ang * 22 + 1.4 * noise2(ang * 2.5, 2.3));
              const reach = Math.exp(-sr / (h * 1.2)) * smoothstep(sunR * 1.3, sunR * 3.4, sr) * smoothstep(h * 0.02, h * 0.16, y);
              ray = (wv * wv * 1.9 - 0.62) * reach;
            }
            // the horizon away from the sun stays rose; only the sun's own glow goes gold → pale
            const warm = clamp(Math.pow(gy, 0.8) * 0.74 + 0.4 * glow + 0.75 * core + 0.08 * tex - 0.08 + 0.3 * ray);
            d = 0.04 + 0.36 * Math.pow(gy, 1.7) + 0.3 * glow + 0.5 * core;
            d *= (0.84 + 0.32 * (0.5 + 0.5 * fbm2(x * 0.013, y * 0.024, 3))) * (1 + 0.6 * ray);
            if (d > 0.95) d = 0.95;
            d = fm(d, hash2(c * 11 + 5, r * 3 + 17), 0.22);              // the night still holds the zenith
            // stratus: two thin lit streaks low in the sky
            for (let s = 0; s < 2; s++) {
              const qs = (y - strY[s][cE]) / (p * [0.9, 0.6][s]);
              const st_ = Math.exp(-qs * qs) * strC[s][cE];
              if (st_ > 0.25) { d = Math.max(d, 0.2 + 0.34 * st_ * (0.6 + 0.6 * glow)); }
            }
            let pos = warm * 4 + 1.2 * ray + (hb - 0.5) * 1.2 * (1 - 0.85 * core);
            let idx = clamp(Math.round(pos), 0, 4);
            if (hs < 0.02 && core < 0.15) idx = clamp(idx + (hb < 0.5 ? 2 : -2), 0, 4);    // complementary sprinkle
            // the glow round the sun is gold then rose — never the letters' cream, so they stay legible
            col = SK0 + idx;
            if (core > 0.3) { d = Math.max(d, 0.5 + 0.45 * core); if (core > 0.42 && hb < core * 1.4) col = SK4; }
            d *= smoothstep(-h * 0.02, h * 0.07, y);
            // a few stars still out high up, fading into the dawn
            const starP = (0.01 + 0.05 * mw) * (1 - smoothstep(0.12, 0.45, warm));
            if (hs < starP) {
              d = 0.08 + 0.45 * Math.pow(hb, 4);
              col = STAR;
              Y.twA[j] = 0.45; Y.twF[j] = 0.6 + 2.2 * hash2(c, r * 3 + 1); Y.twP[j] = TAU * hash2(c * 5 + 2, r);
            }
            // the sun's disc
            const sd = Math.hypot(sdx, sdy);
            if (sd < sunR + p * 1.5) {
              const disc = smoothstep(sunR + p * 0.5, sunR - p * 0.5, sd);
              if (disc > 0.08) { d = 0.72 + 0.28 * disc; col = disc > 0.6 && sd < sunR - p * 0.8 ? SUN : SK4; Y.twA[j] = 0; }
              else { d = Math.min(d, 0.3); Y.twA[j] = 0; }                   // a thin dark ring sets the limb off
            }
          }
          // moon
          const mdx = x - moX, mdy = y - moY, mr = Math.hypot(mdx, mdy);
          if (mr < moR + p) {
            const disc = smoothstep(moR + p * 0.5, moR - p * 0.5, mr);
            const mx_ = mdx + moSx * moR * 0.5, my_ = mdy + moSy * moR * 0.5;  // shadow disc, offset away from the lit limb
            const shadow = smoothstep(moR - p * 0.45, moR + p * 0.45, Math.hypot(mx_, my_));
            const lit = disc * shadow;
            Y.twA[j] = 0;
            if (lit > 0.06) { d = (CM ? 0.25 : 0.3) + (CM ? 0.5 : 0.68) * lit; col = CM ? STAR : INK; }
            else if (disc > 0.4) { if (!CM) { d = 0.035 * disc; col = MUT; } else d *= 0.6; }   // earthshine
            else if (!CM) d = 0;
          } else if (!CM && mr < moR * 3) {
            const glow = Math.exp(-(mr - moR) / (moR * 0.6));
            if (hb < glow * 0.8) { d = Math.max(d, 0.03 + 0.03 * glow); if (!Y.twA[j]) col = MUT; }
          }
          LD[SKY][j] = d; LC[SKY][j] = col;
        }
      }
    }

    yield;
    // ---- per-dot (visible) composite at rest, and the buffers a pan composes into
    const B = T.B = {
      twA: new Float32Array(n), twF: new Float32Array(n), twP: new Float32Array(n),
      plE: new Float32Array(n), plA: new Float32Array(n), plB: new Float32Array(n),
      stE: new Float32Array(n), stA: new Float32Array(n), stB: new Float32Array(n), stW: new Float32Array(n),
      stS: new Float32Array(n),     // steam: how near the sun it hangs (colour: backlit)
      fxD: new Float32Array(n), fxC: new Uint8Array(n), fxM: new Uint8Array(n), fxAge: new Float32Array(n), fxS: new Uint8Array(n),
      fxL: new Float32Array(n),     // smoke: which side of its puff a dot sits on (+ = toward the light)
      stamp: new Uint32Array(n), touched: new Int32Array(n), nTouched: 0, frame: 1, nz2: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) B.nz2[i] = noise2(xs[i] * 0.1, ys[i] * 0.1);   // fine smoke grain (static)
    yield;
    T.D0 = new Float32Array(n); T.C0 = new Uint8Array(n); T.K0 = new Uint8Array(n);
    T.Dd = new Float32Array(n); T.Cd = new Uint8Array(n); T.Kd = new Uint8Array(n);
    T.cBase = new Int32Array(FG + 1); T.cFrac = new Float32Array(FG + 1); T.cTop = new Float32Array(cols * 6);
    T.offs = new Float32Array(FG + 1);
    compose(T, T.offs, T.D0, T.C0, T.K0, 0, false);
    const K0 = T.K0;
    const haloV = new Uint8Array(n), cratV = new Uint8Array(n);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, j = r * colsE + c + M;
      haloV[i] = Y.halo[j] || Y.cor[j]; cratV[i] = Y.crat[j];
      if (K0[i] === SKY) { B.twA[i] = Y.twA[j]; B.twF[i] = Y.twF[j]; B.twP[i] = Y.twP[j]; }
    }
    yield;

    // nearest point of a centreline (2 px samples): a coarse pass over every 8th, then refine
    let nearJ = 0, nearD2 = 0;
    const nearest = (pts, nP, x, y) => {
      let best = 1e18, bj = 0;
      for (let j = 0; j < nP; j += 8) {
        const dx = x - pts[j * 3], dy = y - pts[j * 3 + 1], d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bj = j; }
      }
      const j0 = Math.max(0, bj - 8), j1 = Math.min(nP - 1, bj + 8);
      for (let j = j0; j <= j1; j++) {
        const dx = x - pts[j * 3], dy = y - pts[j * 3 + 1], d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bj = j; }
      }
      nearJ = bj; nearD2 = best;
    };

    // ---- Semeru ash plume: geometry is static, puffs are emitted and drift per frame.
    // Centreline: a short vertical column that bends over into the wind (arc-length param).
    const plLen = w * mix(0.6, 0.36, a);
    const plTurn = h * mix(0.045, 0.04, a);
    Object.assign(L, {
      plLen, plV: mix(7, 9, a), plLam: mix(80, 112, a), plR0: p * 1.25, plGrow: mix(0.055, 0.05, a),
    });
    L.plK = Math.ceil(plLen / L.plLam) + 1;
    {
      const pts = [];
      let cx = semX, cy = semPeak - p * 0.3;
      const step = 2;
      for (let sArc = 0; sArc <= plLen; sArc += step) {
        pts.push(cx, cy, sArc);
        const phi = 1.45 * (1 - Math.exp(-sArc / plTurn)) + 0.08 * fbm2(sArc * 0.004, 4.2, 2);
        cx -= Math.sin(phi) * step;
        cy -= Math.cos(phi) * step;
      }
      const nP = pts.length / 3;
      let pminX = 1e9, pmaxX = -1e9, pminY = 1e9, pmaxY = -1e9;
      for (let j = 0; j < nP; j++) {
        const r = L.plR0 + L.plGrow * pts[j * 3 + 2];
        pminX = Math.min(pminX, pts[j * 3] - r * 2.4); pmaxX = Math.max(pmaxX, pts[j * 3] + r * 2.4);
        pminY = Math.min(pminY, pts[j * 3 + 1] - r * 2.4); pmaxY = Math.max(pmaxY, pts[j * 3 + 1] + r * 2.4);
      }
      for (let i = 0; i < n; i++) {
        if ((i & 4095) === 0) yield;
        const k = K0[i];
        if ((k !== SKY && k !== SEM) || haloV[i]) continue;
        const x = xs[i], y = ys[i];
        if (x < pminX || x > pmaxX || y < pminY || y > pmaxY) continue;
        nearest(pts, nP, x, y);
        const bj = nearJ, best = nearD2;
        const al = pts[bj * 3 + 2];
        const rMax = L.plR0 + L.plGrow * al;
        const dist = Math.sqrt(best);
        if (dist > rMax * 2.3 + p) continue;
        const sgn = y < pts[bj * 3 + 1] ? -1 : 1;   // negative = upper (lit) side
        let env = 1 - smoothstep(plLen * 0.5, plLen, al);
        if (k === SEM) env *= 1 - smoothstep(semPeak - p * 1.5, semPeak + p * 0.5, y);
        env *= smoothstep(0, h * 0.035, y);
        if (env <= 0.01) continue;
        B.plE[i] = env; B.plA[i] = al; B.plB[i] = sgn * dist;
      }
    }

    // ---- Bromo steam: a column out of the crater that rises, then lies over in the wind
    //      (colour: taller and denser, white, glowing warm where it drifts in front of the sun)
    {
      const vx = brX - brRw * 0.1, vy = brYc + brRy * 0.35;
      // (colour: the column clears the cap line before it bends, so it shows against the dawn)
      const rise = CM ? Math.max(h * 0.12, (vy - W.top + p * 2) / 1.08) : h * mix(0.085, 0.08, a);
      const len = rise + w * mix(0.24, 0.17, a) * (CM ? 0.95 : 1);
      const pts = [];
      let cx = vx, cy = vy;
      const step = 2;
      for (let sArc = 0; sArc <= len; sArc += step) {
        pts.push(cx, cy, sArc);
        const phi = 1.32 * smoothstep(rise * 0.5, rise * 1.3, sArc) + 0.1 * fbm2(sArc * 0.01, 2.6, 2);
        cx -= Math.sin(phi) * step;
        cy -= Math.cos(phi) * step;
      }
      const nP = pts.length / 3;
      const wdOf = (al) => p * 1.5 + al * 0.1;
      let pminX = 1e9, pmaxX = -1e9, pminY = 1e9, pmaxY = -1e9;
      for (let j = 0; j < nP; j++) {
        const r = wdOf(pts[j * 3 + 2]) * 2.4 + p;
        pminX = Math.min(pminX, pts[j * 3] - r); pmaxX = Math.max(pmaxX, pts[j * 3] + r);
        pminY = Math.min(pminY, pts[j * 3 + 1] - r); pmaxY = Math.max(pmaxY, pts[j * 3 + 1] + r);
      }
      L.stF = 0.05;
      const env0 = CM ? 0.66 : 0.42;
      for (let i = 0; i < n; i++) {
        if ((i & 4095) === 0) yield;
        const k = K0[i];
        if (!(k === SKY || k === SEM || k === WORD || k === WALL || cratV[i])) continue;
        const x = xs[i], y = ys[i];
        if (x < pminX || x > pmaxX || y < pminY || y > pmaxY || y > vy) continue;
        nearest(pts, nP, x, y);
        const bj = nearJ, best = nearD2;
        const al = pts[bj * 3 + 2];
        const wd = wdOf(al);
        const dist = Math.sqrt(best);
        if (dist > wd * 2.3 + p) continue;
        const env = env0 * (1 - smoothstep(len * 0.4, len, al)) * smoothstep(-p, p * 1.5, al);
        if (env <= 0.01) continue;
        const j1 = Math.min(nP - 1, bj + 1), j0 = j1 - 1;
        const tx = pts[j1 * 3] - pts[j0 * 3], ty = pts[j1 * 3 + 1] - pts[j0 * 3 + 1];
        const sgn = tx * (y - pts[bj * 3 + 1]) - ty * (x - pts[bj * 3]) < 0 ? -1 : 1;
        B.stE[i] = env; B.stA[i] = al; B.stB[i] = sgn * dist; B.stW[i] = wd;
        if (CM) B.stS[i] = Math.exp(-Math.max(0, Math.hypot(x - sunX, (y - sunY) * 1.2) - sunR) / (sunR * 2.2));
      }
    }

    // ---- jeep convoys on the sand sea, in the troughs between the cloud banks
    {
      // each track runs mid-trough between bank k's rim and bank k+1's billow tops, smoothed
      L.tracks = [0, 1].map((k) => {
        const raw = new Float32Array(colsE), ty = new Float32Array(colsE);
        for (let c = 0; c < colsE; c++) raw[c] = (banks[k].top[c] + banks[k + 1].top[c]) * 0.5 + p * 0.6;
        const R_ = Math.max(2, Math.round(w * 0.012 / p));
        for (let c = 0; c < colsE; c++) {
          let sum = 0, nn = 0;
          for (let d = -R_; d <= R_; d++) { const cc = c + d; if (cc >= 0 && cc < colsE) { sum += raw[cc]; nn++; } }
          ty[c] = sum / nn;
        }
        return ty;
      });
      const v = clamp(w * 0.0048, 3.2, 7.5);
      L.convoys = [
        { tr: 0, dir: -1, x0: w * 0.92, v, n: 4, gap: p * 3.6, ph: 0 },
        { tr: 1, dir: 1, x0: w * 0.1, v: v * 0.8, n: 3, gap: p * 4.0, ph: 2.1 },
        { tr: 0, dir: -1, x0: w * 0.4, v: v * 1.05, n: 2, gap: p * 3.4, ph: 4.2 },
        { tr: 1, dir: 1, x0: w * 0.68, v: v * 0.85, n: 2, gap: p * 3.8, ph: 5.3 },
      ];
    }
    // ---- hikers' headlamps climbing the viewpoint, warung lanterns glowing on the ridge
    //      (few and readable: each light is one bright dot in a dark collar with a soft glow ring)
    {
      const lamps = [];
      const xs_ = a > 0.5 ? [0.06, 0.17, 0.29] : [0.08, 0.27];
      xs_.forEach((u, k) => lamps.push({ walk: 0, x: w * u, dy: p * (2.4 + 1.4 * hash2(k, 31)), ph: TAU * hash2(k, 32), f: 5 + 3 * hash2(k, 33) }));
      const nw = a > 0.5 ? 4 : 2;
      for (let k = 0; k < nw; k++) lamps.push({ walk: 1, x0: w * 0.42, x1: w * 0.01, u0: hash2(k, 41), v: 2.2 + 1.2 * hash2(k, 42), dy: p * (1.3 + 0.8 * hash2(k, 43)), ph: TAU * hash2(k, 44) });
      L.lamps = lamps;
    }

    let crest = 0;
    for (let c = 0; c < cols; c++) crest += cFg[c + M];
    T.horizon = +(crest / cols / h).toFixed(3);
    T.skyline = +(yS / h).toFixed(3);
  }

  // ---------------------------------------------------------------- compositor
  // Paints the planes far → near with each plane shifted by its own parallax offset (offs[k], px),
  // sub-dot shifts by linear interpolation of the plane's coverage. offs = 0 reproduces the rest
  // composite exactly.
  function compose(S, offs, D, C, K, t, tw) {
    const L = S.L, Y = S.Y, p = L.p, cols = L.cols, rows = L.rows, M = L.M, colsE = L.colsE;
    const base = S.cBase, frac = S.cFrac, T = S.cTop;
    for (let k = 0; k <= FG; k++) {
      const u = M - offs[k] / p;
      const b = Math.max(0, Math.min(colsE - cols - 1, Math.floor(u)));
      base[k] = b; frac[k] = clamp(u - b);
    }
    const tops = [Y.tFg, Y.tSea, Y.tBt, Y.tBr, Y.tWall, Y.tSem], lay = [FG, FLOOR, BATOK, BROMO, WALL, SEM];
    for (let q = 0; q < 6; q++) {
      const arr = tops[q], b = base[lay[q]], f = frac[lay[q]], o = q * cols;
      for (let c = 0; c < cols; c++) { const ce = c + b; T[o + c] = arr[ce] + (arr[ce + 1] - arr[ce]) * f; }
    }
    const bW = base[WORD], fW = frac[WORD];
    const LDs = Y.LD, LCs = Y.LC, wc_ = Y.wordCov, halo = Y.halo, rim = Y.rim, cor = Y.cor;
    const btBot = Y.btBot, brBot = Y.brBot, c2 = cols * 2, c3 = cols * 3, c4 = cols * 4, c5 = cols * 5;
    for (let r = 0; r < rows; r++) {
      const y = L.oy + r * p, rowE = r * colsE, rowV = r * cols;
      for (let c = 0; c < cols; c++) {
        const i = rowV + c;
        let k;
        if (y >= T[c]) k = FG;
        else if (y >= T[cols + c]) k = FLOOR;
        else if (y >= T[c2 + c] && y < btBot) k = BATOK;
        else if (y >= T[c3 + c] && y < brBot) k = BROMO;
        else if (y >= T[c4 + c]) k = WALL;
        else {
          const je = rowE + c + bW;
          const wc = wc_[je] + (wc_[je + 1] - wc_[je]) * fW;
          if (wc > 0.04) {
            if (y > T[c4 + c] - p * 1.05) { D[i] = 0; C[i] = FNT; K[i] = WORD; continue; }   // one empty row parts letters from the crest
            k = WORD;
          } else if (cor[fW < 0.5 ? je : je + 1]) k = WORD;
          else if (halo[fW < 0.5 ? je : je + 1]) { D[i] = 0; C[i] = FNT; K[i] = WORD; continue; }
          else if (y >= T[c5 + c]) k = SEM;
          else k = SKY;
        }
        const ce = rowE + c + base[k], f = frac[k];
        const ld = LDs[k];
        let d = f ? ld[ce] + (ld[ce + 1] - ld[ce]) * f : ld[ce];
        const jn = f < 0.5 ? ce : ce + 1;
        C[i] = LCs[k][jn];
        if (k === FG && rim[jn]) k = RIM;
        else if (tw && k === SKY) { const ta = Y.twA[jn]; if (ta > 0) d *= 1 - ta * (0.5 + 0.5 * Math.sin(t * Y.twF[jn] + Y.twP[jn])); }
        D[i] = d; K[i] = k;
      }
    }
  }

  // ---------------------------------------------------------------- interaction
  // the drag follows 1:1 inside the range, then rubber-bands asymptotically (no hard wall)
  function rubber(L, raw) {
    const lim = L.camMax, R = L.camRb, a = Math.abs(raw);
    return a <= lim ? raw : Math.sign(raw) * (lim + R * (1 - 1 / (1 + (a - lim) / R)));
  }
  function unrubber(L, cam) {
    const lim = L.camMax, R = L.camRb, a = Math.abs(cam);
    if (a <= lim) return cam;
    const u = Math.min(0.97, (a - lim) / R);
    return Math.sign(cam) * (lim + R * (1 / (1 - u) - 1));
  }

  // the site's custom cursor reads data-cursor on pointerover only: set it and re-dispatch one
  function setCursor(S, st, cur) {
    if (S.cur === cur) return;
    if (S.cvSt !== st) {
      S.cvSt = st; S.cv = null;
      const all = Halftone.instances ? Array.from(Halftone.instances) : [];
      const ht = all.find((h) => h.st === st);
      if (ht && ht.o && ht.o.autoplay) S.cv = ht.c;
    }
    S.cur = cur;
    const cv = S.cv;
    if (!cv) return;
    cv.dataset.cursor = cur;
    let ev = null;
    try { ev = new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }); } catch (e) { ev = new Event('pointerover', { bubbles: true }); }
    cv.dispatchEvent(ev);
  }

  function update(S, st, dt) {
    const L = S.L;
    if (!L) return;
    const I = S.I, P = st.pointer, now = st.now, red = st.reduced || !!st.still;
    if (I.t0 === null) I.t0 = now;
    if (P.inside && (Math.abs(P.x - I.px) > 0.5 || Math.abs(P.y - I.py) > 0.5)) I.lastMove = now;
    if (P.down) { I.lastIn = now; I.lastMove = now; I.gq = null; }
    I.px = P.x; I.py = P.y;
    let busy = false;

    // camera: the drag follows the pointer (rubber band past the range); released, a spring
    const lim = L.camMax;
    if (P.down && P.moved) {
      if (!I.drag) { I.drag = true; I.ever = true; I.gd = null; I.raw = unrubber(L, I.cam); }
      I.raw += P.dx;
      I.cam = rubber(L, I.raw);
      I.camV = P.vx; busy = true;
    } else if (I.gd) {
      // ghost drag: a finger slides the view sideways and lets go (teaches the move on touch)
      const g = I.gd, u = (now - g.t0) / g.T;
      if (u >= 0 && u < 1) {
        const e = u * u * (3 - 2 * u), de = 6 * u * (1 - u) / g.T;
        I.cam = rubber(L, g.dir * g.D * e); I.camV = g.dir * g.D * de;
      } else if (u > 1.4) I.gd = null;
      busy = true;
    }
    if (!(P.down && P.moved) && !(I.gd && now >= I.gd.t0 && now - I.gd.t0 < I.gd.T)) {
      if (I.drag) { I.drag = false; I.camV = clamp(I.camV * 0.55, -1200, 1200); }
      if (dt > 0 && (I.cam !== 0 || I.camV !== 0)) {
        const steps = Math.max(1, Math.ceil(dt / 0.008)), hh = dt / steps;
        for (let s = 0; s < steps; s++) {
          let acc = -34 * I.cam - 8.2 * I.camV;
          if (I.cam > lim) acc -= 260 * (I.cam - lim); else if (I.cam < -lim) acc -= 260 * (I.cam + lim);
          I.camV += acc * hh; I.cam += I.camV * hh;
        }
        const cap = lim + L.camRb * 1.1;
        I.cam = clamp(I.cam, -cap, cap);
        if (Math.abs(I.cam) < 0.03 && Math.abs(I.camV) < 0.6) { I.cam = 0; I.camV = 0; } else busy = true;
      }
    }

    // timelines
    const RS = I.rockets;
    for (let k = RS.length - 1; k >= 0; k--) if (now - RS[k].t0 > RS[k].life) RS.splice(k, 1);
    const ES = I.erupt;
    for (let k = ES.length - 1; k >= 0; k--) if (now - ES[k].t0 > ES[k].life) ES.splice(k, 1);
    const TP = I.taps;
    for (let k = TP.length - 1; k >= 0; k--) if (now - TP[k].t0 > 0.9) TP.splice(k, 1);
    if (RS.length || ES.length || TP.length || now - I.flash < 3.2 || I.gq || now - I.trT < TR_DUR) busy = true;

    // ghost demo: only when nobody is playing — no input for a while (sooner before the first ever
    // touch), nothing the visitor set off still alive, the pointer outside or resting a long time
    let mine = I.userFlash && now - I.flash < 3.2;
    for (let k = 0; k < RS.length && !mine; k++) if (RS[k].user) mine = true;
    for (let k = 0; k < ES.length && !mine; k++) if (ES[k].user) mine = true;
    const quiet = now - Math.max(I.lastIn, I.lastMove, I.t0) > (I.ever ? G_QUIET : G_FIRST);
    const still = !P.inside || now - I.lastMove > G_STILL;
    const idle = !red && !P.down && !I.drag && (st.progress || 0) > 0.72 && quiet && still && !mine;
    if (!idle) I.ghostNext = Math.max(I.ghostNext, now + 0.9);
    else if (now >= I.ghostNext && !I.gq && !I.gd) {
      const k = I.ghostK++;
      const pick = k % 6;                     // launch · Bromo · drag · launch · beams · Semeru
      const p = L.p;
      if (pick === 2) I.gd = { t0: now + 0.35, T: 1.1, dir: (k / 6 | 0) % 2 ? -1 : 1, D: lim * 0.85, x0: L.w * 0.5, y: L.h * 0.6 };
      else {
        const sx = L.w * (0.22 + 0.56 * hash2(k, 71)), sy = L.h * (0.06 + 0.12 * hash2(k, 72));
        let kind = 'launch', x = sx, y = sy;
        if (pick === 1) { kind = 'bromo'; x = L.brX; y = L.brYc + p * 3; }
        else if (pick === 5) { kind = 'semeru'; x = L.semX + p * 2; y = L.semPeak + p * 5; }
        else if (pick === 4) {
          kind = 'beams'; x = L.w * 0.3;
          const tr = L.tracks[0], u = clamp((x - L.ox) / p + L.M, 0, L.colsE - 1) | 0;
          y = tr[u] + p * 2;
          if (kindAt(S, x, y) !== FLOOR) { kind = 'launch'; x = sx; y = sy; }
        }
        tap(S, now, x, y, true);
        I.gq = { kind, x, y, at: now + 0.38, user: false };
      }
      I.ghostNext = now + G_EVERY;
    }
    if (I.gq && now >= I.gq.at) {
      const q = I.gq;
      I.gq = null;
      if (q.kind === 'bromo') erupt(S, st, 0, 0.75, false);
      else if (q.kind === 'semeru') erupt(S, st, 1, 0.8, false);
      else if (q.kind === 'beams') { I.flash = now; I.userFlash = false; }
      else launch(S, st, q.x, q.y, false);
    }

    // the cursor label says what a click does right here
    if (P.inside || I.drag) {
      const k = I.drag ? -1 : kindAt(S, P.x, P.y);
      setCursor(S, st, I.drag ? 'Drag' : volcanoAt(S, P.x, P.y, k) >= 0 ? 'Erupt' : k === FLOOR ? 'Beams' : 'Launch');
    }

    // background pre-build of the other colour mode (a few ms per frame)
    if (!P.down && now >= S.preAt) prebuild(S, st, 2.5);
    if (busy) st.busy = true;
  }

  function kindAt(S, x, y) {
    const L = S.L;
    const c = clamp(Math.round((x - L.ox) / L.p), 0, L.cols - 1), r = clamp(Math.round((y - L.oy) / L.p), 0, L.rows - 1);
    return S.K[r * L.cols + c];
  }

  // which volcano a point belongs to, by silhouette: the cloud sea wrapping a cone's foot still
  // counts as that cone (0 = Bromo / Batok, 1 = Semeru, -1 = none)
  function volcanoAt(S, x, y, k) {
    const L = S.L, p = L.p;
    if (k === SEM) return 1;
    if (k === BROMO || k === BATOK) return 0;
    if (k !== FLOOR) return -1;
    // only the cloud just wrapping a cone counts — deeper in the sea it is the sand (beams)
    const cE = clamp(Math.round((x - S.offs[FLOOR] - L.ox) / p) + L.M, 0, L.colsE - 1);
    if (y > S.Y.tSea[cE] + p * 3.5) return -1;
    const below = y - L.brYc, bx = x - S.offs[BROMO];
    if (below > -L.brRy && y < L.seaBase + p * 2 && Math.abs(bx - L.brX) < L.brRw + Math.max(0, below) / L.brS) return 0;
    if (y < L.seaBase + p * 2 && y > L.batokY(x - S.offs[BATOK])) return 0;
    return -1;
  }

  // the instant answer to any tap: a ring of dots expanding where the finger / cursor came down
  function tap(S, now, x, y, ghost) {
    const I = S.I;
    I.taps.push({ x, y, t0: now, ghost });
    if (I.taps.length > 8) I.taps.shift();
  }

  function launch(S, st, x, y, user) {
    const L = S.L, I = S.I, now = st.now;
    const oPad = I.cam * PX_PAD;
    const tx = clamp(x - oPad, L.w * 0.03, L.w * 0.97);
    const ty = Math.min(y, L.padY - L.h * 0.3);
    const H = L.padY - ty;
    const dist = Math.hypot(tx - L.padX, H);
    const R = { t0: now, tx, ty, H, k: 2.8, id: I.nR++, life: 14, user: !!user, T: 0.72 + 0.7 * dist / Math.max(L.h, 320), P: {}, Q: {} };
    R.tSt = HOLD + R.T * Math.pow(S_ST, 1 / SEXP);
    R.tHit = HOLD + R.T;                       // reaches the target (s = 1)
    // where and how fast the first stage is when it separates (for its tumble)
    rpos(L, R, S_ST, R.Q);
    const dsdt = SEXP * Math.pow(R.tSt - HOLD, SEXP - 1) / Math.pow(R.T, SEXP);
    R.st = { x: R.Q.x, y: R.Q.y, ux: R.Q.ux, uy: R.Q.uy, vx: R.Q.ux * R.Q.sp * dsdt, vy: R.Q.uy * R.Q.sp * dsdt, w: (hash2(R.id, 7) < 0.5 ? -1 : 1) * (1.8 + 1.2 * hash2(R.id, 8)) };
    I.rockets.push(R);
    if (I.rockets.length > MAX_R) I.rockets.shift();
  }

  function erupt(S, st, vol, sc, user) {
    const I = S.I;
    I.erupt.push({ vol, t0: st.now, id: I.nE++, life: 11, sc: sc || 1, user: !!user });
    if (I.erupt.length > MAX_E) I.erupt.shift();
  }

  function click(S, x, y, st) {
    const L = S.L;
    if (!L) return;
    const I = S.I;
    I.lastIn = st.now; I.ever = true; I.gq = null;
    const k = kindAt(S, x, y), vol = volcanoAt(S, x, y, k);
    tap(S, st.now, x, y, false);
    if (vol >= 0) erupt(S, st, vol, 1, true);
    else if (k === FLOOR) { I.flash = st.now; I.userFlash = true; }
    else launch(S, st, x, k >= FG ? Math.min(y, L.yS - L.h * 0.12) : y, true);
  }

  function keyDown(S, key, st) {
    const L = S.L;
    if (!L) return false;
    const I = S.I;
    switch (key) {
      case ' ': case 'Enter': case 'ArrowUp': {
        const k = I.nR;
        launch(S, st, L.w * (0.2 + 0.6 * hash2(k, 3)), L.h * (0.05 + 0.14 * hash2(k, 4)), true);
        break;
      }
      case 'ArrowLeft': I.camV += L.camMax * 4.2; break;
      case 'ArrowRight': I.camV -= L.camMax * 4.2; break;
      case 'e': case 'E': erupt(S, st, I.nE % 3 === 2 ? 1 : 0, 1, true); break;
      default: return false;
    }
    I.lastIn = st.now; I.ever = true; I.gq = null;
    return true;
  }

  // ---------------------------------------------------------------- per frame
  const rocketAt = (L, s) => {
    const x = L.padX + L.downrange * Math.pow(s, TURN_EXP);
    const y = L.padY - s * L.climbH;
    const tx = L.downrange * TURN_EXP * Math.pow(Math.max(s, 1e-4), TURN_EXP - 1), ty = -L.climbH;
    const tl = Math.hypot(tx, ty);
    return { x, y, ux: tx / tl, uy: ty / tl };
  };
  const altOf = (p) => (p <= P_IGN ? 0 : Math.pow((p - P_IGN) / (1 - P_IGN), ALT_EXP));
  const emitOf = (s) => P_IGN + (1 - P_IGN) * Math.pow(Math.min(Math.max(s, 0), 1), 1 / ALT_EXP);
  // click rockets: x ∝ s^k toward the target (gravity turn), y linear in s
  function rpos(L, R, s, o) {
    const dx = R.tx - L.padX;
    o.x = L.padX + dx * Math.pow(s, R.k);
    o.y = L.padY - R.H * s;
    const tx = dx * R.k * Math.pow(Math.max(s, 1e-4), R.k - 1), ty = -R.H, tl = Math.hypot(tx, ty);
    o.ux = tx / tl; o.uy = ty / tl; o.sp = tl;
    return o;
  }

  function touch(B, i) {
    if (B.stamp[i] !== B.frame) { B.stamp[i] = B.frame; B.touched[B.nTouched++] = i; B.fxD[i] = 0; B.fxM[i] = 0; B.fxAge[i] = 1; }
  }

  // soft disc of smoke / ash (fx mode 2) on dots no nearer than plane maxK
  function puff(S, cx, cy, rx, ry, I, age, maxK, src) {
    const L = S.L, B = S.B, K = S.K, p = L.p, cols = L.cols;
    const c0 = Math.max(0, Math.floor((cx - rx - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((cx + rx - L.ox) / p));
    const r0 = Math.max(0, Math.floor((cy - ry - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((cy + ry - L.oy) / p));
    if (c0 > c1 || r0 > r1) return;
    const irx = 1 / rx, iry = 1 / ry;
    for (let r = r0; r <= r1; r++) {
      const dy = (L.oy + r * p - cy) * iry, dy2 = dy * dy;
      if (dy2 >= 1) continue;
      for (let c = c0; c <= c1; c++) {
        const dx = (L.ox + c * p - cx) * irx, q = dx * dx + dy2;
        if (q >= 1) continue;
        const i = r * cols + c;
        if (K[i] > maxK) continue;
        const v = I * Math.sqrt(1 - q);
        touch(B, i);
        // fxL: + on the side of the puff that faces the low sun (left, a little below)
        if (v > B.fxD[i] && B.fxM[i] !== 1) { B.fxD[i] = v; B.fxAge[i] = age; B.fxM[i] = 2; B.fxS[i] = src; B.fxL[i] = -0.92 * dx + 0.3 * dy; }
      }
    }
  }

  // a point (spark, lamp, lava bomb) splatted bilinearly onto the 4 nearest dots of planes [k0, k1];
  // mode 1 = opaque, 3 = light (never dims what is there)
  function splat(S, x, y, v, col, k0, k1, mode, gam) {
    if (gam === undefined) gam = 0.8;
    const L = S.L, B = S.B, K = S.K, p = L.p;
    const u = (x - L.ox) / p, w_ = (y - L.oy) / p;
    const c0 = Math.floor(u), r0 = Math.floor(w_), fx = u - c0, fy = w_ - r0;
    for (let dr = 0; dr < 2; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= L.rows) continue;
      const wy = dr ? fy : 1 - fy;
      for (let dc = 0; dc < 2; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= L.cols) continue;
        const i = r * L.cols + c, kk = K[i];
        if (kk < k0 || kk > k1) continue;
        const vv = v * Math.pow((dc ? fx : 1 - fx) * wy, gam);
        if (vv < 0.03) continue;
        touch(B, i);
        const cur = B.fxM[i] === 1 || B.fxM[i] === 3 ? B.fxD[i] : mode === 3 ? S.D[i] : 0;
        if (vv <= cur) continue;
        B.fxM[i] = mode; B.fxD[i] = vv; B.fxC[i] = col;
      }
    }
  }

  function frame(S, st, t) {
    const B = S.B, L = S.L, I = S.I, p = L.p;
    for (let j = 0; j < B.nTouched; j++) { const i = B.touched[j]; B.fxM[i] = 0; B.fxD[i] = 0; }
    B.nTouched = 0; B.frame++;
    // camera pan → per-plane offsets → composite
    const cam = I.cam;
    let sh = 0;
    for (let k = 0; k < I.erupt.length; k++) {
      const E = I.erupt[k], tau = st.now - E.t0;
      if (tau > 0 && tau < 0.9) sh += (E.vol === 0 ? 2.6 : 1.4) * E.sc * Math.sin(tau * 52 + E.id) * Math.exp(-tau / 0.2);
    }
    S.pan = Math.abs(cam) > 0.04 || Math.abs(sh) > 0.05;
    for (let k = 0; k <= FG; k++) S.offs[k] = S.pan ? cam * PX[k] + sh : 0;
    S.oPad = S.pan ? cam * PX_PAD + sh : 0;
    if (S.pan) {
      compose(S, S.offs, S.Dd, S.Cd, S.Kd, t, true);
      S.D = S.Dd; S.C = S.Cd; S.K = S.Kd;
      S.shSem = Math.round(S.offs[SEM] / p); S.shBr = Math.round(S.offs[BROMO] / p);
    } else { S.D = S.D0; S.C = S.C0; S.K = S.K0; S.shSem = 0; S.shBr = 0; }
    const now = st.now, red = st.reduced || !!st.still;
    const prog = clamp(st.progress || 0);
    // mode-change sweep (sample() reads S.tr / trX / trY / trR)
    const trA = now - I.trT;
    if (trA >= 0 && trA < TR_DUR && !red) {
      const u = trA / TR_DUR;
      S.trOn = true; S.tr = 1 - (1 - u) * (1 - u);
      S.trX = I.trX; S.trY = I.trY;
      S.trR = 1.45 * Math.hypot(Math.max(I.trX, L.w - I.trX), Math.max(I.trY, L.h - I.trY));
    } else { S.trOn = false; S.tr = 0; }

    // kinematics
    const s = altOf(prog);
    const ign = smoothstep(P_IGN - 0.03, P_IGN + 0.01, prog);  // engine light-up envelope (no pop)
    const R = rocketAt(L, s);
    R.x += S.oPad;
    const climb = s * L.climbH;
    const RS = I.rockets;
    for (let k = 0; k < RS.length; k++) {
      const r = RS[k], tau = now - r.t0;
      r.tau = tau;
      r.s = Math.pow(Math.max(0, tau - HOLD) / r.T, SEXP);
      rpos(L, r, r.s, r.P);
      r.P.x += S.oPad;
      r.staged = tau > r.tSt;
    }

    // 1. smoke and ash
    if (ign > 0.001) mainExhaust(S, t, prog, s, ign);
    for (let k = 0; k < RS.length; k++) rocketSmoke(S, RS[k], t);
    for (let k = 0; k < I.erupt.length; k++) ashFx(S, I.erupt[k], now - I.erupt[k].t0);
    // 2. turbulent texture + colour of every smoke dot
    smokeTexture(S, t);
    // 3. light: pad floodlights before launch, flames lighting mist, smoke and the ridge
    mainLights(S, t, R, ign, climb);
    for (let k = 0; k < RS.length; k++) rocketLights(S, RS[k], now);
    for (let k = 0; k < I.erupt.length; k++) craterGlow(S, I.erupt[k], now - I.erupt[k].t0);
    // 4. the tower, then the rockets (opaque, in front of all but the near ridge)
    tower(S, t, red);
    {
      const flick = 0.5 + 0.5 * Math.sin(t * 23) * Math.sin(t * 13.7);
      const fl = L.rocketL * (1.0 + 0.22 * flick) * ign * (L.CM ? 1.3 : 1);
      rocketBody(S, t, R.x, R.y, R.ux, R.uy, L.rocketL, L.rocketW * 0.5, fl, 1, 1, 1);
    }
    for (let k = 0; k < RS.length; k++) rocketDraw(S, RS[k], now);
    for (let k = 0; k < I.erupt.length; k++) lavaFx(S, I.erupt[k], now - I.erupt[k].t0);
    // 5. life in the valley
    jeeps(S, t, now);
    lamps(S, t, red);
    if (!red) { meteors(S, t); fireflies(S, t); }
    // 6. answers to the hand: tap rings, the rockets' target reticles, the ghost's finger
    for (let k = 0; k < RS.length; k++) reticle(S, RS[k]);
    tapRings(S, now);
    if (I.gd) ghostFinger(S, now);
  }

  // an expanding ring of dots where a tap / click came down (ghost taps look the same: they teach)
  function tapRings(S, now) {
    const L = S.L, X = S.X, p = L.p, TP = S.I.taps;
    for (let k = 0; k < TP.length; k++) {
      const q = TP[k], tau = now - q.t0;
      if (tau < 0 || tau > 0.62) continue;
      const u = tau / 0.62, e = 1 - (1 - u) * (1 - u) * (1 - u);
      const rad = p * (0.9 + 4.6 * e), v = 0.95 * (1 - u * u);
      const N = Math.max(8, Math.round(TAU * rad / (p * 1.25)));
      for (let j = 0; j < N; j++) {
        const an = TAU * j / N + 0.3;
        splat(S, q.x + Math.cos(an) * rad, q.y + Math.sin(an) * rad, v, X.tap, 0, RIM, 1, 0.55);
      }
      if (tau < 0.12) splat(S, q.x, q.y, 1 - tau / 0.12, X.tap, 0, RIM, 1, 0.5);   // the touch itself
    }
  }

  // the rocket's target: a reticle snaps open at the click, settles and turns while the rocket
  // climbs toward it, then flares out with a star burst when the rocket arrives
  function reticle(S, R) {
    const L = S.L, X = S.X, p = L.p, tau = R.tau, hit = R.tHit;
    if (tau < 0 || tau > hit + 0.5) return;
    const cx = R.tx + S.oPad, cy = R.ty;
    let rad, v;
    if (tau < 0.2) { const u = tau / 0.2; rad = p * (0.8 + 2.6 * (1 - (1 - u) * (1 - u))); v = 1; }
    else if (tau < hit) { const u = clamp((tau - 0.2) / 0.35); rad = p * (3.4 - 1.3 * u * u * (3 - 2 * u)); v = 0.8 + 0.2 * Math.sin(tau * 8); }
    else { const u = (tau - hit) / 0.5; rad = p * (2.1 + 4 * u); v = 1 - u; }
    const spin = 0.6 * tau + R.id;
    // a dark collar inside the ring keeps it legible over a bright sky or the letters
    if (L.CM) collar(S, cx, cy, Math.max(p, rad - p * 0.9), 0, WORD, 0.06);
    for (let j = 0; j < 8; j++) {
      const an = spin + TAU * j / 8;
      splat(S, cx + Math.cos(an) * rad, cy + Math.sin(an) * rad, v * (j & 1 ? 0.7 : 1), j & 1 ? X.retLo : X.ret, 0, WORD, 1, 0.5);
    }
    if (tau >= hit - 0.05) {                                   // arrival: a four-point star flare
      const f = clamp(1 - (tau - hit) / 0.45);
      splat(S, cx, cy, f, X.core, 0, WORD, 1, 0.4);
      for (let j = 1; j <= 2; j++) for (let q = 0; q < 4; q++) {
        const ex = [1, -1, 0, 0][q], ey = [0, 0, 1, -1][q];
        splat(S, cx + ex * p * j * (0.6 + 0.6 * (1 - f)), cy + ey * p * j * (0.6 + 0.6 * (1 - f)), f * (j === 1 ? 0.8 : 0.45), j === 1 ? X.ret : X.retLo, 0, WORD, 1, 0.5);
      }
    }
  }

  // the ghost's drag: a fingertip ring presses, slides with the view, lifts
  function ghostFinger(S, now) {
    const L = S.L, X = S.X, p = L.p, g = S.I.gd, tau = now - g.t0;
    if (tau < -0.35 || tau > g.T + 0.3) return;
    const u = clamp(tau / g.T), e = u * u * (3 - 2 * u);
    const x = g.x0 + g.dir * g.D * e, y = g.y;
    const press = tau < 0 ? 1 + tau / 0.35 : tau > g.T ? 1 - (tau - g.T) / 0.3 : 1;
    const rad = p * (3.8 - 1.4 * clamp(press));
    for (let j = 0; j < 12; j++) {
      const an = TAU * j / 12;
      splat(S, x + Math.cos(an) * rad, y + Math.sin(an) * rad, 0.85 * press, X.tap, 0, RIM, 1, 0.55);
    }
    for (let j = 1; j <= 3 && tau > 0 && tau < g.T; j++) splat(S, x - g.dir * p * 1.6 * j - g.dir * rad, y, 0.5 * press * (1 - j / 4), X.tap, 0, RIM, 1, 0.55);
  }

  // shrink the dots of planes [k0, k1] within radius rr to at most dv (a dark collar / corridor)
  function collar(S, x, y, rr, k0, k1, dv) {
    const L = S.L, B = S.B, K = S.K, D = S.D, C = S.C, p = L.p, cols = L.cols;
    const c0 = Math.max(0, Math.floor((x - rr - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((x + rr - L.ox) / p));
    const r0 = Math.max(0, Math.floor((y - rr - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((y + rr - L.oy) / p));
    const r2 = rr * rr;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const dx = L.ox + c * p - x, dy = L.oy + r * p - y;
      if (dx * dx + dy * dy > r2) continue;
      const i = r * cols + c, kk = K[i];
      if (kk < k0 || kk > k1) continue;
      touch(B, i);
      const m = B.fxM[i];
      if (m === 1 || m === 2 || (m === 3 && B.fxD[i] > 0.2)) continue;   // a light, smoke, a lit beam
      const cur = m ? B.fxD[i] : D[i];
      if (cur <= dv) continue;
      if (!m) B.fxC[i] = C[i];
      B.fxM[i] = 1; B.fxD[i] = dv;
    }
  }

  // a light that reads as one: a dark collar on the dots around it, then the light, opaque
  function light(S, x, y, v, col, k0, k1, dv) {
    collar(S, x, y, S.L.p * 1.5, k0, k1, dv === undefined ? 0.05 : dv);
    splat(S, x, y, v, col, k0, k1, 1, 0.45);
  }

  function mainExhaust(S, t, prog, s, ign) {
    const L = S.L, p = L.p;
    const climb = s * L.climbH, Lr = L.rocketL;
    const N = Math.min(320, Math.ceil(Math.max(1, climb) / (p * 0.5)) + 1);
    const wind = L.w * mix(0.1, 0.13, L.a), grow = Math.min(L.w, L.h) * 0.06;
    const ga = Math.max(0, prog - P_IGN + 0.01);
    for (let k = 0; k <= N; k++) {
      const sk = s * k / N;
      const age = Math.max(0, prog - emitOf(sk));
      const P = rocketAt(L, sk);
      const back = (s - sk) * L.climbH;                         // path length behind the nozzle
      const drift = wind * age * (0.2 + 0.8 * sk) * (1 - Math.exp(-age * 4));
      let cx = P.x + S.oPad - drift, cy = P.y - L.h * 0.02 * age;
      let rad = p * 0.75 + grow * Math.pow(age, 0.75) * (0.5 + 0.6 * sk);
      rad *= 0.8 + 0.4 * (0.5 + 0.5 * noise2(sk * 18, 1.7));
      cx += rad * 0.5 * noise2(sk * 7 + 0.3, age * 2.5 + t * 0.05);
      cy += rad * 0.25 * noise2(sk * 7 + 5.1, age * 2.5 + t * 0.04);
      let I = (0.6 * Math.exp(-age * 2.4) + 0.12 * Math.exp(-age * 0.7)) * ign;
      // the flame stays the brightest thing: smoke right behind it is held below it
      if (back < 2 * Lr) I = Math.min(I, 0.5 + 0.1 * back / (2 * Lr));
      let rx = rad, ry = rad;
      // ground cloud: the first stretch billows out along the sand and rises over the ridge
      const gnd = 1 - smoothstep(0, 0.09, sk);
      if (gnd > 0) {
        const gs = Math.sqrt(ga);
        rx += gnd * L.h * 0.15 * gs * (1 + 0.6 * ga);
        ry += gnd * L.h * 0.055 * smoothstep(0, 0.12, ga);
        cy -= gnd * (L.padY - L.crestPad + L.h * 0.035) * smoothstep(0, 0.14, ga);
        cx -= gnd * wind * 0.3 * ga;
        I = Math.max(I, gnd * (0.55 * Math.exp(-ga * 2.2) + 0.1) * ign);
      }
      if (I < 0.02) continue;
      puff(S, cx, cy, rx, ry, I, age, FLOOR, 0);
    }
  }

  function rocketSmoke(S, R, t) {
    const L = S.L, p = L.p, tau = R.tau;
    if (tau <= 0) return;
    const wind = L.w * mix(0.1, 0.13, L.a), grow = Math.min(L.w, L.h) * 0.075;
    const Lr = L.rocketL, dx = R.tx - L.padX;
    const ga = tau / 6;
    let sk = 0, guard = 0;
    const sMax = Math.min(R.s, 2.2);
    while (sk <= sMax && guard++ < 240) {
      const x = L.padX + dx * Math.pow(sk, R.k), y = L.padY - R.H * sk;
      const te = HOLD + R.T * Math.pow(sk, 1 / SEXP);
      const ag = Math.max(0, tau - te) / 5.5;
      const em = te < R.tSt ? 1 : te < R.tSt + COAST ? 0 : 0.6;
      const hgt = Math.min(1, (R.H * sk) / L.climbH);
      const drift = wind * ag * (0.2 + 0.8 * hgt) * (1 - Math.exp(-ag * 4));
      let rad = p * 0.7 + grow * Math.pow(ag, 0.75) * (0.5 + 0.6 * hgt);
      rad *= 0.8 + 0.4 * (0.5 + 0.5 * noise2(sk * 18 + R.id * 3.7, 1.7));
      let cx = x + S.oPad - drift + rad * 0.5 * noise2(sk * 7 + 0.3 + R.id, ag * 2.5 + t * 0.05);
      let cy = y - L.h * 0.02 * ag + rad * 0.25 * noise2(sk * 7 + 5.1 + R.id, ag * 2.5 + t * 0.04);
      let I = (0.6 * Math.exp(-ag * 2.4) + 0.12 * Math.exp(-ag * 0.7)) * em * smoothstep(0, 0.2, tau);
      const back = Math.hypot(R.P.x - (x + S.oPad), R.P.y - y);
      if (back < 2 * Lr) I = Math.min(I, 0.5 + 0.1 * back / (2 * Lr));
      let rx = rad, ry = rad;
      const gnd = 1 - smoothstep(0, 0.07, hgt);
      if (gnd > 0) {
        const gs = Math.sqrt(ga);
        rx += gnd * L.h * 0.1 * gs * (1 + 0.6 * ga);
        ry += gnd * L.h * 0.04 * smoothstep(0, 0.12, ga);
        cy -= gnd * (L.padY - L.crestPad + L.h * 0.03) * smoothstep(0, 0.14, ga);
        cx -= gnd * wind * 0.3 * ga;
        I = Math.max(I, gnd * (0.5 * Math.exp(-ga * 2.2) + 0.08) * smoothstep(0, 0.25, tau) * smoothstep(1.6, 0.9, ga));
      }
      if (I >= 0.02) puff(S, cx, cy, rx, ry, I, ag, FLOOR, 0);
      const sp = Math.hypot(dx * R.k * Math.pow(Math.max(sk, 1e-3), R.k - 1), R.H);
      if (sk < S_ST && sk + Math.max(p * 0.55, rad * 0.42) / sp >= S_ST && tau > R.tSt) {
        const ts = tau - R.tSt, Q = R.st;                          // separation puff
        const sr = p * 1.6 + L.h * 0.05 * Math.pow(ts, 0.6);
        puff(S, Q.x + S.oPad + Q.ux * Lr * 0.44 - wind * 0.08 * ts, Q.y + Q.uy * Lr * 0.44, sr, sr * 0.8, 0.55 * Math.exp(-ts / 1.6) * smoothstep(0, 0.1, ts), ts / 5, FLOOR, 0);
      }
      sk += Math.max(p * 0.55, rad * 0.42) / sp;
    }
  }

  function ashFx(S, E, tau) {
    if (tau < 0) return;
    const L = S.L, p = L.p;
    const bro = E.vol === 0, off = S.offs[bro ? BROMO : SEM], sc = E.sc;
    const vx = (bro ? L.brX - L.brRw * 0.1 : L.semX) + off, vy = bro ? L.brYc : L.semPeak + p * 0.2;
    const NQ = bro ? 8 : 12, maxK = bro ? BROMO : SEM;
    for (let q = 0; q < NQ; q++) {
      const te = q * (bro ? 0.16 : 0.12) + 0.06 * hash2(E.id, q);
      const age = tau - te;
      if (age < 0) continue;
      const hq = hash2(q, E.id + 7);
      let rise, spread, rad;
      if (bro) {
        rise = 0.3 * L.h * sc * (1 - Math.exp(-age / 1.4)) * (0.6 + 0.6 * hq) + age * L.h * 0.008;
        spread = L.brRw * 0.7 * (hash2(q, E.id + 3) - 0.5);
        rad = p * 1.2 + L.h * 0.042 * sc * Math.pow(age, 0.6) * (0.7 + 0.6 * hash2(q, E.id + 5));
      } else {
        // the column punches up, then the head billows out sideways (a cauliflower)
        rise = L.h * sc * (0.035 + 0.075 * hq) * (1 - Math.exp(-age / 0.9)) + age * L.h * 0.006;
        spread = L.w * 0.05 * sc * (hash2(q, E.id + 3) - 0.5) * (0.3 + Math.min(1, age * 0.5)) * hq * 2;
        rad = p * 1.4 + L.h * 0.05 * sc * Math.pow(age, 0.55) * (0.6 + 0.7 * hq);
      }
      const wind = L.w * (bro ? 0.014 : 0.02) * Math.max(0, age - 0.5);
      const cx = vx + spread - wind, cy = vy - rise;
      const I = (bro ? 0.62 : 0.66) * smoothstep(0, 0.25, age) * Math.exp(-age / (bro ? 3.4 : 4.2));
      if (I > 0.02) puff(S, cx, cy, rad, rad * 0.88, I, age / 9, maxK, bro ? 1 : 2);
    }
  }

  function smokeTexture(S, t) {
    const B = S.B, X = S.X, CM = S.L.CM;
    const xs = S.xs, ys = S.ys;
    for (let j = 0; j < B.nTouched; j++) {
      const i = B.touched[j];
      if (B.fxM[i] !== 2) continue;
      const x = xs[i], y = ys[i], age = B.fxAge[i];
      const nz = noise3(x * 0.04 + t * 0.02, y * 0.04, t * 0.04 + age * 1.5) + 0.5 * B.nz2[i];
      let v = B.fxD[i] * (0.78 + 0.45 * nz);
      // billows with holes in them as the column ages, instead of a flat grey wedge
      v *= smoothstep(-0.55, 0.15, nz - 0.9 * age + 0.35);
      if (v > 0.62) v = 0.62;
      v = fm(v, hash2(i, 29), 0.075);
      if (v < 0.015) { B.fxM[i] = 0; continue; }
      B.fxD[i] = v;
      const src = B.fxS[i];
      if (src === 0) {
        if (!CM) B.fxC[i] = age + 0.18 * hash2(i, 3) < 0.35 && v > 0.12 ? X.smHi : X.smLo;
        else {
          // colour: a lit edge toward the sun (big pale dots), a violet shadow side (small, darker
          // than the sky it covers) — so the trail has volume against the painted dawn
          const lit = B.fxL[i] + 0.35 * nz - 0.25 * age;
          B.fxC[i] = lit > 0.15 ? X.smHi : lit > -0.35 ? X.smLo : X.smDk;
          v *= lit > 0.15 ? 1.15 : lit > -0.35 ? 0.9 : 0.62;
          if (v > 0.7) v = 0.7;
          B.fxD[i] = v;
        }
      } else {
        // ash: dark body, the freshly lit tops brighter; Semeru's catch the sunrise pink
        const top = nz > (CM ? 0.08 : 0.25) && age < 0.25;
        if (CM) B.fxC[i] = top ? (src === 2 ? PLP : SMH) : v > 0.1 ? ASH : ASD;
        else B.fxC[i] = top && v > 0.2 ? X.ashHi : X.ashLo;
      }
    }
  }

  // light from a flame low over the ridge: lights mist, smoke and the ridge rim
  function groundLight(S, gx, gy, sig, tI) {
    if (tI <= 0.02) return;
    const L = S.L, B = S.B, K = S.K, D = S.D, C = S.C, X = S.X, p = L.p, cols = L.cols;
    const gr = sig * 3;
    const c0 = Math.max(0, Math.floor((gx - gr - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((gx + gr - L.ox) / p));
    const r0 = Math.max(0, Math.floor((gy - gr - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((gy + gr - L.oy) / p));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        const dx = L.ox + c * p - gx, dy = (L.oy + r * p - gy) * 1.25;
        const q = (dx * dx + dy * dy) / (2 * sig * sig);
        if (q > 4.5) continue;
        const v = Math.exp(-q) * tI;
        const kd = K[i];
        const hsh = hash2(i, 17);
        if (B.stamp[i] === B.frame && B.fxM[i] === 2) {           // exhaust cloud lit from below
          if (hsh < smoothstep(0.1, 0.45, v)) { B.fxC[i] = X.light; B.fxD[i] = Math.min(0.8, B.fxD[i] * (1 + 0.35 * v)); }
          continue;
        }
        if (kd === FG || kd === WORD) continue;
        if (kd === RIM) {
          if (v > 0.1 && C[i] === X.rimHi && D[i] > 0.05) { touch(B, i); B.fxM[i] = 3; B.fxD[i] = Math.min(1, D[i] + 0.25 * v); B.fxC[i] = X.light; }
          continue;
        }
        if (hsh < smoothstep(0.05, 0.42, v)) {
          touch(B, i);
          if (B.fxM[i] === 3 && B.fxD[i] > Math.max(D[i] * 0.8, 0.035 + 0.5 * Math.pow(v, 1.4))) continue;
          B.fxM[i] = 3; B.fxC[i] = X.light;
          B.fxD[i] = Math.max(D[i] * 0.8, 0.035 + 0.5 * Math.pow(v, 1.4));
        }
      }
    }
  }

  // a small halo that rides with a flame
  function flameHalo(S, hx, hy, sig, I) {
    if (I <= 0.01) return;
    const L = S.L, B = S.B, K = S.K, D = S.D, X = S.X, p = L.p, cols = L.cols;
    const gr = sig * 3;
    const c0 = Math.max(0, Math.floor((hx - gr - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((hx + gr - L.ox) / p));
    const r0 = Math.max(0, Math.floor((hy - gr - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((hy + gr - L.oy) / p));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        const kd = K[i];
        if (kd >= FG || kd === WORD) continue;
        const dx = L.ox + c * p - hx, dy = L.oy + r * p - hy;
        const v = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)) * I;
        const hsh = hash2(i, 23);
        if (B.stamp[i] === B.frame && B.fxM[i] === 2) {
          if (v > 0.25 && hsh < v * 1.2) { B.fxC[i] = X.light; B.fxD[i] = Math.min(0.8, B.fxD[i] * (1 + 0.4 * v)); }
          continue;
        }
        if (v > 0.08 && hsh < smoothstep(0.1, 0.55, v)) {
          touch(B, i);
          if (B.fxM[i] === 3 && B.fxD[i] > 0.04 + 0.32 * v * v) continue;
          B.fxM[i] = 3; B.fxC[i] = X.light; B.fxD[i] = Math.max(D[i], 0.04 + 0.32 * v * v);
        }
      }
    }
  }

  function mainLights(S, t, R, ign, climb) {
    const L = S.L, p = L.p, Lr = L.rocketL;
    const fl = 0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 17.3);
    const low = 1 - smoothstep(0, L.h * 0.3, climb);
    const flood = 0.55 * (1 - ign) * (0.95 + 0.05 * Math.sin(t * 1.3));
    const tI = flood + ign * low * fl * 0.85;
    groundLight(S, R.x, Math.min(L.crestPad + p * 0.5, R.y - Lr * 0.2), L.h * (0.042 + 0.03 * ign * low), tI);
    if (ign > 0.01) flameHalo(S, R.x - R.ux * Lr * 0.35, R.y - R.uy * Lr * 0.35, Math.max(p * 1.6, Lr * 0.42), ign * fl);
  }

  function rocketIgn(R) {
    const tau = R.tau;
    let ig = smoothstep(0, 0.12, tau);
    if (tau > R.tSt) ig *= smoothstep(R.tSt + COAST, R.tSt + COAST + 0.14, tau);
    return ig;
  }

  function rocketLights(S, R, now) {
    const L = S.L, p = L.p, Lr = L.rocketL;
    const ig = rocketIgn(R), fl = 0.92 + 0.08 * Math.sin(now * 31 + R.id) * Math.sin(now * 17.3);
    const climb = L.padY - R.P.y;
    const low = 1 - smoothstep(0, L.h * 0.3, climb);
    // ignition: the pad flashes the instant the click lands, before the rocket clears the ridge
    const pf = R.tau >= 0 && R.tau < 0.7 ? Math.exp(-R.tau / 0.16) : 0;
    if (low > 0 || pf > 0) groundLight(S, R.P.x, Math.min(L.crestPad + p * 0.5, R.P.y - Lr * 0.2), L.h * (0.04 + 0.025 * low + 0.03 * pf), Math.max(ig * low * fl * 0.8, pf * 1.05));
    if (pf > 0.08) {
      const X = S.X, px = L.padX + S.oPad, py = L.crestPad - p * 0.4;
      for (let j = -2; j <= 2; j++) splat(S, px + j * p * (1 + 1.5 * (1 - pf)), py - (2 - Math.abs(j)) * p * 0.6 * (1 - pf), pf * (j ? 0.75 : 1), j ? X.flame : X.core, 0, RIM, 1, 0.5);
    }
    if (ig > 0.01 && R.P.y > -Lr) {
      const Lc = R.staged ? Lr * 0.56 : Lr;
      flameHalo(S, R.P.x - R.P.ux * Lc * 0.35, R.P.y - R.P.uy * Lc * 0.35, Math.max(p * 1.5, Lc * 0.42), ig * fl * (R.staged ? 0.8 : 1));
    }
  }

  // rocket body + flame. o = fins, nose, dim
  function rocketBody(S, t, nx, ny, ux, uy, Lr, Wr, fl, fins, nose, dim) {
    const L = S.L, B = S.B, K = S.K, X = S.X, p = L.p, cols = L.cols, CM = L.CM;
    const finW = p * 0.95;
    const ext = Lr + fl + p * 3;
    const cx = nx + ux * (Lr - fl) * 0.5, cy = ny + uy * (Lr - fl) * 0.5;
    const c0 = Math.max(0, Math.floor((cx - ext - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((cx + ext - L.ox) / p));
    const r0 = Math.max(0, Math.floor((cy - ext - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((cy + ext - L.oy) / p));
    if (c0 > c1 || r0 > r1) return;
    const soft = p * 0.45;
    const radAt = (ta) => (!nose || ta < 0.7 ? Wr : Wr * Math.sqrt(Math.max(0, (1 - ta) / 0.3)));
    const flick = noise2(t * 14, 3.1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (K[i] >= FG) continue;
        const dx = L.ox + c * p - nx, dy = L.oy + r * p - ny;
        const al = dx * ux + dy * uy;                          // along the axis (+ toward the nose)
        const ps = -dx * uy + dy * ux;                         // across (+ = right of the axis)
        const pr = Math.abs(ps);
        let v = 0, col = X.rkLit;
        // body: a cylinder with an ogive nose and two fins, lit on the left
        if (al >= -soft && al <= Lr + soft) {
          const ta = al / Lr;
          const rad = radAt(clamp(ta));
          let cov = smoothstep(rad + soft, rad - soft * 0.3, pr) * smoothstep(-soft, soft * 0.3, al) * smoothstep(Lr + soft, Lr - soft * 0.5, al);
          const u = clamp(ps / Wr, -1.4, 1.4);
          let lum = mix(0.68, 0.22, smoothstep(-0.8, 0.8, u));
          if (nose && fins && ta > 0.5 && ta < 0.58) lum *= 0.62;   // interstage
          if (fins && ta < 0.24) {                                 // fins
            const fw = rad + finW * (1 - ta / 0.24);
            const fc = smoothstep(fw + soft, fw - soft * 0.3, pr) * smoothstep(-soft, soft * 0.3, al);
            if (fc > cov) { cov = fc; lum = ps < 0 ? 0.5 : 0.22; }
          }
          v = cov * lum * dim;
          col = u > 0.45 ? X.rkShade : X.rkLit;
          if (cov < 0.08) v = 0;
        }
        // flame below the nozzle: white-hot core, orange plume
        if (fl > 0.5 && al < soft * 0.5 && al > -fl - soft) {
          const tf = clamp(-al / fl);
          const frad = Wr * (1.2 * Math.pow(1 - tf, 0.75) + 0.08) * (0.9 + 0.2 * noise2(al * 0.15 - t * 14, 3.1 + flick * 0.01));
          const fv = smoothstep(frad + soft, frad - soft * 0.4, pr) * (1 - 0.35 * tf);
          if (fv > 0.06 && (v < 0.05 || al < 0)) {
            v = Math.max(fv, 0.25);
            col = tf < 0.26 && pr < Wr * 0.62 ? X.core : X.flame;
            if (col === X.core) v = 0.95;
          }
        }
        if (v < 0.05) {
          // knockout: a one-dot dark ring keeps the rocket legible over the bright letters; inside
          // fresh exhaust the same ring reads as smoke lit by the flame instead of a hole
          // (colour: the same ring, two dots wide, also clears the dense painted sky — a corridor)
          let ring = 0;
          const rw = CM ? p * 2.1 : p * 1.45;
          if (dim > 0.9 && al > -fl - rw - p * 0.15 && al < Lr + rw) {
            const ta = clamp(al / Lr);
            const rad = al < 0 ? Wr * 1.3 : Math.max(radAt(ta), fins && ta < 0.24 ? Wr + finW * (1 - ta / 0.24) : 0);
            if (pr < rad + rw) ring = 1;
          }
          if (ring) {
            const fresh = B.stamp[i] === B.frame && B.fxM[i] === 2;
            if (fresh) { if (al < Lr * 0.4 && fl > 0.5) { B.fxC[i] = X.light; B.fxD[i] = Math.min(0.8, B.fxD[i] * 1.2); } }
            else if (K[i] === WORD) { touch(B, i); if (B.fxM[i] !== 1) { B.fxM[i] = 1; B.fxD[i] = 0; B.fxC[i] = FNT; } }
            else if (CM && K[i] <= WALL) { touch(B, i); if (B.fxM[i] !== 1) { B.fxM[i] = 1; B.fxD[i] = S.D[i] * 0.1; B.fxC[i] = S.C[i]; } }
          }
          continue;
        }
        touch(B, i);
        if (B.fxM[i] === 1 && B.fxD[i] >= v) continue;
        B.fxM[i] = 1; B.fxD[i] = v; B.fxC[i] = col;
      }
    }
  }

  function rocketDraw(S, R, now) {
    const L = S.L, X = S.X, p = L.p, Lr = L.rocketL, Wr = L.rocketW * 0.5, tau = R.tau;
    const P = R.P;
    const ig = rocketIgn(R);
    const flick = 0.5 + 0.5 * Math.sin(now * 23 + R.id) * Math.sin(now * 13.7);
    const onScreen = P.y > -Lr * 2 && P.x > -Lr * 2 && P.x < L.w + Lr * 2;
    if (!R.staged) {
      if (onScreen) rocketBody(S, now, P.x, P.y, P.ux, P.uy, Lr, Wr, Lr * (1 + 0.22 * flick) * ig * (L.CM ? 1.3 : 1), 1, 1, 1);
    } else {
      // upper stage carries on from the old interstage
      const L2 = Lr * 0.56;
      const nx = P.x + P.ux * Lr * 0.44, ny = P.y + P.uy * Lr * 0.44;
      if (onScreen) rocketBody(S, now, nx, ny, P.ux, P.uy, L2, Wr * 0.92, L2 * (1.15 + 0.25 * flick) * ig * (L.CM ? 1.3 : 1), 0, 1, 1);
      // the spent first stage tumbles away and falls
      const ts = tau - R.tSt, Q = R.st;
      const g = L.h * 0.85;
      const sx = Q.x + S.oPad + Q.vx * 0.75 * ts, sy = Q.y + Q.vy * 0.75 * ts + 0.5 * g * ts * ts;
      const th = Q.w * ts, cs = Math.cos(th), sn = Math.sin(th);
      const ux = Q.ux * cs - Q.uy * sn, uy = Q.ux * sn + Q.uy * cs;
      const fade = 1 - smoothstep(1.4, 3.2, ts);
      if (fade > 0.02 && sy < L.h + Lr) rocketBody(S, now, sx, sy, ux, uy, Lr * 0.44, Wr, 0, 1, 0, 0.7 * fade);
      // staging sparkle: a ring of sparks from the interstage
      if (ts < 1.0) {
        const ix = Q.x + S.oPad + Q.ux * Lr * 0.44 + Q.vx * 0.85 * ts, iy = Q.y + Q.uy * Lr * 0.44 + Q.vy * 0.85 * ts;
        for (let j = 0; j < 20; j++) {
          const life = 0.5 + 0.5 * hash2(R.id, j + 20);
          if (ts > life) continue;
          const an = TAU * (j / 20) + 0.5 * hash2(R.id, j + 30);
          const reach = p * (3 + 5 * hash2(R.id, j + 40));        // sparks fly out and are braked by the air
          const k = 1 - Math.exp(-ts * 6);
          const x = ix + Math.cos(an) * reach * k;
          const y = iy + Math.sin(an) * reach * k * 0.85 + 0.5 * L.h * 0.35 * ts * ts;
          const f = Math.pow(1 - ts / life, 1.2);
          splat(S, x, y, f, j % 3 ? X.spark : X.flame, 0, FLOOR, 1, 0.5);
        }
        // a flash where the stages part
        if (ts < 0.16) { const fv = 1 - ts / 0.16; for (let q = 0; q < 5; q++) splat(S, ix + [0, p, -p, 0, 0][q], iy + [0, 0, 0, p, -p][q], q ? 0.7 * fv : fv, q ? X.flame : X.core, 0, FLOOR, 1, 0.5); }
      }
    }
  }

  function craterGlow(S, E, tau) {
    if (tau < 0 || tau > 3.4) return;
    const L = S.L, B = S.B, K = S.K, D = S.D, X = S.X, p = L.p, cols = L.cols;
    const bro = E.vol === 0, off = S.offs[bro ? BROMO : SEM];
    const gx = (bro ? L.brX - L.brRw * 0.1 : L.semX) + off, gy = bro ? L.brYc - L.brRy * 0.2 : L.semPeak + p * 0.6;
    const sig = bro ? L.brRw * 0.62 : p * 2.6;
    const I = E.sc * smoothstep(0, 0.12, tau) * Math.exp(-tau / 1.2);
    const maxK = bro ? FLOOR : SEM;                    // Bromo's fire lights the cloud sea around it
    const gr = sig * 2.6;
    const c0 = Math.max(0, Math.floor((gx - gr - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((gx + gr - L.ox) / p));
    const r0 = Math.max(0, Math.floor((gy - gr - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((gy + gr - L.oy) / p));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      if (K[i] > maxK || K[i] === WORD) continue;
      const dx = L.ox + c * p - gx, dy = (L.oy + r * p - gy) * (L.oy + r * p > gy ? 2.4 : 1.1);
      const v = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)) * I;
      const hsh = hash2(i, 61);
      if (B.stamp[i] === B.frame && B.fxM[i] === 2) {
        if (hsh < smoothstep(0.08, 0.4, v)) B.fxC[i] = X.lava;
        continue;
      }
      if (v > 0.06 && hsh < smoothstep(0.06, 0.5, v)) {
        touch(B, i);
        if (B.fxM[i] === 1) continue;
        B.fxM[i] = 3; B.fxC[i] = v > 0.5 ? X.lavaHot : X.lava; B.fxD[i] = Math.max(D[i], 0.1 + 0.45 * v);
      }
    }
  }

  function lavaFx(S, E, tau) {
    if (tau < 0 || tau > 4.5) return;
    const L = S.L, X = S.X, p = L.p;
    const bro = E.vol === 0, off = S.offs[bro ? BROMO : SEM], sc = E.sc;
    const vx = (bro ? L.brX - L.brRw * 0.1 : L.semX) + off, vy = bro ? L.brYc - L.brRy * 0.1 : L.semPeak + p * 0.3;
    const maxK = bro ? BROMO : SEM;
    if (bro) {
      // a fountain: bombs thrown in a burst over ~0.9 s, short glowing trails, falling back
      const Hh = L.h * 0.2 * sc, g = L.h * 1.15, v0 = Math.sqrt(2 * g * Hh);
      const land = vy + L.brRy * 2.4;
      for (let j = 0; j < 36; j++) {
        const tj = tau - 0.9 * Math.pow(hash2(E.id, j + 40), 1.5);
        if (tj < 0) continue;
        const ang = (hash2(E.id, j + 50) - 0.5) * 1.1;
        const vv = v0 * (0.45 + 0.55 * hash2(E.id, j + 60));
        for (let k = 0; k < 4; k++) {
          const tk = tj - k * 0.03;
          if (tk < 0) break;
          const x = vx + Math.sin(ang) * vv * tk, y = vy - Math.cos(ang) * vv * tk + 0.5 * g * tk * tk;
          if (y > land) break;
          const cool = smoothstep(1.2, 2.2, tk);
          const v = (k === 0 ? 1 : 0.7 - 0.15 * k) * (1 - 0.7 * cool);
          splat(S, x, y, v, k === 0 && cool < (S.L.CM ? 0.8 : 0.5) ? X.lavaHot : X.lava, 0, maxK, 1, 0.5);
        }
      }
    } else {
      // Semeru: a glowing burst at the summit, then incandescent rocks avalanche down the flank
      for (let j = 0; j < 12; j++) {
        const tj = tau - 1.1 * hash2(E.id, j + 40);
        if (tj < 0) continue;
        const side = hash2(E.id, j + 70) < 0.7 ? 1 : -1;
        const ballistic = 0.35;
        let x, y, life = 1;
        if (tj < ballistic) {
          const ang = side * (0.25 + 0.5 * hash2(E.id, j + 50)), vv = L.h * (0.25 + 0.2 * hash2(E.id, j + 60));
          x = vx + Math.sin(ang) * vv * tj; y = vy - Math.cos(ang) * vv * tj + 0.5 * L.h * 2.2 * tj * tj;
        } else {
          const tr = tj - ballistic;
          const run = L.w * (0.03 + 0.06 * hash2(E.id, j + 80)) * (1 - Math.exp(-tr / 1.3));   // slows as it runs out
          x = vx + side * (L.w * 0.012 + run);
          y = L.semY(x - off) - p * 0.4;
          life = 1 - smoothstep(1.6, 3.6, tr);
        }
        const hot = tj < ballistic + 0.25;
        for (let k = 0; k < 3; k++) {
          const v = (k === 0 ? 0.85 : 0.5 - 0.15 * k) * life * sc;
          if (v < 0.05) break;
          splat(S, x - side * k * p * 0.7, y - k * p * 0.25 * (tj < ballistic ? -1 : 1), v, k === 0 && hot ? X.lavaHot : X.lava, 0, maxK, 1, 0.5);
        }
      }
    }
  }

  function tower(S, t, red) {
    const L = S.L, X = S.X, p = L.p, CM = L.CM;
    const x = L.towerX + S.oPad;
    let row = 0;
    for (let y = L.towerTop; y <= L.towerBot; y += p, row++) {
      // mast + lattice: the cross-bracing reads as alternating dot sizes; in colour a dark steel
      // silhouette against the bright cloud sea, its west edge glinting in the sunrise
      if (CM) {
        splat(S, x, y, row === 0 ? 0.62 : 0.52, row % 3 === 1 ? SK4 : HZ0, 0, FLOOR, 1);
        splat(S, x + p, y, row % 2 ? 0.2 : 0.42, VSH, 0, FLOOR, 1);
      } else {
        splat(S, x, y, row === 0 ? 0.6 : 0.5, X.tower, 0, FLOOR, 1);
        splat(S, x + p, y, row % 2 ? 0.2 : 0.42, X.tower, 0, FLOOR, 1);
      }
      if (row === 2 || row === 5) {                                                // service arms
        splat(S, x - p, y, 0.34, CM ? HZ0 : X.tower, 0, FLOOR, 1);
        splat(S, x - 2 * p, y, 0.22, CM ? HZ0 : X.tower, 0, FLOOR, 1);
      }
    }
    // obstruction beacons: the head strobes, a second light lower down blinks out of phase
    const ph = (t * 0.8) % 1, ph2 = (t * 0.8 + 0.5) % 1;
    const b1 = red ? 0.55 : ph < 0.1 ? 0.95 : 0.12 + 0.1 * Math.exp(-(ph - 0.1) * 6);
    const b2 = red ? 0.3 : ph2 < 0.1 ? 0.6 : 0.06;
    splat(S, x, L.towerTop - p, b1, X.beacon, 0, FLOOR, 1);
    splat(S, x + p, L.towerTop + p * 3, b2, X.beacon2, 0, FLOOR, 1);
  }

  function jeeps(S, t, now) {
    const L = S.L, B = S.B, K = S.K, D = S.D, C = S.C, X = S.X, p = L.p, cols = L.cols, CM = L.CM;
    const oF = S.offs[FLOOR];
    // high beams after a click on the sand: on at once, a quick double blink, a long sweep, fade
    const tf = now - S.I.flash;
    const flash = tf < 0 || tf > 3.2 ? 0 : tf < 0.16 ? 1 : tf < 0.26 ? 0.3 : tf < 0.4 ? 1 : 1 - smoothstep(1.7, 3.2, tf);
    const span = L.w * 1.3, xA = -0.15 * L.w;
    const bl = p * (6 + 20 * flash), bI = 0.34 + 0.4 * flash;
    const rr = Math.ceil(0.6 + (0.16 + 0.07 * flash) * bl / p + 1.6);
    for (let ci = 0; ci < L.convoys.length; ci++) {
      const cv = L.convoys[ci], tr = L.tracks[cv.tr];
      const trY = (x) => { const u = clamp((x - L.ox) / p + L.M, 0, L.colsE - 1.001), c0 = Math.floor(u), f = u - c0; return tr[c0] + (tr[c0 + 1] - tr[c0]) * f; };
      let lead = cv.x0 + cv.dir * cv.v * t;
      lead = xA + ((((lead - xA) % span) + span) % span);
      for (let j = 0; j < cv.n; j++) {
        const xl = lead - cv.dir * (j * cv.gap + p * 0.6 * Math.sin(t * 0.37 + j * 1.7 + cv.ph));
        const y = L.oy + Math.round((trY(xl) - L.oy) / p) * p;   // on a dot row: the pair stays crisp
        const x = xl + oF;
        if (x < -bl - p * 4 || x > L.w + bl + p * 4) continue;
        const dir = cv.dir;
        // beam: a cone of pale lit sand ahead of the jeep, its edge in shadow (colour)
        const c0 = Math.max(0, Math.floor((Math.min(x, x + dir * bl) - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((Math.max(x, x + dir * bl) - L.ox) / p));
        const r0 = Math.max(0, Math.round((y - L.oy) / p) - rr), r1 = Math.min(L.rows - 1, Math.round((y - L.oy) / p) + rr);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          if (K[i] !== FLOOR) continue;
          const u = (L.ox + c * p - x) * dir;
          if (u < p * 1.2 || u > bl) continue;
          const wdt = p * (0.45 + (0.16 + 0.07 * flash) * u / p);
          const q = (L.oy + r * p - y - u * 0.05) / wdt, aq = q < 0 ? -q : q;
          const fall = 1 - u / bl;
          if (aq < 1.15) {
            const v = bI * Math.sqrt(fall) * (1 - 0.45 * aq * aq);
            if (v < 0.05 || (!CM && hash2(i, 71) > v * 3.6)) continue;
            touch(B, i);
            if (B.fxM[i] === 1) continue;
            const vv = CM ? Math.max(D[i] * 0.6, 0.16 + 0.72 * v) : Math.max(D[i], 0.07 + 0.38 * v);
            if (B.fxM[i] === 3 && B.fxD[i] >= vv) continue;
            B.fxM[i] = 3; B.fxD[i] = vv; B.fxC[i] = CM ? (v > 0.3 || aq < 0.35 ? X.beamHi : X.beam) : v > 0.2 ? X.beamHi : X.beam;
          } else if (CM && aq < 2.3 && fall > 0.1) {
            touch(B, i);
            if (B.fxM[i]) continue;
            B.fxM[i] = 1; B.fxD[i] = Math.min(D[i], 0.06); B.fxC[i] = C[i];
          }
        }
        // paired headlights (warm white in a dark collar), a tail light behind
        const hv = 0.9 + 0.1 * flash;
        light(S, x, y, hv, X.head, FLOOR, FLOOR);
        light(S, x - dir * p * 1.05, y, hv * 0.92, X.head, FLOOR, FLOOR);
        splat(S, x - dir * p * 2.7, y, CM ? 0.5 : 0.34, X.tail, FLOOR, FLOOR, 1, 0.6);
      }
    }
  }

  function lamps(S, t, red) {
    const L = S.L, X = S.X, p = L.p;
    const oF = S.offs[FG];
    for (let k = 0; k < L.lamps.length; k++) {
      const q = L.lamps[k];
      if (!q.walk) {
        // warung lanterns on the viewpoint: one crisp warm dot (snapped to the grid) in a dark
        // collar, and a soft ring of lit ground around it, flickering like a flame
        const xl = L.ox + Math.round((q.x + oF - L.ox) / p) * p;
        const yl = L.oy + Math.round((L.fgY(q.x) + q.dy - L.oy) / p) * p;
        const fl = red ? 0 : 0.08 * Math.sin(t * q.f + q.ph) * Math.sin(t * 2.3 + q.ph * 2);
        light(S, xl, yl, 0.92 + fl, X.lantern, FG, RIM);
        for (let j = 0; j < 8; j++) {
          const an = TAU * j / 8;
          splat(S, xl + Math.cos(an) * p * 2, yl + Math.sin(an) * p * 2, 0.2 + 0.6 * fl + (j & 1 ? 0 : 0.06), X.glow, FG, RIM, 3, 1);
        }
      } else {
        // hikers' headlamps bobbing up the trail to the viewpoint
        const span = q.x0 - q.x1;
        const u = ((q.u0 * span + q.v * t) % span + span) % span;
        const xl = q.x0 - u;
        const edge = Math.min(u, span - u) / (p * 6);
        const v = 0.72 * clamp(edge) * (red ? 1 : 0.88 + 0.12 * Math.sin(t * 7 + q.ph));
        const y = L.fgY(xl) + q.dy + (red ? 0 : p * 0.15 * Math.sin(t * 6 + q.ph));
        if (v > 0.06) light(S, xl + oF, y, v, X.lamp, FG, RIM, 0.05 + 0.2 * (1 - clamp(edge)));
      }
    }
  }

  // fireflies in the grass below the crest: each blinks once a cycle, then wanders somewhere new
  function fireflies(S, t) {
    const L = S.L, X = S.X, p = L.p, oF = S.offs[FG];
    const N = L.a > 0.5 ? 9 : 5;
    for (let k = 0; k < N; k++) {
      const per = 3.2 + 2.4 * hash2(k, 81);
      const ph = t / per + hash2(k, 82), n = Math.floor(ph), cyc = ph - n;
      if (cyc < 0.15 || cyc > 0.5) continue;
      const on = Math.sin(Math.PI * (cyc - 0.15) / 0.35);
      const bx = L.w * (0.04 + 0.92 * hash2(k * 7 + n, 83));
      const x = bx + p * 3 * noise2(k * 3.1, t * 0.4) + oF;
      const y = L.fgY(bx) + p * (1.8 + 5 * hash2(k * 7 + n, 84)) + p * 1.2 * noise2(k * 5.3, t * 0.35 + 9);
      if (on > 0.3) light(S, x, y, 0.72 * on, X.fly, FG, RIM, 0.05 + 0.25 * (1 - on));
      else splat(S, x, y, 0.72 * on, X.fly, FG, RIM, 3, 0.6);
    }
  }

  function meteors(S, t) {
    const L = S.L, X = S.X, p = L.p, PER = 7.5;
    const k0 = Math.floor(t / PER);
    const oS = S.offs[SKY];
    for (let k = k0 - 1; k <= k0; k++) {
      if (k < 1 || hash2(k, 901) > 0.72) continue;
      const ts = k * PER + 3.5 * hash2(k, 902), dur = 0.55 + 0.4 * hash2(k, 903);
      const tau = t - ts;
      if (tau < 0 || tau > dur + 0.3) continue;
      const x0 = L.w * (0.08 + 0.84 * hash2(k, 904)) + oS, y0 = L.h * (0.03 + 0.2 * hash2(k, 905));
      const right = hash2(k, 906) < 0.5;
      const an = 0.3 + 0.32 * hash2(k, 907);
      const dx = (right ? 1 : -1) * Math.cos(an), dy = Math.sin(an);
      const len = L.w * mix(0.17, 0.11, L.a) * (0.7 + 0.6 * hash2(k, 908));
      const pr = Math.min(1, tau / dur);
      const ease = 1 - Math.pow(1 - pr, 1.6);
      const hx = x0 + dx * len * ease, hy = y0 + dy * len * ease;
      const env = tau < dur ? Math.sin(Math.PI * Math.min(1, pr * 0.9 + 0.1)) : 0.35 * (1 - (tau - dur) / 0.3);
      const tail = len * Math.min(0.45, ease) * (tau < dur ? 1 : 1 - (tau - dur) / 0.3);
      for (let u = 0; u <= tail; u += p * 0.5) {
        const f = tail > 0 ? 1 - u / tail : 0;
        const v = env * (u < p * 0.6 ? 0.95 : 0.65 * Math.pow(f, 1.4));
        if (v < 0.05) break;
        splat(S, hx - dx * u, hy - dy * u, v, u < p ? X.star : X.starLo, SKY, SKY, 3);
      }
    }
  }

  Halftone.scenes.nightLaunch = scene;
})();
