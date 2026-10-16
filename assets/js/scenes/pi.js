/*!
 * pi.js — the "π-shaped engineer" (About section). Light theme. A toy you can play with.
 *
 * The π is built like a portal frame, and each member tells its discipline in tone:
 *   bar       = systems thinking — a beam drawn as its bending stress: dense flanges (top and
 *               bottom rails), a light neutral axis, and dark nodes where it carries each leg
 *               (load paths); it thins out at the tips.
 *   left leg  = software — DIGITAL depth: six quantised tone steps, one light row between steps,
 *               like bit depth or a layered stack. Exact values, no grain.
 *   right leg = hardware — ANALOG depth: one continuous ramp with print grain, curling at the foot.
 *   ground    = a crisp plate of muted dots exactly as wide as the beam, from the beam down to the
 *               feet's baseline: every other grid point on offset rows, deepening by dot SIZE only.
 * Coverage is authored in "tangent units" (1 = neighbouring dots just touch). The deep ends go past
 * 1 (scene.gain > 1): dots overlap into near-solid ink with pin-hole paper, so depth reaches ink.
 *
 * Interaction (all eased from st.now, so it also works when st.t is frozen):
 *   click a leg / the bar  -> it CHARGES from that point: a pulse runs through the member, along the
 *                             beam (systems thinking connecting them) and down the other leg, in each
 *                             member's own grammar — software: band by band, latched, with a square
 *                             packet (clocked); hardware: a droplet with a comet tail (analog);
 *                             beam: the flanges carry it. A ripple of dots spreads from the click, and
 *                             each foot pings the ground when the pulse arrives.
 *   drag a leg up / down   -> stretches its depth (shallower / deeper, rubber-banded); released, it
 *                             springs back with a wobble. Software re-quantises in whole rows,
 *                             hardware stretches smoothly.
 *   pointer over a member  -> it swells, and a leg shows a ↕ grip on its foot; the custom cursor
 *                             reads "Stretch" over a leg, "Charge" over the beam (affordances).
 *   keys 1 / 2 / 3         -> select software / hardware / systems (same look as the HTML labels);
 *   Enter / Space          -> charge the selection (or the beam); ↑ / ↓ kick the selected leg; Esc.
 *   idle (3 s untouched)   -> a ghost demo every few seconds, alternating a charge (software foot,
 *                             beam, hardware foot) with a TUG: a ghost hand grips a leg (↕ shows),
 *                             pulls it a few rows deeper and lets the spring wobble it back.
 *
 * st.data.hover in {'software','hardware','systems',null} (HTML labels): the hovered member keeps its
 * ramp and grows slightly (multiplicative, so its depth story survives); accent pours in as a 1-row
 * front and stays only on its deep end — software: its last step; hardware: the curl's end (crisp,
 * no dither); systems: the top flange and the two nodes. The other members thin out by dot size.
 *
 * Colour mode (st.mode 'color') is a pointillist painting, not an infographic: dots stop at about
 * touching (coverage soft-capped near 1 tangent unit) so paper shows between them, and depth is
 * carried by hue and value. Neighbouring hues mix optically, each member in its own grammar —
 * software: six teal-grey → indigo steps, each band ordered-dithered (Bayer) with its neighbours
 * (digital); hardware: straw → amber → rust → copper, stochastically dithered along the ramp
 * (analog); beam: olive-sage → deep green with ochre in the web, and a few of each leg's own dots
 * where it carries that leg (the beam joins both). Ground: two warm greys. Pulses: gold, with cream
 * and white cores; the hardware droplet is a cream/white head with a paper halo. Mono: as before.
 *
 * Halftone.scenes.pi.anchors(w, h) -> { systems, software, hardware }: the CENTRE of each HTML
 * label pill, in CSS px (main.js / .pi-label centre the pill with translate(-50%,-50%)).
 */
(function () {
  'use strict';
  const U = Halftone.utils;
  const clamp = U.clamp, smoothstep = U.smoothstep, fbm2 = U.fbm2;

  // materials (palette indices). In mono every member material is ink.
  const INK = 0, ACC = 1, MUTED = 2;
  const SW0 = 3;          // 3..8   software: six steps, teal-grey -> indigo
  const HW0 = 9;          // 9..13  hardware: straw, amber, orange, rust, copper
  const SY0 = 14;         // 14..17 systems: olive-sage, sage, green, deep green
  const PALE = 18, WHITE = 19, MUTED2 = 20, OCHRE = 21;
  const SYS = 1, SW = 2, HW = 3;
  const PARTS = [null, 'systems', 'software', 'hardware'];
  const HALF_PI = Math.PI / 2;
  const GAIN = 1.3, IG2 = 1 / (GAIN * GAIN), MAXU = GAIN * GAIN;   // tangent units -> engine coverage
  const FULL = 1.5;                                                // "lit" coverage, tangent units
  const LEVELS = [0.40, 0.56, 0.74, 0.95, 1.2, 1.5];               // software: quantised depth
  const GAP = 0.2;                                                 // the light row between steps
  const V = 0.74;                                                  // pulse speed, glyph sizes per second
  const IDLE_AFTER = 3, IDLE_PAIR = 8.8, IDLE_TUG_AT = 3.6;   // ghost: a charge, then a tug 3.6 s later
  // colour mode: coverage soft-caps here (tangent units) so paper stays visible between dots
  const CAP0 = 0.78, CAPW = 0.28;
  // 4x4 Bayer matrix: the software leg's ORDERED (digital) colour dither
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // the grip shown on a hovered leg's deep end: chevrons up and down, ⌃ ⌄ (9 rows x 5 cols, centred)
  const GRIP = [
    0, 0, 1, 0, 0,
    0, 1, 0, 1, 0,
    1, 0, 0, 0, 1,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    0, 0, 0, 0, 0,
    1, 0, 0, 0, 1,
    0, 1, 0, 1, 0,
    0, 0, 1, 0, 0];
  // ghost tug (idle demo): grip shows, pull in, hold, release to the spring
  const TUG_IN = 0.45, TUG_PULL = 0.6, TUG_REL = 1.35, TUG_END = 1.9;

  const pitchFor = (w, h) => 4.5 + 1.5 * clamp((Math.min(w, h) - 350) / 210);
  const odd = (v) => 2 * Math.round((v - 1) / 2) + 1;

  /** Glyph geometry at rest, in CSS px. Straight edges sit between dot rows/cols (crisp), stems and
   *  bar have an odd dot count so packets centre on a dot. */
  function geo(w, h) {
    const P = pitchFor(w, h);
    const cols = Math.ceil(w / P) + 1, rows = Math.ceil(h / P) + 1;
    const ox = (w - (cols - 1) * P) / 2, oy = (h - (rows - 1) * P) / 2;
    const snapX = (v) => ox + (Math.round((v - ox) / P - 0.5) + 0.5) * P;
    const snapY = (v) => oy + (Math.round((v - oy) / P - 0.5) + 0.5) * P;
    const S = Math.min(w, h), cx = w / 2, cy = h / 2 + 0.01 * S;

    const nStem = Math.max(3, odd(0.094 * S / P));     // stem width in dots
    const nBar = Math.max(3, odd(0.088 * S / P));      // bar height in dots
    const barT = snapY(cy - 0.300 * S), barB = barT + nBar * P;
    const barL = snapX(cx - 0.385 * S), barR = w - barL;  // grid is symmetric about the centre
    const lL0 = snapX(cx - 0.215 * S - nStem * P / 2), lL1 = lL0 + nStem * P;
    const lR0 = snapX(cx + 0.150 * S - nStem * P / 2), lR1 = lR0 + nStem * P;
    const hw = nStem * P / 2;
    const xL = (lL0 + lL1) / 2, xR = (lR0 + lR1) / 2;
    const footB = snapY(cy + 0.300 * S);
    const R = 1.9 * hw;                                  // centre-line radius of the right foot's curl
    const yS = footB - hw - R;                           // where the right stem starts to curl
    const ccx = xR + R;
    const tipX = snapX(ccx + 0.062 * S);
    const yb = (barT + barB) / 2;
    return { P, cols, rows, ox, oy, S, cx, cy, nStem, nBar, barT, barB, barL, barR, lL0, lL1, lR0, lR1,
      hw, xL, xR, footB, R, yS, ccx, tipX, yb };
  }

  /** The legs as they are right now: software stretched by qL whole rows, hardware by dR px. */
  function shape(g, qL, dR) {
    const P = g.P;
    const footL = g.footB + qL * P, footR = g.footB + dR, yS = g.yS + dR;
    const rowOf = (y) => Math.round((y - g.oy) / P);
    const r0 = rowOf(g.barB + P / 2), rE = rowOf(footL - P / 2), nR = rE - r0 + 1;
    const Bk = []; for (let k = 0; k <= 6; k++) Bk.push(Math.round(k * (nR + 1) / 6));
    const bandRow = new Int8Array(g.rows + 2).fill(-1);
    for (let q = 0; q < nR; q++) for (let k = 0; k < 6; k++) if (q >= Bk[k] && q <= Bk[k + 1] - 2) bandRow[r0 + q] = k;
    const bandY = [];
    for (let k = 0; k < 6; k++) {
      const a = Bk[k], b = (k === 5 ? nR - 1 : Bk[k + 1] - 2);
      bandY.push(g.oy + (r0 + Math.floor((a + b) / 2)) * P - g.yb);
    }
    const legL = footL - g.yb;
    const legR = (yS - g.yb) + g.R * HALF_PI + (g.tipX - g.ccx);
    return { qL, dR, footL, footR, yS, r0, rE, nR, bandRow, bandY, legL, legR,
      K: [0, Math.round((g.barR - g.cx) / P), nR - 1, Math.round(legR / P)], hb: 0.5 * (bandY[1] - bandY[0]) };
  }

  function sdBox(x, y, x0, y0, x1, y1) {
    const dx = Math.max(x0 - x, x - x1), dy = Math.max(y0 - y, y - y1);
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
  }

  /** hardware leg: signed distance, arc length s from the beam's centre-line, cross offset ac */
  const HWQ = { sd: 0, s: 0, ac: 0 };
  function hwAt(g, D, x, y) {
    const sStem = sdBox(x, y, g.lR0, g.barB, g.lR1, D.yS);
    let sCurl = 1e9;
    const qx = x - g.ccx, qy = y - D.yS;
    if (qx <= 0 && qy >= 0) sCurl = Math.abs(Math.hypot(qx, qy) - g.R) - g.hw;
    const sTerm = sdBox(x, y, g.ccx, D.yS + g.R - g.hw, g.tipX, D.yS + g.R + g.hw);
    if (sStem <= Math.min(sCurl, sTerm)) { HWQ.sd = sStem; HWQ.s = y - g.yb; HWQ.ac = x - g.xR; }
    else if (sCurl <= sTerm) { HWQ.sd = sCurl; HWQ.s = (D.yS - g.yb) + g.R * Math.atan2(qy, -qx); HWQ.ac = g.R - Math.hypot(qx, qy); }
    else { HWQ.sd = sTerm; HWQ.s = (D.yS - g.yb) + g.R * HALF_PI + (x - g.ccx); HWQ.ac = (D.yS + g.R) - y; }
    return HWQ;
  }

  // ---- label pills (.pi-label: Geist Mono 11.5px, +.06em, uppercase; padding 8/10, dot 6, gap 8)
  const LABEL = { systems: 'Systems thinking', software: 'Software', hardware: 'Hardware' };
  const PILL_H = 28;
  let mctx = null;
  function pillW(text) {
    let tw = text.length * 7.59;
    try {
      mctx = mctx || document.createElement('canvas').getContext('2d');
      mctx.font = '450 11.5px "Geist Mono", ui-monospace, monospace';
      const ls = 'letterSpacing' in mctx;
      if (ls) mctx.letterSpacing = '0.69px';
      const m = mctx.measureText(text.toUpperCase()).width;
      if (m > 0) tw = m + (ls ? 0 : 0.69 * text.length);
    } catch (e) { /* estimate */ }
    return Math.round(tw + 32);
  }

  /** Recompute one dot's member, tone, material and coordinates for the current leg shapes. */
  function classify(S, i) {
    const g = S.g, D = S.D, P = g.P, x = S.xs[i], y = S.ys[i];
    const r = (i / g.cols) | 0, c = i - r * g.cols;
    S.part[i] = 0; S.base[i] = 0; S.edge[i] = 0; S.band[i] = -1; S.pk[i] = -1; S.rail[i] = 0;
    S.deep[i] = 0; S.fr[i] = 0; S.ac[i] = 0; S.mat[i] = INK; S.kq[i] = 0; S.sk[i] = 0;
    const sBar = sdBox(x, y, g.barL, g.barT, g.barR, g.barB);
    const sLL = sdBox(x, y, g.lL0, g.barB, g.lL1, D.footL);
    const H = hwAt(g, D, x, y), sRR = H.sd;
    const sd = Math.min(sBar, sLL, sRR);
    if (sd < 0.75 * P) {
      const ed = smoothstep(0.5 * P, -0.5 * P, sd), tex = S.tex[i];
      S.edge[i] = ed;
      if (sBar <= Math.min(sLL, sRR) + 1e-3) {
        // systems: a beam drawn as its bending stress — dense flanges, light neutral axis,
        // dark nodes over each leg (load paths), thinning at the tips. Low grain: clean print.
        S.part[i] = SYS;
        const half = (g.nBar - 1) / 2, eta = Math.abs((r - S.rT) - half) / half;
        const gl = (x - g.xL) / S.sx, gr = (x - g.xR) / S.sx;
        const node = Math.exp(-gl * gl) + Math.exp(-gr * gr);
        const isRail = r === S.rT || r === S.rB;
        let v = 0.15 + 0.62 * Math.pow(eta, 1.8) + 0.62 * node * (1 - 0.3 * eta);
        if (isRail) v = Math.max(v, 0.98) + 0.12 * node;
        v *= 0.62 + 0.38 * smoothstep(0, 0.1 * g.S, Math.min(x - g.barL, g.barR - x));
        v += 0.035 * tex;
        S.base[i] = ed * clamp(v, 0, 1.6);
        S.rail[i] = isRail ? 1 : 0;
        S.kq[i] = Math.round(Math.abs(x - g.cx) / P);
        S.sk[i] = Math.abs(x - g.cx);
        // colour: stress -> olive-sage .. deep green, dithered; ochre in the light web; where the beam
        // carries a leg, a few of that leg's own dots (blue on the software side, amber on hardware)
        const h1 = U.hash2(c * 7 + 3, r * 13 + 1), h2 = U.hash2(c * 5 + 17, r * 3 + 29);
        const tb = clamp((v - 0.16) / 1.02) * 3;
        let m = SY0 + Math.min(3, Math.floor(tb + h1));
        const nl = Math.exp(-gl * gl), nr = Math.exp(-gr * gr), lo = (r - S.rT) / (g.nBar - 1);
        if (nl > 0.3 && h2 < 0.3 * nl * lo) m = h1 < 0.5 ? SW0 + 3 : SW0 + 4;   // rising from below
        else if (nr > 0.3 && h2 < 0.3 * nr * lo) m = h1 < 0.5 ? HW0 + 2 : HW0 + 3;
        else if (tb < 1.3 && h2 > 0.86) m = OCHRE;
        S.mat[i] = m;
        const nodeZ = (Math.abs(x - g.xL) < g.hw || Math.abs(x - g.xR) < g.hw) && r > S.rB - Math.round(g.nBar / 3);
        S.deep[i] = (r === S.rT || nodeZ) && ed > 0.6 ? 1 : 0;
        S.dC[i] = Math.abs(x - g.cx);
      } else if (sLL < sRR) {
        // software: digital depth, six quantised steps
        S.part[i] = SW;
        const k = D.bandRow[r] === undefined ? -1 : D.bandRow[r], s = y - g.yb;
        S.band[i] = k;
        S.base[i] = ed * (k < 0 ? GAP : LEVELS[k]);
        // colour: each band its own exact hue, ordered-dithered (Bayer) with its neighbours — digital
        if (k < 0) {
          const ka = D.bandRow[r - 1];
          S.mat[i] = SW0 + (ka >= 0 ? ka : 0);
        } else {
          const b = BAYER[((r & 3) << 2) | (c & 3)];
          S.mat[i] = SW0 + (b < 3 && k < 5 ? k + 1 : b > 13 && k > 0 ? k - 1 : k);
        }
        S.sk[i] = s;
        S.kq[i] = r - D.r0;
        S.ac[i] = x - g.xL;
        S.deep[i] = k === 5 && ed > 0.6 ? 1 : 0;
        S.dC[i] = S.toL + s;
        for (let q = 0; q < 6; q++) if (Math.abs(s - D.bandY[q]) < 1.5 * P) { S.pk[i] = q; break; }
      } else {
        // hardware: analog depth, a continuous ramp with grain
        S.part[i] = HW;
        const u = clamp((y - g.barB) / (D.footR - g.barB));
        const lev = 0.40 + 1.08 * Math.pow(u, 1.6);
        S.base[i] = ed * clamp(lev + 0.10 * tex * (1 - 0.7 * u), 0, 1.55);
        S.sk[i] = H.s;
        S.ac[i] = H.ac;
        S.kq[i] = Math.round(H.s / P);
        // colour: straw -> copper, stochastically dithered along the ramp — analog
        const h1 = U.hash2(c * 11 + 5, r * 7 + 3), h2 = U.hash2(c * 3 + 41, r * 17 + 9);
        let q = Math.floor(clamp(u * 1.08 + 0.12 * S.wav[i]) * 3.75 + h1);
        if (h2 < 0.07) q += h2 < 0.035 ? 1 : -1;                     // a few strays: painterly
        S.mat[i] = HW0 + (q < 0 ? 0 : q > 4 ? 4 : q);
        S.deep[i] = H.s > 0.8 * D.legR && ed > 0.6 ? 1 : 0;
        S.dC[i] = S.toR + H.s;
      }
    } else if (((r - S.rE0) & 1) === 0 && (((c - S.cL) + ((S.rE0 - r) >> 1)) & 1) === 0) {
      // the ground: a crisp plate exactly as wide as the beam, from the beam down to the feet's
      // baseline. Every other dot on offset rows; depth is dot SIZE only. A clean margin around the
      // glyph — where a leg retracts, the plate shows through.
      const inside = x > g.barL && x < g.barR && y < g.footB && sd > 1.5 * P;
      const rad = inside ? (S.rMin + (S.rMax - S.rMin) * smoothstep(S.fy0, S.fy1, y)) * smoothstep(S.fy0 - 0.03 * g.S, S.fy0 + 0.05 * g.S, y) : 0;
      S.fr[i] = rad >= 0.36 ? rad : 0;
      S.mat[i] = U.hash2(c * 13 + 7, r * 5 + 11) < 0.32 ? MUTED2 : MUTED;   // colour: two warm greys
    }
  }

  function rebuild(S, region) {
    const cols = S.g.cols;
    for (let r = region[2]; r <= region[3]; r++) for (let c = region[0]; c <= region[1]; c++) classify(S, r * cols + c);
  }

  /** What member is under (x, y)? -> { p, c } with c = x on the beam, arc length s on a leg. */
  function pick(S, x, y) {
    const g = S.g, D = S.D, P = g.P, m = 0.9 * P;
    if (y > g.barB - 0.3 * P) {
      if (x > g.lL0 - m && x < g.lL1 + m && y < D.footL + m) return { p: SW, c: clamp(y - g.yb, g.barB - g.yb, D.legL) };
      const H = hwAt(g, D, x, y);
      if (H.sd < m) return { p: HW, c: clamp(H.s, g.barB - g.yb, D.legR) };
    }
    if (x > g.barL - m && x < g.barR + m && y > g.barT - m && y < g.barB + 0.5 * m) return { p: SYS, c: clamp(x, g.barL, g.barR) };
    return null;
  }

  // rubber band: 1:1 near rest, asymptotic towards the limits (A deeper, B shallower)
  const rub = (x, A, B) => (x >= 0 ? A * (1 - Math.exp(-x / A)) : -B * (1 - Math.exp(x / B)));
  const unrub = (y, A, B) => (y >= 0 ? -A * Math.log(1 - Math.min(y / A, 0.995)) : B * Math.log(1 + Math.max(y / B, -0.995)));

  function newI() {
    return { sel: null, hov: 0, last: -1e9, px: -1e4, py: -1e4, pressed: false, grab: 0, raw0: 0, grabbing: false,
      str: [0, 0, 0, 0], vel: [0, 0, 0, 0], idleT0: -1, idleK: -1, touched: false, tug: null };
  }

  /** where the ↕ grip sits on each leg's foot (grid row / col of its centre) */
  function gripAt(S) {
    const g = S.g, D = S.D, P = g.P;
    const row = (y) => Math.round((y - g.oy) / P), col = (x) => Math.round((x - g.ox) / P);
    // software: the middle of the deepest step; hardware: the stem's foot, just above the curl
    const k5 = D.bandRow, rows = [];
    for (let r = D.r0; r <= D.rE; r++) if (k5[r] === 5) rows.push(r);
    S.gR[SW] = rows.length ? rows[(rows.length - 1) >> 1] : row(D.footL - 4 * P);
    S.gC[SW] = col(g.xL);
    S.gR[HW] = row(D.yS - 5 * P);
    S.gC[HW] = col(g.xR);
  }

  /** start a charge at member p, coordinate c0 (x on the beam, s on a leg) */
  function charge(S, st, p, c0, amp) {
    const g = S.g, D = S.D, P = g.P, L = g.xL, R = g.xR, v = V * g.S;
    let jL, jR;
    if (p === SYS) { jL = Math.abs(c0 - L); jR = Math.abs(c0 - R); }
    else if (p === SW) { jL = c0; jR = c0 + (R - L); }
    else { jR = c0; jL = c0 + (R - L); }
    const fL = p === SW ? Math.abs(D.legL - c0) : jL + D.legL;
    const fR = p === HW ? Math.abs(D.legR - c0) : jR + D.legR;
    const tips = Math.max(jL + (L - g.barL), jR + (g.barR - R));
    const ch = { t0: st.now, p, c0, jL, jR, amp, F: 0, glow: 0, end: Math.max(fL, fR, tips) + 26 * P };
    S.chs.push(ch);
    if (S.chs.length > 4) S.chs.shift();
    if (st.reduced) return;
    // each foot pings the ground when the pulse arrives
    if (fL > 3 * P) ripple(S, st, g.xL, g.footB, 0.85 * amp, fL / v, 0.36, 1.5);
    if (fR > 3 * P) ripple(S, st, (g.ccx + g.tipX) / 2, g.footB, 0.85 * amp, fR / v, 0.36, 1.5);
  }

  function ripple(S, st, x, y, amp, delay, size, dur) {
    if (st.reduced) return;
    S.rips.push({ x, y, t0: st.now + delay, amp, Rm: size * S.g.S, dur, r: 0, a: 0, w: 0.042 * S.g.S });
    if (S.rips.length > 8) S.rips.shift();
  }

  function sourcePoint(S, p, c0, o) {
    const g = S.g, D = S.D;
    if (p === SYS) { o.x = c0; o.y = g.yb; return o; }
    if (p === SW) { o.x = g.xL; o.y = g.yb + c0; return o; }
    // hardware: walk the skeleton
    const sA = D.yS - g.yb, sB = sA + g.R * HALF_PI;
    if (c0 <= sA) { o.x = g.xR; o.y = g.yb + c0; }
    else if (c0 <= sB) { const th = (c0 - sA) / g.R; o.x = g.ccx - g.R * Math.cos(th); o.y = D.yS + g.R * Math.sin(th); }
    else { o.x = g.ccx + (c0 - sB); o.y = D.yS + g.R; }
    return o;
  }

  /** a keyboard / demo charge: legs fire from their deep end, the beam from its centre */
  function fire(S, st, p, amp) {
    const g = S.g, D = S.D, P = g.P;
    const c0 = p === SYS ? g.cx : p === SW ? D.bandY[5] : D.legR - 2.2 * P;
    const o = sourcePoint(S, p, c0, { x: 0, y: 0 });
    ripple(S, st, o.x, o.y, 0.75 * amp, 0, 0.3, 1.1);
    charge(S, st, p, c0, amp);
  }

  const scene = {
    pitch: pitchFor,
    layout: 'grid',
    gain: GAIN,
    palette: {
      mono: ['ink', 'accent', 'muted',
        'ink', 'ink', 'ink', 'ink', 'ink', 'ink',
        'ink', 'ink', 'ink', 'ink', 'ink',
        'ink', 'ink', 'ink', 'ink',
        'accent', 'accent', 'muted', 'ink'],
      color: ['#1C1D1B', '#F2B53A', '#BCB3A4',
        // software: teal-grey, sea teal, cerulean, cobalt, indigo, deep indigo
        '#8DBBBB', '#5C9DAE', '#3F7DA8', '#33609C', '#2D4686', '#252F66',
        // hardware: straw, amber, orange, rust, copper
        '#E9B85E', '#E2903F', '#CC6630', '#A8462A', '#743022',
        // systems: olive-sage, sage, green, deep green
        '#A9B57B', '#76A05D', '#3F8253', '#23583F',
        // pulse cream, pulse white, ground sand-grey, beam ochre
        '#FFE6A8', '#FFFCF2', '#D2C5AD', '#C9A253'],
    },
    animated: true,
    interact: 'none',
    drag: 'x',
    cursor: 'Play',
    label: 'π — two deep specialties joined by systems thinking',

    /** Centre of each label pill (CSS px), for translate(-50%,-50%) placement. */
    anchors(w, h) {
      const g = geo(w, h), gap = Math.max(8, 0.024 * g.S);
      const ws = pillW(LABEL.systems), wl = pillW(LABEL.software), wr = pillW(LABEL.hardware);
      const yUp = g.barT - gap - PILL_H / 2, yDn = g.footB + gap + PILL_H / 2;
      return {
        systems: [g.barL + ws / 2, yUp],
        software: [g.lL0 + wl / 2, yDn],
        hardware: [g.lR0 + wr / 2, yDn],
      };
    },

    setup(st) {
      const g = geo(st.w, st.h), P = g.P;
      const { n, xs, ys } = st.grid;
      const rowOf = (y) => Math.round((y - g.oy) / P), colOf = (x) => Math.round((x - g.ox) / P);
      const prev = st._pi;
      const S = {
        g, xs, ys, n,
        base: new Float32Array(n), edge: new Float32Array(n), part: new Uint8Array(n), mat: new Uint8Array(n),
        kq: new Int16Array(n), deep: new Uint8Array(n), sk: new Float32Array(n), ac: new Float32Array(n),
        band: new Int8Array(n), pk: new Int8Array(n), rail: new Uint8Array(n), dC: new Float32Array(n),
        fr: new Float32Array(n), tex: new Float32Array(n), wav: new Float32Array(n),
        rT: rowOf(g.barT + P / 2), rB: rowOf(g.barB - P / 2), rE0: rowOf(g.footB - P / 2),
        cL: Math.round((g.barL + P / 2 - g.ox) / P),
        sx: 0.07 * g.S, toL: g.cx - g.xL, toR: g.xR - g.cx,
        fy0: g.barB - 0.02 * g.S, fy1: g.footB, rMin: 0.6, rMax: Math.max(1.15, 0.22 * P),
        invMaxR: 1 / (GAIN * 0.5 * P),
        e: [0, 0, 0, 0], m: [0, 0, 0, 0], sp: [0, 0, 0, 0], eh: [0, 0, 0, 0], pin: [0, 0, 0, 0],
        gA: [0, 0, 0, 0], gR: [0, 0, 0, 0], gC: [0, 0, 0, 0], gh: 0,
        chs: [], rips: [], col: st.mode === 'color',
        I: prev && prev.I ? prev.I : newI(),
      };
      S.I.str = [0, 0, 0, 0]; S.I.vel = [0, 0, 0, 0]; S.I.grab = 0; S.I.grabbing = false; S.I.tug = null;
      for (let i = 0; i < n; i++) { S.tex[i] = fbm2(xs[i] * 0.05, ys[i] * 0.05, 2); S.wav[i] = U.noise2(xs[i] / g.S * 4.2 + 3.1, ys[i] / g.S * 2.4); }
      S.D = shape(g, 0, 0);
      // stretch limits: deeper is rubber-banded (the label pills sit under the feet)
      S.deepA = 0.1 * g.S;
      S.shallowB = [0, 0, (g.footB - g.barB) - 17 * P, (g.yS - g.barB) - 2.5 * P];
      const r0 = Math.max(0, rowOf(g.barB) - 1), r1 = Math.min(g.rows - 1, rowOf(g.footB + S.deepA * 1.35) + 3);
      S.regL = [Math.max(0, colOf(g.lL0) - 4), Math.min(g.cols - 1, colOf(g.lL1) + 4), r0, r1];
      S.regR = [Math.max(0, colOf(g.lR0) - 4), Math.min(g.cols - 1, colOf(g.tipX) + 4), r0, r1];
      st._pi = S;
      for (let i = 0; i < n; i++) classify(S, i);
      gripAt(S);
      this._attachDom(st);
    },

    /** Page glue that needs the canvas (so find our engine instance), only for live canvases:
     *  - touch: page scroll stays on (drag 'x' = pan-y) except when a finger lands on a leg, where a
     *    vertical drag stretches it instead (touchstart is cancelled there only);
     *  - the HTML label pills under the feet ride down with a leg stretched deeper, and the keyboard
     *    selection (keys 1/2/3) lights its pill like a hover does;
     *  - the custom cursor label follows what is under the pointer ("Stretch" on a leg, "Charge" on
     *    the beam, "Play" elsewhere): data-cursor is updated and a pointerover is re-dispatched on the
     *    canvas, since the site cursor re-reads data-cursor on pointerover only. */
    _attachDom(st) {
      const all = Halftone.instances ? Array.from(Halftone.instances) : [];
      const ht = all.find((h) => h.st === st);
      if (!ht || !ht.o || !ht.o.autoplay) return;
      const host = ht.c.parentElement;
      const lab = (k) => (host ? host.querySelector('.pi-label[data-pi="' + k + '"]') : null);
      st._piDom = { sw: lab('software'), hw: lab('hardware'), all: host ? Array.from(host.querySelectorAll('.pi-label[data-pi]')) : [],
        ySw: 0, yHw: 0, focus: null, cv: ht.c, cur: ht.c.dataset.cursor || 'Play' };
      if (st._piDom.sw) st._piDom.sw.style.translate = '';
      if (st._piDom.hw) st._piDom.hw.style.translate = '';
      if (ht._piTouch) return;
      ht._piTouch = true;
      const opt = { passive: false };
      if (ht._ac) opt.signal = ht._ac.signal;
      ht.c.addEventListener('touchstart', (e) => {
        const S = st._pi;
        if (!S || e.touches.length !== 1) return;
        const rc = ht.c.getBoundingClientRect(), t = e.touches[0];
        const h = pick(S, t.clientX - rc.left, t.clientY - rc.top);
        if (h && h.p !== SYS) e.preventDefault();
      }, opt);
    },

    update(st, dt) {
      const S = st._pi;
      if (!S) return;
      const g = S.g, P = g.P, I = S.I, Pt = st.pointer, now = st.now;
      const red = st.reduced || !!st.still, snap = !(dt > 0);
      let busy = false;
      S.col = st.mode === 'color';

      // ---- input bookkeeping
      if (Pt.down || (Pt.inside && (Math.abs(Pt.x - I.px) > 0.5 || Math.abs(Pt.y - I.py) > 0.5))) { I.last = now; I.touched = true; }
      I.px = Pt.x; I.py = Pt.y;
      const hv = (st.data && st.data.hover) || null;
      if (hv) I.last = now;
      const focus = hv || I.sel;

      // ---- press: what did we grab?   release: hand the velocity to the spring
      if (Pt.down) {
        if (!I.pressed) {
          I.pressed = true;
          const h = pick(S, Pt.downX, Pt.downY);
          I.grab = h && h.p !== SYS ? h.p : 0;
          if (I.grab) I.raw0 = unrub(I.str[I.grab], S.deepA, S.shallowB[I.grab]);
        }
      } else if (I.pressed) {
        I.pressed = false;
        if (I.grabbing && I.grab) {
          const leg = I.grab, raw = unrub(I.str[leg], S.deepA, S.shallowB[leg]);
          const slope = raw >= 0 ? Math.exp(-raw / S.deepA) : Math.exp(raw / S.shallowB[leg]);
          I.vel[leg] = clamp(Pt.vy * slope, -1600, 1600);
          // the ground takes the bounce
          if (Math.abs(I.str[leg]) > 2 * P) ripple(S, st, leg === SW ? g.xL : (g.ccx + g.tipX) / 2, g.footB, 0.55, 0.05, 0.28, 1.2);
        }
        I.grab = 0; I.grabbing = false;
      }

      // ---- hover affordance (or the leg being stretched)
      if (I.grab) I.hov = I.grab;
      else if (Pt.inside && !Pt.down) { const h = pick(S, Pt.x, Pt.y); I.hov = h ? h.p : 0; }
      else I.hov = 0;

      // ---- ghost tug (idle demo): grip shows, the leg is pulled a few rows deeper, held, released
      const tg = I.tug;
      let tugPh = -1;
      S.gh = 0;
      if (tg) {
        tugPh = now - tg.t0;
        if (tugPh >= TUG_END || I.grab) { I.tug = null; tugPh = -1; }
        else {
          if (tugPh < TUG_REL + 0.2) S.gh = tg.leg;
          if (tugPh >= TUG_REL && !tg.rel) {
            tg.rel = true;
            if (tg.leg === SW) ripple(S, st, g.xL, S.D.footL, 0.4, 0.04, 0.24, 1.1);
            else ripple(S, st, (g.ccx + g.tipX) / 2, S.D.footR, 0.4, 0.04, 0.24, 1.1);
          }
          busy = true;
        }
      }

      // ---- stretch: follows the pointer while dragged; released, an underdamped spring
      for (let leg = SW; leg <= HW; leg++) {
        const B = S.shallowB[leg];
        if (I.grab === leg && Pt.down && Pt.moved) {
          I.str[leg] = rub(I.raw0 + (Pt.y - Pt.downY), S.deepA, B);
          I.grabbing = true; busy = true;
        } else if (tugPh >= TUG_IN && tugPh < TUG_REL && I.tug.leg === leg) {
          const u = clamp((tugPh - TUG_IN) / TUG_PULL);
          I.str[leg] = I.tug.A * u * u * (3 - 2 * u); I.vel[leg] = 0;
        } else if (I.str[leg] !== 0 || I.vel[leg] !== 0) {
          const k = 190, c = red ? 2 * Math.sqrt(k) : 2 * 0.28 * Math.sqrt(k);
          const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
          let x = I.str[leg], v = I.vel[leg];
          for (let q = 0; q < steps; q++) { v += (-k * x - c * v) * h; x += v * h; }
          x = clamp(x, -0.985 * B, 1.25 * S.deepA);
          if (snap) { x = 0; v = 0; }
          if (Math.abs(x) < 0.15 && Math.abs(v) < 2) { x = 0; v = 0; } else busy = true;
          I.str[leg] = x; I.vel[leg] = v;
        }
      }
      const qL = Math.round(I.str[SW] / P), dR = Math.round(I.str[HW] * 4) / 4;
      if (qL !== S.D.qL || dR !== S.D.dR) {
        const chL = qL !== S.D.qL, chR = dR !== S.D.dR;
        S.D = shape(g, qL, dR);
        if (chL) rebuild(S, S.regL);
        if (chR) rebuild(S, S.regR);
        gripAt(S);
      }

      // ---- emphasis: labels / keys (full), pointer hover (a swell + the ↕ grip on a leg's foot)
      for (let p = 1; p <= 3; p++) {
        const on = focus === PARTS[p] ? 1 : 0, off = focus && !on ? 1 : 0;
        const hov = I.hov === p || S.gh === p ? 1 : 0;
        const gt = p !== SYS && hov && !I.grabbing ? 1 : 0;
        S.pin[p] = on;
        if (snap) { S.e[p] = on; S.m[p] = off; S.sp[p] = on; S.eh[p] = hov; S.gA[p] = gt; continue; }
        S.e[p] += (on - S.e[p]) * (1 - Math.exp(-dt / (on ? 0.15 : 0.22)));
        S.m[p] += (off - S.m[p]) * (1 - Math.exp(-dt / 0.3));
        S.eh[p] += (hov - S.eh[p]) * (1 - Math.exp(-dt / 0.12));
        S.gA[p] += (gt - S.gA[p]) * (1 - Math.exp(-dt / (gt ? 0.14 : 0.1)));
        S.sp[p] = on ? Math.min(1, S.sp[p] + dt / 0.5) : Math.max(0, S.sp[p] - dt / 0.25);
        if (Math.abs(S.e[p] - on) < 1e-3) S.e[p] = on; else busy = true;
        if (Math.abs(S.m[p] - off) < 1e-3) S.m[p] = off; else busy = true;
        if (Math.abs(S.eh[p] - hov) < 1e-3) S.eh[p] = hov; else busy = true;
        if (Math.abs(S.gA[p] - gt) < 2e-3) S.gA[p] = gt; else busy = true;
        if (S.sp[p] !== on) busy = true;
      }

      // ---- idle demo: every few seconds a ghost charge (software foot, beam, hardware foot),
      //      alternating with a ghost TUG on a leg (hardware, software) that shows the stretch
      const idle = !red && !focus && !Pt.down && !I.grabbing && now - I.last > IDLE_AFTER;
      if (idle) {
        if (I.idleT0 < 0) { I.idleT0 = now + (I.touched ? 1.2 : 1.8); I.idleK = -1; }
        const ph = now - I.idleT0;
        if (ph >= 0) {
          const pair = Math.floor(ph / IDLE_PAIR), k = 2 * pair + (ph - pair * IDLE_PAIR >= IDLE_TUG_AT ? 1 : 0);
          if (k !== I.idleK) {
            I.idleK = k;
            if (k & 1) {
              const leg = [HW, SW][(k >> 1) & 1];
              I.tug = { leg, t0: now, rel: false, A: (leg === SW ? 3.4 : 3.2) * P };
            } else fire(S, st, [SW, SYS, HW][(k >> 1) % 3], 0.7);
          }
        }
      } else { I.idleT0 = -1; if (I.tug && !I.tug.rel) I.tug = null; }

      // ---- charges and ripples
      const v = V * g.S;
      for (let k = S.chs.length - 1; k >= 0; k--) {
        const ch = S.chs[k], age = now - ch.t0;
        ch.F = st.reduced ? 1e9 : v * age;
        ch.glow = ch.amp * (st.reduced ? 0.42 : 0.16) * Math.exp(-age / 1.1) * smoothstep(0, 0.08, age);
        if ((st.reduced || ch.F > ch.end) && ch.glow < 0.004) S.chs.splice(k, 1); else busy = true;
      }
      for (let k = S.rips.length - 1; k >= 0; k--) {
        const R = S.rips[k], u = (now - R.t0) / R.dur;
        if (u > 1) { S.rips.splice(k, 1); continue; }
        busy = true;
        if (u < 0) { R.a = 0; continue; }
        R.r = R.Rm * (1 - (1 - u) * (1 - u));
        R.a = R.amp * smoothstep(0, 0.12, u) * (1 - smoothstep(0.35, 1, u));
      }
      // ---- page glue: pills follow a deeper foot; keyboard selection lights its pill
      const dom = st._piDom;
      if (dom) {
        const ySw = Math.max(0, S.D.footL - g.footB), yHw = Math.max(0, Math.round(S.D.dR));
        if (dom.sw && ySw !== dom.ySw) { dom.ySw = ySw; dom.sw.style.translate = ySw ? '0 ' + ySw.toFixed(1) + 'px' : ''; }
        if (dom.hw && yHw !== dom.yHw) { dom.yHw = yHw; dom.hw.style.translate = yHw ? '0 ' + yHw + 'px' : ''; }
        if (!hv && dom.focus !== I.sel) {
          dom.focus = I.sel;
          dom.all.forEach((l) => l.classList.toggle('is-on', l.dataset.pi === I.sel));
        } else if (hv) dom.focus = hv;
        // the cursor label says what a drag / click does right here
        const cur = I.grab ? 'Stretch' : I.hov === SYS ? 'Charge' : I.hov ? 'Stretch' : 'Play';
        if (cur !== dom.cur && dom.cv) {
          dom.cur = cur;
          dom.cv.dataset.cursor = cur;
          if (Pt.inside) {
            let ev = null;
            try { ev = new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }); } catch (e) { ev = new Event('pointerover', { bubbles: true }); }
            dom.cv.dispatchEvent(ev);
          }
        }
      }
      st.busy = busy || st.busy;
    },

    onClick(x, y, st) {
      const S = st._pi;
      if (!S) return;
      const I = S.I;
      I.last = st.now; I.touched = true;
      const h = pick(S, x, y);
      ripple(S, st, x, y, h ? 0.9 : 0.7, 0, h ? 0.34 : 0.3, 1.2);
      if (h) charge(S, st, h.p, h.c, 1);
    },

    onKey(key, st) {
      const S = st._pi;
      if (!S) return false;
      const I = S.I;
      I.last = st.now; I.touched = true;
      const sel = { 1: 'software', 2: 'hardware', 3: 'systems' }[key];
      if (sel) { I.sel = I.sel === sel ? null : sel; return true; }
      const cur = (st.data && st.data.hover) || I.sel;
      const p = cur === 'software' ? SW : cur === 'hardware' ? HW : SYS;
      switch (key) {
        case 'Enter': case ' ': fire(S, st, p, 1); return true;
        case 'ArrowDown': case 'ArrowUp': {
          const kick = key === 'ArrowDown' ? 520 : -520;
          if (p === SYS) { I.vel[SW] += kick; I.vel[HW] += kick; } else I.vel[p] += kick;
          return true;
        }
        case 'Escape': if (I.sel) { I.sel = null; return true; } return false;
        default: return false;
      }
    },

    sample(x, y, t, st, out, i) {
      const S = st._pi, p = S.part[i];
      const rips = S.rips, nr = rips.length;
      let ring = 0;
      if (nr) {
        for (let k = 0; k < nr; k++) {
          const R = rips[k];
          if (R.a <= 0) continue;
          const dx = x - R.x, dy = y - R.y, lim = R.r + 3 * R.w;
          if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
          const dd = Math.sqrt(dx * dx + dy * dy) - R.r;
          if (dd > -3 * R.w && dd < 3 * R.w) { const q = R.a * Math.exp(-dd * dd / (R.w * R.w)); if (q > ring) ring = q; }
        }
      }
      if (p === 0) {
        const r0 = S.fr[i];
        if (r0 === 0) { out.d = 0; return; }
        const r = (r0 + 0.9 * ring) * S.invMaxR;
        out.d = r * r; out.c = S.mat[i];
        return;
      }
      const g = S.g, P = g.P, ed = S.edge[i], col = S.col;
      let d = S.base[i], c = S.mat[i];
      const e = S.e[p], m = S.m[p], eh = S.eh[p];
      // emphasis: the member grows and KEEPS its ramp (multiplicative); the others thin out.
      // Pointer hover swells more (about +15% radius) — it is the affordance for "grab me".
      if (e > 0 || eh > 0) d *= 1 + 0.16 * e + 0.34 * eh * (1 - e);
      if (m > 0) d *= 1 - 0.5 * m * (1 - e);
      const sp = S.sp[p];
      if (sp > 0) {
        const k = S.kq[i], F = sp * (S.D.K[p] + 1);
        if (k < F && S.deep[i]) { if (!col || U.hash2(i, 41) > 0.16) c = ACC; }   // colour: a few own-hue specks stay
        else if (S.pin[p] && sp < 1 && k === (F | 0) && ed > 0.6) c = ACC;   // the 1-row pour front
      }
      // charges
      const chs = S.chs, nc = chs.length;
      if (nc) {
        const band = S.band[i];
        const coord = p === SYS ? x : (p === SW && band >= 0 ? S.D.bandY[band] : S.sk[i]);
        for (let k = 0; k < nc; k++) {
          const ch = chs[k];
          const Dd = p === ch.p ? Math.abs(coord - ch.c0)
            : p === SYS ? Math.min(ch.jL + Math.abs(x - g.xL), ch.jR + Math.abs(x - g.xR))
              : (p === SW ? ch.jL : ch.jR) + coord;
          const u = ch.F - Dd, a = ch.amp;
          if (u < -4 * P) continue;
          if (u > 0 && ch.glow > 0) d *= 1 + ch.glow * smoothstep(0, 3 * P, u);
          if (ch.F > 1e8) continue;
          if (p === SW) {
            // digital: the band holding the front latches ON as a block; a square packet sits in it
            if (band >= 0) {
              const hb = S.D.hb;
              if (u > -hb && u < hb) { d += (FULL * ed - d) * 0.9 * a; if (col && ed > 0.6) c = ACC; }
              else if (u >= hb) d += (FULL * ed - d) * 0.2 * a * Math.exp(-(u - hb) / (4.5 * P));
            }
            const q = S.pk[i];
            if (q >= 0 && Math.abs(S.ac[i]) < 1.5 * P && Math.abs(S.sk[i] - S.D.bandY[q]) < 1.5 * P) {
              const uq = ch.F - (p === ch.p ? Math.abs(S.D.bandY[q] - ch.c0) : ch.jL + S.D.bandY[q]);
              if (uq > -S.D.hb && uq < S.D.hb) { d = Math.max(d, FULL * ed); if (a > 0.35) c = col ? PALE : ACC; }
            }
          } else if (p === HW) {
            // analog: a soft droplet stretched along the path, with a comet tail behind it
            const ac = S.ac[i], al = u / (2.1 * P), cr = ac / (1.25 * P);
            const qd = al * al + cr * cr;
            let f = qd < 9 ? Math.exp(-qd) : 0;
            if (u > 0) { const cr2 = ac / (2.4 * P); f = Math.max(f, 0.6 * Math.exp(-u / (5.5 * P) - cr2 * cr2)); }
            d += (FULL * ed - d) * f * a;
            if (a > 0.35 && ed > 0.5) {
              // a teardrop: a round head (radius ~1.9 dots) leading, a tail tapering behind (vs
              // software's square packet). Accent by a smooth threshold on the drop's field with dot
              // size following it, so the outline grows / shrinks instead of popping between frames;
              // in colour the head is white on cream, inside a copper rim.
              const hr = 1.9 * P, tl = 2.3 * hr;
              const ta = u < 0 ? u / hr : u / tl;
              const wq = u < 0 ? 1 : Math.sqrt(Math.max(0.04, 1 - u / tl));
              const tc = ac / (hr * wq), tq = ta * ta + tc * tc;
              if (tq < 1) {
                c = col ? (u < 0.45 * hr && tq < 0.55 ? WHITE : PALE) : ACC;
                d = FULL * ed * (0.4 + 0.6 * smoothstep(1, 0.3, tq));
              } else if (tq < 2) {
                // the rim: mono — a paper halo (smaller ink dots); colour — a copper ring, so the
                // cream head holds against the light amber top of the leg as well as the deep end
                if (col) { if (tq < 1.7) c = HW0 + 4; }
                else d *= 0.4 + 0.6 * smoothstep(1, 2, tq);
              }
            }
          } else {
            // the beam: its flanges carry the pulse, the web follows lightly
            const w = u / (2.6 * P);
            let f = w > -3 && w < 3 ? Math.exp(-w * w) : 0;
            if (S.rail[i]) {
              if (u > 0) f = Math.max(f, 0.4 * Math.exp(-u / (8 * P)));
              d += (FULL * ed - d) * f * a;
              if (f > 0.5 && a > 0.35) c = ACC;
            } else {
              d += (FULL * ed - d) * 0.5 * f * a;
              if (f > (col ? 0.6 : 0.9) && a > 0.35 && ed > 0.6) c = ACC;
            }
          }
        }
      }
      // the ↕ grip on a hovered leg's foot (and on the ghost tug's leg)
      if (p !== SYS) {
        const gA = S.gA[p];
        if (gA > 0.1 && ed > 0.5) {
          const r = (i / g.cols) | 0, dr = r - S.gR[p] + 4, dc = i - r * g.cols - S.gC[p] + 2;
          if (dr >= 0 && dr < 9 && dc >= 0 && dc < 5 && GRIP[dr * 5 + dc]) { c = col && p === HW ? PALE : ACC; d = FULL * ed * (0.3 + 0.7 * gA); }
        }
      }
      if (ring > 0) d *= 1 + 0.45 * ring;
      // colour: soft-cap coverage near "just touching" so paper shows between dots (pointillism)
      if (col && d > CAP0) d = CAP0 + CAPW * (1 - Math.exp((CAP0 - d) / CAPW));
      out.d = (d > MAXU ? MAXU : d) * IG2; out.c = c;
    },

    revealKey(x, y, st) {
      const S = st._pi, g = S.g;
      const c = Math.round((x - g.ox) / g.P), r = Math.round((y - g.oy) / g.P);
      const i = r * g.cols + c;
      if (!(i >= 0 && i < S.part.length) || S.part[i] === 0) {
        return 0.3 + 0.62 * clamp((y - g.barB) / (g.footB - g.barB));   // the ground, top-down, row by row
      }
      return 0.68 * S.dC[i] / (g.S * 0.95);                              // bar centre outward, then down the legs
    },
  };

  scene.anchorAlign = { systems: 'center', software: 'center', hardware: 'center' };
  Halftone.scenes = Halftone.scenes || {};
  Halftone.scenes.pi = scene;
})();
