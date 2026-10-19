/*!
 * night.js — Halftone.scenes.nightLaunch
 * Footer centrepiece: a ground station at night, firmware to cloud, ground to sky. The name rises
 * like a monument behind a data-centre skyline; in front of it a circuit board lies in true
 * perspective as the land (copper running to the horizon like streets, chips standing on it as
 * low buildings); a ground-station dish tracks the satellites; a rocket waits by its lattice tower
 * and launches as the footer scrolls in; in the near ground the owner's Moxon–Yagi on its tripod
 * follows a CanSat drifting down under its parachute. Dots only, no mountains.
 *
 * Two looks (st.mode; each is built once per size and cached, the other one is pre-built in the
 * background a moment after setup, so the toggle swaps instantly and repaints in a sweep that
 * radiates out of the dish):
 *   mono   night ink + one accent: the flame, the tower's beacon, the launch reticle and whatever a
 *          visitor sets off (packet heads, pulses, rings). Copper is a faint muted line, chips are
 *          grey slabs with ink pin combs, the board itself nearly black.
 *   color  a curated dot-painting: indigo night (stars, dotted orbit tracks, a teal city glow
 *          between the letters' feet), a warm-white name whose foot catches that glow (mint),
 *          navy rack cabinets with green / amber / blue (rarely red) status LEDs, solder-mask
 *          greens for the board with a sheen at its far edge, copper → gold traces, black chips
 *          with silver pins and white silkscreen corners, a radio module with a silver RF shield,
 *          a white dish, a cyan uplink, an orange parachute and flame.
 *
 * Depth planes, far → near (parallax factors for the camera pan in brackets):
 *   sky [0.05]   stars, two dotted orbit tracks with their satellites (an H: bus + solar wings),
 *                the CanSat under its parachute, meteors
 *   wordmark [0.2]  st.data.word, its foot hidden by the board's far edge on desktop (≈ 14 %; just
 *                under the letters on a phone where they are ~10 dots tall); one empty ring of dots
 *                parts the letters from whatever is behind them
 *   racks [0.34] the data centre on the horizon: each cabinet only as tall as the letter behind it
 *                allows (H's legs may hide, A keeps its crossbar, Y its stem, U its bowl)
 *   board [0.38 at the horizon → 1 at the bottom edge, row by row]  a pinhole projection of a PCB
 *                (u lateral, v depth): the main bus into the data centre, octilinear routes (one 45°
 *                run) MCU → dish, MCU → radio (UART), radio → antenna, data centre → dish
 *                (backhaul), side streets; vias, 0402 pairs, chips as ray-traced boxes (MCU, radio
 *                module with a whip antenna, crystal, SOIC on wide screens). A pan pivots the copper
 *                about the vanishing point.
 *   objects, each at the parallax of its foot on the board: the dish (pedestal, a bowl seen from
 *                the front whose face turns toward us as it points lower, feed on three struts), the
 *                launch tower + pad + rocket, the Moxon–Yagi: TWO complete Moxon rectangles on one
 *                boom (rear = reflector, front = driven element, fed at the middle of its front bar)
 *                and FIVE straight directors, each a little shorter; one-dot strokes in a dark collar.
 *
 * Interaction (anatomy-style toy; every answer is eased and physical):
 *   click the sky      a tap ring + a target reticle, the pad flashes, a rocket launches toward the
 *                      click (gravity turn, flame, smoke, staging, the spent stage tumbling away; ≤ 5
 *                      at once). The dish slews to track it while it climbs
 *   click the dish     uplink: a train of packets climbs to the tracked satellite, which flashes and
 *                      rings (ack)
 *   click a chip       Send: a burst of packets races along the copper (the trace glows behind the
 *                      lead packet) — MCU → dish → uplink; radio module → antenna → telemetry
 *   click the antenna  Telemetry: rings run out of the directors to the CanSat, its reply comes down
 *                      the line and the elements flash
 *   click the racks    Sync: a wave runs down the row (lids and LEDs), then a backhaul burst to the
 *                      dish and an uplink
 *   click the board    Ping: a ring races out across the board (a circle in board space, an ellipse
 *                      on screen), lighting the copper it crosses
 *   drag ←→            the camera pans with parallax, rubber-bands softly past its range, springs back
 *   keys               Space / Enter / ↑ launch · ← → pan · U uplink · P packets · T telemetry
 *   cursor             the label says what a click does right there: Launch / Uplink / Send /
 *                      Telemetry / Sync / Ping, Drag while dragging (data-cursor + a re-dispatched
 *                      pointerover, as pi.js)
 *   idle               LEDs flicker with traffic, packets climb the bus, the dish follows the
 *                      satellites (handing over between passes, parked at the next rise point), a
 *                      short uplink every few seconds, the CanSat's telemetry trickles down, the
 *                      beacon blinks; a ghost demo (visible tap rings / a drag, so touch users learn
 *                      the moves: launch · send · drag · uplink · ping · sync) only when nobody is
 *                      playing: no input for 9 s (3.5 s before the first ever touch), nothing a visitor
 *                      set off still alive, the pointer outside or still for 12 s. Reduced motion /
 *                      pause: no autonomous motion (scene time stops; the dish and antenna snap to
 *                      their targets), direct manipulation still answers.
 *
 * st.progress 0..1  main rocket: on the pad beside the tower → ignition → gravity turn → nose ≈ 0.13h
 * st.data.word      wordmark text (default 'MUKHAYYAR')
 * scene.hint        touch-gesture hint text for the page (optional to display)
 * Colour mode looks right on the footer gradient (the green starts at the horizon, ≈ 50 %)
 *   linear-gradient(180deg, #121436 0%, #181C4A 40%, #1A2A4C 49%, #0C281D 53%, #0A1F16 78%, #0B0B0A 100%)
 * Deterministic: every flicker, jog and ghost pick comes from hashes of indices, never Math.random.
 */
(function () {
  'use strict';
  if (!window.Halftone) return;
  const U = Halftone.utils;
  const { TAU, clamp, mix, smoothstep, hash2, noise2, noise3, fbm2 } = U;

  // ------------------------------------------------------------------ materials
  // Mono only ever uses 0–3. Colour paints with 4+ (each entry maps to a sensible mono tone too).
  const INK = 0, ACC = 1, MUT = 2, FNT = 3;
  const SK0 = 4, SK1 = 5, ORB = 6, STAR = 7, WCR = 8, WRM = 9, RK0 = 10, RK1 = 11;
  const LDG = 12, LDA = 13, LDR = 14, MK0 = 15, MK1 = 16, MK2 = 17, CU = 18, CUH = 19;
  const SLK = 20, CHB = 21, CHT = 22, PIN = 23, DSH = 24, DSS = 25, DSD = 26, BEAM = 27;
  const BML = 28, FLM = 29, FCR = 30, RKW = 31, RKS = 32, SMH = 33, SML = 34, SMD = 35;
  const TWR = 36, BCN = 37, PKT = 38, HZ = 39, GLW = 40, VIA = 41, SAT = 42, SPN = 43;
  const ANT = 44, ANS = 45, CHU = 46, LDB = 47;
  const PALETTE = {
    mono: [
      'ink', 'accent', 'muted', 'faint',
      'faint', 'muted', 'muted', 'ink', 'ink', 'ink', 'faint', 'muted',
      'ink', 'ink', 'accent', 'faint', 'faint', 'muted', 'muted', 'ink',
      'muted', 'faint', 'muted', 'ink', 'ink', 'muted', 'muted', 'ink',
      'muted', 'accent', 'ink', 'ink', 'muted', 'ink', 'muted', 'muted',
      'muted', 'accent', 'ink', 'faint', 'muted', 'ink', 'ink', 'muted',
      'ink', 'muted', 'ink', 'ink',
    ],
    color: [
      '#F3ECDD', '#FF6A2B', '#8E93A8', '#3A3F5C',
      // sky: deep indigo dust, periwinkle, orbit lines, star; wordmark warm white, its city-lit foot
      '#262B6A', '#454C9E', '#7E86D8', '#EEF0FF', '#FFF4DE', '#A6EBDD',
      // racks: body, frame; LEDs green / amber / red
      '#222A50', '#4B5683', '#4BE38E', '#FFB547', '#FF5A4D',
      // solder mask deep / mid / sheen, copper, gold
      '#0E3A27', '#17583B', '#2D8456', '#BE8740', '#F2C66F',
      // silkscreen, chip body / top sheen, pins
      '#E4EADC', '#16181E', '#3A3E4C', '#CDD3DC',
      // dish white / shade / deep shade, uplink cyan / dim
      '#F5F7FB', '#A3ACC2', '#5D6688', '#62E6F6', '#2C8DB3',
      // flame, flame core, rocket white / shade, smoke lit / shade / dark
      '#FF8A2B', '#FFE7A2', '#FFFFFF', '#A4A2BF', '#ECE8F4', '#9C98B8', '#55527E',
      // tower steel, beacon red, packet, far-board haze, city glow, via gold
      '#7D88A8', '#FF3B30', '#C8FFF6', '#173F33', '#2E8C93', '#E8B85E',
      // satellite, solar panel, antenna aluminium / PVC shade, parachute, LED blue
      '#E4EAFF', '#5B86F2', '#E8EBF1', '#8B93A8', '#FF7A45', '#5FB8FF',
    ],
  };
  // effect materials per mode. Mono keeps the accent for the hero details only: the flame, the
  // tower beacon, the launch reticle and the packets / pulses a visitor sets off.
  const FXM = { flame: ACC, core: INK, rkLit: INK, rkShade: MUT, light: ACC, smHi: INK, smLo: MUT, smDk: MUT,
    star: INK, starLo: MUT, tower: MUT, towerHi: INK, beacon: ACC, beacon2: MUT, spark: INK, ret: ACC, retLo: MUT,
    tap: INK, pkt: INK, pktHot: ACC, pktLo: MUT, beam: INK, beamLo: MUT, sat: INK, satP: MUT, ledLo: MUT,
    led: [INK, INK, INK, INK], dish: INK, dishS: MUT, dishD: MUT, dishK: FNT, ant: INK, antS: MUT, chute: INK,
    chute2: INK, can: MUT, ping: INK, pingLo: MUT, cuHi: INK, pin: INK, wave: INK };
  const FXC = { flame: FLM, core: FCR, rkLit: RKW, rkShade: RKS, light: FLM, smHi: SMH, smLo: SML, smDk: SMD,
    star: STAR, starLo: SK1, tower: TWR, towerHi: DSS, beacon: BCN, beacon2: BCN, spark: FCR, ret: FCR, retLo: ORB,
    tap: STAR, pkt: PKT, pktHot: BEAM, pktLo: BML, beam: BEAM, beamLo: BML, sat: SAT, satP: SPN, ledLo: RK1,
    led: [LDG, LDA, LDB, LDR], dish: DSH, dishS: DSS, dishD: DSD, dishK: CHB, ant: ANT, antS: ANS, chute: CHU,
    chute2: WCR, can: PIN, ping: CUH, pingLo: CU, cuHi: CUH, pin: PIN, wave: BEAM };

  // depth planes (static layers), far → near
  const SKY = 0, WORD = 1, RACK = 2, BOARD = 3;
  const PX = [0.05, 0.2, 0.34];      // parallax per plane; the board's grows row by row (perspective)
  const PXB0 = 0.38, PXB1 = 1;       // board parallax at the horizon / at the bottom edge
  const pxB = (L, y) => PXB0 + (PXB1 - PXB0) * clamp((y - L.yH) / L.F);

  // faint tones are screened stochastically (sparse specks) instead of a grid of pinpricks
  const fm = (d, hh, T) => (d >= T ? d : hh < d / T ? T : 0);

  const P_IGN = 0.04;   // progress at which the engines light
  const ALT_EXP = 1.1;  // altitude grows a little faster than progress (the rocket accelerates)
  const TURN_EXP = 2.4; // gravity turn: downrange ∝ altitude^TURN_EXP
  // click rockets: hold-down, ease of the climb, staging point (path fraction), coast between stages
  const HOLD = 0.1, SEXP = 1.4, S_ST = 0.5, COAST = 0.22, MAX_R = 5;
  // ghost demo etiquette (s): quiet time after input, before the first ever touch, pointer still
  const G_QUIET = 9, G_FIRST = 3.5, G_STILL = 12, G_EVERY = 10;
  const TR_DUR = 0.95;  // mode-change repaint sweep

  const newI = () => ({ cam: 0, camV: 0, raw: 0, drag: false, t0: null, px: -1e4, py: -1e4,
    lastIn: -1e9, lastMove: -1e9, ever: false, rockets: [], taps: [], bursts: [], ups: [], pings: [], tele: [],
    acks: [], syncT: -1e9, syncUser: false, syncSent: true, nR: 0, nB: 0, ghostK: 0, ghostNext: 0, gq: null, gd: null,
    trT: -1e9, trX: 0, trY: 0, dishA: null, dishV: 0, antA: null, antV: 0, trk: -1, autoUp: 0, autoTele: 0 });

  const scene = {
    palette: PALETTE,
    layout: 'grid',
    animated: true,
    interact: 'lens',
    interactRadius: 170,
    drag: 'x',
    cursor: 'Launch',
    label: 'Ground station at night — click the sky to launch a rocket, the dish to uplink, a chip to send packets',
    // a quiet line the page may show to touch visitors (no cursor there): what the gestures do
    hint: 'Tap the sky · the dish · a chip · drag',
    fonts: ['800 100px Geist'],
    horizon: 0.53,
    skyline: 0.45,
    // dot spacing follows the width, but the dot count is capped so tall / very wide footers
    // (1440×900, 2560×890) stay inside the frame budget
    pitch(w, h) { return Math.max(clamp(w / 240, 4.6, 7.2), Math.sqrt(w * h / 26000)); },
    setup(st) { setup(this, st); },
    onMode(mode, st) { switchMode(this, mode, st); },
    update(st, dt) { update(this, st, dt); },
    onClick(x, y, st) { click(this, x, y, st); },
    onKey(key, st) { return keyDown(this, key, st); },
    sample(x, y, t, st, out, i) {
      const S = this, B = S.B;
      if (i === 0) frame(S, st, t);
      const k = S.K[i];
      let d = S.D[i], c = S.C[i];
      if (!S.pan && k === SKY) {
        const tw = B.twA[i];
        if (tw > 0) d *= 1 - tw * (0.5 + 0.5 * Math.sin(t * B.twF[i] + B.twP[i]));
      }
      // rockets, flames, smoke, the dish, packets, LEDs …
      const m = B.fxM[i];
      if (m) {
        const f = B.fxD[i];
        if (m !== 2) { d = f; c = B.fxC[i]; }
        else if (k === WORD && d > 0.1) d *= 1 - 0.8 * Math.min(1, f / 0.5);   // smoke veils the letters
        else if (S.L.CM) {
          // colour: smoke is a body with volume against the dense painted ground and sky
          if (f > 0.05) { const o = f > 0.3 ? 1 : (f - 0.05) * 4; d += (f - d) * o; c = B.fxC[i]; }
        } else if (f > d) { d = f; c = B.fxC[i]; }
      }
      // mode change: the new palette repaints in a sweep out of the dish
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
  const KEYS = ['L', 'X', 'Y', 'B', 'D0', 'C0', 'K0', 'U0', 'Dd', 'Cd', 'Kd', 'Ud', 'cBase', 'cFrac', 'cTop', 'offs', 'horizon', 'skyline'];
  function install(S, T) {
    for (const k of KEYS) S[k] = T[k];
    S.D = T.D0; S.C = T.C0; S.K = T.K0; S.CUv = T.U0; S.pan = false;
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
    // short-lived timelines refer to this layout's routes and satellites: start them afresh
    S.I.dishA = null; S.I.antA = null; S.I.bursts.length = 0; S.I.pings.length = 0; S.I.ups.length = 0; S.I.acks.length = 0;
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
      I.trX = L.dX; I.trY = L.dPivY;
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

  // ------------------------------------------------------------------ wordmark
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
    // glyph centres (screen px): the racks keep clear of the parts a letter needs to be read
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

  // ------------------------------------------------------------------ board helpers
  // a route that a PCB router would draw: straight, one 45° run, straight (u lateral, v depth)
  function oct(A, B, jog) {
    const du = B[0] - A[0], dv = B[1] - A[1], adu = Math.abs(du), adv = Math.abs(dv);
    const su = du < 0 ? -1 : 1, sv = dv < 0 ? -1 : 1;
    if (adu <= adv) {
      const run = (adv - adu) * jog;
      const P1 = [A[0], A[1] + sv * run];
      const P2 = [B[0], P1[1] + sv * adu];
      return [A, P1, P2, B];
    }
    const run = (adu - adv) * jog;
    const P1 = [A[0] + su * run, A[1]];
    const P2 = [P1[0] + su * adv, B[1]];
    return [A, P1, P2, B];
  }
  function dedupe(pts) {
    const out = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const q = out[out.length - 1];
      if (Math.abs(pts[k][0] - q[0]) + Math.abs(pts[k][1] - q[1]) > 1e-5) out.push(pts[k]);
    }
    return out;
  }
  // a parallel copy of a polyline at distance d (mitred joins) — one trace of a bus
  function offsetPoly(pts, d) {
    const out = [];
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    for (let i = 0; i < pts.length; i++) {
      const n1 = i > 0 ? nrm(pts[i - 1], pts[i]) : nrm(pts[i], pts[i + 1]);
      const n2 = i < pts.length - 1 ? nrm(pts[i], pts[i + 1]) : n1;
      let mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const cs = mx * n1[0] + my * n1[1] || 1;
      out.push([pts[i][0] + mx * d / cs, pts[i][1] + my * d / cs]);
    }
    return out;
  }

  // ------------------------------------------------------------------ build
  function* buildGen(S, st, CM, T) {
    const w = st.w, h = st.h, p = st.pitch;
    const { n, xs, ys, cols, rows } = st.grid;
    const a = clamp((w / h - 0.9) / (2.57 - 0.9)); // 0 = phone, 1 = wide desktop
    const L = { a, w, h, p, cols, rows, ox: xs[0], oy: ys[0], CM };
    T.L = L;
    T.X = CM ? FXC : FXM;
    const ox = L.ox, oy = L.oy;

    // ---- camera pan range, and the extended grid every plane is painted on so a pan reveals more
    L.camMax = clamp(w * 0.1, 60, 150);
    L.camRb = L.camMax * 0.35;
    const M = Math.ceil((L.camMax * 1.42) / p) + 2, colsE = cols + 2 * M, nE = rows * colsE;
    L.M = M; L.colsE = colsE;
    const xOf = (cE) => ox + (cE - M) * p;
    const yOf = (r) => oy + r * p;
    const rowOf = (y) => Math.round((y - oy) / p);
    const colOf = (x) => Math.round((x - ox) / p) + M;
    const snapY = (y) => oy + Math.round((y - oy) / p) * p;
    const snapX = (x) => ox + Math.round((x - ox) / p) * p;

    // ---- wordmark; the text raster is shared by both modes
    L.wordW = w * mix(0.95, 0.946, a);
    L.wordTop = h * mix(0.33, 0.24, a);
    L.maxCap = h * mix(0.2, 0.34, a);
    const wkey = w + 'x' + h + '|' + ((st.data && st.data.word) || '');
    if (!S.wordCache || S.wordCache.key !== wkey) S.wordCache = { key: wkey, W: makeWord(st, L) };
    const W = S.wordCache.W;
    L.word = W;
    yield;

    // ---- horizon = the far edge of the board. Desktop: it hides the letters' feet (≈ 14 %, the
    //      name rises behind the skyline like a monument); phone: the letters are ~10 dots tall,
    //      so it sits just under them
    const yH = W.top + W.cap * mix(0.99, 0.86, Math.sqrt(a)) + p * 1.05;
    const F = h - yH, vpX = w * mix(0.4, 0.47, a);
    Object.assign(L, { yH, F, vpX, yB: yH + p * 0.3 });
    const vAt = (y) => F / Math.max(0.5, y - yH);
    const uAt = (x, v) => (x - vpX) * v / F;
    const toX = (u, v) => vpX + F * u / v, toY = (v) => yH + F / v;
    const G = W.glyphs;
    // how much of each letter must stay in view (fraction of the cap height from the top)
    const NEED = { A: 0.72, U: 0.8, J: 0.82, G: 0.74, Q: 0.8, Z: 0.8, S: 0.72, O: 0.7, C: 0.7, D: 0.68, B: 0.7, E: 0.7, Y: 0.77, V: 0.79, P: 0.64, R: 0.6, W: 0.6 };
    const needAt = (x0, x1) => {
      let nd = 0.5;
      for (const g of G) if (g.x + g.w * 0.55 > x0 && g.x - g.w * 0.55 < x1) nd = Math.max(nd, NEED[g.ch] || 0.56);
      return nd;
    };

    // ---- the data centre: a row of rack cabinets standing on the board's far edge. Each one is
    //      as tall as the letter behind it allows (H's legs can hide, A keeps its crossbar)
    const dcL = w * mix(0.27, 0.375, a), dcR = w * mix(0.49, 0.61, a);
    L.dcX = (dcL + dcR) / 2;
    const rw = a > 0.45 ? 4 : 3;
    const yRB = snapY(yH + p * mix(1.3, 1.7, a));
    L.yRB = yRB;
    const racks = [];
    {
      let c = colOf(dcL), k = 0;
      const cEnd = colOf(dcR);
      while (c + rw - 1 <= cEnd) {
        const x0 = xOf(c) - p * 0.5, x1 = xOf(c + rw - 1) + p * 0.5;
        const top0 = W.top + W.cap * needAt(x0 - p, x1 + p) + p * 1.05;
        const mid = 1 - 0.4 * Math.abs((x0 + x1) / 2 - L.dcX) / ((dcR - dcL) / 2);
        const hh = h * mix(0.075, 0.105, a) * (0.62 + 0.45 * hash2(k, 501)) * mid;
        let top = Math.max(top0, yRB - hh);
        top = oy + Math.ceil((top - oy) / p - 0.001) * p;
        if (yRB - top >= p * 2.5) racks.push({ c0: c, c1: c + rw - 1, rt: rowOf(top), rb: rowOf(yRB), k });
        c += rw + (k % 3 === 2 ? 2 : 1);           // a wider aisle every three cabinets
        k++;
      }
    }
    L.racks = racks;

    // ---- objects on the board. Phone (a < 0.5): the dish stands right of the data centre;
    //      desktop: left of it, between the U and the K. The Moxon–Yagi is nearest, low left.
    const wide = a >= 0.5;
    // above 760 px the page's footer bar lies over the last ~64 px of the canvas: the phone layout
    // then squeezes its near ground above it
    const barOver = w > 760;
    L.barOver = barOver;
    const gy = (f) => (wide || !barOver ? f * h : yH + (f * h - yH) * (h - 64 - yH) / (h - yH));
    L.dX = snapX(w * (wide ? mix(0.22, 0.255, (a - 0.5) * 2) : mix(0.21, 0.2, a * 2)));
    L.dR = Math.max(p * 4.8, h * mix(0.058, 0.074, a));
    L.dPivY = yH + h * mix(0.065, 0.03, a);
    L.dBaseY = snapY(yH + h * mix(0.17, 0.13, a));
    L.dTau = 0.5;                                     // the bowl's face turned toward us (rad)

    const rocketL = Math.max(p * 8, h * mix(0.085, 0.105, a));
    const rocketW = p * mix(2.7, 2.9, a);
    const padX = w * mix(0.84, 0.79, a);
    const padY = yH + h * mix(0.1, 0.075, a);         // nozzle at rest, on the pad
    const noseTop = h * mix(0.15, 0.13, a);
    const kd = mix(0.16, 0.22, a);                     // downrange per unit of climb
    const climbH = padY - noseTop - rocketL / Math.hypot(TURN_EXP * kd, 1);
    const downrange = climbH * kd;
    Object.assign(L, { padX, padY, rocketL, rocketW, climbH, downrange });
    {
      const c = Math.round((padX + rocketW * 1.25 + p * 0.6 - ox) / p);
      L.towerX = ox + c * p;
      L.towerTop = snapY(padY - rocketL * 1.22);
      L.towerBot = snapY(padY + p * 0.5);
    }

    // Moxon–Yagi on its tripod in the near ground, aimed at the CanSat
    L.aX = w * (wide ? 0.095 : 0.85);
    L.aY = gy(mix(0.8, 0.69, a));
    L.aHubY = gy(mix(0.9, 0.8, a));
    L.aFootY = gy(mix(0.968, 0.86, a));
    const as = wide ? 1 : 0.78;
    L.aE = p * 4.8 * as;            // depth of each Moxon rectangle (along the boom)
    L.aA = p * 4.6 * as;            // half-width of the rectangles
    L.aG = p * 3.0 * as;            // space between the two rectangles
    L.aD = p * 1.8 * as;            // the rear U's tails
    L.aBt = p * 1.4 * as;           // the front U's tails (the gap between the tips: E - D - Bt)
    L.aDs = p * 2.9 * as;           // director spacing
    L.aBack = p * 10.5 * as;        // from the clamp back to the reflector's rear bar

    // the CanSat drifting down under its parachute (the antenna's target): the wind carries it
    // back toward the antenna, so the boom swings through ~45°
    L.cs = wide ? { x0: w * 0.345, x1: w * 0.3, y0: h * 0.085, y1: h * 0.2, T: 26 } : { x0: w * 0.13, x1: w * 0.24, y0: h * 0.1, y1: h * 0.26, T: 26 };

    // satellites on two orbits (screen ellipses), crossing the band above the letters
    {
      const mk = (cxf, apexF, rxf, ryf, dir, T, cross, ph) => {
        const ry = h * ryf;
        return { cx: w * cxf, cy: h * apexF + ry, rx: w * rxf, ry, dir, T, cross, ph };
      };
      L.sats = [
        mk(mix(0.5, 0.5, a), mix(0.11, 0.105, a), mix(0.85, 0.62, a), mix(0.42, 0.5, a), 1, 38, 31, 9),
        mk(mix(0.6, 0.72, a), mix(0.065, 0.075, a), mix(0.8, 0.55, a), mix(0.5, 0.62, a), -1, 46, 36, 30),
      ];
      L.satUpY = W.top - p * 1.5;
    }

    // ---- board geometry: u lateral, v depth (camera 1 unit above the board, bottom edge v = 1)
    const chips = [];
    // a chip: front-left corner at screen fractions (xf, yf), front edge fF·F wide on screen
    const mkChip = (kind, xf, yf, fF, dvk, z, np) => {
      const y0 = gy(yf), v0 = vAt(y0), u0 = uAt(xf * w, v0), su = fF * F / (y0 - yH);
      return { kind, u0, u1: u0 + su, v0, v1: v0 + su * dvk, z, np };
    };
    const mcu = wide ? mkChip('mcu', 0.35, 0.785, 0.43, 1, 0.1, 8) : mkChip('mcu', 0.08, 0.8, 0.37, 1, 0.1, 8);
    const xb = wide ? mkChip('xbee', 0.205, 0.84, 0.25, 1.35, 0.07, 6) : mkChip('xbee', 0.52, 0.93, 0.22, 1.35, 0.07, 6);
    const smu = mcu.u1 - mcu.u0;
    const xtal = { kind: 'xtal', u0: mcu.u1 - smu * 0.42, u1: mcu.u1 - smu * 0.12, v0: mcu.v1 + smu * 0.32, v1: mcu.v1 + smu * 0.46, z: 0.07, np: 0 };
    chips.push(mcu, xb, xtal);
    let soic = null;
    if (wide) { soic = mkChip('soic', 0.6, 0.765, 0.2, 0.75, 0.06, 4); chips.push(soic); }
    L.chips = chips;

    // routes (board polylines). Packets ride these, so every one is also drawn as copper.
    const routes = [];
    const addRoute = (pts, kind) => { routes.push({ pts: dedupe(pts), kind }); return routes.length - 1; };
    const bundle = (pts, nT, sp, kind) => {
      const ids = [], P = dedupe(pts);
      for (let k = 0; k < nT; k++) ids.push(addRoute(offsetPoly(P, (k - (nT - 1) / 2) * sp), kind));
      return ids;
    };
    const vBot = vAt(h + p * 2), vFar = 60;
    // the main bus: four traces from under the viewer straight into the data centre
    L.bus = [];
    const nBus = wide ? 4 : 3;
    for (let k = 0; k < nBus; k++) { const u = (k - (nBus - 1) / 2) * 0.085; L.bus.push(addRoute([[u, vBot], [u, vFar]], 'bus')); }
    // MCU → dish: a pair off the MCU's back edge, one 45° run, into the dish's pedestal
    const dV = vAt(L.dBaseY), dU = uAt(L.dX, dV);
    {
      const A = [mcu.u0 + smu * 0.25, mcu.v1 + 0.02], A1 = [A[0], A[1] + 0.25];
      const Bp = [dU, dV - Math.min(0.8, dV * 0.18)];
      L.rDish = bundle([A, ...oct(A1, Bp, 0.3), [dU, dV]], wide ? 2 : 1, 0.08, 'dish');
    }
    // MCU → radio (UART), then the radio's feed line to the antenna's tripod
    const aV = vAt(L.aFootY - p * 0.5), aU = uAt(L.aX, aV);
    {
      const sd = (xb.u0 + xb.u1) / 2 < (mcu.u0 + mcu.u1) / 2 ? -1 : 1;
      const A = [sd < 0 ? mcu.u0 : mcu.u1, mcu.v0 + smu * 0.3], Bx = [sd < 0 ? xb.u1 : xb.u0, xb.v0 + (xb.v1 - xb.v0) * 0.55];
      const P = [A, [A[0] + sd * 0.1, A[1]], ...oct([A[0] + sd * 0.1, A[1]], [Bx[0] - sd * 0.1, Bx[1]], 0.5), Bx];
      L.rUart = bundle(P, wide ? 2 : 1, 0.07, 'uart');
      const C = [xb.u0 + (xb.u1 - xb.u0) * 0.3, xb.v0];
      L.rAnt = [addRoute([C, ...oct([C[0], C[1] - 0.06], [aU, aV], 0.4)], 'ant')];
      L.rAntFull = [L.rUart[0], L.rAnt[0]];
    }
    // chips onto the main bus (constant-depth traces: rows across the board)
    {
      const link = (q, nT) => {
        const sd = (q.u0 + q.u1) / 2 < 0 ? 1 : -1, ue = sd > 0 ? q.u1 : q.u0, ub = sd * -0.1275;
        for (let k = 0; k < nT; k++) {
          const vv = q.v0 + (q.v1 - q.v0) * (0.35 + 0.3 * k);
          const y = snapY(toY(vv)), vS = vAt(y);   // on a dot row, so it prints as one clean line
          const jog = Math.min(0.1, Math.abs(ub - ue) * 0.3);
          addRoute([[ue, vS], [ub - sd * jog, vS], [ub, vS + jog]], 'link');
        }
      };
      link(mcu, wide ? 2 : 1);
      if (soic) link(soic, 2);
    }
    // backhaul: from the data centre's foot back along the far board to the dish
    {
      const vb = Math.min(vAt(yRB + p * 0.6), 30);
      L.rBack = [addRoute([[0, vb], ...oct([0, vb - 0.5], [dU + (dU < 0 ? 0.3 : -0.3), dV + 0.3], 0.6), [dU, dV + 0.3]], 'back')];
    }
    // two side streets that run off under the viewer (desktop width only)
    if (wide) {
      [[0.05, 0.3, 11], [0.95, 0.4, 13]].forEach(([xf, sh, v1], k) => {
        const v0 = vBot, u0 = uAt(xf * w, v0), u1 = u0 * sh;
        addRoute([...oct([u0, v0], [u1, v1], 0.35), [u1, v1 + 16]], 'deco');
      });
    }
    // sample each route in screen space with a travel-time table: packets keep a steady pace on
    // screen but ease off as they recede (perspective)
    for (const R of routes) {
      const sx = [], sy = [], tt = [];
      let tAcc = 0, px_ = 0, py_ = 0;
      for (let k = 0; k + 1 < R.pts.length; k++) {
        const P0 = R.pts[k], P1 = R.pts[k + 1];
        const v0 = Math.min(vFar, P0[1]), v1 = Math.min(vFar, P1[1]);
        const x0 = toX(P0[0], v0), y0 = toY(v0), x1 = toX(P1[0], v1), y1 = toY(v1);
        const len = Math.hypot(x1 - x0, y1 - y0), N = Math.max(1, Math.ceil(len / 2));
        for (let j = k === 0 ? 0 : 1; j <= N; j++) {
          const f = j / N, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
          if (sx.length) tAcc += Math.hypot(x - px_, y - py_) / (0.25 + 0.75 * clamp((y - yH) / F));
          sx.push(x); sy.push(y); tt.push(tAcc); px_ = x; py_ = y;
        }
      }
      R.sx = Float32Array.from(sx); R.sy = Float32Array.from(sy); R.tt = Float32Array.from(tt); R.T = tAcc;
    }
    L.routes = routes;
    yield;

    // ---- per-plane layers on the extended grid
    const LD = [], LC = [];
    for (let k = 0; k <= BOARD; k++) { LD.push(new Float32Array(nE)); LC.push(new Uint8Array(nE).fill(FNT)); }
    const Y = {
      LD, LC, twA: new Float32Array(nE), twF: new Float32Array(nE), twP: new Float32Array(nE),
      wordCov: new Float32Array(nE), halo: new Uint8Array(nE), cu: new Uint8Array(nE), feat: new Uint8Array(nE),
      tRack: new Float32Array(colsE).fill(1e6), bRack: new Float32Array(colsE).fill(-1e6),
    };
    T.Y = Y;
    for (const q of racks) for (let c = q.c0; c <= q.c1; c++) { Y.tRack[c] = yOf(q.rt) - p * 0.5; Y.bRack[c] = yOf(q.rb) + p * 0.5; }

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
    const hS = (c, r) => hash2(c * 7 + 3, r * 13 + 1), hB = (c, r) => hash2(c * 3 + 11, r * 5 + 7);
    const glowTop = yH - h * mix(0.2, 0.17, a);
    const dcK = (x) => 0.45 + 0.55 * Math.exp(-Math.pow((x - L.dcX) / (w * 0.22), 2));

    yield;
    // ----- wordmark: dense bright dots, a little haze just above the cut
    for (let r = 0; r < rows; r++) {
      const y = yOf(r);
      if (y < wt || y > wb) continue;
      if ((r & 3) === 0) yield;
      for (let cE = 0; cE < colsE; cE++) {
        const j = r * colsE + cE, x = xOf(cE);
        const cv = Y.wordCov[j];
        if (cv <= 0.0) continue;
        const ty = (y - W.top) / W.cap;
        const haze = smoothstep(yH - W.cap * 0.35, yH + W.cap * 0.1, y);
        const lum = 0.95 - 0.06 * ty - 0.05 * haze + 0.05 * fbm2(x * 0.018, y * 0.018, 2);
        LD[WORD][j] = smoothstep(0.06, 0.94, cv) * lum;
        if (!CM) LC[WORD][j] = INK;
        else {
          // warm white; the foot of each letter catches the glow of the data centre (mint)
          const b1 = r + 1 < rows ? Y.wordCov[j + colsE] : 0;
          const edge = b1 < 0.3 ? 1 : 0;
          const cut = smoothstep(yH - p * 3.6, yH - p * 1.2, y);
          const lit = Math.max(edge * 0.6, cut) * (0.25 + 0.75 * Math.exp(-Math.abs(x - L.dcX) / (w * 0.22)));
          LC[WORD][j] = hB(cE - M, r) < lit * 0.85 ? WRM : WCR;
        }
      }
    }

    yield;
    // ----- sky: (mono) stars and a faint haze of light over the data centre between the letters
    //       · (colour) a dotted indigo night thickening to a teal city glow at the horizon
    {
      const r1 = Math.min(rows - 1, rowOf(yRB) + 1);
      for (let r = 0; r <= r1; r++) {
        if ((r & 3) === 0) yield;
        const y = yOf(r);
        for (let cE = 0; cE < colsE; cE++) {
          const j = r * colsE + cE, c = cE - M, x = xOf(cE);
          const hs = hS(c, r), hb = hB(c, r);
          let d = 0, col = MUT;
          const gz = smoothstep(glowTop, yH + p, y), dk = dcK(x);
          if (!CM) {
            const edge = smoothstep(0, h * 0.05, y);
            if (hs < 0.0105) {
              const br = Math.pow(hb, 5);
              d = (0.05 + 0.5 * br) * edge;
              col = d > 0.15 ? INK : MUT;
              Y.twA[j] = d > 0.12 ? 0.6 : 0.35;
              Y.twF[j] = 0.6 + 2.2 * hash2(c, r * 3 + 1);
              Y.twP[j] = TAU * hash2(c * 5 + 2, r);
            }
            if (gz > 0) {
              const gv = (0.02 * gz + 0.17 * Math.pow(gz, 1.6) * (0.85 + 0.3 * fbm2(x * 0.004, y * 0.012, 2))) * dk;
              const gs = fm(gv, hb, 0.085);
              if (gs > d) { d = gs; col = MUT; Y.twA[j] = 0; }
            }
          } else {
            const gy = clamp(y / yH);
            const tex = 0.8 + 0.4 * (0.5 + 0.5 * fbm2(x * 0.011, y * 0.022, 3));
            const glow = Math.pow(gz, 1.4) * dk;
            d = (0.016 + 0.06 * gy * gy + 0.34 * glow) * tex * smoothstep(-h * 0.02, h * 0.08, y);
            d = fm(d, hs * 0.5 + hash2(c * 11 + 5, r * 3 + 17) * 0.5, 0.13);
            col = glow > 0.42 ? (hb < 0.55 ? GLW : SK1) : glow > 0.2 ? (hb < 0.3 ? GLW : SK1) : gy > 0.55 && hb < 0.45 ? SK1 : SK0;
            if (hs < 0.012) {
              d = 0.08 + 0.48 * Math.pow(hb, 4);
              col = STAR;
              Y.twA[j] = 0.45; Y.twF[j] = 0.6 + 2.2 * hash2(c, r * 3 + 1); Y.twP[j] = TAU * hash2(c * 5 + 2, r);
            }
          }
          LD[SKY][j] = d; LC[SKY][j] = col;
        }
      }
      // orbit tracks: faint dashed ellipses (the satellites ride them)
      for (const s of L.sats) {
        const N = Math.ceil(Math.PI * (s.rx + s.ry) / (p * 0.12));
        let arc = 0, lx = 0, ly = 0;
        for (let q = 0; q <= N; q++) {
          const th = -0.25 + (Math.PI + 0.5) * q / N;
          const x = s.cx + s.rx * Math.cos(th), y = s.cy - s.ry * Math.sin(th);
          if (q) arc += Math.hypot(x - lx, y - ly);
          lx = x; ly = y;
          if (y > yH || y < 0) continue;
          if ((arc % (p * 2.2)) > p * 0.35) continue;
          const r = rowOf(y), cE = colOf(x);
          if (r < 0 || r >= rows || cE < 0 || cE >= colsE) continue;
          const j = r * colsE + cE;
          const v = (CM ? 0.17 : 0.12) * smoothstep(h * 0.03, h * 0.12, y);
          if (v > LD[SKY][j]) { LD[SKY][j] = v; LC[SKY][j] = CM ? ORB : MUT; Y.twA[j] = 0; }
        }
      }
    }

    yield;
    // ----- racks: a lid row, a frame, a body with 1U seams, and a column of status LEDs
    L.leds = [];
    for (const q of racks) {
      for (let r = q.rt; r <= q.rb; r++) {
        for (let cE = q.c0; cE <= q.c1; cE++) {
          const j = r * colsE + cE, c = cE - M;
          const top = r === q.rt, lft = cE === q.c0, rgt = cE === q.c1, ledCol = cE === q.c0 + 1;
          const seam = (r - q.rt) % 2 === 0;
          let d, col;
          if (top) { d = CM ? 0.62 : 0.5; col = CM ? RK1 : MUT; }
          else if (lft) { d = CM ? 0.5 : 0.28; col = CM ? RK1 : MUT; }
          else if (rgt) { d = CM ? 0.42 : 0.12; col = CM ? RK0 : MUT; }
          else { d = CM ? (seam ? 0.5 : 0.38) : (seam ? 0.1 : 0.05); col = CM ? RK0 : FNT; }
          if (ledCol && !top && r < q.rb && (r - q.rt) % 2 === 1) {
            d = CM ? 0.3 : 0.12; col = CM ? RK1 : MUT;
            const kind = hash2(c, r * 3 + 1);
            L.leds.push({ x: xOf(cE), y: yOf(r), k: kind < 0.62 ? 0 : kind < 0.85 ? 1 : kind < 0.95 ? 2 : 3, ph: hash2(c * 3, r), f: 0.4 + 1.6 * hash2(c, r * 7) });
          }
          if (!CM && (hS(c, r) > 0.5 && !top && !lft)) d *= 0.6;
          LD[RACK][j] = d; LC[RACK][j] = col;
        }
      }
    }

    yield;
    // ----- the board: solder mask, copper, pads, vias, silkscreen, chips
    const LDb = LD[BOARD], LCb = LC[BOARD];
    const r0B = Math.max(0, rowOf(yH) + (yOf(rowOf(yH)) <= yH + p * 0.3 ? 1 : 0));
    L.r0B = r0B;
    // the board thins out toward the page below (on desktop the footer bar sits over the last ~50 px)
    const botFade = (y) => (barOver ? 1 - smoothstep(h - 112, h - 34, y) : 1 - smoothstep(h * 0.88, h * 1.03, y));
    for (let r = r0B; r < rows; r++) {
      if ((r & 7) === 0) yield;
      const y = yOf(r), v = vAt(y);
      const far = smoothstep(3, 22, v), bot = botFade(y);
      const sheen = Math.exp(-(y - yH) / (F * 0.08));
      for (let cE = 0; cE < colsE; cE++) {
        const j = r * colsE + cE, c = cE - M, x = xOf(cE);
        const hs = hS(c, r), hb = hB(c, r);
        let d = 0, col = FNT;
        if (!CM) {
          // a dark board: a few specks, and its far edge catching the glow of the racks
          d = fm(0.04 * (0.2 + 0.8 * far) * bot, hs, 0.05);
          if (r === r0B) { d = 0.12 + 0.14 * dcK(x); col = MUT; }
        } else {
          // solder mask: small dots in two greens, a sheen at the far edge where it reflects the
          // city glow, thinning out toward the page below
          const u = uAt(x, v);
          const tex = 0.85 + 0.3 * noise2(u * 1.3, v * 0.9);
          d = (0.17 + 0.07 * (1 - far) + 0.16 * sheen * dcK(x)) * tex * (barOver ? bot : 0.3 + 0.7 * bot);
          col = sheen > 0.45 && hb < sheen * 0.75 ? (hs < 0.25 * dcK(x) ? GLW : MK2) : far > 0.7 ? (hb < 0.5 ? HZ : MK0) : hb < 0.25 ? MK0 : MK1;
          d = fm(d, hs, 0.1);
        }
        LDb[j] = d; LCb[j] = col;
      }
    }
    yield;
    const putF = (j, d, col, cu) => {
      if (!Y.feat[j] || d > LDb[j]) { LDb[j] = d; LCb[j] = col; Y.feat[j] = 1; }
      if (cu) Y.cu[j] = 1;
    };
    // a one-dot line on the extended grid (a dot per step along the major axis)
    const walkE = (x0, y0, x1, y1, fn) => {
      const gx0 = (x0 - ox) / p + M, gy0 = (y0 - oy) / p, gx1 = (x1 - ox) / p + M, gy1 = (y1 - oy) / p;
      const dx = gx1 - gx0, dy = gy1 - gy0, N = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
      let lc = -1e9, lr = -1e9;
      for (let k = 0; k <= N; k++) {
        const f = k / N, c = Math.round(gx0 + dx * f), r = Math.round(gy0 + dy * f);
        if (c === lc && r === lr) continue;
        lc = c; lr = r;
        if (c < 0 || c >= colsE || r < r0B || r >= rows) continue;
        fn(r * colsE + c, yOf(r), k);
      }
    };
    // copper: every route as a one-dot line whose dots shrink with distance
    const traceTone = (y) => {
      const v = vAt(y);
      return (CM ? mix(0.56, 0.2, smoothstep(1.6, 22, v)) : mix(0.36, 0.12, smoothstep(1.6, 20, v))) * botFade(y);
    };
    const segCu = (P0, P1, kind) => {
      const v0 = Math.min(vFar, Math.max(0.6, P0[1])), v1 = Math.min(vFar, Math.max(0.6, P1[1]));
      walkE(toX(P0[0], v0), toY(v0), toX(P1[0], v1), toY(v1), (j, y) => {
        const tn = traceTone(y) * (kind === 'deco' ? 0.75 : 1);
        if (tn < 0.03) return;
        putF(j, tn, CM ? (vAt(y) < 3 ? CUH : CU) : MUT, 1);
      });
    };
    for (let q = 0; q < routes.length; q++) {
      if ((q & 3) === 0) yield;
      const R = routes[q];
      for (let k = 0; k + 1 < R.pts.length; k++) segCu(R.pts[k], R.pts[k + 1], R.kind);
    }
    yield;
    // vias (a bright dot, a dark ring where it is big enough), SMD pad pairs
    const via = (u, v, big) => {
      if (v < 0.8) return;
      const x = toX(u, v), y = toY(v), r = rowOf(y), cE = colOf(x);
      if (r < r0B || r >= rows || cE < 1 || cE >= colsE - 1) return;
      const tn = traceTone(y) * 1.6 + 0.08;
      putF(r * colsE + cE, Math.min(0.9, tn), CM ? VIA : INK, 1);
      if (big && y - yH > F * 0.4) for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const rr = r + dr, cc = cE + dc;
        if (rr < r0B || rr >= rows) continue;
        const jj = rr * colsE + cc;
        if (!Y.feat[jj]) { LDb[jj] = CM ? 0.05 : 0; }
      }
    };
    for (let q = 0; q < routes.length; q++) {
      const R = routes[q], e = R.pts[R.pts.length - 1];
      if (R.kind === 'deco') via(e[0], Math.min(e[1], 18), true);
      if (R.kind === 'link') via(e[0], e[1], false);
      for (let k = 1; k + 1 < R.pts.length; k++) {
        if (R.kind !== 'deco' && hash2(k, q + 7) < 0.55) continue;
        const P = R.pts[k];
        if (P[1] < 1 || P[1] > 12) continue;
        via(P[0], P[1], true);
      }
    }
    {
      const pairs = [[-0.32, 1.5], [0.36, 1.35], [-0.36, 2.6], [0.3, 3.6], [0.32, 2.2]];
      for (const [u, v] of pairs) {
        const y = snapY(toY(v)), vv = vAt(y);
        if (y >= h || y <= yH) continue;
        const x0 = snapX(toX(u, vv)), r = rowOf(y), cE = colOf(x0);
        for (const dc of [-1, 1]) {
          const cc = cE + dc;
          if (cc < 0 || cc >= colsE) continue;
          putF(r * colsE + cc, Math.min(0.85, traceTone(y) * 1.5 + 0.12), CM ? CUH : INK, 1);
        }
      }
    }
    yield;
    // chips: low boxes standing on the board — pins as a comb, one dot in two, along each visible
    // edge; the body (top, front, the side facing us) from a ray–box test per dot
    const rb = { X: 0, Z: 0 };
    const rayBox = (q, x, y) => {
      const dx = (x - vpX) / F, dy = (y - yH) / F;
      if (dy <= 0) return -1;
      let t0 = q.v0, t1 = q.v1, face = 2;
      if (Math.abs(dx) < 1e-9) { if (q.u0 > 0 || q.u1 < 0) return -1; }
      else {
        let ta = q.u0 / dx, tb = q.u1 / dx;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        if (ta > t0) { t0 = ta; face = 1; }
        if (tb < t1) t1 = tb;
      }
      const ya = (1 - q.z) / dy, yb = 1 / dy;
      if (ya > t0) { t0 = ya; face = 0; }
      if (yb < t1) t1 = yb;
      if (t0 > t1) return -1;
      rb.Z = t0; rb.X = dx * t0;
      return face;
    };
    const pinTone = CM ? 0.62 : 0.5;
    const comb = (P0, P1, every) => {
      walkE(toX(P0[0], P0[1]), toY(P0[1]), toX(P1[0], P1[1]), toY(P1[1]), (j, y, k) => {
        if (k % every !== 0) return;
        putF(j, pinTone * (0.6 + 0.4 * botFade(y)), CM ? PIN : INK, 0);
      });
    };
    for (const q of chips) {
      let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
      for (const uu of [q.u0 - 0.1, q.u1 + 0.1]) for (const vv of [q.v0 - 0.1, q.v1 + 0.1]) for (const zz of [0, q.z]) {
        const x = toX(uu, vv), y = yH + F * (1 - zz) / vv;
        bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      }
      Object.assign(q, { bx0, bx1, by0, by1, yF: toY(q.v0), cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2 });
      // pins: just outside the body on the board
      const o = 0.05, inset = 0.06;
      if (q.kind === 'mcu' || q.kind === 'soic') {
        if (q.kind === 'mcu') comb([q.u0 + inset, q.v0 - o], [q.u1 - inset, q.v0 - o], 2);
        comb([q.u0 - o, q.v0 + inset], [q.u0 - o, q.v1 - inset], 2);
        comb([q.u1 + o, q.v0 + inset], [q.u1 + o, q.v1 - inset], 2);
      } else if (q.kind === 'xbee') {
        comb([q.u0 - o, q.v0 + inset], [q.u0 - o, q.v1 - inset], 2);
        comb([q.u1 + o, q.v0 + inset], [q.u1 + o, q.v1 - inset], 2);
      } else {
        comb([q.u0 - o, (q.v0 + q.v1) / 2], [q.u0 - o, (q.v0 + q.v1) / 2], 1);
        comb([q.u1 + o, (q.v0 + q.v1) / 2], [q.u1 + o, (q.v0 + q.v1) / 2], 1);
      }
      for (let r = Math.max(r0B, rowOf(by0) - 1); r <= Math.min(rows - 1, rowOf(by1) + 1); r++) {
        const y = yOf(r);
        for (let cE = Math.max(0, colOf(bx0) - 1); cE <= Math.min(colsE - 1, colOf(bx1) + 1); cE++) {
          const x = xOf(cE), j = r * colsE + cE, c = cE - M;
          const face = rayBox(q, x, y);
          if (face < 0) continue;
          const hb = hB(c, r);
          const fu = (rb.X - q.u0) / (q.u1 - q.u0), fv = (rb.Z - q.v0) / (q.v1 - q.v0);
          let d, col;
          if (q.kind === 'mcu' || q.kind === 'soic') {
            if (face === 0) {
              const rim = fv > 0.8 || fu < 0.07 || fu > 0.93;
              const dot1 = Math.hypot((fu - 0.16) * (q.u1 - q.u0), (fv - 0.2) * (q.v1 - q.v0)) < 0.07;
              d = CM ? (rim ? 0.6 : 0.56) : rim ? 0.22 : 0.15;
              col = CM ? (rim && fv > 0.8 ? CHT : CHB) : rim ? MUT : FNT;
              if (dot1) { d = CM ? 0.42 : 0.26; col = CM ? CHT : MUT; }
            } else if (face === 2) { d = CM ? 0.5 : 0.07; col = CM ? CHB : FNT; }
            else { d = CM ? 0.52 : 0.1; col = CM ? CHB : FNT; }
          } else if (q.kind === 'xbee') {
            // a radio module: its own small board (green) under a silver RF shield
            if (face === 0) {
              const shield = fu > 0.14 && fu < 0.86 && fv > 0.1 && fv < 0.66;
              d = CM ? (shield ? 0.6 : 0.5) : shield ? 0.3 : 0.12;
              col = CM ? (shield ? (fv > 0.56 || hb < 0.12 ? PIN : DSS) : MK2) : shield ? MUT : FNT;
            } else { d = CM ? 0.5 : 0.08; col = CM ? MK0 : FNT; }
          } else {
            d = face === 0 ? (CM ? 0.66 : 0.32) : (CM ? 0.45 : 0.12);
            col = CM ? (face === 0 ? PIN : DSS) : face === 0 ? MUT : FNT;
          }
          LDb[j] = d * (0.55 + 0.45 * botFade(y)); LCb[j] = col; Y.feat[j] = 1; Y.cu[j] = 0;
        }
      }
      // silkscreen: corner brackets just outside the pins
      if (q.kind === 'mcu' || q.kind === 'xbee') {
        const so = 0.15, sl = Math.min(0.18, (q.u1 - q.u0) * 0.25);
        const ux0 = q.u0 - so, ux1 = q.u1 + so, vy0 = q.v0 - so;
        const silk = (u0, v0, u1, v1) => walkE(toX(u0, v0), toY(v0), toX(u1, v1), toY(v1), (j, y) => putF(j, (CM ? 0.4 : 0.14) * botFade(y), CM ? SLK : MUT, 0));
        silk(ux0, vy0, ux0 + sl, vy0); silk(ux0, vy0, ux0, vy0 + sl);
        silk(ux1, vy0, ux1 - sl, vy0); silk(ux1, vy0, ux1, vy0 + sl);
      }
    }
    // the radio module's whip antenna
    {
      const q = xb, wu = q.u0 + (q.u1 - q.u0) * 0.82, wv = q.v1 - 0.05;
      const x = snapX(toX(wu, wv)), y0 = yH + F * (1 - q.z) / wv;
      L.whip = { x, y0, y1: y0 - p * mix(4, 5, a), yF: q.yF };
    }
    yield;

    // ---- per-dot (visible) composite at rest, and the buffers a pan composes into
    const B = T.B = {
      twA: new Float32Array(n), twF: new Float32Array(n), twP: new Float32Array(n),
      fxD: new Float32Array(n), fxC: new Uint8Array(n), fxM: new Uint8Array(n), fxAge: new Float32Array(n), fxS: new Uint8Array(n),
      fxL: new Float32Array(n),
      stamp: new Uint32Array(n), touched: new Int32Array(n), nTouched: 0, frame: 1, nz2: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) B.nz2[i] = noise2(xs[i] * 0.1, ys[i] * 0.1);   // fine smoke grain (static)
    yield;
    T.D0 = new Float32Array(n); T.C0 = new Uint8Array(n); T.K0 = new Uint8Array(n); T.U0 = new Uint8Array(n);
    T.Dd = new Float32Array(n); T.Cd = new Uint8Array(n); T.Kd = new Uint8Array(n); T.Ud = new Uint8Array(n);
    T.cBase = new Int32Array(3); T.cFrac = new Float32Array(3); T.cTop = new Float32Array(cols * 2);
    T.offs = new Float32Array(3);
    compose(T, 0, T.D0, T.C0, T.K0, T.U0, 0, false);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, j = r * colsE + c + M;
      if (T.K0[i] === SKY) { B.twA[i] = Y.twA[j]; B.twF[i] = Y.twF[j]; B.twP[i] = Y.twP[j]; }
    }
    let rTop = yRB;
    for (const q of racks) rTop = Math.min(rTop, yOf(q.rt));
    T.horizon = +(yH / h).toFixed(3);
    T.skyline = +(rTop / h).toFixed(3);
  }

  // ---------------------------------------------------------------- compositor
  // Paints the planes far → near, each shifted by its own parallax offset (sub-dot shifts by
  // linear interpolation); the board shifts row by row (its parallax grows toward the viewer, so
  // a pan pivots the copper about the vanishing point). cam = 0 reproduces the rest composite.
  function compose(S, cam, D, C, K, CUv, t, tw) {
    const L = S.L, Y = S.Y, p = L.p, cols = L.cols, rows = L.rows, M = L.M, colsE = L.colsE;
    const base = S.cBase, frac = S.cFrac, T = S.cTop;
    for (let k = 0; k < 3; k++) {
      const u = M - cam * PX[k] / p;
      const b = Math.max(0, Math.min(colsE - cols - 1, Math.floor(u)));
      base[k] = b; frac[k] = clamp(u - b);
      if (S.offs) S.offs[k] = cam * PX[k];
    }
    {
      const b = base[RACK] + (frac[RACK] >= 0.5 ? 1 : 0);
      for (let c = 0; c < cols; c++) { T[c] = Y.tRack[c + b]; T[cols + c] = Y.bRack[c + b]; }
    }
    const LDs = Y.LD, LCs = Y.LC, wc_ = Y.wordCov, halo = Y.halo, cu = Y.cu, yH = L.yH;
    const bW = base[WORD], fW = frac[WORD];
    for (let r = 0; r < rows; r++) {
      const y = L.oy + r * p, rowE = r * colsE, rowV = r * cols;
      const isB = r >= L.r0B;
      let bB = 0, fB = 0;
      if (isB) {
        const u = M - cam * pxB(L, y) / p;
        bB = Math.max(0, Math.min(colsE - cols - 1, Math.floor(u))); fB = clamp(u - bB);
      }
      for (let c = 0; c < cols; c++) {
        const i = rowV + c;
        let k;
        if (y >= T[c] && y < T[cols + c]) k = RACK;
        else if (isB) k = BOARD;
        else {
          const je = rowE + c + bW;
          const wc = wc_[je] + (wc_[je + 1] - wc_[je]) * fW;
          const occ = Math.min(yH, T[c]);
          if (wc > 0.04) {
            if (y > occ - p * 1.05) { D[i] = 0; C[i] = FNT; K[i] = WORD; CUv[i] = 0; continue; }   // one empty row parts letters from the skyline
            k = WORD;
          } else if (halo[fW < 0.5 ? je : je + 1]) { D[i] = 0; C[i] = FNT; K[i] = WORD; CUv[i] = 0; continue; }
          else k = SKY;
        }
        let ce, f;
        if (k === BOARD) { ce = rowE + c + bB; f = fB; } else { ce = rowE + c + base[k]; f = frac[k]; }
        const ld = LDs[k];
        let d = f ? ld[ce] + (ld[ce + 1] - ld[ce]) * f : ld[ce];
        const jn = f < 0.5 ? ce : ce + 1;
        C[i] = LCs[k][jn];
        if (tw && k === SKY) { const ta = Y.twA[jn]; if (ta > 0) d *= 1 - ta * (0.5 + 0.5 * Math.sin(t * Y.twF[jn] + Y.twP[jn])); }
        CUv[i] = k === BOARD ? cu[jn] : 0;
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

  // satellite k at scene time t: screen position (rest) and whether it is in the clear sky
  function satPos(L, k, t, o) {
    const s = L.sats[k];
    const ph = (((t + s.ph) % s.T) + s.T) % s.T;
    const u = ph / s.cross;
    const thA = s.dir > 0 ? Math.PI + 0.22 : -0.22, thB = s.dir > 0 ? -0.22 : Math.PI + 0.22;
    const th = thA + (thB - thA) * Math.min(u, 1.2);
    o.x = s.cx + s.rx * Math.cos(th); o.y = s.cy - s.ry * Math.sin(th); o.u = u;
    o.up = u <= 1 && o.y < L.satUpY && o.x > L.w * 0.02 && o.x < L.w * 0.98;
    return o;
  }
  function canSat(L, t, o) {
    const c = L.cs, ph = ((t + 7) % c.T + c.T) % c.T, u = ph / c.T;
    o.u = u;
    o.x = c.x0 + (c.x1 - c.x0) * u + L.p * 1.2 * Math.sin(t * 0.5);
    o.y = c.y0 + (c.y1 - c.y0) * u;
    o.v = smoothstep(0, 0.08, u) * (1 - smoothstep(0.9, 1, u));
    return o;
  }
  const SP = { x: 0, y: 0, u: 0, up: false }, CS = { x: 0, y: 0, u: 0, v: 0 };

  // the dish's pivot and focus, and where it points (screen, incl. the pan offset)
  function dishGeom(S, o) {
    const L = S.L, phi = S.I.dishA, R = L.dR, tau = L.dTau + 0.3 * Math.pow(Math.abs(Math.cos(phi)), 1.3);
    const bx = Math.cos(phi), by = -Math.sin(phi);
    const px = L.dX + (S.oDish || 0), py = L.dPivY;
    const ct = Math.cos(tau);
    o.bx = bx; o.by = by; o.px = px; o.py = py; o.tau = tau;
    o.cx = px + bx * R * 0.3 * ct; o.cy = py + by * R * 0.3 * ct;
    o.fx = o.cx + bx * R * 0.62 * ct; o.fy = o.cy + by * R * 0.62 * ct;
    return o;
  }
  const DG = {};

  function update(S, st, dt) {
    const L = S.L;
    if (!L) return;
    const I = S.I, P = st.pointer, now = st.now, red = st.reduced || !!st.still, t = st.t;
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
    S.oDish = I.cam * pxB(L, L.dBaseY);

    // timelines
    const RS = I.rockets;
    for (let k = RS.length - 1; k >= 0; k--) if (now - RS[k].t0 > RS[k].life) RS.splice(k, 1);
    const prune = (arr, life) => { for (let k = arr.length - 1; k >= 0; k--) if (now - arr[k].t0 > (arr[k].life || life)) arr.splice(k, 1); };
    prune(I.taps, 0.9); prune(I.bursts, 6); prune(I.ups, 4); prune(I.pings, 2.2); prune(I.tele, 4); prune(I.acks, 1.2);
    if (RS.length || I.taps.length || I.bursts.length || I.ups.length || I.pings.length || I.tele.length || I.acks.length ||
      now - I.syncT < 1.6 || I.gq || now - I.trT < TR_DUR) busy = true;

    // chains: packets that reach the dish go up the beam; the CanSat answers a pulse
    for (const b of I.bursts) {
      if (!b.done && now - b.t0 >= b.T) {
        b.done = true;
        if (b.to === 'dish') uplink(S, st, b.user);
        else if (b.to === 'ant') telemetry(S, st, b.user);
      }
    }
    if (now - I.syncT > 0.45 && !I.syncSent) { I.syncSent = true; burst(S, st, 'back', I.syncUser); }

    if (aim(S, st, dt)) busy = true;
    // ambient life (scene time: frozen under reduced motion / pause): every few seconds the dish
    // sends a short uplink, and the CanSat a line of telemetry down to the antenna
    if (!red) {
      const k = Math.floor(t / 6.5);
      if (k !== I.autoUp) { I.autoUp = k; if (I.trk >= 0 && I.dishErr < 0.08 && k > 0) uplink(S, st, false, true); }
      const k2 = Math.floor((t + 2.7) / 5.5);
      if (k2 !== I.autoTele) { I.autoTele = k2; if (k2 > 0) I.tele.push({ t0: now, user: false, quiet: true, life: 3 }); }
    }

    // ghost demo: only when nobody is playing — no input for a while (sooner before the first ever
    // touch), nothing the visitor set off still alive, the pointer outside or resting a long time
    let mine = false;
    for (let k = 0; k < RS.length && !mine; k++) if (RS[k].user) mine = true;
    for (const arr of [I.bursts, I.ups, I.pings, I.tele]) for (let k = 0; k < arr.length && !mine; k++) if (arr[k].user) mine = true;
    if (I.syncUser && now - I.syncT < 2.5) mine = true;
    const quiet = now - Math.max(I.lastIn, I.lastMove, I.t0) > (I.ever ? G_QUIET : G_FIRST);
    const still = !P.inside || now - I.lastMove > G_STILL;
    const idle = !red && !P.down && !I.drag && (st.progress || 0) > 0.72 && quiet && still && !mine;
    if (!idle) I.ghostNext = Math.max(I.ghostNext, now + 0.9);
    else if (now >= I.ghostNext && !I.gq && !I.gd) {
      const k = I.ghostK++;
      const pick = k % 6;                     // launch · send · drag · uplink · ping · sync
      if (pick === 2) I.gd = { t0: now + 0.35, T: 1.1, dir: (k / 6 | 0) % 2 ? -1 : 1, D: lim * 0.85, x0: L.w * 0.5, y: L.h * 0.62 };
      else {
        let kind = 'launch', x = L.w * (0.3 + 0.4 * hash2(k, 71)), y = L.h * (0.06 + 0.1 * hash2(k, 72));
        if (pick === 1) { kind = 'send'; const q = L.chips[0]; x = q.cx; y = q.cy; }
        else if (pick === 3) { kind = 'uplink'; dishGeom(S, DG); x = DG.cx; y = DG.cy; }
        else if (pick === 4) { kind = 'ping'; x = L.vpX + L.F * 0.35 / 3.6; y = L.yH + L.F / 3.6; if (hitAt(S, x, y).kind !== 'ping') { kind = 'launch'; x = L.w * 0.5; y = L.h * 0.08; } }
        else if (pick === 5) { kind = 'sync'; const q = L.racks[L.racks.length >> 1]; if (q) { x = L.ox + (q.c0 - L.M + 1) * L.p; y = L.oy + (q.rt + 2) * L.p; } else kind = 'launch'; }
        tap(S, now, x, y, true);
        I.gq = { kind, x, y, at: now + 0.38, q: 0 };
      }
      I.ghostNext = now + G_EVERY;
    }
    if (I.gq && now >= I.gq.at) {
      const q = I.gq;
      I.gq = null;
      if (q.kind === 'launch') launch(S, st, q.x, q.y, false);
      else act(S, st, q.kind, q.x, q.y, false, q.q);
    }

    // the cursor label says what a click does right here
    if (P.inside || I.drag) setCursor(S, st, I.drag ? 'Drag' : hitAt(S, P.x, P.y).label);

    // background pre-build of the other colour mode (a few ms per frame)
    if (!P.down && now >= S.preAt) prebuild(S, st, 2.5);
    if (busy) st.busy = true;
  }

  // the dish: tracks the newest rocket a visitor launched while it climbs, otherwise the
  // satellite overhead (handing over when it slips behind the letters), parked at the next
  // rise point between passes. A slew is a damped spring with a rate limit (it has mass).
  // The Moxon–Yagi follows the CanSat. Returns true while either is still moving.
  function aim(S, st, dt) {
    const L = S.L, I = S.I, t = st.t, red = st.reduced || !!st.still, RS = I.rockets;
    let busy = false;
    S.oDish = I.cam * pxB(L, L.dBaseY);
    {
      let tx = null, ty = 0;
      for (let k = RS.length - 1; k >= 0; k--) {
        const R = RS[k];
        if (R.user && R.tau > 0.2 && R.tau < R.tHit + 1.2 && R.P) { tx = R.P.x; ty = R.P.y; break; }
      }
      if (tx === null) {
        let pick = -1;
        if (I.trk >= 0 && satPos(L, I.trk, t, SP).up) pick = I.trk;
        else for (let k = 0; k < L.sats.length; k++) if (satPos(L, k, t, SP).up) { pick = k; break; }
        I.trk = pick;
        if (pick >= 0) { satPos(L, pick, t, SP); tx = SP.x + I.cam * PX[SKY]; ty = SP.y; }
        else { tx = L.dX + L.w * 0.25; ty = L.h * 0.08; }
      }
      const px = L.dX + S.oDish, py = L.dPivY;
      const tgt = clamp(Math.atan2(py - ty, tx - px), 0.3, Math.PI - 0.3);
      if (I.dishA === null || red) { I.dishA = tgt; I.dishV = 0; }
      else if (dt > 0) {
        const steps = Math.max(1, Math.ceil(dt / 0.008)), hh = dt / steps;
        for (let s = 0; s < steps; s++) {
          const acc = 38 * (tgt - I.dishA) - 11 * I.dishV;
          I.dishV = clamp(I.dishV + acc * hh, -1.6, 1.6);
          I.dishA += I.dishV * hh;
        }
        if (Math.abs(tgt - I.dishA) > 0.004 || Math.abs(I.dishV) > 0.01) busy = true;
      }
      I.dishErr = Math.abs(tgt - I.dishA);
    }
    // the Moxon–Yagi follows the CanSat (slowly: a hand-turned mast)
    {
      canSat(L, t, CS);
      const o = I.cam * pxB(L, L.aFootY);
      const tgt = clamp(Math.atan2(L.aY - CS.y, CS.x + I.cam * PX[SKY] - (L.aX + o)), 0.25, Math.PI - 0.25);
      if (I.antA === null || red) { I.antA = tgt; I.antV = 0; }
      else if (dt > 0) {
        const steps = Math.max(1, Math.ceil(dt / 0.008)), hh = dt / steps;
        for (let s = 0; s < steps; s++) {
          const acc = 14 * (tgt - I.antA) - 7 * I.antV;
          I.antV = clamp(I.antV + acc * hh, -0.8, 0.8);
          I.antA += I.antV * hh;
        }
      }
    }
    return busy;
  }

  function kindAt(S, x, y) {
    const L = S.L;
    const c = clamp(Math.round((x - L.ox) / L.p), 0, L.cols - 1), r = clamp(Math.round((y - L.oy) / L.p), 0, L.rows - 1);
    return S.K[r * L.cols + c];
  }

  // what is under a point: the dish, the antenna, a chip, the racks, the board, or sky
  const HIT = { kind: 'launch', label: 'Launch', q: -1 };
  function hitAt(S, x, y) {
    const L = S.L, I = S.I, p = L.p, cam = I.cam;
    HIT.q = -1;
    // the antenna (nearest)
    {
      const o = cam * pxB(L, L.aFootY), ax = L.aX + o, ay = L.aY, th = I.antA || 0.6;
      const bx = Math.cos(th), by = -Math.sin(th);
      const rx = x - ax, ry = y - ay, al = rx * bx + ry * by, ac = -rx * by + ry * bx;
      const tip = -L.aBack + 2 * L.aE + L.aG + L.aDs * 5 + p;
      if ((al > -L.aBack - p && al < tip && Math.abs(ac) < L.aA * 1.15) ||
        (Math.abs(x - ax) < p * 3.5 && y > ay && y < L.aFootY + p)) { HIT.kind = 'telemetry'; HIT.label = 'Telemetry'; return HIT; }
    }
    // the dish
    {
      dishGeom(S, DG);
      const R = L.dR;
      if (Math.hypot(x - DG.cx, y - DG.cy) < R * 1.12 || (Math.abs(x - DG.px) < R * 0.45 && y > DG.py && y < L.dBaseY + p)) {
        HIT.kind = 'uplink'; HIT.label = 'Uplink'; return HIT;
      }
    }
    // the tower and the pad: launch
    {
      const o = cam * pxB(L, L.padY);
      if (x > L.padX + o - L.rocketW * 1.4 && x < L.towerX + o + p * 2.5 && y > L.towerTop - p * 2 && y < L.padY + p * 2) { HIT.kind = 'launch'; HIT.label = 'Launch'; return HIT; }
    }
    // chips
    for (let q = 0; q < L.chips.length; q++) {
      const c = L.chips[q], o = cam * pxB(L, c.yF);
      if (x > c.bx0 + o - p && x < c.bx1 + o + p && y > c.by0 - p && y < c.by1 + p) { HIT.kind = 'send'; HIT.label = 'Send'; HIT.q = q; return HIT; }
    }
    const k = kindAt(S, x, y);
    if (k === RACK) { HIT.kind = 'sync'; HIT.label = 'Sync'; return HIT; }
    if (k === BOARD) { HIT.kind = 'ping'; HIT.label = 'Ping'; return HIT; }
    HIT.kind = 'launch'; HIT.label = 'Launch';
    return HIT;
  }

  // the instant answer to any tap: a ring of dots expanding where the finger / cursor came down
  function tap(S, now, x, y, ghost) {
    const I = S.I;
    I.taps.push({ x, y, t0: now, ghost });
    if (I.taps.length > 8) I.taps.shift();
  }

  function launch(S, st, x, y, user) {
    const L = S.L, I = S.I, now = st.now;
    const oPad = I.cam * pxB(L, L.padY);
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

  // a burst of packets along a set of routes ('dish' from the MCU, 'ant' from the radio, 'back'
  // from the data centre); when the last one arrives the next stage fires
  function burst(S, st, which, user) {
    const L = S.L, I = S.I;
    const ids = which === 'dish' ? L.rDish : which === 'ant' ? L.rAnt : L.rBack;
    let T = 0;
    for (const id of ids) T = Math.max(T, L.routes[id].T);
    const v = L.w * mix(0.55, 0.62, L.a) + 220;     // px/s at the near edge
    const n = 5, gap = 0.07;
    const dur = T / v + gap * (n - 1);
    I.bursts.push({ t0: st.now, ids, v, n, gap, T: dur, user: !!user, to: which === 'ant' ? 'ant' : 'dish', id: I.nB++, life: dur + 0.6 });
    if (I.bursts.length > 6) I.bursts.shift();
  }
  function uplink(S, st, user, quiet) {
    const I = S.I;
    I.ups.push({ t0: st.now, user: !!user, quiet: !!quiet, n: quiet ? 3 : 6, life: 3.2 });
    if (I.ups.length > 6) I.ups.shift();
  }
  function telemetry(S, st, user) {
    const I = S.I;
    I.tele.push({ t0: st.now, user: !!user, life: 3.4 });
    if (I.tele.length > 5) I.tele.shift();
  }
  function ping(S, st, x, y, user) {
    const L = S.L, I = S.I;
    if (y <= L.yH + L.p * 0.5) return;
    const o = I.cam * pxB(L, y);
    const v = L.F / (y - L.yH), u = (x - o - L.vpX) * v / L.F;
    I.pings.push({ t0: st.now, u, v, user: !!user, life: 2.2 });
    if (I.pings.length > 4) I.pings.shift();
  }

  function act(S, st, kind, x, y, user, q) {
    const I = S.I;
    if (kind === 'uplink') uplink(S, st, user);
    else if (kind === 'send') burst(S, st, q === 1 ? 'ant' : 'dish', user);
    else if (kind === 'telemetry') telemetry(S, st, user);
    else if (kind === 'ping') ping(S, st, x, y, user);
    else if (kind === 'sync') { I.syncT = st.now; I.syncUser = !!user; I.syncSent = false; }
  }

  function click(S, x, y, st) {
    const L = S.L;
    if (!L) return;
    const I = S.I;
    I.lastIn = st.now; I.ever = true; I.gq = null;
    const hit = hitAt(S, x, y);
    tap(S, st.now, x, y, false);
    if (hit.kind === 'launch') launch(S, st, x, y > L.yH - L.p * 2 ? Math.min(y, L.h * 0.2) : y, true);
    else act(S, st, hit.kind, x, y, true, hit.q);
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
      case 'u': case 'U': uplink(S, st, true); break;
      case 'p': case 'P': burst(S, st, 'dish', true); break;
      case 't': case 'T': telemetry(S, st, true); break;
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

  // soft disc of smoke (fx mode 2) on dots no nearer than plane maxK
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
        // fxL: + on the side of the puff that faces the light (left, a little below)
        if (v > B.fxD[i] && B.fxM[i] !== 1) { B.fxD[i] = v; B.fxAge[i] = age; B.fxM[i] = 2; B.fxS[i] = src; B.fxL[i] = -0.92 * dx + 0.3 * dy; }
      }
    }
  }

  // a point splatted bilinearly onto the 4 nearest dots of planes [k0, k1];
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
  // one crisp dot: the nearest grid dot only (small things that must not blur: LEDs, a satellite)
  function dot(S, x, y, v, col, k0, k1) {
    const L = S.L, B = S.B, K = S.K, p = L.p;
    const c = Math.round((x - L.ox) / p), r = Math.round((y - L.oy) / p);
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return;
    const i = r * L.cols + c, kk = K[i];
    if (kk < k0 || kk > k1) return;
    touch(B, i);
    if ((B.fxM[i] === 1 || B.fxM[i] === 3) && B.fxD[i] >= v) return;
    B.fxM[i] = 1; B.fxD[i] = v; B.fxC[i] = col;
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

  // a straight stroke, rasterised per dot (crisp at any angle). mode 'collar' darkens instead
  function stroke(S, x0, y0, x1, y1, hw, v, col, k0, k1, collarR) {
    const L = S.L, B = S.B, K = S.K, D = S.D, C = S.C, p = L.p, cols = L.cols;
    const pad = (collarR || hw) + p * 0.6;
    const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - pad - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((Math.max(x0, x1) + pad - L.ox) / p));
    const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - pad - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((Math.max(y0, y1) + pad - L.oy) / p));
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-6;
    for (let r = r0; r <= r1; r++) {
      const py = L.oy + r * p;
      for (let c = c0; c <= c1; c++) {
        const px = L.ox + c * p;
        let tt = ((px - x0) * dx + (py - y0) * dy) / l2;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const ex = px - (x0 + dx * tt), ey = py - (y0 + dy * tt), dist = Math.sqrt(ex * ex + ey * ey);
        const i = r * cols + c, kk = K[i];
        if (kk < k0 || kk > k1) continue;
        if (collarR) {
          if (dist > collarR) continue;
          touch(B, i);
          const m = B.fxM[i];
          if (m === 1 || m === 2) continue;
          const cur = m ? B.fxD[i] : D[i];
          if (cur <= v) continue;
          if (!m) B.fxC[i] = C[i];
          B.fxM[i] = 1; B.fxD[i] = v;
          continue;
        }
        const cov = smoothstep(hw + p * 0.42, hw + p * 0.05, dist);
        if (cov < 0.06) continue;
        const vv = v * (0.3 + 0.7 * cov);
        touch(B, i);
        if (B.fxM[i] === 1 && B.fxD[i] >= vv && B.fxS[i] === 7) continue;
        B.fxM[i] = 1; B.fxD[i] = vv; B.fxC[i] = col; B.fxS[i] = 7;
      }
    }
  }

  // a one-dot line on the visible grid: one dot per step along the major axis (crisp at any angle)
  function walk(L, x0, y0, x1, y1, fn) {
    const gx0 = (x0 - L.ox) / L.p, gy0 = (y0 - L.oy) / L.p, gx1 = (x1 - L.ox) / L.p, gy1 = (y1 - L.oy) / L.p;
    const dx = gx1 - gx0, dy = gy1 - gy0, N = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
    let lc = -1e9, lr = -1e9;
    for (let k = 0; k <= N; k++) {
      const f = k / N, c = Math.round(gx0 + dx * f), r = Math.round(gy0 + dy * f);
      if (c === lc && r === lr) continue;
      lc = c; lr = r;
      if (c < 0 || c >= L.cols || r < 0 || r >= L.rows) continue;
      fn(r * L.cols + c, f, k);
    }
  }
  // crisp strokes [x0, y0, x1, y1, v, col] with a one-dot dark collar round them: hardware that
  // stands in front of the scene (the antenna, the dish's struts)
  const LST = [];
  function lines(S, segs, k0, k1, dv) {
    const L = S.L, B = S.B, K = S.K, D = S.D, C = S.C, cols = L.cols;
    LST.length = 0;
    for (let q = 0; q < segs.length; q++) {
      const sg = segs[q];
      walk(L, sg[0], sg[1], sg[2], sg[3], (i) => {
        const kk = K[i];
        if (kk < k0 || kk > k1) return;
        touch(B, i);
        if (B.fxS[i] === 8 && B.fxD[i] >= sg[4]) return;
        B.fxM[i] = 1; B.fxD[i] = sg[4]; B.fxC[i] = sg[5]; B.fxS[i] = 8; LST.push(i);
      });
    }
    if (dv < 0) return;
    for (let q = 0; q < LST.length; q++) {
      const i = LST[q], r = (i / cols) | 0, c = i - r * cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((!dr && !dc) || rr < 0 || cc < 0 || rr >= L.rows || cc >= cols) continue;
        const j = rr * cols + cc, kk = K[j];
        if (kk < k0 || kk > k1) continue;
        touch(B, j);
        if (B.fxS[j] === 8 || B.fxM[j] === 2) continue;
        const cur = B.fxM[j] ? B.fxD[j] : D[j];
        if (cur <= dv) continue;
        if (!B.fxM[j]) B.fxC[j] = C[j];
        B.fxM[j] = 1; B.fxD[j] = dv;
      }
    }
  }

  function frame(S, st, t) {
    const B = S.B, L = S.L, I = S.I, p = L.p;
    for (let j = 0; j < B.nTouched; j++) { const i = B.touched[j]; B.fxM[i] = 0; B.fxD[i] = 0; B.fxS[i] = 0; }
    B.nTouched = 0; B.frame++;
    // camera pan → per-plane offsets → composite
    const cam = I.cam;
    S.pan = Math.abs(cam) > 0.04;
    if (S.pan) {
      compose(S, cam, S.Dd, S.Cd, S.Kd, S.Ud, t, true);
      S.D = S.Dd; S.C = S.Cd; S.K = S.Kd; S.CUv = S.Ud;
    } else { S.D = S.D0; S.C = S.C0; S.K = S.K0; S.CUv = S.U0; for (let k = 0; k < 3; k++) S.offs[k] = 0; }
    S.oPad = cam * pxB(L, L.padY);
    S.oDish = cam * pxB(L, L.dBaseY);
    S.oAnt = cam * pxB(L, L.aFootY);
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
    if (I.dishA === null || I.antA === null) aim(S, st, 0);

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

    // 1. smoke
    if (ign > 0.001) mainExhaust(S, t, prog, s, ign);
    for (let k = 0; k < RS.length; k++) rocketSmoke(S, RS[k], t);
    smokeTexture(S, t);
    // 2. sky: satellites, the CanSat, the uplink and telemetry links
    sky(S, t, now, red);
    // 3. light: pad floodlights before launch, flames lighting the ground and the smoke
    mainLights(S, t, R, ign, climb);
    for (let k = 0; k < RS.length; k++) rocketLights(S, RS[k], now);
    // 4. the data centre's LEDs, packets on the copper, pings
    leds(S, t, now, red);
    board(S, t, now, red);
    // 5. the dish, the tower, then the rockets
    dish(S, t, now);
    tower(S, t, red);
    {
      const flick = 0.5 + 0.5 * Math.sin(t * 23) * Math.sin(t * 13.7);
      const fl = L.rocketL * (1.0 + 0.22 * flick) * ign * (L.CM ? 1.3 : 1);
      rocketBody(S, t, R.x, R.y, R.ux, R.uy, L.rocketL, L.rocketW * 0.5, fl, 1, 1, 1);
    }
    for (let k = 0; k < RS.length; k++) rocketDraw(S, RS[k], now);
    // 6. the antenna, nearest of all
    antenna(S, t, now);
    if (!red) meteors(S, t);
    // 7. answers to the hand: tap rings, the rockets' target reticles, the ghost's finger
    for (let k = 0; k < RS.length; k++) reticle(S, RS[k]);
    tapRings(S, now);
    if (I.gd) ghostFinger(S, now);
  }

  // ---- sky: the two satellites on their tracks, the uplink beam, the CanSat
  // a satellite: a bright bus between two solar wings (an H, two rows tall); x glides, y on a row
  function satDraw(S, x, y, v, hot) {
    const L = S.L, X = S.X, p = L.p;
    const yy = L.oy + Math.round((y - L.oy) / p) * p;
    collar(S, x, yy + p * 0.5, p * 2.6, SKY, SKY, 0.02);
    for (let row = 0; row < 2; row++) {
      const y_ = yy + row * p;
      splat(S, x, y_, v, hot ? X.pktHot : X.sat, SKY, SKY, 1, 0.4);
      for (const j of [-3, -2, 2, 3]) splat(S, x + j * p, y_, v * 0.8, X.satP, SKY, SKY, 1, 0.4);
      if (!row) for (const j of [-1, 1]) splat(S, x + j * p, y_, v * 0.35, X.satP, SKY, SKY, 1, 0.4);
    }
  }
  function sky(S, t, now, red) {
    const L = S.L, X = S.X, p = L.p, I = S.I, oS = S.offs[SKY];
    for (let k = 0; k < L.sats.length; k++) {
      satPos(L, k, t, SP);
      if (SP.u > 1.05) continue;
      const x = SP.x + oS;
      let hot = false;
      for (const A of I.acks) if (A.k === k && now - A.t0 < 0.5) hot = true;
      satDraw(S, x, SP.y, k === 0 ? 0.95 : 0.75, hot);
      // its blinking nav light
      if (!red && (t * 1.3 + k * 0.5) % 1 < 0.12) dot(S, x, SP.y - p, 0.6, X.beacon2, SKY, SKY);
    }
    // ack rings round a satellite when an uplink arrives
    for (const A of I.acks) {
      const tau = now - A.t0;
      if (tau < 0 || tau > 0.9) continue;
      satPos(L, A.k, t, SP);
      const u = tau / 0.9, rad = p * (1.6 + 5 * (1 - (1 - u) * (1 - u))), vv = 0.9 * (1 - u);
      const N = Math.max(8, Math.round(TAU * rad / (p * 1.3)));
      for (let j = 0; j < N; j++) { const an = TAU * j / N; splat(S, SP.x + oS + Math.cos(an) * rad, SP.y + Math.sin(an) * rad, vv, A.user ? X.pktHot : X.beam, SKY, WORD, 1, 0.55); }
    }
    // the uplink: dish focus → tracked satellite. A faint dotted link where it crosses clear sky
    // (behind the letters), and trains of bright packets over everything
    dishGeom(S, DG);
    const fx = DG.fx, fy = DG.fy;
    let tx = null, ty = 0, tk = I.trk;
    if (tk >= 0) { satPos(L, tk, t, SP); tx = SP.x + oS; ty = SP.y; }
    if (tx !== null && I.dishErr < 0.12) {
      const len = Math.hypot(tx - fx, ty - fy), N = Math.floor(len / (p * 1.05));
      const ux = (tx - fx) / len, uy = (ty - fy) / len, ph = red ? 0 : (t * 2.2) % 3;
      for (let j = 3; j < N - 1; j++) {
        if (((j + 3 - Math.floor(ph)) % 3) !== 0) continue;
        dot(S, fx + ux * j * p * 1.05, fy + uy * j * p * 1.05, L.CM ? 0.32 : 0.22, X.beamLo, SKY, SKY);
      }
    }
    for (const U_ of I.ups) {
      const tau = now - U_.t0;
      let ex = tx, ey = ty, k = tk;
      if (ex === null) { ex = fx + DG.bx * L.h; ey = fy + DG.by * L.h; k = -1; }
      const len = Math.hypot(ex - fx, ey - fy), T_ = Math.max(0.5, len / (L.h * 1.6));
      if (!U_.acked && tau > T_ && k >= 0) { U_.acked = true; I.acks.push({ t0: now, k, user: U_.user }); }
      for (let j = 0; j < U_.n; j++) {
        const f = (tau - j * 0.075) / T_;
        if (f < 0 || f > 1) continue;
        const x = fx + (ex - fx) * f, y = fy + (ey - fy) * f;
        const v = U_.quiet ? 0.62 : j === 0 ? 1 : 0.85;
        const col = U_.user && j === 0 ? X.pktHot : U_.quiet ? X.beamLo : X.beam;
        light(S, x, y, v, col, SKY, BOARD, 0.04);
      }
    }
    // the CanSat under its parachute, drifting down; the antenna's telemetry rings and replies
    canSat(L, t, CS);
    if (CS.v > 0.02) {
      const cx = L.ox + Math.round((CS.x + oS - L.ox) / p) * p, cy = L.oy + Math.round((CS.y - L.oy) / p) * p;
      const v = CS.v;
      collar(S, cx, cy - p * 2.5, p * 4.8, SKY, SKY, 0.02);
      // canopy: a dome of gores (alternating), the rigging converging on the can
      const rowsC = [[-5, 1], [-4, 2], [-3, 3]];
      for (const [dy, hw] of rowsC) for (let dx = -hw; dx <= hw; dx++) {
        const g = (dx + 9) & 1;
        dot(S, cx + dx * p, cy + dy * p, v * (L.CM ? 0.9 : g ? 0.92 : 0.66), L.CM ? (g ? X.chute : X.chute2) : X.chute, SKY, SKY);
      }
      for (const [dx, dy] of [[-2, -2], [2, -2], [-1, -1], [1, -1]]) dot(S, cx + dx * p, cy + dy * p, v * 0.32, X.antS, SKY, SKY);
      dot(S, cx, cy, v * 0.9, X.can, SKY, SKY);
      dot(S, cx, cy + p, v * 0.8, X.can, SKY, SKY);
      if (!red && (t * 1.1) % 1 < 0.1) dot(S, cx, cy + p, 0.9, X.beacon2, SKY, SKY);
    }
  }

  // ---- the data centre: status LEDs flicker with traffic; a Sync sends a wave down the row
  function leds(S, t, now, red) {
    const L = S.L, X = S.X, I = S.I, o = S.offs[RACK], p = L.p;
    const ts = now - I.syncT;
    const span = L.racks.length ? (L.racks[L.racks.length - 1].c1 - L.racks[0].c0 + 2) * p : 1;
    const x0 = L.racks.length ? L.ox + (L.racks[0].c0 - L.M) * p : 0;
    if (ts >= 0 && ts < 1.4) {
      const fade = 1 - smoothstep(0.9, 1.4, ts), wx = x0 + span * (ts / 0.6);
      for (const q of L.racks) {
        const xc = L.ox + ((q.c0 + q.c1) / 2 - L.M) * p, dd = Math.abs(xc - wx);
        const wv = Math.exp(-(dd * dd) / (p * p * 10)) * fade;
        if (wv < 0.15) continue;
        for (let c = q.c0; c <= q.c1; c++) dot(S, L.ox + (c - L.M) * p + o, L.oy + q.rt * p, 0.4 + 0.55 * wv, X.wave, RACK, RACK);
      }
    }
    for (let k = 0; k < L.leds.length; k++) {
      const q = L.leds[k];
      const x = q.x + o;
      let on;
      if (red) on = q.k === 0 ? 0.7 : 0.35;
      else {
        const n = Math.floor(t * q.f + q.ph * 10);
        on = hash2(k, n) < (q.k === 3 ? 0.25 : 0.62) ? 1 : 0;
        on = on ? 0.8 + 0.2 * hash2(k, n + 1) : 0.18;
      }
      if (ts >= 0 && ts < 1.4) {
        const wx = x0 + span * (ts / 0.6), dd = Math.abs(q.x - wx);
        const wave = Math.exp(-(dd * dd) / (p * p * 6)) * (1 - smoothstep(0.9, 1.4, ts));
        if (wave > 0.1) { on = Math.max(on, wave); }
        if (wave > 0.5) { dot(S, x, q.y, 1, X.wave, RACK, RACK); continue; }
      }
      if (on < 0.2) dot(S, x, q.y, L.CM ? 0.24 : 0.12, X.ledLo, RACK, RACK);
      else dot(S, x, q.y, on * (L.CM ? 0.92 : 0.82), L.CM ? X.led[q.k] : (q.k === 3 ? X.ledLo : X.led[0]), RACK, RACK);
    }
  }

  // the route sampled at time tau (s): screen position at rest
  const RP = { x: 0, y: 0, ok: false }, RP2 = { x: 0, y: 0, ok: false };
  function routeAt(R, tau, o) {
    if (tau < 0 || tau > R.T) { o.ok = false; return o; }
    const tt = R.tt;
    let lo = 0, hi = tt.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tt[mid] < tau) lo = mid; else hi = mid; }
    const f = (tau - tt[lo]) / Math.max(1e-6, tt[hi] - tt[lo]);
    o.x = R.sx[lo] + (R.sx[hi] - R.sx[lo]) * f; o.y = R.sy[lo] + (R.sy[hi] - R.sy[lo]) * f; o.ok = true;
    return o;
  }

  // ---- the board: idle traffic on the bus into the data centre, bursts, pings
  function board(S, t, now, red) {
    const L = S.L, X = S.X, I = S.I, p = L.p, cam = I.cam;
    const sc = L.w * mix(0.55, 0.62, L.a) + 220;
    const pkt = (x, y, v, col, dv) => {
      const xx = x + cam * pxB(L, y);
      const fade = clamp((y - L.yH) / (p * 2.5));
      if (fade < 0.05) return;
      light(S, xx, y, v * (0.55 + 0.45 * fade), col, BOARD, BOARD, dv);
    };
    // idle traffic: packets climbing the bus into the data centre
    if (!red) {
      for (let k = 0; k < L.bus.length; k++) {
        const R = L.routes[L.bus[k]];
        const per = R.T / (sc * 0.5) + 2.2 + 1.3 * hash2(k, 401);
        const tau = ((t + per * hash2(k, 402)) % per) * sc * 0.5;
        routeAt(R, tau, RP);
        if (RP.ok) pkt(RP.x, RP.y, 0.85, X.pkt, 0.04);
      }
    }
    // bursts
    for (const b of I.bursts) {
      const tau = now - b.t0;
      for (let q = 0; q < b.ids.length; q++) {
        const R = L.routes[b.ids[q]];
        if (!R) continue;
        for (let j = 0; j < b.n; j++) {
          const tj = (tau - j * b.gap - q * 0.03) * b.v;
          routeAt(R, tj, RP);
          if (!RP.ok) continue;
          // the copper behind the lead packet glows, then cools
          if (j === 0) for (let k = 1; k <= 9; k++) {
            routeAt(R, tj - k * p * 1.1, RP2);
            if (!RP2.ok) break;
            const fade = clamp((RP2.y - L.yH) / (p * 2.5));
            splat(S, RP2.x + cam * pxB(L, RP2.y), RP2.y, 0.75 * (1 - k / 10) * fade, X.cuHi, BOARD, BOARD, 3, 0.6);
          }
          routeAt(R, tj, RP);
          pkt(RP.x, RP.y, j === 0 ? 1 : 0.8, b.user && j === 0 ? X.pktHot : X.pkt, 0.03);
        }
      }
      // the source chip's pins light as the burst leaves
      if (tau < 0.5 && b.to !== 'back') {
        const q = L.chips[b.to === 'ant' ? 1 : 0];
        const o = cam * pxB(L, q.yF);
        const f = 1 - tau / 0.5;
        for (let j = 0; j < 6; j++) splat(S, q.bx0 + o + (q.bx1 - q.bx0) * (j + 0.5) / 6, q.by1 - p * 0.6, 0.6 * f, X.cuHi, BOARD, BOARD, 3, 0.6);
      }
    }
    // pings: a ring racing out across the board (a circle in board space), lighting copper it crosses
    const D = S.D, K = S.K, CUv = S.CUv, B = S.B, cols = L.cols;
    for (const g of I.pings) {
      const tau = now - g.t0;
      if (tau < 0 || tau > 1.6) continue;
      const u = tau / 1.6, rB = 0.05 + 1.6 * (1 - Math.pow(1 - u, 2.2)), band = 0.1 + 0.08 * u, fade = 1 - u;
      // bounds of the ring on screen
      const vNear = Math.max(0.8, g.v - rB - band), vFar_ = g.v + rB + band;
      const yA = L.yH + L.F / vFar_, yB_ = Math.min(L.h, L.yH + L.F / vNear);
      const r0 = Math.max(L.r0B, Math.floor((yA - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((yB_ - L.oy) / p));
      for (let r = r0; r <= r1; r++) {
        const y = L.oy + r * p, v = L.F / (y - L.yH), o = cam * pxB(L, y);
        const dvv = v - g.v;
        if (Math.abs(dvv) > rB + band) continue;
        const half = Math.sqrt(Math.max(0, (rB + band) * (rB + band) - dvv * dvv));
        const xa = L.vpX + o + L.F * (g.u - half) / v, xb = L.vpX + o + L.F * (g.u + half) / v;
        const c0 = Math.max(0, Math.floor((xa - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((xb - L.ox) / p));
        for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          if (K[i] !== BOARD) continue;
          const x = L.ox + c * p, uu = (x - o - L.vpX) * v / L.F;
          const dd = Math.hypot(uu - g.u, dvv * 0.9), e = Math.abs(dd - rB);
          if (e > band) continue;
          const k = 1 - e / band;
          touch(B, i);
          if (B.fxM[i] === 1) continue;
          if (CUv[i]) { B.fxM[i] = 3; B.fxD[i] = Math.max(D[i], (0.5 + 0.5 * k) * fade + 0.1); B.fxC[i] = g.user ? X.pktHot : X.ping; }
          else if (k > 0.5 && hash2(i, 77) < 0.55 * fade) { B.fxM[i] = 3; B.fxD[i] = Math.max(D[i], 0.3 * fade * k); B.fxC[i] = X.pingLo; }
        }
      }
    }
    // the radio's whip antenna (it stands up off the board)
    {
      const wv = L.whip, o = cam * pxB(L, wv.yF);
      lines(S, [[wv.x + o, wv.y0, wv.x + o, wv.y1, L.CM ? 0.55 : 0.4, X.antS]], SKY, BOARD, L.CM ? 0.05 : -1);
      dot(S, wv.x + o, wv.y1, L.CM ? 0.7 : 0.5, X.ant, SKY, BOARD);
    }
  }

  // ---- the ground-station dish: pedestal, the bowl seen from the front, its feed on three struts
  function dish(S, t, now) {
    const L = S.L, X = S.X, p = L.p, CM = L.CM;
    const G_ = dishGeom(S, DG);
    const R = L.dR, tau = G_.tau, st_ = Math.sin(tau);
    const bx = G_.bx, by = G_.by, mx = -by, my = bx;           // boresight / bowl's long axis
    const base = L.dBaseY, px = G_.px, py = G_.py;
    const B = S.B, K = S.K, D = S.D, C = S.C, cols = L.cols;
    // the bowl: an ellipse (the rim circle seen tilted toward us), its inside shaded as a dish,
    // in a one-dot dark collar so it reads in front of the letters
    const cx = G_.cx, cy = G_.cy, a_ = R, b_ = R * st_, ca = a_ + p * 1.15, cb = b_ + p * 1.15;
    const ext = ca + p;
    const c0 = Math.max(0, Math.floor((cx - ext - L.ox) / p)), c1 = Math.min(cols - 1, Math.ceil((cx + ext - L.ox) / p));
    const r0 = Math.max(0, Math.floor((cy - ext - L.oy) / p)), r1 = Math.min(L.rows - 1, Math.ceil((cy + ext - L.oy) / p));
    const vx_ = cx - bx * b_ * 0.35, vy_ = cy - by * b_ * 0.35;    // the vertex sits toward the near lip
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = L.ox + c * p, y = L.oy + r * p;
      const rx = x - cx, ry = y - cy;
      const ra = rx * mx + ry * my, rb_ = rx * bx + ry * by;
      const al = ra / a_, be = rb_ / b_, q = al * al + be * be;
      const i = r * cols + c;
      if (q > 1) {
        const qa = ra / ca, qb = rb_ / cb;
        if (qa * qa + qb * qb > 1) continue;
        touch(B, i);
        const m = B.fxM[i];
        if (m === 1 || m === 2) continue;
        const cur = m ? B.fxD[i] : D[i];
        if (cur > 0.03) { if (!m) B.fxC[i] = C[i]; B.fxM[i] = 1; B.fxD[i] = 0.03; }
        continue;
      }
      touch(B, i);
      const rho = Math.sqrt(q);
      let v, col;
      if (rho > 0.8) { v = CM ? 0.9 : 0.82; col = X.dish; }                     // the lip
      else {
        // concave: lit on the side away from the light (light from the upper left)
        const lx = (x - vx_) / R, ly = (y - vy_) / R;
        const lum = clamp(0.42 + 0.5 * (0.55 * lx + 0.83 * ly) + 0.2 * rho);
        v = CM ? 0.42 + 0.48 * lum : 0.16 + 0.5 * lum;
        col = lum > 0.62 ? X.dish : lum > 0.32 ? X.dishS : X.dishD;
      }
      B.fxM[i] = 1; B.fxD[i] = v; B.fxC[i] = col; B.fxS[i] = 5;
    }
    // pedestal: a tapered column and a plinth, behind the bowl
    const ped = (x, y, v, col) => {
      const c = Math.round((x - L.ox) / p), r = Math.round((y - L.oy) / p);
      if (c < 0 || r < 0 || c >= cols || r >= L.rows) return;
      const i = r * cols + c;
      if (B.stamp[i] === B.frame && B.fxS[i] === 5) return;
      dot(S, x, y, v, col, SKY, BOARD);
    };
    for (let y = py; y <= base + 0.1; y += p) {
      const f = (y - py) / Math.max(1, base - py), hw = R * (0.12 + 0.16 * f);
      collar(S, px, y, hw + p * 1.1, SKY, RACK, 0.03);
      for (let x = -hw; x <= hw + 0.1; x += p) ped(px + x, y, (x < -0.1 ? 0.6 : 0.42) * (CM ? 1 : 0.8), x < -0.1 ? X.dishS : X.dishD);
    }
    for (let x = -R * 0.5; x <= R * 0.5 + 0.1; x += p) ped(px + x, base, CM ? 0.62 : 0.45, X.dishS);
    // vertex hub, struts and the feed horn at the focus
    dot(S, vx_, vy_, CM ? 0.5 : 0.3, X.dishK, SKY, BOARD);
    const fx = G_.fx, fy = G_.fy;
    const rims = [[cx + mx * a_ * 0.9, cy + my * a_ * 0.9], [cx - mx * a_ * 0.9, cy - my * a_ * 0.9], [cx - bx * b_ * 0.85, cy - by * b_ * 0.85]];
    lines(S, rims.map(([rx, ry]) => [rx, ry, fx, fy, CM ? 0.52 : 0.4, X.dishS]), SKY, BOARD, -1);
    collar(S, fx, fy, p * 1.1, SKY, WORD, 0.03);
    dot(S, fx, fy, 1, X.dish, SKY, BOARD);
    dot(S, fx + bx * p, fy + by * p, CM ? 0.7 : 0.55, X.dishS, SKY, BOARD);
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
      let I = (0.6 * Math.exp(-age * 2.4) + 0.12 * Math.exp(-age * 0.7) * smoothstep(0.04, 0.22, sk)) * ign;
      // the flame stays the brightest thing: smoke right behind it is held below it
      if (back < 2 * Lr) I = Math.min(I, 0.5 + 0.1 * back / (2 * Lr));
      let rx = rad, ry = rad;
      // ground cloud: the first stretch billows out across the board round the pad
      const gnd = 1 - smoothstep(0, 0.09, sk);
      if (gnd > 0) {
        const gs = Math.sqrt(ga);
        rx += gnd * L.h * 0.15 * gs * (1 + 0.6 * ga);
        ry += gnd * L.h * 0.05 * smoothstep(0, 0.12, ga);
        cy -= gnd * L.h * 0.03 * smoothstep(0, 0.14, ga);
        cx -= gnd * wind * 0.3 * ga;
        I = Math.max(I, gnd * (0.55 * Math.exp(-ga * 2.2) + 0.1 * Math.exp(-ga * 1.6)) * ign);
      }
      if (I < 0.02) continue;
      puff(S, cx, cy, rx, ry, I, age, BOARD, 0);
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
      const cx = x + S.oPad - drift + rad * 0.5 * noise2(sk * 7 + 0.3 + R.id, ag * 2.5 + t * 0.05);
      let cy = y - L.h * 0.02 * ag + rad * 0.25 * noise2(sk * 7 + 5.1 + R.id, ag * 2.5 + t * 0.04);
      let I = (0.6 * Math.exp(-ag * 2.4) + 0.12 * Math.exp(-ag * 0.7)) * em * smoothstep(0, 0.2, tau);
      const back = Math.hypot(R.P.x - (x + S.oPad), R.P.y - y);
      if (back < 2 * Lr) I = Math.min(I, 0.5 + 0.1 * back / (2 * Lr));
      let rx = rad, ry = rad;
      const gnd = 1 - smoothstep(0, 0.07, hgt);
      let cxx = cx;
      if (gnd > 0) {
        const gs = Math.sqrt(ga);
        rx += gnd * L.h * 0.1 * gs * (1 + 0.6 * ga);
        ry += gnd * L.h * 0.04 * smoothstep(0, 0.12, ga);
        cy -= gnd * L.h * 0.025 * smoothstep(0, 0.14, ga);
        cxx -= gnd * wind * 0.3 * ga;
        I = Math.max(I, gnd * (0.5 * Math.exp(-ga * 2.2) + 0.08) * smoothstep(0, 0.25, tau) * smoothstep(1.6, 0.9, ga));
      }
      if (I >= 0.02) puff(S, cxx, cy, rx, ry, I, ag, BOARD, 0);
      const sp = Math.hypot(dx * R.k * Math.pow(Math.max(sk, 1e-3), R.k - 1), R.H);
      if (sk < S_ST && sk + Math.max(p * 0.55, rad * 0.42) / sp >= S_ST && tau > R.tSt) {
        const ts = tau - R.tSt, Q = R.st;                          // separation puff
        const sr = p * 1.6 + L.h * 0.05 * Math.pow(ts, 0.6);
        puff(S, Q.x + S.oPad + Q.ux * Lr * 0.44 - wind * 0.08 * ts, Q.y + Q.uy * Lr * 0.44, sr, sr * 0.8, 0.55 * Math.exp(-ts / 1.6) * smoothstep(0, 0.1, ts), ts / 5, BOARD, 0);
      }
      sk += Math.max(p * 0.55, rad * 0.42) / sp;
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
      if (!CM) B.fxC[i] = age + 0.18 * hash2(i, 3) < 0.35 && v > 0.12 ? X.smHi : X.smLo;
      else {
        // colour: a lit edge (big pale dots), a violet shadow side (small) — volume against the sky
        const lit = B.fxL[i] + 0.35 * nz - 0.25 * age;
        B.fxC[i] = lit > 0.15 ? X.smHi : lit > -0.35 ? X.smLo : X.smDk;
        v *= lit > 0.15 ? 1.15 : lit > -0.35 ? 0.9 : 0.62;
        if (v > 0.7) v = 0.7;
        B.fxD[i] = v;
      }
    }
  }

  // light from a flame low over the board: lights the copper, the ground and the smoke
  function groundLight(S, gx, gy, sig, tI) {
    if (tI <= 0.02) return;
    const L = S.L, B = S.B, K = S.K, D = S.D, X = S.X, p = L.p, cols = L.cols;
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
        if (kd === WORD) continue;
        if (hsh < smoothstep(0.05, 0.42, v)) {
          touch(B, i);
          if (B.fxM[i] === 1) continue;
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
        if (kd === WORD) continue;
        const dx = L.ox + c * p - hx, dy = L.oy + r * p - hy;
        const v = Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)) * I;
        const hsh = hash2(i, 23);
        if (B.stamp[i] === B.frame && B.fxM[i] === 2) {
          if (v > 0.25 && hsh < v * 1.2) { B.fxC[i] = X.light; B.fxD[i] = Math.min(0.8, B.fxD[i] * (1 + 0.4 * v)); }
          continue;
        }
        if (v > 0.08 && hsh < smoothstep(0.1, 0.55, v)) {
          touch(B, i);
          if (B.fxM[i] === 1 || (B.fxM[i] === 3 && B.fxD[i] > 0.04 + 0.32 * v * v)) continue;
          B.fxM[i] = 3; B.fxC[i] = X.light; B.fxD[i] = Math.max(D[i], 0.04 + 0.32 * v * v);
        }
      }
    }
  }

  function mainLights(S, t, R, ign, climb) {
    const L = S.L, p = L.p, Lr = L.rocketL;
    const fl = 0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 17.3);
    const low = 1 - smoothstep(0, L.h * 0.3, climb);
    const flood = 0.42 * (1 - ign) * (0.95 + 0.05 * Math.sin(t * 1.3));
    const tI = flood + ign * low * fl * 0.85;
    groundLight(S, R.x, Math.min(L.padY + p * 0.5, R.y - Lr * 0.2), L.h * (0.036 + 0.03 * ign * low), tI);
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
    // ignition: the pad flashes the instant the click lands
    const pf = R.tau >= 0 && R.tau < 0.7 ? Math.exp(-R.tau / 0.16) : 0;
    if (low > 0 || pf > 0) groundLight(S, R.P.x, Math.min(L.padY + p * 0.5, R.P.y - Lr * 0.2), L.h * (0.04 + 0.025 * low + 0.03 * pf), Math.max(ig * low * fl * 0.8, pf * 1.05));
    if (pf > 0.08) {
      const X = S.X, px = L.padX + S.oPad, py = L.padY + p * 0.6;
      for (let j = -2; j <= 2; j++) splat(S, px + j * p * (1 + 1.5 * (1 - pf)), py - (2 - Math.abs(j)) * p * 0.6 * (1 - pf), pf * (j ? 0.75 : 1), j ? X.flame : X.core, 0, BOARD, 1, 0.5);
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
          // knockout: a dark ring keeps the rocket legible over the bright letters and the dense
          // painted ground; inside fresh exhaust the same ring reads as smoke lit by the flame
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
            else if (CM || K[i] >= RACK) { touch(B, i); if (B.fxM[i] !== 1) { B.fxM[i] = 1; B.fxD[i] = S.D[i] * 0.1; B.fxC[i] = S.C[i]; } }
          }
          continue;
        }
        touch(B, i);
        if (B.fxM[i] === 1 && B.fxD[i] >= v && B.fxS[i] === 9) continue;
        B.fxM[i] = 1; B.fxD[i] = v; B.fxC[i] = col; B.fxS[i] = 9;
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
          splat(S, x, y, f, j % 3 ? X.spark : X.flame, 0, BOARD, 1, 0.5);
        }
        // a flash where the stages part
        if (ts < 0.16) { const fv = 1 - ts / 0.16; for (let q = 0; q < 5; q++) splat(S, ix + [0, p, -p, 0, 0][q], iy + [0, 0, 0, p, -p][q], q ? 0.7 * fv : fv, q ? X.flame : X.core, 0, BOARD, 1, 0.5); }
      }
    }
  }

  // the launch tower: a lattice mast with service arms, an obstruction beacon on top
  function tower(S, t, red) {
    const L = S.L, X = S.X, p = L.p, CM = L.CM;
    const x = L.towerX + S.oPad;
    let row = 0;
    for (let y = L.towerTop; y <= L.towerBot + 0.1; y += p, row++) {
      collar(S, x + p * 0.5, y, p * 1.3, SKY, RACK, 0.04);
      dot(S, x, y, row === 0 ? 0.62 : 0.52, row % 3 === 1 && CM ? X.towerHi : X.tower, SKY, BOARD);
      dot(S, x + p, y, row % 2 ? 0.2 : 0.42, X.tower, SKY, BOARD);
      if (row === 2 || row === 5) {                                                // service arms
        dot(S, x - p, y, 0.36, X.tower, SKY, BOARD);
        dot(S, x - 2 * p, y, 0.24, X.tower, SKY, BOARD);
      }
    }
    // the pad: a plinth under the rocket, the flame trench a dark notch
    const px = L.padX + S.oPad, py = L.padY + p * 0.6;
    for (let j = -3; j <= 3; j++) dot(S, px + j * p, py, j === 0 ? 0.12 : 0.45, X.tower, SKY, BOARD);
    // obstruction beacons: the head strobes, a second light lower down blinks out of phase
    const ph = (t * 0.8) % 1, ph2 = (t * 0.8 + 0.5) % 1;
    const b1 = red ? 0.55 : ph < 0.1 ? 0.95 : 0.12 + 0.1 * Math.exp(-(ph - 0.1) * 6);
    const b2 = red ? 0.3 : ph2 < 0.1 ? 0.6 : 0.06;
    dot(S, x, L.towerTop - p, b1, X.beacon, SKY, BOARD);
    dot(S, x + p, L.towerTop + p * 3, b2, X.beacon2, SKY, BOARD);
  }

  // ---- the Moxon–Yagi: TWO complete Moxon rectangles on one boom (rear = reflector, front =
  //      driven element, fed at the middle of its front bar), then FIVE straight directors, each
  //      a little shorter. On a tripod, turned toward the CanSat. Telemetry rings run out of the
  //      directors; the CanSat's reply comes down the line
  function antenna(S, t, now) {
    const L = S.L, X = S.X, p = L.p, I = S.I, CM = L.CM;
    const o = S.oAnt;
    const ax = L.aX + o, ay = L.aY, th = I.antA;
    const bx = Math.cos(th), by = -Math.sin(th), ex = -by, ey = bx;
    const E = L.aE, A = L.aA, G = L.aG, Dt = L.aD, Bt = L.aBt, ds = L.aDs;
    const s0 = -L.aBack;
    const P = (s, e) => [ax + bx * s + ex * e, ay + by * s + ey * e];
    const segs = [];
    const mox = (sr, fed) => {
      const sf = sr + E;
      segs.push([sr, -A, sr, A, 0], [sr, -A, sr + Dt, -A, 0], [sr, A, sr + Dt, A, 0]);
      if (fed) segs.push([sf, -A, sf, -p * 0.55, 1], [sf, p * 0.55, sf, A, 1]);
      else segs.push([sf, -A, sf, A, 0]);
      segs.push([sf, -A, sf - Bt, -A, fed ? 1 : 0], [sf, A, sf - Bt, A, fed ? 1 : 0]);
    };
    mox(s0, false);
    mox(s0 + E + G, true);
    const sD = s0 + 2 * E + G;
    for (let j = 0; j < 5; j++) { const s = sD + ds * (j + 1), hl = A * (1.1 - 0.06 * j); segs.push([s, -hl, s, hl, 2]); }
    const sTip = sD + ds * 5 + p * 0.7;
    // tripod: mast to the hub, three legs
    const hubY = L.aHubY, footY = L.aFootY;
    const ls = L.aX > L.w * 0.5 ? -1 : 1;
    const legs = [[ax, hubY, ax - ls * p * 4.6, footY], [ax, hubY, ax + ls * p * 4.2, footY - p * 0.4], [ax, hubY, ax + ls * p * 0.8, footY + p * 1.2]];
    // flash when a reply lands
    let flash = 0;
    for (const q of I.tele) { const tau = now - q.t0 - (q.T || 1.7); if (tau > 0 && tau < 0.5 && !q.quiet) flash = Math.max(flash, 1 - tau / 0.5); }
    // crisp one-dot strokes in a dark collar: tripod and mast, the boom, then the elements
    const segL = [];
    const mastV = CM ? 0.62 : 0.4, legV = CM ? 0.52 : 0.34, boomV = CM ? 0.62 : 0.42;
    segL.push([ax, ay, ax, hubY, mastV, X.antS]);
    for (const l of legs) segL.push([l[0], l[1], l[2], l[3], legV, X.antS]);
    { const [x0, y0] = P(s0 - p * 0.6, 0), [x1, y1] = P(sTip, 0); segL.push([x0, y0, x1, y1, boomV, X.antS]); }
    for (const sg of segs) {
      const [x0, y0] = P(sg[0], sg[1]), [x1, y1] = P(sg[2], sg[3]);
      const v = Math.min(1, (sg[4] === 2 ? (CM ? 0.74 : 0.56) : (CM ? 0.86 : 0.7)) + 0.3 * flash);
      segL.push([x0, y0, x1, y1, v, flash > 0.3 ? X.wave : X.ant]);
    }
    lines(S, segL, SKY, BOARD, CM ? 0.05 : 0.02);
    // the feed point on the driven element's front bar
    { const [fx, fy] = P(s0 + 2 * E + G, 0); dot(S, fx, fy, 0.9, X.ant, SKY, BOARD); }
    // telemetry: rings out of the directors toward the CanSat, then a reply down the line
    const [tx_, ty_] = P(sTip, 0);
    canSat(L, t, CS);
    const csx = CS.x + S.offs[SKY], csy = CS.y;
    const dist = Math.hypot(csx - tx_, csy - ty_);
    for (const q of I.tele) {
      const tau = now - q.t0;
      const T1 = Math.max(0.6, dist / (L.h * 1.5));
      q.T = T1 + Math.max(0.5, dist / (L.h * 1.3));
      if (!q.quiet) {
        for (let k = 0; k < 3; k++) {
          const f = (tau - k * 0.12) / T1;
          if (f < 0 || f > 1) continue;
          const rad = f * dist, span = 0.32 - 0.12 * f;
          const N = Math.max(3, Math.round(rad * span * 2 / (p * 1.2)));
          const v = (1 - f * 0.6) * (k === 0 ? 1 : 0.7);
          for (let j = 0; j <= N; j++) {
            const an = th + span * (2 * j / N - 1);
            const wx = tx_ + Math.cos(an) * rad, wy = ty_ - Math.sin(an) * rad, wc = q.user ? X.pktHot : X.wave;
            splat(S, wx, wy, v, wc, SKY, SKY, 1, 0.55);           // behind the letters …
            splat(S, wx, wy, v, wc, RACK, BOARD, 1, 0.55);        // … in front of the ground
          }
        }
      }
      // the reply: a short train of packets down from the CanSat
      const t2 = tau - (q.quiet ? 0 : T1);
      const T2 = q.T - T1;
      for (let j = 0; j < (q.quiet ? 2 : 4); j++) {
        const f = (t2 - j * 0.08) / T2;
        if (f < 0 || f > 1) continue;
        const x = csx + (tx_ - csx) * f, y = csy + 2 * p + (ty_ - csy - 2 * p) * f;
        light(S, x, y, q.quiet ? 0.6 : 0.95, q.quiet ? X.beamLo : X.beam, SKY, BOARD, 0.04);
      }
    }
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
        splat(S, q.x + Math.cos(an) * rad, q.y + Math.sin(an) * rad, v, X.tap, 0, BOARD, 1, 0.55);
      }
      if (tau < 0.12) splat(S, q.x, q.y, 1 - tau / 0.12, X.tap, 0, BOARD, 1, 0.5);   // the touch itself
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
      splat(S, x + Math.cos(an) * rad, y + Math.sin(an) * rad, 0.85 * press, X.tap, 0, BOARD, 1, 0.55);
    }
    for (let j = 1; j <= 3 && tau > 0 && tau < g.T; j++) splat(S, x - g.dir * p * 1.6 * j - g.dir * rad, y, 0.5 * press * (1 - j / 4), X.tap, 0, BOARD, 1, 0.55);
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
