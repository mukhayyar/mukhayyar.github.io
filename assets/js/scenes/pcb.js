/*!
 * pcb.js — featured project spotlight: rekafab (https://rekafab.mukhayyar.my.id),
 * the AI-native, code-first PCB studio in the browser. Its starter board — 53 × 80 mm,
 * 36 placed parts — drawn only in dots and held up in true perspective.
 *
 * The board: rounded outline with four plated mounting holes, a QFP MCU with
 * decoupling row, QSPI flash, USB-C with ESD and series resistors, LDO, HC-49
 * crystal, two tact switches, LEDs, a 1×8 header footprint (round pads) and a populated
 * 2×5 SWD header, vias,
 * Manhattan + 45° traces on real nets, a hatched ground pour, silkscreen
 * outlines, refdes and the wordmark.
 *
 * Rendering: every layer (board, copper, pads, pour, silk, bodies, shadows, nets,
 * parts) is rasterised once into 5 texel/mm maps and composited per colour mode.
 * Per dot: an inverse projection (screen -> board plane) for the board, the low
 * body plane (ICs, passives) and the tall body plane (USB-C, crystal, switches),
 * plus the back face for the board edge — then a texture lookup. The edge band takes its dot
 * area from its coverage of the dot's cell (signed distance to the outline, at least a dot
 * thick); the wordmark is left off where a dot is wider than ~0.75 mm (mobile).
 *
 * Palette (material indices, same length in both modes):
 *   0 mask   1 mask light   2 pour   3 trace   4 pad   5 pad glint   6 silk
 *   7 body   8 body marking  9 metal  10 metal glint  11 FR4 edge / ceramic
 *   12 accent (active net, DRC)   13 LED   14 trace glint   15 mask sheen   16 pour sheen
 * Interaction:
 *   hover a part   its silk outline and signal nets light up (accent), pulses flow along the
 *                  copper to the parts they connect (through the vias and their bottom-layer
 *                  hops, seen through the board); the rest of the copper dims. Ground is never
 *                  lit: a small part on GND gets a local, tonal swell of the mask and pour
 *   click a part   select it (persists); click the board: run the design-rule check
 *                  (scan, two findings pop and resolve, the mask ripples "all clear");
 *                  click outside the board: deselect
 *   drag           turn (±35°) and tilt (±20°), soft-clamped past that (max ≈ ±42° / ±24.5°),
 *                  with inertia; springs back to 3/4 (ζ ≈ 0.55, ≤ ~15% overshoot)
 *   keys           arrows nudge, Enter/Space check, n/p next/previous part, Esc clear
 *   idle (3 s)     slow sway + a random part's nets every few seconds (not when reduced)
 * Extra API: Halftone.scenes.pcb.status(st) -> { phase, issues, part, selected, nets }
 *            Halftone.scenes.pcb.locate(st, 'U1') -> [x, y] screen position of a part
 */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const q8 = (v) => Math.round(clamp(v, 0, 1) * 255);
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  // ---------------------------------------------------------------------------
  // Board model. Millimetres, origin at the top-left corner, x right, y down.
  // Parts are drawn a little larger than life so they read at dot scale.
  // ---------------------------------------------------------------------------
  const BW = 80, BH = 53, BRAD = 2.6, THICK = 2.4;
  const H_LO = 1.1, H_HI = 3.1;                 // body heights (low: ICs + passives, tall: connectors)
  const TPM = 5, MARG = 2, ITPM = 1 / TPM;      // texels per mm, texture margin
  const TW = (BW + 2 * MARG) * TPM, TH = (BH + 2 * MARG) * TPM;
  const CAM = 210;                              // camera distance, mm

  // materials (palette indices)
  const MASK_D = 0, MASK_L = 1, POUR_C = 2, TRACE_C = 3, PAD_C = 4, PAD_HI = 5, SILK_C = 6,
    BODY_C = 7, BODY_HI = 8, METAL_C = 9, METAL_HI = 10, EDGE_C = 11, ACC = 12, LED_C = 13, TRACE_HI = 14, SHEEN = 15, POUR_HI = 16;
  // base texel kinds
  const K_NONE = 0, K_MASK = 1, K_POUR = 2, K_TRACE = 3, K_PAD = 4, K_SILK = 5, K_BARE = 6;
  // body materials
  const M_IC = 1, M_METAL = 2, M_CER = 3, M_LED = 4, M_GOLD = 5;

  const NETS = ['', 'GND', 'VBUS', 'VSYS', '3V3', 'UD+', 'UD-', 'D+', 'D-', 'CC1', 'CC2', 'XIN', 'XOUT',
    'QSPI_SS', 'QSPI_SD0', 'QSPI_SD1', 'QSPI_SD2', 'QSPI_SD3', 'QSPI_SCLK', 'SWDIO', 'SWCLK', 'RUN',
    'GP0', 'GP1', 'GP2', 'GP3', 'GP4', 'GP5', 'LED', 'LED_A', 'PWR_LED', 'SHIELD'];
  const NID = {};
  NETS.forEach((s, i) => { NID[s] = i; });
  const GND = 1, SHIELD = NID.SHIELD;   // SHIELD: mounting holes + USB-C shell, bonded to the pour, never lit

  const PARTS = [], TRACES = [], VIAS = [], FIDS = [], HOLES = [], TEXT = [], BYREF = {};
  function part(ref, x, y) {
    const p = { ref, id: PARTS.length + 1, x, y, pads: [], bodies: [], silk: [], nets: new Set(), box: null, tall: false };
    PARTS.push(p); BYREF[ref] = p; return p;
  }
  function pad(p, x, y, w, h, net, o) {
    o = o || {};
    const q = { x, y, w, h, net: NID[net] || 0, rr: o.rr != null ? o.rr : Math.min(w, h) * 0.2, round: !!o.round,
      drill: o.drill || 0, slot: o.slot || null, part: p ? p.id : 0 };
    if (p) { p.pads.push(q); if (q.net) p.nets.add(q.net); }
    return q;
  }
  // body shapes, drawn in order: rect (x, y = centre) / circle / text; shade 0..255 (255 = marking / glint)
  function bodyRect(p, z, mat, x, y, w, h, r, shade) { p.bodies.push({ t: 'r', z, mat, x, y, w, h, r, shade }); if (z === 'hi') p.tall = true; }
  function bodyCirc(p, z, mat, x, y, r, shade) { p.bodies.push({ t: 'c', z, mat, x, y, r, shade }); }
  function bodyText(p, z, mat, s, x, y, size, shade) { p.bodies.push({ t: 't', z, mat, s, x, y, size, shade }); }
  function silkRect(p, x0, y0, x1, y1) { p.silk.push(['poly', [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]); }
  function silkLine(p, pts) { p.silk.push(['poly', pts]); }
  function silkDot(p, x, y, r) { p.silk.push(['dot', x, y, r]); }
  function silkText(p, s, x, y, size, align) { p.silk.push(['text', s, x, y, size, align || 'center']); }
  const trace = (net, w, pts) => TRACES.push({ net: NID[net], w, pts });
  // bottom-layer copper: never drawn, but seen through the board in accent while its net is lit
  const BOT = [];
  const btrace = (net, w, pts) => BOT.push({ net: NID[net], w, pts });
  const via = (net, x, y) => VIAS.push({ net: NID[net], x, y, r: 0.5, d: 0.22 });

  // ---- footprints -----------------------------------------------------------
  function chip(ref, x, y, vert, na, nb, kind) {
    const p = part(ref, x, y);
    const big = kind === 'C1206' || kind === 'F1206';
    const L = big ? 3.2 : 1.9, Wd = big ? 1.6 : 1.0, off = big ? 1.45 : 0.85, pl = big ? 1.2 : 0.9, pw = big ? 1.9 : 1.15;
    const ax = vert ? 0 : 1, ay = vert ? 1 : 0;
    pad(p, x - off * ax, y - off * ay, vert ? pw : pl, vert ? pl : pw, na);
    pad(p, x + off * ax, y + off * ay, vert ? pw : pl, vert ? pl : pw, nb);
    const mat = kind[0] === 'R' ? M_IC : kind[0] === 'D' ? M_LED : M_CER;
    bodyRect(p, 'lo', mat, x, y, vert ? Wd : L, vert ? L : Wd, 0.12, kind[0] === 'D' ? 230 : 120);
    const tl = big ? 0.55 : 0.38, e = L / 2 - tl / 2;
    bodyRect(p, 'lo', M_METAL, x - e * ax, y - e * ay, vert ? Wd : tl, vert ? tl : Wd, 0.05, 150);
    bodyRect(p, 'lo', M_METAL, x + e * ax, y + e * ay, vert ? Wd : tl, vert ? tl : Wd, 0.05, 150);
    // silk ticks along the long sides
    const so = pw / 2 + 0.45, sl = big ? 1.0 : 0.45;
    if (vert) { silkLine(p, [[x - so, y - sl], [x - so, y + sl]]); silkLine(p, [[x + so, y - sl], [x + so, y + sl]]); }
    else { silkLine(p, [[x - sl, y - so], [x + sl, y - so]]); silkLine(p, [[x - sl, y + so], [x + sl, y + so]]); }
    if (kind[0] === 'D') { // cathode bar on the b side
      const cx = x + (off + pl / 2 + 0.5) * ax, cy = y + (off + pl / 2 + 0.5) * ay;
      if (vert) silkLine(p, [[cx - 0.8, cy], [cx + 0.8, cy]]); else silkLine(p, [[cx, cy - 0.8], [cx, cy + 0.8]]);
    }
    return p;
  }

  function qfp(ref, x, y, sides) {
    const p = part(ref, x, y);
    const pitch = 1.25, o = 6.1, pl = 1.8, pw = 0.62;
    for (let k = 0; k < 8; k++) {
      const s = -4.375 + pitch * k;
      pad(p, x - o, y + s, pl, pw, sides.L[k]);
      pad(p, x + s, y + o, pw, pl, sides.B[k]);
      pad(p, x + o, y + s, pl, pw, sides.R[k]);
      pad(p, x + s, y - o, pw, pl, sides.T[k]);
    }
    bodyRect(p, 'lo', M_IC, x, y, 10, 10, 0.5, 40);
    bodyCirc(p, 'lo', M_IC, x - 3.4, y - 3.4, 0.75, 255);
    bodyCirc(p, 'lo', M_IC, x - 3.4, y - 3.4, 0.42, 40);
    bodyText(p, 'lo', M_IC, 'RKF', x + 0.6, y + 1.2, 2.3, 255);
    bodyText(p, 'lo', M_IC, '2040', x + 0.6, y + 3.4, 1.6, 255);
    const e = 7.35, c = 1.6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      silkLine(p, [[x + sx * e, y + sy * (e - c)], [x + sx * e, y + sy * e], [x + sx * (e - c), y + sy * e]]);
    }
    silkDot(p, x - e - 0.1, y - 5.6, 0.42);
    return p;
  }

  function soic8(ref, x, y, left, right) {
    const p = part(ref, x, y);
    for (let k = 0; k < 4; k++) {
      const yy = y - 1.905 + 1.27 * k;
      pad(p, x - 2.75, yy, 1.55, 0.6, left[k]);
      pad(p, x + 2.75, yy, 1.55, 0.6, right[k]);
    }
    bodyRect(p, 'lo', M_IC, x, y, 3.9, 4.9, 0.25, 40);
    bodyCirc(p, 'lo', M_IC, x - 1.15, y - 1.6, 0.4, 255);
    bodyText(p, 'lo', M_IC, '25Q', x + 0.1, y + 0.9, 1.1, 255);
    silkLine(p, [[x - 2.25, y - 2.9], [x + 2.25, y - 2.9]]);
    silkLine(p, [[x - 2.25, y + 2.9], [x + 2.25, y + 2.9]]);
    silkDot(p, x - 3.9, y - 2.6, 0.35);
    return p;
  }

  // ---------------------------------------------------------------------------
  // The starter board: 36 placed parts.
  // ---------------------------------------------------------------------------
  (function layout() {
    // U1 MCU (QFP-32, stylised)
    qfp('U1', 40, 25, {
      L: ['3V3', 'GND', 'D+', 'D-', '3V3', 'GP0', 'GP1', 'GP2'],
      B: ['GP3', 'QSPI_SD2', 'QSPI_SD1', 'QSPI_SS', 'GND', 'QSPI_SD3', 'QSPI_SCLK', 'QSPI_SD0'],
      R: ['SWDIO', 'SWCLK', 'GP4', 'GP5', 'RUN', 'LED', 'XOUT', 'XIN'],
      T: ['3V3', 'GND', '3V3', 'GND', '3V3', 'GND', '3V3', 'GND'],
    });
    silkText(BYREF.U1, 'U1', 48.6, 33.4, 1.5, 'left');

    // U2 LDO (SOT-223)
    {
      const p = part('U2', 20, 8);
      pad(p, 20, 4.3, 3.4, 2.0, '3V3');
      pad(p, 17.7, 11.6, 1.0, 1.9, 'VSYS');
      pad(p, 20.0, 11.6, 1.0, 1.9, '3V3');
      pad(p, 22.3, 11.6, 1.0, 1.9, 'GND');
      bodyRect(p, 'lo', M_IC, 20, 8, 6.5, 3.5, 0.25, 40);
      bodyText(p, 'lo', M_IC, '1117-3.3', 20, 8.5, 1.05, 255);
      silkRect(p, 16.2, 2.6, 23.8, 10.2);
      silkText(p, 'U2', 26.6, 4.9, 1.5, 'left');
    }

    // U3 QSPI flash (SOIC-8)
    soic8('U3', 40, 40.5, ['QSPI_SS', 'QSPI_SD1', 'QSPI_SD2', 'GND'], ['3V3', 'QSPI_SD3', 'QSPI_SCLK', 'QSPI_SD0']);
    silkText(BYREF.U3, 'U3', 44.5, 44.6, 1.5, 'left');

    // U4 USB ESD (SOT-23-6, flow-through)
    {
      const p = part('U4', 12.8, 23.75);
      const L = ['GND', 'UD+', 'UD-'], R = ['VBUS', 'UD+', 'UD-'];
      for (let k = 0; k < 3; k++) { pad(p, 11.1, 22.75 + k, 0.9, 0.55, L[k]); pad(p, 14.5, 22.75 + k, 0.9, 0.55, R[k]); }
      bodyRect(p, 'lo', M_IC, 12.8, 23.75, 1.7, 3.0, 0.15, 40);
      silkDot(p, 10.2, 21.9, 0.3);
      silkText(p, 'U4', 12.8, 20.9, 1.3, 'center');
    }

    // J1 USB-C receptacle at the left edge
    {
      const p = part('J1', 3, 24.25);
      const nets = ['GND', 'VBUS', 'CC1', 'UD+', 'UD-', 'CC2', 'VBUS', 'GND'];
      for (let k = 0; k < 8; k++) pad(p, 8.0, 20.75 + k, 1.3, 0.55, nets[k]);
      for (const [tx, ty] of [[1.0, 19.0], [5.6, 19.0], [1.0, 29.5], [5.6, 29.5]]) {
        pad(p, tx, ty, 1.5, 2.4, 'SHIELD', { rr: 0.75, drill: 0.3, slot: [0.6, 1.4] });
      }
      bodyRect(p, 'hi', M_METAL, 3.0, 24.25, 7.6, 9.0, 1.0, 190);
      bodyRect(p, 'hi', M_METAL, 3.25, 24.25, 6.3, 7.6, 0.7, 225);
      bodyRect(p, 'hi', M_METAL, 0.9, 24.25, 0.3, 7.2, 0.1, 140);
      bodyRect(p, 'hi', M_METAL, 3.6, 21.0, 1.8, 0.8, 0.3, 140);
      bodyRect(p, 'hi', M_METAL, 3.6, 27.5, 1.8, 0.8, 0.3, 140);
      bodyRect(p, 'hi', M_METAL, 5.2, 22.4, 0.4, 2.2, 0.1, 255);
      silkLine(p, [[0.4, 17.0], [7.2, 17.0]]);
      silkLine(p, [[0.4, 31.5], [7.2, 31.5]]);
      silkText(p, 'J1', 4.0, 33.4, 1.5, 'center');
    }

    // Y1 crystal (HC-49 SMD)
    {
      const p = part('Y1', 53.5, 36.6);
      pad(p, 48.6, 36.6, 2.4, 1.9, 'XIN');
      pad(p, 58.4, 36.6, 2.4, 1.9, 'XOUT');
      bodyRect(p, 'hi', M_METAL, 53.5, 36.6, 9.4, 3.8, 1.9, 170);
      bodyRect(p, 'hi', M_METAL, 53.5, 36.6, 8.3, 2.7, 1.35, 215);
      bodyRect(p, 'hi', M_METAL, 53.5, 35.85, 6.0, 0.45, 0.22, 255);
      silkLine(p, [[49.6, 34.1], [57.4, 34.1]]);
      silkLine(p, [[49.6, 39.1], [57.4, 39.1]]);
      silkText(p, 'Y1', 53.5, 41.2, 1.5, 'center');
    }

    // SW1 reset (6 × 6 tact), SW2 boot (small tact)
    {
      const p = part('SW1', 65.5, 44.5);
      for (const [px, py, n] of [[61.4, 42.2, 'GND'], [61.4, 46.8, 'GND'], [69.6, 42.2, 'RUN'], [69.6, 46.8, 'RUN']]) pad(p, px, py, 1.7, 1.1, n);
      bodyRect(p, 'hi', M_METAL, 65.5, 44.5, 6.0, 6.0, 0.4, 175);
      bodyRect(p, 'hi', M_IC, 65.5, 44.5, 4.5, 4.5, 0.35, 30);
      bodyCirc(p, 'hi', M_IC, 65.5, 44.5, 1.85, 255);
      bodyCirc(p, 'hi', M_IC, 65.5, 44.5, 1.45, 60);
      silkRect(p, 62.0, 41.0, 69.0, 48.0);
      silkText(p, 'RESET', 65.5, 50.3, 1.3, 'center');
    }
    {
      const p = part('SW2', 53.0, 45.8);
      pad(p, 50.3, 45.8, 1.3, 1.8, 'QSPI_SS');
      pad(p, 55.7, 45.8, 1.3, 1.8, 'GND');
      bodyRect(p, 'hi', M_METAL, 53.0, 45.8, 4.2, 3.2, 0.3, 175);
      bodyRect(p, 'hi', M_IC, 53.0, 45.8, 3.0, 2.0, 0.25, 30);
      bodyRect(p, 'hi', M_IC, 53.0, 45.8, 1.3, 0.8, 0.2, 255);
      silkText(p, 'BOOT', 53.0, 49.2, 1.3, 'center');
    }

    // LEDs + resistors + pull-ups
    chip('D1', 35.0, 7.0, false, 'PWR_LED', 'GND', 'D0603');
    chip('R5', 31.0, 7.0, false, '3V3', 'PWR_LED', 'R0603');
    chip('D2', 66.0, 36.0, true, 'LED_A', 'GND', 'D0603');
    chip('R6', 66.0, 31.6, true, 'LED', 'LED_A', 'R0603');
    chip('R7', 72.6, 36.0, true, '3V3', 'RUN', 'R0603');
    chip('R8', 46.0, 46.4, false, 'QSPI_SS', '3V3', 'R0603');
    chip('R1', 19.0, 22.4, false, 'UD+', 'D+', 'R0603');
    chip('R2', 19.0, 26.1, false, 'UD-', 'D-', 'R0603');
    chip('R3', 14.6, 30.0, true, 'CC1', 'GND', 'R0603');
    chip('R4', 12.6, 30.0, true, 'CC2', 'GND', 'R0603');
    silkText(BYREF.D1, 'PWR', 35.0, 4.6, 1.2, 'center');

    // capacitors
    chip('C1', 15.2, 9.8, true, 'GND', 'VSYS', 'C1206');
    chip('C2', 25.0, 9.8, true, 'GND', '3V3', 'C1206');
    const decx = [34.4, 36.9, 39.4, 41.9, 44.4, 46.9];
    decx.forEach((dx, j) => chip('C' + (3 + j), dx, 13.3, true, '3V3', 'GND', 'C0603'));
    chip('C9', 48.6, 40.6, true, 'XIN', 'GND', 'C0603');
    chip('C10', 58.4, 40.6, true, 'XOUT', 'GND', 'C0603');
    chip('C11', 40.0, 45.4, false, '3V3', 'GND', 'C0603');
    chip('C12', 16.8, 30.0, true, 'VBUS', 'GND', 'C0603');
    chip('C13', 30.0, 19.6, true, '3V3', 'GND', 'C0603');
    chip('C14', 9.6, 13.6, false, 'GND', 'VSYS', 'C0603');
    chip('C15', 31.2, 33.2, true, 'GND', '3V3', 'C0603');
    chip('F1', 12.4, 16.4, true, 'VSYS', 'VBUS', 'F1206');

    // J2 1×8 header, J3 2×5 SWD / GPIO header. Drawn larger than life (1 mm drills; J2 at
    // 3 mm pitch with 2.2 mm pads so a full dot of mask separates the rings; J3 populated).
    const HP = 2.8, HD = 2.3, HR = 0.5, JP = 3.0, JD = 2.2;
    {
      const p = part('J2', 24.5, 48.6);
      const nets = ['VBUS', 'GND', '3V3', 'GP0', 'GP1', 'GP2', 'GP3', 'GND'];
      for (let k = 0; k < 8; k++) {
        const x = 14.0 + JP * k;
        pad(p, x, 48.6, JD, JD, nets[k], k === 0 ? { rr: 0.25, drill: HR } : { round: true, drill: HR });
      }
      silkRect(p, 12.35, 46.95, 36.65, 50.25);
      silkLine(p, [[12.35, 46.2], [13.6, 46.2]]);
      silkText(p, 'J2', 10.7, 49.15, 1.5, 'center');
    }
    {
      const p = part('J3', 72.0, 16.6);
      const Lc = ['SWDIO', 'SWCLK', 'GP4', 'GP5', 'RUN'], Rc = ['3V3', 'GND', 'GND', 'GND', '3V3'];
      for (let k = 0; k < 5; k++) {
        const y = 11.0 + HP * k;
        pad(p, 70.6, y, HD, HD, Lc[k], k === 0 ? { rr: 0.25, drill: HR } : { round: true, drill: HR });
        pad(p, 70.6 + HP, y, HD, HD, Rc[k], { round: true, drill: HR });
      }
      // populated: a black 2×5 housing with bright pin tips (they light with their nets)
      bodyRect(p, 'hi', M_IC, 72.0, 16.6, 5.5, 13.9, 0.35, 30);
      for (let k = 0; k < 5; k++) for (const px of [70.6, 70.6 + HP]) bodyRect(p, 'hi', M_GOLD, px, 11.0 + HP * k, 1.15, 1.15, 0.15, 220);
      silkRect(p, 68.95, 9.35, 75.05, 23.85);
      silkLine(p, [[68.2, 10.0], [68.2, 12.0]]);
      silkText(p, 'SWD', 72.0, 25.9, 1.3, 'center');
    }

    // mounting holes (plated, GND), fiducials
    for (const [hx, hy] of [[3.6, 3.6], [76.4, 3.6], [3.6, 49.4], [76.4, 49.4]]) {
      HOLES.push(pad(null, hx, hy, 5.6, 5.6, 'SHIELD', { round: true, drill: 1.6 }));
    }
    FIDS.push([7.0, 44.5], [75.0, 28.5], [43.8, 4.4]);

    // board text
    // fitted between the fiducial and the mounting hole, heavy and tracked so every stroke
    // is wider than a dot at card size (hidden where a dot is wider than ~0.7 mm)
    TEXT.push({ s: 'rekafab', x0: 46.9, x1: 72.2, y: 8.6, max: 6.6, stroke: 0.1, track: 0.04, font: '800 {s}px Geist, system-ui, sans-serif' });

    // ---- routing ------------------------------------------------------------
    const W = 0.44, WP = 0.8;
    // USB: VBUS through the polyfuse into the LDO, the D+/D- pair through ESD and series resistors
    trace('VBUS', WP, [[8.65, 21.75], [9.4, 21.75], [12.4, 18.75], [12.4, 17.6]]);
    trace('VSYS', WP, [[12.4, 15.2], [12.4, 13.6], [17.7, 13.6], [17.7, 12.4]]);
    trace('VSYS', 0.5, [[10.45, 13.6], [12.4, 13.6]]);
    trace('VSYS', 0.5, [[15.2, 11.6], [15.2, 13.6]]);
    trace('3V3', WP, [[20.0, 12.4], [20.0, 13.8], [26.6, 13.8], [29.4, 11.0], [47.6, 11.0]]);
    trace('3V3', 0.5, [[25.0, 11.6], [25.0, 13.8]]);
    trace('UD+', W, [[8.65, 23.75], [16.0, 23.75], [17.35, 22.4], [18.2, 22.4]]);
    trace('D+', W, [[19.8, 22.4], [20.65, 22.4], [21.375, 23.125], [33.0, 23.125]]);
    trace('UD-', W, [[8.65, 24.75], [16.0, 24.75], [17.35, 26.1], [18.2, 26.1]]);
    trace('D-', W, [[19.8, 26.1], [20.65, 26.1], [22.375, 24.375], [33.0, 24.375]]);
    trace('CC1', W, [[8.65, 22.75], [10.0, 22.75]]);
    trace('CC2', W, [[8.65, 25.75], [10.0, 25.75], [12.6, 28.35], [12.6, 29.0]]);
    trace('CC1', W, [[14.6, 29.0], [14.6, 27.9]]);
    trace('VBUS', W, [[16.8, 29.0], [16.8, 27.9]]);
    trace('VBUS', W, [[8.65, 26.75], [9.4, 26.75]]);
    trace('GND', W, [[8.65, 20.75], [9.2, 19.9]]);
    trace('GND', W, [[8.65, 27.75], [9.4, 28.2]]);
    // LEDs, power
    trace('3V3', W, [[30.15, 11.0], [30.15, 7.4]]);
    trace('PWR_LED', W, [[31.85, 7.0], [34.15, 7.0]]);
    decx.forEach((dx) => trace('3V3', 0.5, [[dx, 11.0], [dx, 12.3]]));
    // MCU top: stubs to a zig-zag via row
    for (let k = 0; k < 8; k++) {
      const x = 35.625 + 1.25 * k, g = k & 1;
      trace(g ? 'GND' : '3V3', W, [[x, 18.4], [x, g ? 17.2 : 16.55]]);
      via(g ? 'GND' : '3V3', x, g ? 17.2 : 16.55);
    }
    // MCU left
    trace('3V3', W, [[33.0, 20.625], [31.0, 20.625], [31.0, 18.75], [30.3, 18.75]]);
    trace('GND', W, [[33.0, 21.875], [31.7, 21.875]]);
    trace('3V3', W, [[33.0, 25.625], [31.4, 25.625]]);
    trace('GP0', W, [[33.0, 26.875], [30.6, 26.875], [23.0, 34.475], [23.0, 48.0]]);
    trace('GP1', W, [[33.0, 28.125], [31.12, 28.125], [26.0, 33.245], [26.0, 48.0]]);
    trace('GP2', W, [[33.0, 29.375], [31.64, 29.375], [29.0, 32.015], [29.0, 48.0]]);
    trace('GP3', W, [[35.625, 31.6], [35.625, 32.8], [32.0, 36.425], [32.0, 48.0]]);
    // QSPI fan-out around the flash
    trace('QSPI_SD2', W, [[36.875, 31.6], [36.875, 33.3], [33.4, 36.775], [33.4, 41.135], [36.6, 41.135]]);
    trace('QSPI_SD1', W, [[38.125, 31.6], [38.125, 33.8], [34.65, 37.275], [34.65, 39.865], [36.6, 39.865]]);
    trace('QSPI_SS', W, [[39.375, 31.6], [39.375, 34.3], [35.9, 37.775], [35.9, 38.595], [36.6, 38.595]]);
    trace('GND', W, [[40.625, 31.6], [40.625, 33.9]]);
    trace('QSPI_SD3', W, [[41.875, 31.6], [41.875, 34.3], [44.1, 36.525], [44.1, 39.865], [43.4, 39.865]]);
    trace('QSPI_SCLK', W, [[43.125, 31.6], [43.125, 33.8], [45.35, 36.025], [45.35, 41.135], [43.4, 41.135]]);
    trace('QSPI_SD0', W, [[44.375, 31.6], [44.375, 33.3], [46.6, 35.525], [46.6, 42.405], [43.4, 42.405]]);
    trace('3V3', W, [[42.75, 38.4], [42.75, 37.0]]);
    trace('3V3', W, [[38.6, 45.4], [37.9, 45.4]]);
    // MCU right: SWD + GPIO bus to J3, LED, crystal
    const bus = [['SWDIO', 20.625, 69.0, 11.0], ['SWCLK', 21.875, 70.77, 13.8], ['GP4', 23.125, 72.54, 16.6], ['GP5', 24.375, 74.31, 19.4], ['RUN', 25.625, 76.08, 22.2]];
    for (const [n, y0, c, y1] of bus) trace(n, W, [[47.0, y0], [c - y0, y0], [c - y1, y1], [69.9, y1]]);
    trace('RUN', W, [[70.6, 22.2], [70.6, 40.6], [69.6, 41.6]]);
    trace('RUN', W, [[70.6, 36.85], [72.0, 36.85]]);
    trace('3V3', W, [[72.6, 35.0], [72.6, 33.8]]);
    trace('LED', W, [[47.0, 26.875], [63.0, 26.875], [66.0, 29.875], [66.0, 30.4]]);
    trace('LED_A', W, [[66.0, 32.45], [66.0, 35.15]]);
    trace('XOUT', W, [[47.0, 28.125], [56.9, 28.125], [58.4, 29.625], [58.4, 35.8]]);
    trace('XIN', W, [[47.0, 29.375], [47.6, 29.375], [48.6, 30.375], [48.6, 35.8]]);
    trace('XIN', W, [[48.6, 37.4], [48.6, 39.4]]);
    trace('XOUT', W, [[58.4, 37.4], [58.4, 39.4]]);
    trace('QSPI_SS', W, [[50.3, 45.0], [50.3, 43.6]]);
    trace('QSPI_SS', W, [[44.6, 46.4], [43.9, 46.4]]);
    trace('3V3', W, [[47.4, 46.4], [48.1, 46.4]]);
    trace('VBUS', W, [[14.0, 47.8], [14.0, 45.9]]);
    trace('3V3', W, [[20.0, 47.8], [20.0, 45.9]]);
    trace('3V3', W, [[74.2, 11.0], [75.9, 11.0]]);
    trace('3V3', W, [[74.2, 22.2], [75.9, 22.2]]);
    trace('3V3', W, [[31.2, 34.0], [31.2, 35.4]]);

    for (const [n, x, y] of [['GND', 9.2, 19.9], ['CC1', 10.0, 22.75], ['VBUS', 9.4, 26.75], ['GND', 9.4, 28.2],
      ['CC1', 14.6, 27.9], ['VBUS', 16.8, 27.9], ['GND', 31.7, 21.875], ['3V3', 31.4, 25.625],
      ['GND', 40.625, 33.9], ['3V3', 42.75, 37.0], ['3V3', 37.9, 45.4], ['3V3', 72.6, 33.8],
      ['QSPI_SS', 50.3, 43.6], ['QSPI_SS', 43.9, 46.4], ['3V3', 48.1, 46.4], ['VBUS', 14.0, 45.9],
      ['3V3', 20.0, 45.9], ['3V3', 75.9, 11.0], ['3V3', 75.9, 22.2], ['3V3', 31.2, 35.4]]) via(n, x, y);
    // the hops through the bottom layer (USB-C CC1 and second VBUS pin, J2's VBUS, BOOT -> pull-up)
    btrace('CC1', W, [[10.0, 22.75], [10.35, 23.1], [10.35, 31.0], [11.15, 31.8], [15.0, 31.8], [15.7, 31.1], [15.7, 28.6], [15.0, 27.9], [14.6, 27.9]]);
    btrace('VBUS', W, [[9.4, 26.75], [9.4, 32.6], [14.0, 37.2], [14.0, 45.9]]);
    btrace('VBUS', W, [[16.8, 27.9], [18.2, 29.3], [18.2, 32.0], [17.0, 33.2], [10.0, 33.2]]);
    btrace('QSPI_SS', W, [[43.9, 46.4], [46.7, 43.6], [50.3, 43.6]]);

    // hit boxes
    for (const p of PARTS) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
      for (const q of p.pads) add(q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2);
      for (const b of p.bodies) if (b.t === 'r') add(b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2);
      p.box = [x0 - 0.45, y0 - 0.45, x1 + 0.45, y1 + 0.45];
      p.area = (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]);
      p.cx = (x0 + x1) / 2; p.cy = (y0 + y1) / 2;
    }
  })();

  const PICK = PARTS.slice().sort((a, b) => a.area - b.area);
  const CYCLE = PARTS.slice().sort((a, b) => (a.cx + a.cy * 0.35) - (b.cx + b.cy * 0.35));
  const IDLE_SEQ = ['U1', 'Y1', 'J1', 'U3', 'SW1', 'U2', 'J3', 'R1', 'D2', 'J2', 'C9', 'U4'];
  // The check: a scan line sweeps the board (sine-eased, so its peak speed stays ~100 mm/s),
  // each finding pops the moment the line reaches it (the ease is inverted once, by bisection),
  // then they are fixed in the order found.
  const SCAN_T = 1.3, T_CLEAR = 2.55, T_END = 4.3;
  const scanAt = (tc) => -3 + (BW + 6) * 0.5 * (1 - Math.cos(PI * clamp(tc / SCAN_T, 0, 1)));
  function scanTime(x) {
    let a = 0, b = SCAN_T;
    for (let k = 0; k < 40; k++) { const mid = (a + b) / 2; if (scanAt(mid) < x) a = mid; else b = mid; }
    return b;
  }
  // DRC findings (board mm), in sweep order: silk over R1's pad, XOUT running close to the crystal pad
  const FINDINGS = [{ x: 19.9, y: 24.25 }, { x: 57.1, y: 31.0 }];
  FINDINGS.forEach((f, j) => { f.tp = scanTime(f.x) + 0.02; f.tr = 1.75 + 0.35 * j; });

  // ---------------------------------------------------------------------------
  // Rasterisation (once per page; independent of canvas size)
  // ---------------------------------------------------------------------------
  let RAW = null;
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  // time slicing: the one-off raster work never blocks the main thread for more than ~8 ms
  let sliceT = 0;
  const slice = async () => { const t = performance.now(); if (t - sliceT > 8) { await yieldNow(); sliceT = performance.now(); } };

  function rrPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function padPath(g, q, grow) {
    const e = grow || 0;
    if (q.round) { g.moveTo(q.x + q.w / 2 + e, q.y); g.arc(q.x, q.y, q.w / 2 + e, 0, TAU); }
    else rrPath(g, q.x - q.w / 2 - e, q.y - q.h / 2 - e, q.w + 2 * e, q.h + 2 * e, q.rr + e);
  }
  function drillPath(g, q, grow) {
    const e = grow || 0;
    if (q.slot) rrPath(g, q.x - q.slot[0] / 2 - e, q.y - q.slot[1] / 2 - e, q.slot[0] + 2 * e, q.slot[1] + 2 * e, q.slot[0] / 2 + e);
    else { g.moveTo(q.x + q.drill + e, q.y); g.arc(q.x, q.y, q.drill + e, 0, TAU); }
  }
  function polyPath(g, pts) { g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); }

  function blurBox(a, r, tmp) {
    // separable box blur, radius r texels, in place (tmp: scratch of same length)
    if (r < 1) return a;
    const n = 2 * r + 1, inv = 1 / n;
    for (let y = 0; y < TH; y++) {
      const o = y * TW;
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + clamp(x, 0, TW - 1)];
      for (let x = 0; x < TW; x++) {
        tmp[o + x] = s * inv;
        s += a[o + Math.min(TW - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < TW; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, TH - 1) * TW + x];
      for (let y = 0; y < TH; y++) {
        a[y * TW + x] = s * inv;
        s += tmp[Math.min(TH - 1, y + r + 1) * TW + x] - tmp[Math.max(0, y - r) * TW + x];
      }
    }
    return a;
  }
  function tent(a, tmp) { // [1 2 1]/4 separable
    for (let y = 0; y < TH; y++) {
      const o = y * TW;
      for (let x = 0; x < TW; x++) tmp[o + x] = (a[o + Math.max(0, x - 1)] + 2 * a[o + x] + a[o + Math.min(TW - 1, x + 1)]) * 0.25;
    }
    for (let y = 0; y < TH; y++) {
      const o = y * TW, up = Math.max(0, y - 1) * TW, dn = Math.min(TH - 1, y + 1) * TW;
      for (let x = 0; x < TW; x++) a[o + x] = (tmp[up + x] + 2 * tmp[o + x] + tmp[dn + x]) * 0.25;
    }
    return a;
  }

  async function build(H, keep) {
    const n = TW * TH;
    sliceT = performance.now();
    const mk = () => {
      const c = document.createElement('canvas'); c.width = TW; c.height = TH;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.setTransform(TPM, 0, 0, TPM, MARG * TPM, MARG * TPM);
      g.lineCap = 'round'; g.lineJoin = 'round';
      return g;
    };
    const alpha = (g) => { const d = g.getImageData(0, 0, TW, TH).data, a = new Float32Array(n); for (let k = 0; k < n; k++) a[k] = d[(k << 2) + 3] / 255; return a; };
    const allPads = [];
    for (const p of PARTS) for (const q of p.pads) allPads.push(q);
    for (const q of HOLES) allPads.push(q);
    const drills = allPads.filter((q) => q.drill);

    // --- board outline, punched
    const gB = mk();
    gB.fillStyle = '#fff'; gB.beginPath(); rrPath(gB, 0, 0, BW, BH, BRAD); gB.fill();
    gB.globalCompositeOperation = 'destination-out'; gB.beginPath();
    for (const q of drills) drillPath(gB, q);
    for (const v of VIAS) { gB.moveTo(v.x + v.d, v.y); gB.arc(v.x, v.y, v.d, 0, TAU); }
    gB.fill();

    await slice();
    // --- copper under mask: traces + vias; nets raster
    const gT = mk(), gN = mk();
    const netCol = (id) => `rgb(${id * 8},0,0)`;
    gT.strokeStyle = gT.fillStyle = '#fff';
    for (const tr of TRACES) {
      gT.lineWidth = tr.w; gT.beginPath(); polyPath(gT, tr.pts); gT.stroke();
      gN.strokeStyle = netCol(tr.net); gN.lineWidth = tr.w + 0.15; gN.beginPath(); polyPath(gN, tr.pts); gN.stroke();
    }
    const drawVia = (v) => {
      gT.beginPath(); gT.arc(v.x, v.y, v.r, 0, TAU); gT.fill();
      gN.fillStyle = netCol(v.net); gN.beginPath(); gN.arc(v.x, v.y, v.r + 0.08, 0, TAU); gN.fill();
    };
    for (const v of VIAS) drawVia(v);
    const gBN = mk();
    for (const tr of BOT) { gBN.strokeStyle = netCol(tr.net); gBN.lineWidth = tr.w; gBN.beginPath(); polyPath(gBN, tr.pts); gBN.stroke(); }

    await slice();
    // --- exposed copper (pads, rings), parts raster
    const gP = mk(), gR = mk();
    gP.fillStyle = '#fff';
    for (const q of allPads) {
      gP.beginPath(); padPath(gP, q); gP.fill();
      gN.fillStyle = netCol(q.net); gN.beginPath(); padPath(gN, q, 0.08); gN.fill();
      if (q.part) { gR.fillStyle = `rgb(${q.part * 4},0,0)`; gR.beginPath(); padPath(gR, q, 0.1); gR.fill(); }
    }
    for (const [fx, fy] of FIDS) { gP.beginPath(); gP.arc(fx, fy, 0.6, 0, TAU); gP.fill(); }

    await slice();
    // --- mask openings (fiducials: bare laminate ring)
    const gO = mk();
    gO.fillStyle = '#fff';
    for (const [fx, fy] of FIDS) { gO.beginPath(); gO.arc(fx, fy, 1.5, 0, TAU); gO.fill(); }

    // --- silkscreen (clipped from pads and holes)
    const gS = mk();
    gS.strokeStyle = gS.fillStyle = '#fff'; gS.lineWidth = 0.46;
    const silkTextAt = (g, s, x, y, size, font, align) => {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = font.replace('{s}', (size * TPM).toFixed(2));
      g.textAlign = align; g.textBaseline = 'alphabetic';
      g.fillText(s, (x + MARG) * TPM, (y + MARG) * TPM);
      g.restore();
    };
    for (const p of PARTS) {
      gR.fillStyle = gR.strokeStyle = `rgb(${p.id * 4},0,0)`; gR.lineWidth = 0.5;
      for (const op of p.silk) {
        for (const g of [gS, gR]) {
          if (op[0] === 'poly') { g.beginPath(); polyPath(g, op[1]); g.stroke(); }
          else if (op[0] === 'dot') { g.beginPath(); g.arc(op[1], op[2], op[3], 0, TAU); g.fill(); }
          else if (op[0] === 'text') silkTextAt(g, op[1], op[2], op[3], op[4], '600 {s}px "Geist Mono", ui-monospace, monospace', op[5]);
        }
      }
    }
    const gX = mk();
    for (const t of TEXT) {
      gX.save(); gX.setTransform(1, 0, 0, 1, 0, 0);
      gX.fillStyle = gX.strokeStyle = '#fff'; gX.lineJoin = 'round';
      gX.textAlign = 'left'; gX.textBaseline = 'alphabetic';
      const fit = (sz) => {
        gX.font = t.font.replace('{s}', (sz * TPM).toFixed(2));
        if ('letterSpacing' in gX) gX.letterSpacing = (t.track * sz * TPM).toFixed(2) + 'px';
        const m = gX.measureText(t.s);
        return { m, w: ((m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width)) * ITPM };
      };
      const size = Math.min(t.max, 10 * (t.x1 - t.x0 - t.stroke) / fit(10).w);
      const { m, w } = fit(size);
      const x = (t.x0 + t.stroke / 2 + MARG) * TPM + (m.actualBoundingBoxLeft || 0), y = (t.y + MARG) * TPM;
      gX.fillText(t.s, x, y);
      gX.lineWidth = t.stroke * TPM; gX.strokeText(t.s, x, y);
      t.box = [t.x0, t.y - (m.actualBoundingBoxAscent || size * TPM * 0.75) * ITPM - t.stroke, t.x0 + w + t.stroke, t.y + t.stroke];
      gX.restore();
    }
    gS.globalCompositeOperation = 'destination-out'; gS.beginPath();
    for (const q of allPads) padPath(gS, q, 0.18);
    for (const [fx, fy] of FIDS) { gS.moveTo(fx + 1.6, fy); gS.arc(fx, fy, 1.6, 0, TAU); }
    gS.fill();

    await slice();
    // --- bodies: rgb = (material*50, shade, part*4)
    const gLo = mk(), gHi = mk(), gSh = mk();
    for (const p of PARTS) {
      await slice();
      for (const b of p.bodies) {
        const g = b.z === 'hi' ? gHi : gLo;
        g.fillStyle = `rgb(${b.mat * 50},${b.shade},${p.id * 4})`;
        if (b.t === 'r') { g.beginPath(); rrPath(g, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, b.r); g.fill(); }
        else if (b.t === 'c') { g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill(); }
        else silkTextAt(g, b.s, b.x, b.y, b.size, '600 {s}px "Geist Mono", ui-monospace, monospace', 'center');
      }
      // contact shadow: light from the upper left
      gSh.fillStyle = '#fff';
      for (const b of p.bodies) {
        if (b.t !== 'r') continue;
        const hh = b.z === 'hi' ? H_HI : H_LO;
        gSh.globalAlpha = b.z === 'hi' ? 0.85 : 0.6;
        gSh.beginPath(); rrPath(gSh, b.x - b.w / 2 + 0.28 * hh, b.y - b.h / 2 + 0.4 * hh, b.w, b.h, b.r); gSh.fill();
      }
    }
    await slice();

    // --- ground pour: zone minus clearances, hatched 45° with a solid border
    const gC = mk(), gZ = mk();
    gZ.fillStyle = '#fff'; gZ.beginPath(); rrPath(gZ, 0.8, 0.8, BW - 1.6, BH - 1.6, BRAD - 0.8); gZ.fill();
    gC.strokeStyle = gC.fillStyle = '#fff';
    const CL = 0.55;
    for (const tr of TRACES) if (tr.net !== GND) { gC.lineWidth = tr.w + 2 * CL; gC.beginPath(); polyPath(gC, tr.pts); gC.stroke(); }
    gC.beginPath();
    for (const v of VIAS) if (v.net !== GND) { gC.moveTo(v.x + v.r + CL, v.y); gC.arc(v.x, v.y, v.r + CL, 0, TAU); }
    for (const q of allPads) if (q.net !== GND && q.net !== SHIELD) padPath(gC, q, CL);
    for (const q of drills) drillPath(gC, q, 0.6);
    for (const [fx, fy] of FIDS) { gC.moveTo(fx + 1.9, fy); gC.arc(fx, fy, 1.9, 0, TAU); }
    gC.fill();
    // keep the pour off the wordmark
    for (const t of TEXT) gC.fillRect(t.box[0] - 0.9, t.box[1] - 0.9, t.box[2] - t.box[0] + 1.8, t.box[3] - t.box[1] + 1.8);
    const ZONE = alpha(gZ), CLR = alpha(gC);
    const solid = new Float32Array(n), tmp = new Float32Array(n);
    for (let k = 0; k < n; k++) solid[k] = ZONE[k] * (1 - CLR[k]);
    // erosion (square, radius 2 texels) for the zone border
    const er = new Float32Array(n);
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        let m = 1;
        for (let b = -2; b <= 2 && m > 0; b++) {
          const yy = clamp(y + b, 0, TH - 1) * TW;
          for (let a = -2; a <= 2; a++) { const v = solid[yy + clamp(x + a, 0, TW - 1)]; if (v < m) m = v; }
        }
        er[y * TW + x] = m;
      }
      await slice();
    }
    const POUR = new Float32Array(n);
    const S = 3.9, HW = 0.42, SQ = Math.SQRT1_2;
    for (let y = 0; y < TH; y++) {
      const by = (y + 0.5) * ITPM - MARG;
      for (let x = 0; x < TW; x++) {
        const k = y * TW + x;
        if (solid[k] <= 0.01) continue;
        const bx = (x + 0.5) * ITPM - MARG;
        const a = (bx + by) * SQ / S, b = (bx - by) * SQ / S;
        const da = Math.abs(a - Math.round(a)) * S, db = Math.abs(b - Math.round(b)) * S;
        const hatch = Math.max(clamp((HW - da) * TPM + 0.5, 0, 1), clamp((HW - db) * TPM + 0.5, 0, 1));
        const border = clamp((solid[k] - er[k]) * 1.6, 0, 1);
        POUR[k] = Math.max(hatch, border) * solid[k];
      }
      await slice();
    }
    await slice();

    // stitching vias in open pour
    const stitch = [];
    for (let gy = 4.5; gy < BH - 3; gy += 5.2) for (let gx = 5.0 + ((gy * 1.7) % 2.6); gx < BW - 3; gx += 5.2) {
      let ok = true;
      for (let a = -1.4; a <= 1.4 && ok; a += 0.7) for (let b = -1.4; b <= 1.4; b += 0.7) {
        const tx = Math.round((gx + a + MARG) * TPM), ty = Math.round((gy + b + MARG) * TPM);
        if (solid[ty * TW + tx] < 0.98) { ok = false; break; }
      }
      if (ok) stitch.push({ net: GND, x: gx, y: gy, r: 0.45, d: 0.2 });
    }
    await slice();
    const loA0 = alpha(gLo), hiA0 = alpha(gHi);
    for (const v of stitch) {
      const k = Math.round((v.y + MARG) * TPM) * TW + Math.round((v.x + MARG) * TPM);
      if (loA0[k] > 0 || hiA0[k] > 0) continue;
      drawVia(v); VIAS.push(v);
      gB.globalCompositeOperation = 'destination-out'; gB.beginPath(); gB.arc(v.x, v.y, v.d, 0, TAU); gB.fill();
    }

    // --- read everything
    const BOARD = alpha(gB), TR = alpha(gT), PD = alpha(gP);
    await slice();
    const SK = alpha(gS), OP = alpha(gO), SH = alpha(gSh), TX = alpha(gX);
    await slice();
    const nImg = gN.getImageData(0, 0, TW, TH).data, rImg = gR.getImageData(0, 0, TW, TH).data;
    await slice();
    const loImg = gLo.getImageData(0, 0, TW, TH).data, hiImg = gHi.getImageData(0, 0, TW, TH).data;
    await slice();
    blurBox(SH, 3, tmp); await slice(); blurBox(SH, 3, tmp); await slice();

    const bImg = gBN.getImageData(0, 0, TW, TH).data;
    const NETR = new Uint8Array(n), PARTR = new Uint8Array(n), NETB = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (nImg[(k << 2) + 3] > 110) NETR[k] = Math.round(nImg[k << 2] / 8);
      if (rImg[(k << 2) + 3] > 110) PARTR[k] = Math.round(rImg[k << 2] / 4);
      if (bImg[(k << 2) + 3] > 90) NETB[k] = Math.round(bImg[k << 2] / 8);
    }
    // grow ids into anti-aliased fringes (and the blur halo added at composite time): one texel
    // per pass, read from the previous pass so ids never flood along a row onto unrelated copper
    await slice();
    for (let pass = 0; pass < 4; pass++) {
      const N0 = NETR.slice(), P0 = PARTR.slice();
      for (let k = TW + 1; k < n - TW - 1; k++) {
        if (!N0[k]) NETR[k] = N0[k - 1] || N0[k + 1] || N0[k - TW] || N0[k + TW];
        if (!P0[k]) PARTR[k] = P0[k - 1] || P0[k + 1] || P0[k - TW] || P0[k + TW];
      }
      await slice();
    }
    // per-texel noise, dither, board mask (size independent)
    const N1 = new Float32Array(n), N2 = new Float32Array(n), GR = new Float32Array(n), DITH = new Uint8Array(n), BIN = new Uint8Array(n);
    for (let y = 0; y < TH; y++) {
      const by = (y + 0.5) * ITPM - MARG;
      for (let x = 0; x < TW; x++) {
        const k = y * TW + x, bx = (x + 0.5) * ITPM - MARG;
        DITH[k] = Math.round(H.hash2(x * 7 + 3, y * 13 + 1) * 254) + 1;
        if (BOARD[k] < 0.5) continue;
        BIN[k] = 1;
        N1[k] = H.fbm2(bx * 0.42 + 3.1, by * 0.42 - 1.7, 3);
        N2[k] = H.fbm2(bx * 1.35 + 7.7, by * 1.35 + 2.2, 2);
        GR[k] = H.hash2(x * 3 + 11, y * 5 + 7) - 0.5;
      }
      await slice();
    }
    await slice();

    // --- body planes: top faces + walls per mode
    const plane = async (img) => {
      const COV = new Uint8Array(n), MAT = new Uint8Array(n), PID = new Uint8Array(n);
      const D = [new Uint8Array(n), new Uint8Array(n)], C = [new Uint8Array(n), new Uint8Array(n)];
      for (let k = 0; k < n; k++) {
        if (k % (TW * 16) === 0) await slice();
        const a = img[(k << 2) + 3];
        if (a < 128) continue;
        COV[k] = 1;
        const mat = clamp(Math.round(img[k << 2] / 50), 1, 5), sh = img[(k << 2) + 1] / 255;
        MAT[k] = mat; PID[k] = Math.round(img[(k << 2) + 2] / 4);
        const g = H.hash2(k * 3 + 1, 77) - 0.5;
        let dm, cm, dc, cc;
        if (mat === M_IC) {
          if (sh > 0.75) { dm = 0.3; cm = BODY_HI; dc = 0.7; cc = BODY_HI; }
          else { dm = 0.1 + 0.08 * g + 0.12 * sh; cm = BODY_C; dc = 0.86 + 0.08 * g; cc = BODY_C; }
        } else if (mat === M_METAL) {
          if (sh > 0.95) { dm = 0.55; cm = METAL_HI; dc = 0.95; cc = METAL_HI; }
          else { dm = 0.2 + 0.55 * sh + 0.06 * g; cm = METAL_C; dc = 0.45 + 0.5 * sh + 0.05 * g; cc = METAL_C; }
        } else if (mat === M_CER) { dm = 0.34 + 0.06 * g; cm = METAL_C; dc = 0.82 + 0.08 * g; cc = EDGE_C; }
        else if (mat === M_GOLD) { dm = 0.8; cm = PAD_C; dc = 0.96; cc = g > 0.15 ? PAD_HI : PAD_C; }
        else { dm = 0.4; cm = SILK_C; dc = 0.62; cc = SILK_C; }
        D[0][k] = q8(dm); C[0][k] = cm; D[1][k] = q8(dc); C[1][k] = cc;
      }
      return { COV, MAT, PID, D, C };
    };
    const LO = await plane(loImg);
    const HI = await plane(hiImg);

    RAW = { BIN, DITH, LO, HI, NETR, PARTR, NETB, N1, N2, GR, src: { TR, PD, SK, OP, SH, POUR, TX, BOARD }, comp: {} };
    if (keep) RAW.canvases = { board: gB, trace: gT, pad: gP, silk: gS, lo: gLo, hi: gHi, shadow: gSh, clear: gC, net: gN, part: gR, open: gO, bottom: gBN };
    RAW.stitch = stitch.length;
    return RAW;
  }

  // Composite the board plane for one dot footprint: thin features are pre-filtered to
  // about a dot so traces, pad rows and silk render as steady strokes, not aliasing.
  function composite(blur, wm) {
    const key = blur + (wm ? 'w' : '');
    return RAW.comp[key] || (RAW.comp[key] = compositeNow(blur, wm));
  }
  async function compositeNow(blur, wm) {
    const n = TW * TH, R = RAW, src = R.src, tmp = new Float32Array(n);
    sliceT = performance.now();
    const f = (a, w) => {
      const b = Float32Array.from(a);
      if (blur >= 2) blurBox(b, blur, tmp);
      if (blur >= 1 || w) tent(b, tmp);
      return b;
    };
    const TR = f(src.TR), PD = f(src.PD);
    await slice();
    const SK = f(src.SK), POUR = f(src.POUR, 1);
    await slice();
    // the wordmark: its own light pre-filter (no threshold shared with the fine silk); dot
    // area follows ink coverage, so stroke edges shrink instead of breaking. Too few dots
    // per letter (mobile) and it is left off.
    const TX = wm ? tent(Float32Array.from(src.TX), tmp) : null;
    // soften the dots along the outline and around holes (partial coverage at the edge)
    const EF = Float32Array.from(src.BOARD);
    blurBox(EF, blur >= 2 ? 2 : 1, tmp);
    const OP = src.OP, SH = src.SH, N1 = R.N1, N2 = R.N2, GR = R.GR;
    const KIND = new Uint8Array(n), NETK = new Uint8Array(n), PARTK = new Uint8Array(n), BOTK = new Uint8Array(n);
    const BD = [new Uint8Array(n), new Uint8Array(n)], BC = [new Uint8Array(n), new Uint8Array(n)];
    const EFQ = new Uint8Array(n).fill(255);
    const tPad = blur >= 2 ? 0.34 : 0.45, tTr = blur >= 2 ? 0.3 : 0.4, tSk = blur >= 2 ? 0.25 : 0.42;
    await slice();
    for (let k = 0; k < n; k++) {
      if (k % TW === 0) await slice();
      if (!R.BIN[k]) continue;
      const n1 = N1[k], n2 = N2[k], grain = GR[k], sh = SH[k];
      let kind = K_MASK;
      if (OP[k] > 0.5) kind = K_BARE;
      if (POUR[k] > 0.36 && kind === K_MASK) kind = K_POUR;
      if (TR[k] > tTr) kind = K_TRACE;
      if (PD[k] > tPad) kind = K_PAD;
      if (SK[k] > tSk) kind = K_SILK;
      const tx = TX ? TX[k] : 0, isTx = tx > 0.14 && kind !== K_PAD;
      if (isTx) kind = K_SILK;
      KIND[k] = kind;
      if (kind === K_TRACE || kind === K_PAD) NETK[k] = R.NETR[k];
      if (kind === K_PAD || kind === K_SILK) PARTK[k] = R.PARTR[k];
      BOTK[k] = R.NETB[k];   // drawn only where the top shows mask; under top copper it just carries the pulse
      let dm = 0, cm = MASK_D, dc = 0, cc = MASK_D;
      // Hierarchy: bare mask is the calm mid field, copper under mask (pour hatch) one step
      // up, traces the bright primary structure, then pads / silk at full size.
      switch (kind) {
        case K_MASK:
          // mono: a near-empty faint ground so the pour hatch reads as muted lines on it
          dm = 0.055 + 0.03 * n1 + 0.015 * grain - 0.04 * sh; cm = MASK_D;
          // tonal texture in soft blotches (low-frequency noise, little per-texel grain) so
          // stray light dots never mimic the hatch
          dc = 0.42 + 0.14 * n1 + 0.04 * grain - 0.32 * sh; cc = n1 + 0.14 * n2 + 0.04 * grain > 0.3 && sh < 0.3 ? MASK_L : MASK_D;
          break;
        case K_BARE: dm = 0.05; cm = MASK_D; dc = 0.32; cc = EDGE_C; break;
        case K_POUR:
          dm = 0.3 + 0.1 * POUR[k] + 0.02 * n1 - 0.16 * sh; cm = POUR_C;
          dc = 0.56 + 0.14 * POUR[k] + 0.04 * n1 - 0.36 * sh; cc = POUR_C;
          break;
        case K_TRACE:
          dm = 0.5 + 0.45 * TR[k] - 0.2 * sh; cm = TRACE_C;
          dc = 0.86 + 0.14 * TR[k] - 0.3 * sh; cc = TRACE_C;
          break;
        case K_PAD:
          dm = 0.5 + 0.5 * PD[k]; cm = PAD_C;
          dc = 0.82 + 0.18 * PD[k]; cc = n2 + 0.3 * grain > 0.42 ? PAD_HI : PAD_C;
          break;
        case K_SILK:
          if (isTx) { const a = sstep(0.14, 0.8, tx); dm = 0.08 + 0.87 * a; dc = 0.1 + 0.9 * a; }
          else { dm = 0.4 + 0.5 * SK[k]; dc = 0.6 + 0.38 * SK[k]; }
          cm = cc = SILK_C;
          break;
      }
      const ef = clamp(0.25 + 1.5 * (EF[k] - 0.5), 0.3, 1);
      if (ef < 1) EFQ[k] = q8(ef);
      BD[0][k] = q8(dm * ef); BC[0][k] = cm; BD[1][k] = q8(dc * ef); BC[1][k] = cc;
    }
    return { KIND, NETK, PARTK, BOTK, BD, BC, EFQ, DIST: new Float32Array(n).fill(1e9), ACT: new Uint8Array(n) };
  }

  // ---------------------------------------------------------------------------
  // Geodesic distance along the copper of the active nets, from a part's pads
  // (Dial's algorithm, chamfer 5/7). Unreached copper falls back to straight-line.
  // ---------------------------------------------------------------------------
  function computeDist(C, p, netOn) {
    const n = TW * TH, D = C.DIST, A = C.ACT, KIND = C.KIND, NETK = C.NETK, PARTK = C.PARTK, BOTK = C.BOTK;
    const Di = new Int32Array(n).fill(0x3fffffff);
    const B = [[], [], [], [], [], [], [], []];
    let cnt = 0, lit = 0;
    for (let k = 0; k < n; k++) {
      const kd = KIND[k];
      // top copper of the lit nets, plus their bottom-layer hops (joined through the vias)
      const on = (NETK[k] && netOn[NETK[k]]) || (BOTK[k] && netOn[BOTK[k]]) ? 1 : 0;
      A[k] = on; lit += on;
      if (on && kd === K_PAD && PARTK[k] === p.id) { Di[k] = 0; B[0].push(k); cnt++; }
    }
    const NB = [1, -1, TW, -TW, TW + 1, TW - 1, -TW + 1, -TW - 1], WT = [5, 5, 5, 5, 7, 7, 7, 7];
    let dv = 0;
    while (cnt > 0 && dv < 1e6) {
      const bk = B[dv & 7];
      while (bk.length) {
        const k = bk.pop(); cnt--;
        if (Di[k] !== dv) continue;
        for (let j = 0; j < 8; j++) {
          const m = k + NB[j];
          if (m < 0 || m >= n || !A[m]) continue;
          const nd = dv + WT[j];
          if (nd < Di[m]) { Di[m] = nd; B[nd & 7].push(m); cnt++; }
        }
      }
      dv++;
    }
    const s = 1 / (5 * TPM), cx = (p.cx + MARG) * TPM, cy = (p.cy + MARG) * TPM;
    for (let k = 0; k < n; k++) {
      if (!A[k]) { D[k] = 1e9; continue; }
      if (Di[k] < 0x3fffffff) D[k] = Di[k] * s;
      else { const x = k % TW, y = (k / TW) | 0; D[k] = Math.hypot(x - cx, y - cy) * ITPM * 1.15 + 1.5; }
    }
    return lit;
  }

  // ---------------------------------------------------------------------------
  // View: yaw about the vertical axis, tilt about the horizontal, true perspective.
  // Each plane (board front, back face, low bodies, tall bodies) maps texels to
  // screen by a homography; we keep its inverse (screen -> texel).
  // ---------------------------------------------------------------------------
  const REST = { yaw: -16, tilt: -14 };
  const LIM = { yaw: 35, tilt: 20 }, SOFT = { yaw: 7, tilt: 4.5 };
  // soft clamp: identity inside ±lim, then lim + R·tanh(excess / R); its slope and inverse
  const soft = (x, lim, R) => { const a = Math.abs(x); return a <= lim ? x : Math.sign(x) * (lim + R * Math.tanh((a - lim) / R)); };
  const softD = (x, lim, R) => { const a = Math.abs(x); if (a <= lim) return 1; const t = Math.tanh((a - lim) / R); return 1 - t * t; };
  const unsoft = (x, lim, R) => { const a = Math.abs(x); if (a <= lim) return x; const e = Math.min(0.995, (a - lim) / R); return Math.sign(x) * (lim + R * 0.5 * Math.log((1 + e) / (1 - e))); };

  function basis(yawDeg, tiltDeg) {
    const a = yawDeg * DEG, b = tiltDeg * DEG;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    // R = Ry(yaw) · Rx(tilt): tilt the board back, then turn it as on a turntable
    return { A: [ca, 0, -sa], B: [sb * sa, cb, sb * ca], N: [-cb * sa, sb, -cb * ca] };
  }
  function project(V, s, cx, cy, u, v, h) {
    const qx = (u - BW / 2) * V.A[0] + (v - BH / 2) * V.B[0] + h * V.N[0];
    const qy = (u - BW / 2) * V.A[1] + (v - BH / 2) * V.B[1] + h * V.N[1];
    const qz = (u - BW / 2) * V.A[2] + (v - BH / 2) * V.B[2] + h * V.N[2];
    const f = CAM / (CAM + qz);
    return [cx + s * qx * f, cy + s * qy * f];
  }
  function inv3(m, o, off) {
    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C, r = 1 / det;
    o[off] = A * r; o[off + 1] = -(b * i - c * h) * r; o[off + 2] = (b * f - c * e) * r;
    o[off + 3] = B * r; o[off + 4] = (a * i - c * g) * r; o[off + 5] = -(a * f - c * d) * r;
    o[off + 6] = C * r; o[off + 7] = -(a * h - b * g) * r; o[off + 8] = (a * e - b * d) * r;
  }
  // texel (tx, ty) -> screen homography for a plane at height h, inverted into F.m[off..off+8]
  function planeInv(V, s, cx, cy, h, out, off) {
    const A = V.A, B = V.B, N = V.N;
    // board mm (u, v) from texel: u = tx/TPM - MARG
    const q0x = h * N[0] - (BW / 2) * A[0] - (BH / 2) * B[0];
    const q0y = h * N[1] - (BW / 2) * A[1] - (BH / 2) * B[1];
    const q0z = h * N[2] - (BW / 2) * A[2] - (BH / 2) * B[2];
    // [xh, yh, wh] = M [u, v, 1]
    const w0 = A[2] / CAM, w1 = B[2] / CAM, w2 = 1 + q0z / CAM;
    const M = [cx * w0 + s * A[0], cx * w1 + s * B[0], cx * w2 + s * q0x,
      cy * w0 + s * A[1], cy * w1 + s * B[1], cy * w2 + s * q0y,
      w0, w1, w2];
    // compose with u = tx*ITPM - MARG, v = ty*ITPM - MARG
    const T = [ITPM, 0, -MARG, 0, ITPM, -MARG, 0, 0, 1];
    const G = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) G[r * 3 + c] = M[r * 3] * T[c] + M[r * 3 + 1] * T[3 + c] + M[r * 3 + 2] * T[6 + c];
    inv3(G, out, off);
  }

  function fitView(S, w, h) {
    const V = basis(REST.yaw, REST.tilt);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [u, v] of [[-0.8, 0], [BW, 0], [BW, BH], [-0.8, BH]]) for (const hh of [0, -THICK, H_HI]) {
      const [px, py] = project(V, 1, 0, 0, u, v, hh);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const mobile = w < 560;
    const mx = mobile ? 0.05 * w : 0.075 * w, top = mobile ? 0.07 * h : 0.08 * h, bot = mobile ? 0.15 * h : 0.13 * h;
    const s = Math.min((w - 2 * mx) / (x1 - x0), (h - top - bot) / (y1 - y0));
    S.s = s;
    S.cx = w / 2 - s * (x0 + x1) / 2;
    S.cy = top + (h - top - bot) / 2 - s * (y0 + y1) / 2;
  }

  function setView(S, st) {
    const I = S.I, F = S.f;
    const V = basis(I.yaw, I.tilt);
    planeInv(V, S.s, S.cx, S.cy, 0, F.m, 0);
    planeInv(V, S.s, S.cx, S.cy, H_LO, F.m, 9);
    planeInv(V, S.s, S.cx, S.cy, H_HI, F.m, 18);
    planeInv(V, S.s, S.cx, S.cy, -THICK, F.m, 27);
    // quick-reject box
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [u, v] of [[-1, -0.5], [BW + 0.5, -0.5], [BW + 0.5, BH + 0.5], [-1, BH + 0.5]]) for (const hh of [-THICK, 0, H_HI]) {
      const [px, py] = project(V, S.s, S.cx, S.cy, u, v, hh);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const pad = st.pitch * 1.5;
    F.qx0 = x0 - pad; F.qx1 = x1 + pad; F.qy0 = y0 - pad; F.qy1 = y1 + pad;
    // sheen of the glossy mask: a broad lobe (GLR mm) resting on the upper left. A true mirror
    // spot runs ~13 mm per degree and leaves the board after a few degrees; this one follows
    // the same directions at ~2 mm per degree so turning visibly sweeps light across the mask.
    F.pxd = S.s / st.pitch;   // dots per board mm (edge band coverage)
    F.shx = 27 + 2.1 * (I.yaw - REST.yaw);
    F.shy = 13 - 2.4 * (I.tilt - REST.tilt);
  }
  const GLR = 46, GLI = 1 / (GLR * GLR);

  const GRR = 11;   // radius of the local ground swell, mm
  // signal pulse along the copper: a comet every 14 mm of path, nothing ahead of the first front
  function wave(ds, pv) {
    if (ds > pv + 0.5) return 0;
    let ph = (ds - pv) / 14; ph -= Math.floor(ph);
    if (ph <= 0.7) return 0;
    const z = (ph - 0.7) / 0.3;
    return z < 0.86 ? z * z * 1.35 : (1 - z) / 0.14;
  }

  // board mm under a screen point, on plane `off` (0 base, 18 tall bodies)
  function unproject(S, x, y, off) {
    const m = S.f.m, iw = 1 / (m[off + 6] * x + m[off + 7] * y + m[off + 8]);
    return [(m[off] * x + m[off + 1] * y + m[off + 2]) * iw * ITPM - MARG, (m[off + 3] * x + m[off + 4] * y + m[off + 5]) * iw * ITPM - MARG];
  }
  function onBoard(u, v) {
    if (u < 0 || v < 0 || u > BW || v > BH) return false;
    const cx = clamp(u, BRAD, BW - BRAD), cy = clamp(v, BRAD, BH - BRAD);
    return Math.hypot(u - cx, v - cy) <= BRAD;
  }
  // signed distance to the board outline, mm (negative inside)
  function sdBoard(u, v) {
    const qx = Math.abs(u - BW / 2) - (BW / 2 - BRAD), qy = Math.abs(v - BH / 2) - (BH / 2 - BRAD);
    const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - BRAD;
  }
  function pickPart(S, x, y) {
    const [hu, hv] = unproject(S, x, y, 18);
    for (const p of PICK) if (p.tall) {
      for (const b of p.bodies) if (b.t === 'r' && b.z === 'hi' && Math.abs(hu - b.x) <= b.w / 2 && Math.abs(hv - b.y) <= b.h / 2) return p;
    }
    const [u, v] = unproject(S, x, y, 0);
    for (const p of PICK) { const b = p.box; if (u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3]) return p; }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Interaction state
  // ---------------------------------------------------------------------------
  const NNET = NETS.length;
  const POWER = new Uint8Array(NNET);
  for (const k of ['GND', '3V3', 'VBUS', 'VSYS']) POWER[NID[k]] = 1;
  function newState() {
    return {
      yaw: REST.yaw, tilt: REST.tilt, vyaw: 0, vtilt: 0, dragging: false,
      hov: null, sel: null, idlePart: null, act: null, actT: 0,
      last: 0, idleAmt: 0, idleT0: 0, px: -1e4, py: -1e4,
      chk: null, netA: new Float32Array(NNET), netOn: new Uint8Array(NNET), dim: 0, gnd: 0, gndA: 0,
      lit: 0, dimS: 1, dimM: 1, small: 0,
      ryaw: REST.yaw, rtilt: REST.tilt,
    };
  }

  function startCheck(S, st) {
    S.I.chk = { t0: st.now };
    S.I.sel = null;
  }

  function setActive(S, p, st) {
    const I = S.I;
    if (I.act === p) return;
    I.act = p; I.actT = st.now;
    I.netOn.fill(0);
    I.gnd = 0;
    if (p) {
      // a hub (the MCU, headers) lights its signals; its rails would light the whole board.
      // Ground is never lit: a small part on GND gets a local swell of the plane instead.
      const hub = p.nets.size > 4;
      for (const nId of p.nets) if (nId !== GND && nId !== SHIELD && !(hub && POWER[nId])) I.netOn[nId] = 1;
      I.gnd = !hub && p.nets.has(GND) ? 1 : 0;
      // the rest of the board dims in proportion to how much copper lights up: a 0603 on a
      // short net only steps the board back a little, so its few accent dots stay the focus
      const lit = computeDist(S.C, p, I.netOn);
      I.lit = lit; I.dimS = clamp((lit - 100) / 1000, 0.25, 1);
      I.small = p.area < 14 ? 1 : 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------
  const scene = {
    layout: 'grid',
    palette: {
      mono: ['faint', 'faint', 'muted', 'muted', 'ink', 'ink', 'ink', 'faint', 'muted', 'muted', 'ink', 'muted', 'accent', 'ink', 'muted', 'faint', 'muted'],
      // mask < mask light < sheen < pour < pour in sheen < trace: the hatch stays a step
      // above the mask wherever the light sits
      color: ['#0F4128', '#165434', '#2A7A4E', '#4BAE70', '#C99F4C', '#F1D78F', '#EEEDE6',
        '#1A1C1E', '#4B5156', '#A3AAAE', '#E9ECEC', '#9A8752', 'accent', '#93F2B4', '#93DBAB', '#1D5F3F', '#379160'],
    },
    animated: true,
    interact: 'none',
    drag: 'x',
    cursor: 'Drag',
    label: 'rekafab PCB — drag to tilt, click to run checks',
    fonts: ['800 20px Geist', '600 20px "Geist Mono"'],
    pitch(w, h) {
      if (w < 560) return 3.5;
      return clamp(Math.min(w, h * 1.46) / 168, 4.4, 5.0);
    },

    async setup(st, H) {
      if (!RAW) RAW = await (scene._building || (scene._building = build(H, scene._keep)));
      const S = st._pcb && st._pcb.I ? st._pcb : { I: newState(), f: { m: new Float64Array(36) } };
      st._pcb = S;
      fitView(S, st.w, st.h);
      // dot footprint on the board, in texels -> pre-filter strength
      const fp = (st.pitch / S.s) * TPM;
      S.C = await composite(fp > 4.2 ? 2 : 1, S.s / st.pitch > 1.3);
      if (S.I.act) { const p = S.I.act; S.I.act = null; setActive(S, p, st); }
      setView(S, st);
    },

    update(st, dt, H) {
      const S = st._pcb;
      if (!S) return;
      // reduced motion or the site-wide pause: no autonomous motion, no pulses
      const I = S.I, P = st.pointer, now = st.now, red = st.reduced || !!st.still;
      let busy = false;

      // input bookkeeping
      if (P.down || (P.inside && (Math.abs(P.x - I.px) > 0.5 || Math.abs(P.y - I.py) > 0.5))) I.last = now;
      I.px = P.x; I.py = P.y;
      const idle = !red && now - I.last > 3 && !I.sel && !I.chk && !P.down && !I.hov;
      if (idle && I.idleAmt === 0) I.idleT0 = now;
      const ka = 1 - Math.exp(-dt * (idle ? 0.8 : 4));
      I.idleAmt += ((idle ? 1 : 0) - I.idleAmt) * ka;
      if (I.idleAmt < 0.002 && !idle) I.idleAmt = 0;

      // rotation: drag follows the pointer through a soft clamp (an unbounded raw angle mapped
      // by lim + R·tanh(excess / R), so yaw tops out near ±42°, tilt near ±24.5°); released,
      // a damped spring (ζ ≈ 0.55) with inertia from the clamped angle — no band spring, no whip
      const KD = 0.22;   // deg per px: the turn uses ~85 px of travel before the soft clamp toward -35°
      if (P.down && P.moved) {
        if (!I.dragging) { I.ryaw = unsoft(I.yaw, LIM.yaw, SOFT.yaw); I.rtilt = unsoft(I.tilt, LIM.tilt, SOFT.tilt); }
        I.ryaw -= P.dx * KD; I.rtilt += P.dy * KD;
        I.yaw = soft(I.ryaw, LIM.yaw, SOFT.yaw); I.tilt = soft(I.rtilt, LIM.tilt, SOFT.tilt);
        I.vyaw = -P.vx * KD * softD(I.ryaw, LIM.yaw, SOFT.yaw); I.vtilt = P.vy * KD * softD(I.rtilt, LIM.tilt, SOFT.tilt);
        I.dragging = true; busy = true;
      } else {
        if (I.dragging) { I.dragging = false; I.vyaw = clamp(I.vyaw, -150, 150); I.vtilt = clamp(I.vtilt, -100, 100); }
        const sway = red ? 0 : I.idleAmt;
        const ry = REST.yaw + sway * 9 * Math.sin(0.42 * (now - I.idleT0)), rt = REST.tilt + sway * 3.5 * Math.sin(0.31 * (now - I.idleT0) + 0.6);
        const steps = Math.max(1, Math.ceil(dt / 0.012)), h = dt / steps;
        const my = LIM.yaw + SOFT.yaw, mt = LIM.tilt + SOFT.tilt;
        for (let s = 0; s < steps; s++) {
          let ay = -26 * (I.yaw - ry) - 5.6 * I.vyaw, at = -30 * (I.tilt - rt) - 6.0 * I.vtilt;
          // past a limit: a viscous brake on outward motion only
          if (Math.abs(I.yaw) > LIM.yaw && I.yaw * I.vyaw > 0) ay -= 18 * I.vyaw;
          if (Math.abs(I.tilt) > LIM.tilt && I.tilt * I.vtilt > 0) at -= 18 * I.vtilt;
          I.vyaw += ay * h; I.vtilt += at * h;
          I.yaw += I.vyaw * h; I.tilt += I.vtilt * h;
          if (I.yaw > my) { I.yaw = my; if (I.vyaw > 0) I.vyaw = 0; } else if (I.yaw < -my) { I.yaw = -my; if (I.vyaw < 0) I.vyaw = 0; }
          if (I.tilt > mt) { I.tilt = mt; if (I.vtilt > 0) I.vtilt = 0; } else if (I.tilt < -mt) { I.tilt = -mt; if (I.vtilt < 0) I.vtilt = 0; }
        }
        if (Math.abs(I.yaw - ry) > 0.02 || Math.abs(I.vyaw) > 0.05 || Math.abs(I.tilt - rt) > 0.02 || Math.abs(I.vtilt) > 0.05) busy = true;
        else if (I.idleAmt === 0) { I.yaw = ry; I.tilt = rt; I.vyaw = 0; I.vtilt = 0; }
      }
      setView(S, st);

      // hover
      if (!P.down && P.inside) I.hov = pickPart(S, P.x, P.y);
      else if (!P.inside) I.hov = null;

      // idle demo: a part's nets every few seconds
      I.idlePart = null;
      if (I.idleAmt > 0.5) {
        const k = Math.floor((now - I.idleT0) / 3.4), ph = (now - I.idleT0) - k * 3.4;
        if (ph < 2.4) I.idlePart = BYREF[IDLE_SEQ[Math.floor(H.hash2(k * 7 + 1, 5) * IDLE_SEQ.length + k) % IDLE_SEQ.length]];
      }
      const act = I.chk ? null : (I.hov || I.sel || I.idlePart);
      setActive(S, act, st);

      // net activation
      const kn = 1 - Math.exp(-dt * 7);
      let any = 0;
      for (let j = 1; j < NNET; j++) {
        const tgt = I.netOn[j] && act ? 1 : 0;
        const a = I.netA[j] + (tgt - I.netA[j]) * (dt > 0 ? kn : 0);
        I.netA[j] = Math.abs(a - tgt) < 0.003 ? tgt : a;
        if (I.netA[j] !== tgt) busy = true;
        if (I.netA[j] > any) any = I.netA[j];
      }
      if (act) I.dimM += (I.dimS - I.dimM) * (dt > 0 ? kn : 1);
      I.dim = any * I.dimM;
      const gt = I.gnd && act ? 1 : 0, ga = I.gndA + (gt - I.gndA) * (dt > 0 ? kn : 0);
      I.gndA = Math.abs(ga - gt) < 0.003 ? gt : ga;
      if (I.gndA !== gt) busy = true;
      if (act && !red) busy = true; // pulses

      // design-rule check timeline
      const F = S.f;
      F.chk = 0; F.led2 = 0;
      if (I.chk) {
        const tc = now - I.chk.t0;
        busy = true;
        F.chk = 1; F.tc = tc;
        F.scan = st.reduced ? (tc < 0.11 ? BW + 3 : -1e9) : tc < SCAN_T + 0.1 ? scanAt(tc) : -1e9;
        // findings: pop as the line crosses them, resolve one after the other
        for (let j = 0; j < FINDINGS.length; j++) {
          const f = FINDINGS[j];
          const tp = st.reduced ? 0 : f.tp, tr = f.tr;
          let r = 0, a = 0;
          F['mw' + j] = tc >= tr ? 1 : 0;
          if (tc > tp && tc < tr) {
            const x = tc - tp;
            r = st.reduced ? 2.4 : 2.4 * (1 - Math.exp(-7 * x) * Math.cos(11 * x)) + 0.12 * Math.sin(9 * x);
            a = 1;
          } else if (tc >= tr && tc < tr + 0.4) {
            const x = (tc - tr) / 0.4;
            r = 2.4 * (1 - easeOut(x) * 0.85); a = 1 - x * x;
          }
          F['mr' + j] = r; F['ma' + j] = a;
        }
        const tcl = T_CLEAR;
        F.rip = tc > tcl ? (st.reduced ? 1e9 : (tc - tcl) * 62) : -1e9;
        F.ripA = tc > tcl ? 1 - sstep(0.7, 1.4, tc - tcl) : 0;
        F.ripFlat = st.reduced && tc > tcl ? 0.6 * (1 - sstep(0.3, 1.2, tc - tcl)) : 0;
        F.led2 = tc > tcl ? (Math.sin((tc - tcl) * 14) > -0.2 ? 1 : 0) * (1 - sstep(1.2, 1.6, tc - tcl)) : 0;
        if (tc > T_END) I.chk = null;
      }
      F.sel = I.sel ? I.sel.id : 0;
      F.small = act ? I.small : 0;
      // the status LED lights while it is the part in focus (its LED_A net is lit too)
      if (act && act.id === LED2 && !F.chk) F.led2 = Math.max(F.led2, I.netA[NID.LED_A]);
      F.hov = act && act !== I.sel ? act.id : 0;   // hovered part, or the idle demo's
      F.pulse = act && !red ? 1 : 0;
      F.gnd = I.gndA;
      if (act) { F.srcx = act.cx; F.srcy = act.cy; }
      F.pv = (now - I.actT) * 26;
      F.gv = (now - I.actT) * 9;
      st.busy = busy || st.busy;
    },

    onClick(x, y, st) {
      const S = st._pcb;
      if (!S) return;
      const I = S.I;
      I.last = st.now;
      const p = pickPart(S, x, y);
      if (p) { I.sel = I.sel === p ? null : p; return; }
      const [u, v] = unproject(S, x, y, 0);
      if (onBoard(u, v)) startCheck(S, st);
      else I.sel = null;
    },

    onKey(key, st) {
      const S = st._pcb;
      if (!S) return false;
      const I = S.I;
      I.last = st.now;
      switch (key) {
        case 'ArrowLeft': I.vyaw = Math.min(I.vyaw + 110, 220); return true;
        case 'ArrowRight': I.vyaw = Math.max(I.vyaw - 110, -220); return true;
        case 'ArrowUp': I.vtilt = Math.max(I.vtilt - 80, -160); return true;
        case 'ArrowDown': I.vtilt = Math.min(I.vtilt + 80, 160); return true;
        case 'Enter': case ' ': startCheck(S, st); return true;
        case 'n': case 'N': case 'p': case 'P': {
          const d = key.toLowerCase() === 'n' ? 1 : -1;
          const k = I.sel ? CYCLE.indexOf(I.sel) : (d > 0 ? -1 : 0);
          I.sel = CYCLE[(k + d + CYCLE.length) % CYCLE.length];
          return true;
        }
        case 'Escape': if (I.sel) { I.sel = null; return true; } return false;
        default: return false;
      }
    },

    sample(x, y, t, st, out, i) {
      const S = st._pcb;
      if (!S) return;
      const F = S.f, R = RAW, C = S.C;
      if (i === 0) { F.md = st.mode === 'color' ? 1 : 0; F.netA = S.I.netA; F.dimK = 1 - 0.55 * S.I.dim; }
      if (x < F.qx0 || x > F.qx1 || y < F.qy0 || y > F.qy1) return;
      const m = F.m, md = F.md;

      // board plane
      let iw = 1 / (m[6] * x + m[7] * y + m[8]);
      const tx = (m[0] * x + m[1] * y + m[2]) * iw, ty = (m[3] * x + m[4] * y + m[5]) * iw;
      const kb = tx >= 0 && ty >= 0 && tx < TW && ty < TH ? (ty | 0) * TW + (tx | 0) : -1;
      const bu = tx * ITPM - MARG, bv = ty * ITPM - MARG;

      // DRC overlay: findings ring (drawn above everything)
      if (F.chk) {
        for (let j = 0; j < 2; j++) {
          const a = F['ma' + j];
          if (a <= 0) continue;
          const f = FINDINGS[j], du = bu - f.x, dv = bv - f.y, r = Math.sqrt(du * du + dv * dv), rr = F['mr' + j];
          if (Math.abs(r - rr) < 0.42 || (r < 0.55 && rr > 0.8)) { out.d = 0.95 * a; out.c = F['mw' + j] ? SILK_C : ACC; return; }
          if (a > 0.6 && rr > 1.2 && (Math.abs(r - rr) < 1.0 || r < 1.1)) { out.d = 0; return; }   // a moat so the ring reads
        }
      }

      // tall bodies: top
      iw = 1 / (m[24] * x + m[25] * y + m[26]);
      let ux = (m[18] * x + m[19] * y + m[20]) * iw, uy = (m[21] * x + m[22] * y + m[23]) * iw;
      if (ux >= 0 && uy >= 0 && ux < TW && uy < TH) {
        const k = (uy | 0) * TW + (ux | 0);
        if (R.HI.COV[k]) {
          let d = R.HI.D[md][k] / 255, c = R.HI.C[md][k];
          if (R.HI.MAT[k] === M_METAL || R.HI.MAT[k] === M_GOLD) {
            if (F.sel && R.HI.PID[k] === F.sel) d = Math.min(1, d + 0.12);
            if (R.HI.PID[k] === PIN_PID) { const pn = R.NETR[k]; if (pn && F.netA[pn] > R.DITH[k] / 255) { c = ACC; d = 0.95; } }
          }
          if (F.chk && Math.abs(ux * ITPM - MARG - F.scan) < 0.55) { d = 0.9; c = ACC; }
          out.d = d; out.c = c; return;
        }
      }
      // low bodies: top
      iw = 1 / (m[15] * x + m[16] * y + m[17]);
      ux = (m[9] * x + m[10] * y + m[11]) * iw; uy = (m[12] * x + m[13] * y + m[14]) * iw;
      if (ux >= 0 && uy >= 0 && ux < TW && uy < TH) {
        const k = (uy | 0) * TW + (ux | 0);
        if (R.LO.COV[k]) {
          let d = R.LO.D[md][k] / 255, c = R.LO.C[md][k];
          const mat = R.LO.MAT[k];
          if (mat === M_LED) {
            const pid = R.LO.PID[k];
            if (pid === LED1) { c = md ? LED_C : SILK_C; d = md ? 0.95 : 0.7; }
            else if (pid === LED2 && F.led2 > 0.35) { c = md ? LED_C : SILK_C; d = 0.95; }
          }
          const pid = R.LO.PID[k];
          if (pid && (pid === F.hov || pid === F.sel) && mat === M_IC && R.DITH[k] < 90) { c = BODY_HI; d = md ? 0.75 : 0.32; }
          if (F.chk && Math.abs(ux * ITPM - MARG - F.scan) < 0.55) { d = 0.9; c = ACC; }
          out.d = d; out.c = c; return;
        }
      }
      if (kb < 0) return;
      // walls (the ray met a body's footprint below its top)
      if (R.HI.COV[kb]) {
        const mat = R.HI.MAT[kb];
        out.c = mat === M_IC ? BODY_C : METAL_C;
        out.d = md ? (mat === M_IC ? 0.6 : 0.42) : (mat === M_IC ? 0.22 : 0.26);
        return;
      }
      if (R.LO.COV[kb]) {
        const mat = R.LO.MAT[kb];
        out.c = mat === M_IC ? BODY_C : mat === M_CER ? (md ? EDGE_C : METAL_C) : mat === M_LED ? (md ? LED_C : SILK_C) : METAL_C;
        out.d = md ? 0.5 : (mat === M_IC ? 0.2 : 0.2);
        return;
      }
      const kind = C.KIND[kb];
      if (!kind) {
        if (sdBoard(bu, bv) < -0.3) {
          // inside a drill: a mounting hole shows its plated barrel, small drills stay dark
          for (const q of HOLES) {
            const hu = bu - q.x, hv = bv - q.y;
            if (hu * hu + hv * hv < 3.2) {
              iw = 1 / (m[33] * x + m[34] * y + m[35]);
              const ex = (m[27] * x + m[28] * y + m[29]) * iw, ey = (m[30] * x + m[31] * y + m[32]) * iw;
              if (ex >= 0 && ey >= 0 && ex < TW && ey < TH && R.BIN[(ey | 0) * TW + (ex | 0)]) { out.c = PAD_C; out.d = md ? 0.3 : 0.14; }
              return;
            }
          }
          return;
        }
        // the board's edge. The side face is the strip between the top outline and the back
        // face's outline; its thickness in dots is t = (front sd - back sd) at this point, > 0
        // only on edges that face the viewer. In perspective it is often under a dot, so it is
        // drawn at least one dot thick, and dot area follows the band's coverage of the cell:
        // a continuous FR4 band along a slanted edge instead of stepped dashes.
        const sf = sdBoard(bu, bv) * F.pxd;
        if (sf > 2.6) return;
        iw = 1 / (m[33] * x + m[34] * y + m[35]);
        const eu = (m[27] * x + m[28] * y + m[29]) * iw * ITPM - MARG, ev = (m[30] * x + m[31] * y + m[32]) * iw * ITPM - MARG;
        const tb = sf - sdBoard(eu, ev) * F.pxd;
        if (tb < 0.06) return;
        let cov = Math.max(1, tb * 1.15) + 0.5 - sf;
        cov = (cov > 1 ? 1 : cov) * (tb < 0.4 ? tb / 0.4 : 1);
        if (cov > 0.1) {
          const side = Math.abs(eu - BW / 2) > BW / 2 - 0.5 ? 1 : 0;
          out.c = EDGE_C; out.d = (md ? (side ? 0.84 : 0.76) : (side ? 0.52 : 0.46)) * cov;
        }
        return;
      }

      let d = C.BD[md][kb] / 255, c = C.BC[md][kb];
      const dth = R.DITH[kb] / 255;
      // the outline's fade is for edges that face away; where the edge band shows below
      // (the near and left edges in the default view) the last row keeps full size
      const efq = C.EFQ[kb];
      if (efq < 255 && sdBoard(bu, bv) > -0.9) {
        iw = 1 / (m[33] * x + m[34] * y + m[35]);
        const eu = (m[27] * x + m[28] * y + m[29]) * iw * ITPM - MARG, ev = (m[30] * x + m[31] * y + m[32]) * iw * ITPM - MARG;
        if (sdBoard(eu, ev) < -0.1) d = Math.min(1, d * 255 / efq);
      }
      // sheen of the glossy mask, tracks the view. The pour keeps its own colour in the light
      // (a brighter step of itself) so the hatch never melts into the lit mask.
      const su = bu - F.shx, sv = bv - F.shy, s = 1 - (su * su + sv * sv) * GLI;
      if (s > 0) {
        if (kind === K_MASK) {
          if (md) { if (s * s > dth * 1.2) c = SHEEN; else if (c === MASK_D && s > dth * 0.85) c = MASK_L; d += 0.12 * s; }
          else d += 0.03 * s;
        } else if (kind === K_POUR) {
          if (md) { if (s > dth * 0.7) c = POUR_HI; d += 0.14 * s; }
          else d += 0.06 * s;
        } else if (kind === K_TRACE) {
          if (md && s > dth * 1.25) c = TRACE_HI;
          d += 0.08 * s;
        } else if (kind === K_PAD && md && s > dth * 1.5) c = PAD_HI;
      }
      // local ground: a small part on GND swells the mask and pour around it (tonal, never accent)
      let gl = 0, gw = 0;
      if (F.gnd > 0.01) {
        const pu = bu - F.srcx, pw = bv - F.srcy, r2 = pu * pu + pw * pw;
        if (r2 < GRR * GRR) {
          const r = Math.sqrt(r2), g = 1 - r / GRR;
          if (!F.pulse) { gl = g * g * F.gnd; gw = 0.5 * gl; }
          else if (r <= F.gv + 0.5) {
            gl = g * g * F.gnd;
            let ph = (r - F.gv) / 8; ph -= Math.floor(ph);
            const z = ph > 0.72 ? Math.sin((ph - 0.72) / 0.28 * PI) : 0;
            gw = gl * (0.25 + 0.75 * z);
          }
        }
      }
      // nets
      const net = C.NETK[kb];
      if (net === GND) {
        // ground copper dims with the rest, except next to the part (its own GND pads included)
        if (F.dimK < 1) d *= F.dimK + (1 - F.dimK) * Math.min(1, gl * 2.5);
        if (gw > 0) d = Math.min(1, d + 0.12 * gw);
      } else if (net) {
        if (F.netA[net] > dth) {
          const wv = F.pulse ? wave(C.DIST[kb], F.pv) : 0;
          c = ACC;
          d = (kind === K_PAD ? 0.66 : 0.44) + (kind === K_PAD ? 0.34 : 0.56) * wv;
        } else if (F.dimK < 1) d *= F.dimK;
      } else {
        const bn = C.BOTK[kb];
        if (bn && F.netA[bn] > dth && (kind === K_MASK || kind === K_POUR)) {
          // a lit net's hop through the bottom layer, seen through the board: small, dim accent
          c = ACC; d = 0.16 + 0.5 * (F.pulse ? wave(C.DIST[kb], F.pv) : 0.3);
        } else {
          if (F.dimK < 1 && (kind === K_POUR || kind === K_SILK)) d *= 0.6 + 0.4 * F.dimK + (0.4 - 0.4 * F.dimK) * gl;
          if (gw > 0 && (kind === K_MASK || kind === K_POUR)) {
            if (md) { if (gw > dth * 0.9) c = kind === K_POUR ? TRACE_C : MASK_L; d += 0.2 * gw; }
            else d += (kind === K_POUR ? 0.3 : 0.22) * gw;
          }
        }
      }
      // the part in focus: its silkscreen outline turns accent (hover: fine dots, selected: full)
      if (kind === K_SILK && C.PARTK[kb]) {
        const pk = C.PARTK[kb];
        if (pk === F.sel) { c = ACC; d = Math.max(d, 0.75); }
        else if (pk === F.hov) { c = ACC; d = F.small ? 0.62 : 0.4; }
      }
      // power LED glow on the mask around D1; D2 when the board is clear or D2 is in focus
      if (kind === K_MASK || kind === K_POUR) {
        const g1u = bu - LED1P[0], g1v = bv - LED1P[1], r1 = g1u * g1u + g1v * g1v;
        if (r1 < 9) { const g = 1 - Math.sqrt(r1) / 3; if (g * g > R.DITH[kb] / 255 * 1.4) { c = md ? LED_C : SILK_C; d = md ? 0.35 + 0.5 * g : 0.08 + 0.2 * g; } }
        if (F.led2 > 0) {
          const g2u = bu - LED2P[0], g2v = bv - LED2P[1], r2 = g2u * g2u + g2v * g2v;
          if (r2 < 12) { const g = 1 - Math.sqrt(r2) / 3.46; if (g * g * F.led2 > R.DITH[kb] / 255 * 1.2) { c = md ? LED_C : SILK_C; d = md ? 0.4 + 0.5 * g : 0.1 + 0.3 * g; } }
        }
      }
      // check: scan line + its wake, then the all-clear ripple through the mask
      if (F.chk) {
        const ds = F.scan - bu;
        if (Math.abs(ds) < 0.55) { c = ACC; d = 0.9; }
        else if (ds > 0 && ds < 9 && (kind === K_MASK || kind === K_POUR)) {
          const w = 1 - ds / 9;
          if (md) { if (w * w > R.DITH[kb] / 255) c = MASK_L; d += 0.12 * w; } else d += 0.28 * w * w;
        }
        if (F.ripA > 0 && (kind === K_MASK || kind === K_POUR)) {
          const ru = bu - BW / 2, rv = bv - BH / 2, rr = Math.sqrt(ru * ru + rv * rv), z = F.ripFlat ? 0.5 : (F.rip - rr) / 7;
          if (z > 0 && z < 1) {
            const w = F.ripFlat || Math.sin(z * PI) * F.ripA;
            if (md) { if (!F.ripFlat && w > R.DITH[kb] / 255 * 0.8) c = z > 0.55 ? TRACE_C : MASK_L; d += 0.18 * w; }
            else { d += 0.45 * w; if (!F.ripFlat && w > 0.35 && w > R.DITH[kb] / 255 * 1.2) c = POUR_C; }
          }
        }
      }
      out.d = d; out.c = c;
    },

    revealKey(x, y, st) {
      return 0.8 * clamp(x / st.w, 0, 1) + 0.2 * Halftone.utils.hash2(x * 3 + 1, y * 7 + 3);
    },

    /** What the board is doing, for page captions: phase 'idle' | 'scan' | 'findings' | 'clear'. */
    status(st) {
      const S = st && st._pcb;
      if (!S) return null;
      const I = S.I, p = I.act;
      let phase = 'idle', issues = 0;
      if (I.chk) {
        const tc = st.now - I.chk.t0;
        phase = tc < (st.reduced ? 0.11 : SCAN_T) ? 'scan' : tc < T_CLEAR ? 'findings' : 'clear';
        issues = FINDINGS.filter((f) => tc >= (st.reduced ? 0 : f.tp) && tc < f.tr).length;
      }
      return { phase, issues, part: p ? p.ref : null, selected: I.sel ? I.sel.ref : null, nets: p ? [...p.nets].filter((k) => k !== SHIELD).map((k) => NETS[k]) : [] };
    },
    /** Screen position of a part's centre (top face for tall parts) in the current view, or null. */
    locate(st, ref) {
      const S = st && st._pcb, p = BYREF[ref];
      if (!S || !p) return null;
      const I = S.I;
      return project(basis(I.yaw, I.tilt), S.s, S.cx, S.cy, p.cx, p.cy, p.tall ? H_HI : H_LO);
    },
    _build(H, keep) { scene._keep = keep; return RAW || build(H, keep).then((r) => (RAW = r)); },
    _composite: (blur) => composite(blur),
    parts: PARTS,
  };

  const LED1 = BYREF.D1.id, LED2 = BYREF.D2.id, PIN_PID = BYREF.J3.id;
  const LED1P = [BYREF.D1.x, BYREF.D1.y], LED2P = [BYREF.D2.x, BYREF.D2.y];

  window.Halftone.scenes.pcb = scene;
})();
