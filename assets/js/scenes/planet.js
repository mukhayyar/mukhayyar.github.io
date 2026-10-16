/*!
 * planet.js — hero scene for mukhayyar.my.id
 * The Earth (real coastlines, 1° land mask) turning about its 23.4° axis, lit
 * from the upper left. EEPISAT flies an inclined (≈65°) orbit whose near arc
 * climbs across the lit face; the Surabaya ground station turns with the
 * ground, and while the satellite is more than 10° above its horizon a dotted
 * downlink marches between them. Everything is dots.
 *
 * Interaction (a globe you can hold):
 *   drag ←→        spins the ground (longitude) with inertia and friction; the orbit stays put
 *   drag ↑↓        tilts the axis (and the orbit with it) up to ±15°, springs back on release
 *   click globe    uplink ping: accent rings ripple out across the sphere from the clicked
 *                  point (drawn on the surface, so they foreshorten), a ground-station marker
 *                  stays a while, and if EEPISAT is above that station's horizon an uplink
 *                  climbs to it (≈2× faster than the satellite flies, so it always arrives);
 *                  on arrival EEPISAT answers with an ack ring. Otherwise the ring sweeping
 *                  under the satellite triggers the ack. The marker then prints the outcome
 *                  in 3×5 dot letters: AOS (accent, contact) or LOS (ink, it is below the
 *                  horizon there), so a click that gets no reply explains itself.
 *   click orbit / satellite   boost: a speed burst with a long trail that eases back; a burst
 *                  that would park EEPISAT behind the globe carries it round to the far side.
 *                  While EEPISAT is behind the globe the command is drawn instead: a ring at
 *                  the click and a bright packet that runs along the orbit after it into the
 *                  limb; the satellite answers (ack ring) as it comes round. The cursor reads
 *                  'Boost' over the orbit band, 'Drag' elsewhere.
 *   keys           ←/→ spin, ↑/↓ tilt, Space boosts, Enter pings below EEPISAT: the
 *                  sub-satellite point, swung onto the visible face when it is round the back
 *                  (it lands just inside the limb nearest the satellite); if EEPISAT is hidden
 *                  a light boost brings it round and it answers then (AOS)
 *   idle (3 s)     the slow spin continues; a ghost demo pings the owner's places and prints
 *                  their callsign beside the marker in 3×5 dot letters (SUB, TYO, KUL, PER …),
 *                  nudges the globe and boosts the satellite (waiting for it to be in view).
 *   Reduced motion: no autonomous motion; drag, clicks and keys still respond (calmly).
 *   Page: on the desktop hero the headline column covers the canvas; hookPage() lets pointer
 *   events through everywhere but glyphs/links (see HERO_PE) and stops drags selecting text.
 *   It also keeps the page cursor's label in step (Drag / Boost), gives the cursor a paper
 *   reticle over the painted globe in colour mode (a difference blend turns the paint into
 *   off-palette complements) and over the orbit band in both modes, describes the keys to assistive tech (aria-describedby) and
 *   announces hand-made outcomes (AOS / LOS / boost) in a polite live region.
 *
 * Palette (material index; mono / colour):
 *    0 surface ink / night indigo     1 muted / pale star      2 accent / accent (orbit, signal)
 *    3–5 ink / ocean lit, mid, deep    6–8 ink / forest, savanna, desert
 *    9 ink / ice   10 ink / cool shade   11 ink / cloud white   12 ink / night cloud
 *   13 accent / city lights gold   14 muted / atmosphere cyan   15 accent / bus gold
 *   16 ink / solar panels (navy)   17 ink / cloud body (pale grey-blue)
 *   18–23 ink / sunlit + shade steps of forest, savanna, desert   24 ink / mountain umber
 *   25 ink / shelf turquoise   26 ink / night land
 *   Mono uses 0/1/2 only and is unchanged: lit land ≈ paper, darkening toward the terminator;
 *   lit ocean a screen that thickens from the sub-solar point (0.44) to the terminator (≈0.8);
 *   night side dense ink (0.95) with a faint memory of the continents; clouds are knockouts.
 *   Colour is a pointillist globe: materials are dithered per dot (Seurat-like mixing at
 *   every boundary). Light is modelled twice, like a colour plate: dot size follows the tone
 *   (the sea opens up to paper round the sub-solar point, land stays a solid painted mass) and
 *   each material steps from a sunlit tint to its shade. Oceans in three blues by light and
 *   depth with turquoise shelves; land in forest / savanna / desert by a dryness model,
 *   broken up by dunes, plateaus and umber ranges with snow on the high ones; white ice and
 *   clouds with cool shadows; an indigo night with gold city lights; a cyan rim. Where the
 *   orbit and the links cross the painted globe they run in a paper gutter so they stay legible.
 * Motion: ground 1 rev / 6 min, clouds 1.28× faster, satellite 1 orbit / 14 s,
 *         trail 23% of the orbit. Surabaya has contact at t = 0–2.2 s and again
 *         at t ≈ 14.6–15.9 s on the next orbit; later passes come round with the ground.
 * Pointer: the sun leans toward the cursor (terminator swings), held while dragging.
 * Extra API (optional, for the page):
 *   Halftone.scenes.planet.telemetry(st) -> { lat, lon, altKm, x, y, front, hidden, periodS,
 *       elevDeg, contact, station: { lat, lon, x, y, visible } }
 *     sub-satellite point, screen position and the station's view of the satellite,
 *     from the same model that draws them (including drag, tilt and boosts).
 *   Halftone.scenes.planet.textureMs() -> CPU ms spent on the one-time texture build.
 */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const gauss = (z) => Math.exp(-z * z);
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

  // ---------------------------------------------------------------------------
  // The world. View space: u right, v up, w toward the viewer. Units: planet radii.
  // ---------------------------------------------------------------------------
  const TILT = 23.4 * DEG;            // Earth's obliquity, leaning right
  const NOD = 13 * DEG;               // north pole nodded toward the viewer
  const AXIS = norm3([Math.sin(TILT) * Math.cos(NOD), Math.cos(TILT) * Math.cos(NOD), Math.sin(NOD)]);
  const E1 = norm3([-AXIS[0] * AXIS[2], -AXIS[1] * AXIS[2], 1 - AXIS[2] * AXIS[2]]); // meridian facing us
  const E2 = cross3(AXIS, E1);                                                         // east
  const SUN = norm3([-0.50, 0.42, 0.76]);   // upper left, in front: sub-solar point at ≈(−0.5R, −0.42R)
  const DAY = 360;                           // seconds per rotation (ground): 1°/s
  const W_EARTH = TAU / DAY;
  const W_CLOUD = W_EARTH * 1.28;            // clouds drift east a little faster
  const PERIOD = 14;                         // seconds per orbit
  const W_SAT = TAU / PERIOD;
  const RO = 1.31;                           // orbit radius (planet radii)
  const ELEV = -24 * DEG;                    // we look up at the orbit plane: the near arc climbs over the lit face
  const ROLL = 32 * DEG;                     // and rises to the right, a launch vector (inclination ≈ 65°)
  const ORB_P = [Math.cos(ROLL), Math.sin(ROLL), 0];
  const ORB_Q = [-Math.sin(ELEV) * Math.sin(ROLL), Math.sin(ELEV) * Math.cos(ROLL), -Math.cos(ELEV)];
  const TRAIL = 0.23 * TAU;                  // fading trail, 23% of the orbit
  const HOME = { lat: -7.25, lon: 112.75 };  // Surabaya, East Java: the EEPISAT ground station
  const MASK = 10 * DEG;                     // station elevation mask
  const EARTH_KM = 6371;

  // Interaction tuning
  const TILT_LIM = 15 * DEG;                 // vertical drag tilts the axis this far (rubber band beyond)
  const SPRING = [40, 8.6];                  // tilt spring: stiffness, damping (ζ ≈ 0.68)
  const FRICTION = 1.3;                      // spin inertia decay (1/s)
  const W_MAX = 3.2;                         // fling cap (rad/s)
  const BOOST = 5;                           // satellite burst: extra speed (× orbital rate) per click
  const BOOST_TAU = 0.75;                    // burst decay (s)
  const PING_DUR = 2.3;                      // ring travel time (s)
  const PING_RMAX = 52 * DEG;                // rings travel this far across the sphere
  const PING_GAP = 0.26;                     // three rings, this far apart (s)
  const PING_LIFE = 9;                       // the station marker stays this long (s)
  const UP_SPEED = 64;                       // uplink front, cells / s (EEPISAT flies ≈ 28 on desktop)
  const UP_DELAY = 0.12;                     // the uplink leaves after the ping's flash
  const UP_PKT = 7;                          // packets climbing the link, cells / s
  const UP_GIVEUP = 3.0;                     // no contact by then (it set): the link fades
  const UP_HOLD = 0.7;                       // after contact the link holds this long, then fades
  const UP_RISE = 0.32;                      // … and the front always reaches EEPISAT within this (s)
  const UP_WAIT = 6.0;                       // Enter while EEPISAT is hidden: wait this long for it
  const ENTER_W = 0.3;                       // Enter: the ping swings onto the face at least this far (w)
  const LOS_LIFE = 3.2;                      // the LOS tag shows this long (s)
  const KICK_W = 160 * DEG;                  // boost while hidden: the packet's speed along the orbit (rad/s)
  const ACK_PEND = 4.5;                      // an ack owed by a hidden satellite is paid when it comes round, within (s)
  const BEAT = 5.2;                          // ghost demo: one gesture every BEAT seconds
  // the owner's places, pinged by the ghost demo when they face us
  const SITES = [
    [-7.25, 112.75, 'SUB'],  // Surabaya: EEPISAT, home (the nav clock reads SUB too)
    [35.44, 139.36, 'TYO'],  // Atsugi, Greater Tokyo: Kanagawa Institute of Technology
    [3.11, 101.61, 'KUL'],   // Petaling Jaya, Greater KL: OptiControl
    [-31.95, 115.86, 'PER'], // Perth: APRSAF-30
    [35.1, 129.04, 'PUS'],   // Busan: Project BEE
    [-6.2, 106.82, 'JKT'],   // Jakarta: APRSAF-29
    [39.93, 32.86, 'ANK'],   // Ankara, Türkiye: TEKNOFEST
    [37.2, -78.4, 'VA'],     // Virginia: AAS CanSat
  ];
  // 3×5 dot-matrix letters for callsigns and AOS / LOS tags (rows top to bottom, 3 bits each)
  const FONT = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], E: [7, 4, 6, 4, 7], J: [1, 1, 1, 5, 7], K: [5, 5, 6, 5, 5],
    L: [4, 4, 4, 4, 7], N: [5, 7, 7, 5, 5], O: [7, 5, 5, 5, 7], P: [6, 5, 6, 4, 4], R: [6, 5, 6, 5, 5],
    S: [7, 4, 7, 1, 7], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], Y: [5, 5, 2, 2, 2],
  };
  const LABEL_LIFE = 4.6;                     // the callsign shows this long after a ghost ping (s)
  function labelBits(code) {
    const w = code.length * 4 - 1, bits = new Uint8Array(w * 5);
    for (let k = 0; k < code.length; k++) {
      const g = FONT[code[k]] || [0, 0, 0, 0, 0];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r] & (4 >> c)) bits[r * w + k * 4 + c] = 1;
    }
    return { w, bits };
  }

  // A view frame: the world rotated about the screen's horizontal axis by the tilt a.
  // The sun stays put (a lamp in the room); the axis and the orbit tip together.
  function makeFrame(a) {
    return { a, AX: rotX(AXIS, a), E1: rotX(E1, a), E2: rotX(E2, a), OP: rotX(ORB_P, a), OQ: rotX(ORB_Q, a) };
  }
  const FR0 = makeFrame(0);
  const satDir = (fr, th) => {
    const c = Math.cos(th), s = Math.sin(th), P = fr.OP, Q = fr.OQ;
    return [c * P[0] + s * Q[0], c * P[1] + s * Q[1], c * P[2] + s * Q[2]];
  };
  const geo = (fr, latR, lonViewR) => {
    const cl = Math.cos(latR), sl = Math.sin(latR), c = Math.cos(lonViewR) * cl, s = Math.sin(lonViewR) * cl;
    const A = fr.AX, X = fr.E1, Y = fr.E2;
    return [c * X[0] + s * Y[0] + sl * A[0], c * X[1] + s * Y[1] + sl * A[1], c * X[2] + s * Y[2] + sl * A[2]];
  };
  // elevation of a satellite at view-space S3 (planet radii) seen from ground point g
  const elevation = (S3, g) => {
    const dv = [S3[0] - g[0], S3[1] - g[1], S3[2] - g[2]];
    return Math.asin(clamp(dot3(dv, g) / (Math.hypot(dv[0], dv[1], dv[2]) || 1), -1, 1));
  };

  // Epoch (chosen offline for the composition): at t = 0 EEPISAT has just risen above
  // Surabaya's 10° mask on the near side, the face shows India to Australia, and the
  // pass lasts into the reveal. θ0 = orbit angle, φ0 = ground rotation.
  const EPOCH = [214, 224];
  const SAT0 = { theta: EPOCH[0] * DEG, phi: EPOCH[1] * DEG };

  // Everything that moves, from one model (used by the renderer and by telemetry()).
  // I carries what the hand added: ground spin and the satellite's boosts.
  function kin(t, I, fr) {
    const th = SAT0.theta + W_SAT * t + (I ? I.bth : 0), phi = SAT0.phi + W_EARTH * t + (I ? I.spin : 0);
    const s = satDir(fr, th);
    const g = geo(fr, HOME.lat * DEG, HOME.lon * DEG + phi);
    const el = elevation([RO * s[0], RO * s[1], RO * s[2]], g);
    return { th, phi, s, g, el };
  }

  // ---------------------------------------------------------------------------
  // Satellite glyph, snapped to the grid. The wings lie along the orbit normal,
  // which projects (for this orbit) to the up-left / down-right diagonal: the
  // classic satellite silhouette, near-perpendicular to the front arc.
  // Offsets are cells from the bus's top-left cell; bus is 2×2.
  //        -3 -2 -1  0  1  2  3  4
  //   -3    P  P
  //   -2    P  P  P
  //   -1       P  s
  //    0             B  B
  //    1             B  B
  //    2                   s  P
  //    3                   P  P  P
  //    4                      P  P
  // ---------------------------------------------------------------------------
  const GO = 6, GS = 2 * GO + 2;             // table covers offsets −6..7
  const G_D = new Float32Array(GS * GS), G_C = new Uint8Array(GS * GS), G_W = new Float32Array(GS * GS).fill(1);
  (function buildGlyph() {
    const cells = [];
    const put = (i, j, d, c) => cells.push([i, j, d, c]);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(i, j, 1, 2);
    put(2, 2, 0.3, 0); put(-1, -1, 0.3, 0);
    for (const [i, j] of [[3, 2], [2, 3], [3, 3], [4, 3], [3, 4], [4, 4]]) { put(i, j, 0.8, 0); put(1 - i, 1 - j, 0.8, 0); }
    for (const [i, j, d, c] of cells) { const k = (j + GO) * GS + (i + GO); G_D[k] = d; G_C[k] = c; }
    // paper window: a one-cell moat that softens with distance, shaped like the glyph
    for (let j = -GO; j <= GO + 1; j++) for (let i = -GO; i <= GO + 1; i++) {
      let m = 1e9;
      for (const [a, b] of cells) m = Math.min(m, Math.hypot(i - a, j - b));
      const k = (j + GO) * GS + (i + GO);
      G_W[k] = m < 0.01 ? 1 : m <= 1.01 ? 0 : m <= 1.5 ? 0.18 : m <= 2.01 ? 0.55 : m <= 2.3 ? 0.8 : 1;
    }
  })();

  // ---------------------------------------------------------------------------
  // Land: Natural Earth 1:110m land, rasterised to 360×180 (1°), run-length
  // coded per row (water first), each run a 5-bit little-endian varint in base64.
  // ---------------------------------------------------------------------------
  const MW = 360, MH = 180;
  const LAND_RLE =
    'oLoLoLoLoLoLtENuG+CCBVPZqG5CZEoBBIhG0CaDzBiBDBDWCrBHxC1CIBMIvBePjCHwCrCFCCDRD1BgBHDBtCFrC9BCECXJI0BhBEEBwCCrC6' +
    'BFHCHDCFCKJxB1CEfNkC/BLFDCCBMWnBtCHaYXIjB5BCICQBEJYlBrCEbYmC4BIKBEDCFDCCCBDWjBrCDYmBEEOClB3BQBDDFBCEJBEVgBrCEN' +
    'EIwBLHhBAC2BDCOFDBDDQBBRhBqCEMEC3BDFBNdTMfPGFDUOeBCtBHlBGB2CURYEPDQCDBEGEEKNCBbqBPcDEFB+CCICACMzBCBEDHCBHCEHHP' +
    'ZsBWGBHCCLCECpDAEMsCBGECCJKVvBbDCCZBqDAJGBCvCJMITTBcVBGBBBcBrDCHDxCBBKHDCKOPKaKDKFsEGBHEBpCCEEMOLSIZLDLCuEBSnC' +
    'FCCBJHOKWBbLC9EBPpCICEBHDRHxBMD+EBOoCQGXGwBMEpEBDCJHPRC0BQJXDwBNElEHJJSICCKtBRJDClCNH8DBFFDRWEQtBPKBE6BBKDCGH1' +
    'DSDSWCCBTpBQP4BEOFFBB0DRGRUCZtBLQ3BDLCCEF1DSHRRCdvBHS3BDKCBDHzDTHSxBxBDWwBDCDKCF5DTFTvBBDvBDXuBECEGnEBBNEU0BuB' +
    'DXvBCCGDrENCW0BwBBXzBGCqEBBNCW0BkCCCzBCEsEBCkB1B8BJD1BuECCkB3BBB2BBDGGxBwECBlB4B7BGCBBBByBuEDBlB4B8B+BhBBECkDE' +
    'BlB4BgC7BOBQDDBkDrB4B4BCC/BNDOJiDGBlB4B2B9BQDECMM/CGEjB4B1B+BMIDEKN6CJEkB4B1B+BMJEDJEFE5CKBnB4ByBhCKHCFDBFC/CB' +
    'HLCmB4ByBhCJICGBDDD9CCCCDMCmB5BwBiCJVDD7CHDMBnB5BvBjCIOCGCE8CBCEDJDnB6BuBmCBGKLBGCBCC1CFEGFnB7BtBmCBDNZ0CGDEIn' +
    'B8BrBmCRa0CLGrB+BnBnCTY2CJEuB/BlBnCYFDM2CJCwB/BkBnCaEHDBD4CIBxBgCBCgBnCkE6BhCBCSDBHCnC6BCoC6BiCBBQNCmC7BDnC6Bh' +
    'CDBOODjCvBCNDlC7BjCBCNPCiCwBCOH/B8BkCBCMQBhCyBCPDBD8B9BkCBDKzCyBCPCDK0BCB6BpCJyC0BDUJxBDB7BqCIOBBD/B0BDVJuBFB7' +
    'BrCIICIC8B2BCULRFQBDkCqCJHDJD6B2BDSPOFPpCYByBJFEOD2B1BERPMINDClCsCJCFKBEECByB2BDQQLKMDBmCvCNoC3BDNSKLNNC6BxCLn' +
    'C4BEKUJMOMC6B3CJjC5BDJWGSLLC6B4CJiC6BCGZGSLLC6B6CHiC7BBEcFSLNC4B9CDjC8BgBFSCCHnC+CCLBCB1B7BGCZETBDGNBCB2B+CDIJ' +
    'CBBBuBiCZESBFEPB4BgDCGEBKvBhCZDBBRBGBqChDDBTvB/BbBCBRCYC2BjDBCTuB/BeCRCVBBD1BnDTvB8BfCSCOCGC2BnDYrBKFsBzBDME9B' +
    'nDZsBBNqBwBCDCLE+BnDa8BmByBCCCKF+BmDb9BkB0BCCCHH+BlDd7BkB2BDBBFJ+BkDe7BiB4BEGJCEDCzBkDf6BhB6BEFJOBvBjDkB2BhB7B' +
    'EFHCDJDuBjDmB1Bf8BFEHCDKCCFnBkDpByBd+BEICDBBBGBEKlBjDrBxBcgCDOBBBMKjBjDuBvBbhCCgBIDDcjDuBvBbjCCeKHBYkDtBwBakCG' +
    'ZJhBlDsBwBarCBCCBBRBBDDCgBlDsBwBb0CBWDemDqBxBbsEmDpBzBb7CBJBlBnDnBzBcIBxCGFBlBoDlB0BcHCwCGFDkBoDlBzBdHCrCDBHGD' +
    'jBpDkBzBcHDqCMGDjBrDiBzBcEGqCODFiBsDhBzBaGGoCSBFiBuDe0BYIFpCYiBuDe1BWJFoCbgBuDe1BWJFlCfPBPuDd3BVIFjCiBQBOuDc4B' +
    'WHFiCkBeuDZ7BWIEiClBdtDY+BUJDjCmBctDX/BSMBkCnBbtDWgCSxCnBbtDX/BSxCnBbtDWhCQzCnBasDWjCO0CmBbsDWjCO0CmBbsDVlCM2C' +
    'lBbsDUmCL3CKIScsDTnCJ4CJLCBOcsDSpCC/CDQBBOdrDQjGMXBGrDQlGKYBFrDQlGKZBErDOqGBBCcDCrDLsHDDqDMtHCDqDJyGDYCGqDKxGD' +
    'XDGrDIzGBXDHqDJpHDJpDIqHEJpDIrHCKpDJ2HpDI3HoDIpEBuDpDG5HpDGIDuHpDG5HqDG4HsDG2HvDB4HoLoLoLoLoLoLoL5DBuHoLzDCzHx' +
    'DEyDGsBEGEIBCBDGsBwDDxDMEBRgCiBwDDrDbKnCesDCCF/CGBfHyCVsDDBGkCECKBtBF5CSpDHBGyBCBsCEjDJuCFZBDHwB4FJ6BBSUCEEMtB' +
    '5FLrBYBBKnBuB2FOiBxCuB3FQhBtCqBgGQWzCrBkGQRCEvCdFIqGOSCLoCaIICD/FThBrCHFGJP+FUa5CXrGTb+CE7GQbiKLANSoKBAoLAoLAo' +
    'LAoLAoL';

  function decodeMask() {
    const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lut = new Int8Array(128); for (let k = 0; k < 64; k++) lut[B.charCodeAt(k)] = k;
    const m = new Float32Array(MW * MH);
    let k = 0, x = 0, row = 0, cur = 0;
    while (k < LAND_RLE.length && row < MH) {
      let n = 0, sh = 0, d;
      do { d = lut[LAND_RLE.charCodeAt(k++)]; n |= (d & 31) << sh; sh += 5; } while (d & 32);
      if (cur) m.fill(1, row * MW + x, row * MW + x + n);
      x += n; cur ^= 1;
      if (x >= MW) { x = 0; row++; cur = 0; }
    }
    return m;
  }

  // ---------------------------------------------------------------------------
  // Biomes and lights (colour mode). Hand-placed, broad strokes: the climate belts
  // do most of the work, these blobs push the famous deserts and rainforests.
  // [lat, lon, radius°, weight]
  // ---------------------------------------------------------------------------
  const DESERTS = [
    [23, 6, 12, 0.55], [21, 25, 10, 0.5], [17, 0, 9, 0.18], [23, 46, 9, 0.5], [27, 70, 4, 0.35],
    [31, 58, 6, 0.38], [41, 84, 7, 0.45], [43, 104, 7, 0.42], [34, 86, 7, 0.12], [-25, 127, 11, 0.6],
    [-28, 139, 7, 0.38], [-24, 19, 6, 0.42], [32, -112, 6, 0.42], [-24, -69, 3, 0.45], [-45, -69, 5, 0.3],
    [7, 46, 5, 0.35], [46, 62, 9, 0.16],
  ];
  const WETS = [
    [-4, -62, 13, 0.6], [0, 22, 9, 0.55], [1, 112, 13, 0.55], [-4, 139, 6, 0.55], [24, 89, 5, 0.3],
    [27, 112, 9, 0.38], [60, 100, 18, 0.35], [56, -98, 14, 0.32], [50, 14, 11, 0.38], [37, -84, 9, 0.38],
    [-18, 48, 3, 0.3], [9, -80, 6, 0.4], [-17, 146, 3, 0.4], [9, 78, 5, 0.3], [13, 104, 6, 0.3],
    [-38, 146, 4, 0.3], [-42, 173, 5, 0.35], [20, 79, 9, 0.38], [18, 100, 7, 0.3], [-8, 112, 5, 0.3],
    [-12, 132, 4, 0.22], [-28, 152, 3, 0.3],
  ];
  // mountain belts (colour mode: umber rock, snow on the high ranges) [lat, lon, radius°, height]
  const MOUNTS = [
    [28, 84, 3.2, 0.95], [29, 80.5, 2.8, 0.85], [28.2, 88, 3, 0.95], [27.8, 92, 2.6, 0.8], [35.5, 76.5, 3.2, 0.95],
    [36, 71, 3, 0.75], [33.5, 86, 7, 0.42], [36, 95, 5, 0.38], [42, 80, 4, 0.6], [39, 73, 3, 0.7], [49, 88, 3.5, 0.5],
    [27, 100, 3.5, 0.55], [-5, -78.5, 2.5, 0.6], [-10, -76.5, 2.5, 0.7], [-16, -70, 3.5, 0.85], [-22, -67.5, 3.5, 0.75],
    [-28, -69.5, 2.5, 0.85], [-33, -70, 2.2, 0.95], [-40, -71.5, 2, 0.6], [-47, -73, 2, 0.65], [5, -75.5, 2.5, 0.5],
    [9, -71, 2, 0.4], [37, -106.5, 3.5, 0.6], [41, -110, 3, 0.55], [45, -112, 3.5, 0.55], [50, -116, 3, 0.6],
    [56, -125, 3, 0.55], [61, -145, 4, 0.65], [38, -119.5, 2.2, 0.55], [19, -99, 2.5, 0.45], [46.3, 9, 2.4, 0.75],
    [42.7, 0.5, 1.4, 0.45], [42.8, 44, 2, 0.65], [32, 51, 3, 0.42], [39, 38, 3.5, 0.35], [31.5, -6, 2.2, 0.5],
    [10, 38.5, 3.5, 0.55], [-3, 37, 2.5, 0.5], [-29.5, 29.5, 2, 0.35], [63, 12, 4, 0.45], [60, 59.5, 3, 0.28],
    [-5, 142, 3, 0.6], [36, 138, 1.8, 0.5], [-30, 151, 3, 0.25], [-36.5, 148, 1.8, 0.32], [-43.5, 170.5, 1.6, 0.55],
    [5.5, 116.5, 1.5, 0.35], [-2, 102, 2, 0.35], [-7.6, 110.5, 1.6, 0.3], [-8.2, 113.5, 1.4, 0.3],
  ];
  // where people live: regions seed small towns; metros are bright points
  const POP = [
    [-7, 110, 4, 1], [23, 80, 9, 0.9], [26, 85, 4, 0.7], [30, 72, 4, 0.6], [31, 115, 8, 0.9],
    [35.5, 137, 4, 0.9], [36.5, 127.5, 2.5, 0.8], [13, 122, 4, 0.6], [15, 103, 5, 0.55], [3, 102, 3, 0.6],
    [-32, 150.5, 3.5, 0.5], [-37.5, 145, 2.5, 0.5], [-32, 116, 1.5, 0.4], [49, 9, 11, 0.9], [52.5, -1.5, 3, 0.7],
    [55, 40, 6, 0.5], [39, 34, 5, 0.5], [33, 52, 5, 0.4], [29, 31, 2.5, 0.7], [8, 5, 5, 0.5],
    [39, -80, 8, 0.8], [42, -88, 5, 0.6], [35, -119, 3, 0.7], [31, -97, 4, 0.5], [20, -100, 4, 0.6],
    [-22, -46, 5, 0.8], [-34, -60, 3, 0.5], [5, -74, 3, 0.4], [-26, 28, 3, 0.4], [-1, 36.8, 3, 0.3],
    [25, 52, 3, 0.4], [-8.5, 117, 3, 0.4], [14, 39, 3, 0.25],
  ];
  const METROS = [
    [-7.25, 112.75, 1], [-6.2, 106.8, 1], [-6.9, 107.6, 0.7], [-7, 110.4, 0.6], [-7.8, 110.4, 0.5],
    [-7.98, 112.63, 0.5], [-8.65, 115.2, 0.5], [-5.15, 119.4, 0.4], [3.6, 98.7, 0.5], [-3, 104.8, 0.4],
    [35.7, 139.7, 1], [34.7, 135.5, 0.9], [35.2, 136.9, 0.7], [33.6, 130.4, 0.6], [37.5, 127, 0.9],
    [35.1, 129, 0.6], [31.2, 121.5, 1], [39.9, 116.4, 0.9], [23.1, 113.3, 1], [22.3, 114.2, 0.8],
    [30.6, 114.3, 0.7], [30.7, 104.1, 0.7], [29.6, 106.5, 0.6], [34.3, 108.9, 0.6], [25, 121.5, 0.7],
    [14.6, 121, 0.8], [10.3, 123.9, 0.4], [13.75, 100.5, 0.8], [3.1, 101.6, 0.8], [1.3, 103.8, 0.8],
    [10.8, 106.7, 0.7], [21, 105.8, 0.6], [16.8, 96.2, 0.5], [28.6, 77.2, 1], [19, 72.8, 0.9],
    [22.6, 88.4, 0.8], [23.8, 90.4, 0.8], [13, 80.2, 0.6], [12.9, 77.6, 0.6], [17.4, 78.5, 0.5],
    [24.9, 67, 0.7], [31.5, 74.3, 0.6], [26.9, 80.9, 0.5], [6.9, 79.9, 0.4], [-33.9, 151.2, 0.8],
    [-37.8, 145, 0.7], [-27.5, 153, 0.5], [-31.95, 115.86, 0.6], [-34.9, 138.6, 0.4], [-36.85, 174.8, 0.4],
    [35.7, 51.4, 0.6], [25.2, 55.3, 0.6], [24.7, 46.7, 0.5], [41, 29, 0.8], [39.93, 32.86, 0.5],
    [30, 31.2, 0.9], [6.5, 3.4, 0.7], [-1.3, 36.8, 0.4], [9, 38.7, 0.35], [-26.2, 28, 0.6],
    [55.75, 37.6, 0.9], [51.5, -0.1, 0.9], [48.86, 2.35, 0.9], [40.4, -3.7, 0.6], [41.9, 12.5, 0.6],
    [52.5, 13.4, 0.6], [45.5, 9.2, 0.6], [50.1, 8.7, 0.5], [52.4, 4.9, 0.5], [40.7, -74, 1],
    [41.9, -87.6, 0.7], [34, -118.2, 0.9], [37.7, -122.4, 0.6], [29.8, -95.4, 0.6], [43.7, -79.4, 0.6],
    [33.7, -84.4, 0.5], [25.8, -80.2, 0.5], [47.6, -122.3, 0.5], [19.4, -99.1, 0.9], [-23.5, -46.6, 1],
    [-22.9, -43.2, 0.7], [-34.6, -58.4, 0.8], [4.6, -74.1, 0.5], [-12, -77, 0.5], [-33.4, -70.6, 0.5],
  ];

  // Equirectangular textures, built once per page (size independent), in time
  // slices so the build never blocks the main thread for more than ~8 ms.
  const TW = 512, TH = 256;   // surface: [sea, ice, tone] + bio: [dry, shelf, lights], interleaved
  const CW = 320, CH = 160;   // clouds
  let TEX = null, TEXP = null;
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  const blobs = (list) => list.map(([lat, lon, r, w]) => {
    const c = Math.cos(lat * DEG);
    return { x: c * Math.cos(lon * DEG), y: c * Math.sin(lon * DEG), z: Math.sin(lat * DEG), k: 2 / ((r * DEG) * (r * DEG)), cmin: Math.cos(Math.min(PI, 3 * r * DEG)), w };
  });
  const blobSum = (B, px, py, pz) => {
    let s = 0;
    for (let q = 0; q < B.length; q++) {
      const b = B[q], c = px * b.x + py * b.y + pz * b.z;
      if (c > b.cmin) s += b.w * Math.exp(-(1 - c) * b.k);
    }
    return s;
  };

  async function buildTextures(H) {
    const t0 = performance.now();
    let work = 0, last = t0;
    const slice = async () => {
      const now = performance.now();
      if (now - last > 8) { work += now - last; await yieldNow(); last = performance.now(); }
    };
    const mask = decodeMask();
    // cells within 2° of a coastline: only these need the (costly) ragged-coast warp
    const coast = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const v = mask[y * MW + x];
      let edge = 0;
      for (let b = -2; b <= 2 && !edge; b++) for (let a = -2; a <= 2; a++) {
        const yy = clamp(y + b, 0, MH - 1), xx = (x + a + MW) % MW;
        if (mask[yy * MW + xx] !== v) { edge = 1; break; }
      }
      coast[y * MW + x] = edge;
    }
    const sampler = (arr) => (lonDeg, latDeg) => {
      let mx = lonDeg + 180 - 0.5, my = 90 - latDeg - 0.5;
      mx -= Math.floor(mx / MW) * MW; my = clamp(my, 0, MH - 1.001);
      const x0 = mx | 0, y0 = my | 0, fx = mx - x0, fy = my - y0, x1 = x0 + 1 === MW ? 0 : x0 + 1;
      const a = arr[y0 * MW + x0], b = arr[y0 * MW + x1], c = arr[(y0 + 1) * MW + x0], d = arr[(y0 + 1) * MW + x1];
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    const maskAt = sampler(mask);
    // separable box blur on the 1° mask, wrapped in longitude, clamped in latitude
    const blur = (src, r) => {
      const tmp = new Float32Array(MW * MH), out = new Float32Array(MW * MH), k = 1 / (2 * r + 1);
      for (let y = 0; y < MH; y++) {
        const o = y * MW;
        let s = 0;
        for (let a = -r; a <= r; a++) s += src[o + ((a + MW) % MW)];
        for (let x = 0; x < MW; x++) {
          tmp[o + x] = s * k;
          s += src[o + ((x + r + 1) % MW)] - src[o + ((x - r + MW) % MW)];
        }
      }
      for (let x = 0; x < MW; x++) for (let y = 0; y < MH; y++) {
        let s = 0;
        for (let b = -r; b <= r; b++) s += tmp[clamp(y + b, 0, MH - 1) * MW + x];
        out[y * MW + x] = s * k;
      }
      return out;
    };
    const contAt = sampler(blur(blur(mask, 5), 5));   // continentality, σ ≈ 4.5°
    const nearAt = sampler(blur(blur(mask, 1), 1));   // coastal shelf, σ ≈ 1°
    await slice();
    const n3 = H.noise3, f3 = H.fbm3;
    const BD = blobs(DESERTS), BW = blobs(WETS), BP = blobs(POP);
    const dryAt = (lat, alat, px, py, pz) => {
      let d = 0.2 + 0.38 * gauss((alat - 24) / 9) - 0.34 * gauss(lat / 9) - 0.2 * gauss((alat - 56) / 10);
      d += 0.26 * sstep(0.5, 0.97, contAt(Math.atan2(py, px) / DEG, lat));
      d += blobSum(BD, px, py, pz) - blobSum(BW, px, py, pz);
      return d;
    };

    const surf = new Float32Array(TW * TH * 3);
    const bio = new Float32Array(TW * TH * 3);
    const rel = new Float32Array(TW * TH * 3);   // colour only: [relief, snow, painterly variation]
    const BM = blobs(MOUNTS);
    for (let ty = 0; ty < TH; ty++) {
      const lat = 90 - ((ty + 0.5) / TH) * 180, cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG);
      const alat = Math.abs(lat);
      for (let tx = 0; tx < TW; tx++) {
        const lon = ((tx + 0.5) / TW) * 360 - 180;
        const px = cl * Math.cos(lon * DEG), py = cl * Math.sin(lon * DEG), pz = sl;
        let m;
        if (coast[Math.min(MH - 1, (90 - lat) | 0) * MW + Math.min(MW - 1, (lon + 180) | 0)]) {
          // ragged coastlines: warp the 1° mask by ~0.8°
          const wx = 0.85 * n3(px * 5.1 + 3.1, py * 5.1, pz * 5.1) + 0.35 * n3(px * 13, py * 13 + 1.7, pz * 13);
          const wy = 0.85 * n3(px * 5.1, py * 5.1 + 8.3, pz * 5.1) + 0.35 * n3(px * 13 + 4.4, py * 13, pz * 13);
          m = maskAt(lon + wx / Math.max(0.25, cl), lat + wy);
        } else m = maskAt(lon, lat);
        const land = sstep(0.32, 0.68, m);
        const det = land > 0 || lat > 74 ? f3(px * 3.2 + 9, py * 3.2, pz * 3.2, 3) : 0;
        // ice: Antarctica, Greenland, and the Arctic pack
        const ice = Math.max(land * sstep(60, 70, alat), sstep(77, 84, lat) * (0.85 + 0.15 * det), sstep(-70, -76, lat));
        const sea = (1 - land) * (1 - ice);
        // tone offsets (added to ink): forests a touch darker than deserts; a slow swell on the sea
        const toneLand = 0.05 * gauss(lat / 11) - 0.02 * gauss((alat - 24) / 8) + 0.03 * det;
        const toneSea = 0.035 * n3(px * 2.4, py * 2.4 + 5, pz * 2.4);
        const k = (ty * TW + tx) * 3;
        surf[k] = sea;
        surf[k + 1] = ice;
        surf[k + 2] = land * (1 - ice) * toneLand + sea * toneSea;
        // colour: dryness on land (0 forest … 1 desert), shelf on the sea (shallow near coasts)
        if (land > 0.01) bio[k] = clamp(dryAt(lat, alat, px, py, pz) + 0.16 * det + 0.06 * n3(px * 9, py * 9, pz * 9 + 3), 0, 1);
        if (sea > 0.01) bio[k + 1] = sea * sstep(0.03, 0.42, nearAt(lon, lat)) * (0.75 + 0.25 * n3(px * 6 + 2, py * 6, pz * 6));
        if (land > 0.01) {
          // relief: the ranges, roughened by ridged noise so they read as ridges, not blobs
          const rr = 1 - Math.abs(n3(px * 16 + 1.3, py * 16, pz * 16 + 2.1));
          const rr2 = 1 - Math.abs(n3(px * 37, py * 37 + 4.2, pz * 37));
          const mt = Math.min(1.2, blobSum(BM, px, py, pz));
          const relief = mt * (0.35 + 0.55 * rr * rr + 0.3 * rr2 * rr2);
          rel[k] = relief;
          // snow: the high ranges, lower toward the poles
          const snl = 0.3 * sstep(30, 62, alat);
          rel[k + 1] = sstep(0.56 - snl, 0.86 - snl, relief);
          // painterly variation inside a biome: dunes and plateaus, groves and clearings
          rel[k + 2] = 0.62 * n3(px * 7.3 + 5, py * 7.3, pz * 7.3) + 0.38 * n3(px * 19, py * 19 + 3, pz * 19 + 7);
        }
      }
      await slice();
    }

    // city lights: metros (bright, with satellite towns) + towns scattered where people live
    const splat = (lat, lon, s, rDeg) => {
      const cy = ((90 - lat) / 180) * TH - 0.5, cx = ((lon + 180) / 360) * TW - 0.5;
      const ry = rDeg / (180 / TH), rx = ry / Math.max(0.2, Math.cos(lat * DEG));
      const y0 = Math.max(0, Math.floor(cy - 2.2 * ry)), y1 = Math.min(TH - 1, Math.ceil(cy + 2.2 * ry));
      const x0 = Math.floor(cx - 2.2 * rx), x1 = Math.ceil(cx + 2.2 * rx);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, v = s * Math.exp(-(dx * dx + dy * dy));
        if (v < 0.02) continue;
        const k = (y * TW + ((x % TW) + TW) % TW) * 3 + 2;
        if (v > bio[k]) bio[k] = v;
      }
    };
    for (let k = 0; k < 16000; k++) {
      const h1 = H.hash2(k * 3 + 1, 401), h2 = H.hash2(k * 7 + 2, 977), h3 = H.hash2(k * 5 + 3, 59);
      const lat = Math.asin(2 * h1 - 1) / DEG, lon = 360 * h2 - 180;
      if (lat > 62 || lat < -46 || maskAt(lon, lat) < 0.6) continue;
      const cl = Math.cos(lat * DEG), px = cl * Math.cos(lon * DEG), py = cl * Math.sin(lon * DEG), pz = Math.sin(lat * DEG);
      const dry = clamp(dryAt(lat, Math.abs(lat), px, py, pz), 0, 1);
      const pop = Math.min(1, 0.035 + blobSum(BP, px, py, pz)) * (1 - 0.9 * dry * dry);
      if (h3 > pop * 0.75) continue;
      const h4 = H.hash2(k * 11 + 4, 13);
      splat(lat, lon, 0.4 + 0.5 * h4 * h4, 0.62 + 0.18 * h4);
    }
    for (let q = 0; q < METROS.length; q++) {
      const [lat, lon, s] = METROS[q];
      splat(lat, lon, 0.55 + 0.45 * s, 0.5 + 0.45 * s);
      const nt = 2 + Math.round(4 * s);
      for (let j = 0; j < nt; j++) {
        const a = TAU * H.hash2(q * 13 + j, 71), r = 0.8 + 1.6 * H.hash2(q * 7 + j, 23);
        splat(lat + r * Math.sin(a), lon + r * Math.cos(a) / Math.max(0.3, Math.cos(lat * DEG)), 0.35 + 0.4 * s * H.hash2(j, q), 0.6);
      }
    }
    await slice();

    // Cyclones: centres that twist the cloud field into spirals (counter-clockwise
    // in the north, clockwise in the south). Two are placed so a typhoon east of
    // the Philippines and a southern Indian Ocean low frame the clear window below.
    const cyc = [];
    const addCyc = (lat, lon, r, k) => {
      const c = Math.cos(lat * DEG);
      cyc.push({ x: c * Math.cos(lon * DEG), y: c * Math.sin(lon * DEG), z: Math.sin(lat * DEG), r: r * DEG, k: (lat > 0 ? 1 : -1) * k });
    };
    for (let k = 0; k < 16; k++) {
      const h1 = H.hash2(k * 17 + 3, 91), h2 = H.hash2(k * 5 + 1, 37), h3 = H.hash2(k * 11 + 7, 53);
      const tropical = k % 5 === 0;
      const lat = (h1 < 0.5 ? 1 : -1) * (tropical ? 9 + 12 * h2 : 34 + 26 * h2);
      const lon = -180 + 360 * ((k * 0.618034 + 0.13 * h3) % 1);
      if (Math.abs(lon - 112) < 40 && Math.abs(lat + 5) < 30) continue; // keep the home window clear
      addCyc(lat, lon, tropical ? 5 : 9 + 6 * h3, CLOUD_TWIST * (tropical ? 4.0 : 2.3 + 1.3 * h1));
    }
    addCyc(17, 141, 5.5, CLOUD_TWIST * 4.2);
    addCyc(-27, 72, 10, CLOUD_TWIST * 2.8);
    // home window (India, Java, Australia): at t = 0 the cloud frame equals the ground frame
    const hc = Math.cos(-6 * DEG), hx = hc * Math.cos(115 * DEG), hy = hc * Math.sin(115 * DEG), hz = Math.sin(-6 * DEG);
    const cloud = new Float32Array(CW * CH);
    for (let ty = 0; ty < CH; ty++) {
      const lat = 90 - ((ty + 0.5) / CH) * 180, cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG);
      const alat = Math.abs(lat);
      // where the weather lives: the ITCZ, the storm tracks; clear subtropical highs
      const band = CLOUD_BAND[0] * gauss(lat / 7) + CLOUD_BAND[1] * gauss((alat - 54) / 11)
        - CLOUD_BAND[2] * gauss((alat - 25) / 9) - 0.12 * sstep(70, 88, alat);
      for (let tx = 0; tx < CW; tx++) {
        const lon = ((tx + 0.5) / CW) * 360 - 180;
        let px = cl * Math.cos(lon * DEG), py = cl * Math.sin(lon * DEG), pz = sl;
        const hd = Math.acos(clamp(px * hx + py * hy + pz * hz, -1, 1)) / DEG;
        const clear = CLOUD_CLEAR * gauss(hd / 30);
        let boost = 0;
        for (let q = 0; q < cyc.length; q++) {
          const C = cyc[q];
          const cd = px * C.x + py * C.y + pz * C.z;
          if (cd < 0.82) continue;
          const ang = Math.acos(Math.min(1, cd)) / C.r;
          if (ang > 3) continue;
          const a = C.k * Math.exp(-ang * ang * 0.7), ca = Math.cos(a), sa = Math.sin(a);
          // Rodrigues rotation of p about the cyclone axis
          const kx = C.y * pz - C.z * py, ky = C.z * px - C.x * pz, kz = C.x * py - C.y * px;
          const nx = px * ca + kx * sa + C.x * cd * (1 - ca);
          const ny = py * ca + ky * sa + C.y * cd * (1 - ca);
          const nz = pz * ca + kz * sa + C.z * cd * (1 - ca);
          px = nx; py = ny; pz = nz;
          boost += 0.10 * Math.exp(-ang * ang * 0.5) - 0.16 * Math.exp(-ang * ang * 9); // dense ring, clear eye
        }
        const sz = pz * 1.9; // systems stretch east-west
        const wx = f3(px * 1.1 + 1.7, py * 1.1, sz * 1.1, 2), wy = f3(px * 1.1, py * 1.1 + 7.1, sz * 1.1, 2);
        const n = f3(px * CLOUD_FREQ + wx * 0.9, py * CLOUD_FREQ + wy * 0.9, sz * CLOUD_FREQ, 3, 2.1, 0.48);
        cloud[ty * CW + tx] = sstep(CLOUD_EDGE[0], CLOUD_EDGE[1], n + band + boost - clear);
      }
      await slice();
    }
    TEX = { surf, bio, rel, cloud, ms: work + performance.now() - last, wallMs: performance.now() - t0 };
    return TEX;
  }

  // Tone model. Ink (coverage) on the lit side as a function of the Lambert term:
  // ink = a + b·(1 − λ)^c, so the sub-solar point is the lightest place on the planet.
  const OCEAN = [0.44, 0.38, 1.1];
  const LAND = [0.0, 0.25, 1.6];
  const NIGHT = [0.95, 0.14];          // night ink, minus this much over land
  const TERM = [-0.14, 0.26];          // terminator: day weight = smoothstep over n·l
  const CLOUD_KO = [0.5, 0.42];        // cloud knockout strength at night, + extra by day
  const CLOUD_EDGE = [0.10, 0.42];     // cloud field threshold (texture build)
  const CLOUD_CLEAR = 0.24;            // thinning over the home window at t = 0
  const CLOUD_BAND = [-0.06, 0.14, 0.16]; // ITCZ, storm tracks, subtropical highs (clear)
  const CLOUD_TWIST = 0.6;               // cyclone twist scale
  const CLOUD_FREQ = 1.7;              // base frequency of the cloud field
  const CLOUD_CUT = [0.08, 1.0];       // per-dot edge of the knockout
  const CLOUD_BODY = 0.55;              // knockout share of a cloud's body vs its core
  // Colour mode: dot coverage = a + b·shade^c (+ limb), so the lit face breathes paper
  const OC_D = [0.44, 0.5, 1.15];
  const LAND_D = [0.6, 0.38, 1.2];
  // land light score weights [sun, limb, texture, relief, dither] and tone cut-offs [sunlit, mid]
  const LAND_V = [1.0, 1.2, 0.55, 0.3, 0.42, 0.93, 0.42];
  const LUT_N = 256;
  const OCEAN_LUT = new Float32Array(LUT_N + 1), LAND_LUT = new Float32Array(LUT_N + 1);
  for (let k = 0; k <= LUT_N; k++) {
    const q = 1 - k / LUT_N;
    OCEAN_LUT[k] = OCEAN[0] + OCEAN[1] * Math.pow(q, OCEAN[2]);
    LAND_LUT[k] = LAND[0] + LAND[1] * Math.pow(q, LAND[2]);
  }

  // Colour materials (palette indices)
  const M_NIGHT = 0, M_STAR = 1, M_ACC = 2, M_OC0 = 3, M_OC1 = 4, M_OC2 = 5, M_FOREST = 6, M_SAVANNA = 7,
    M_DESERT = 8, M_ICE = 9, M_SHADE = 10, M_CLOUD = 11, M_NCLOUD = 12, M_CITY = 13, M_ATMO = 14, M_BUS = 15, M_PANEL = 16, M_CBODY = 17,
    M_FOREST_L = 18, M_FOREST_D = 19, M_SAV_L = 20, M_SAV_D = 21, M_DES_L = 22, M_DES_D = 23, M_ROCK = 24, M_SHELF = 25, M_NLAND = 26;
  // land tones by biome (forest, savanna, desert) × light (sunlit, mid, shade)
  const LAND_C = [[M_FOREST_L, M_FOREST, M_FOREST_D], [M_SAV_L, M_SAVANNA, M_SAV_D], [M_DES_L, M_DESERT, M_DES_D]];

  // Wu-style line: split each sample's coverage between the two grid dots that
  // straddle it across the line's major axis. cb(index, weight, param).
  function wuSegment(P, x0, y0, x1, y1, a0, a1, cb) {
    const p = P.p, dx = x1 - x0, dy = y1 - y0;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const ca = (x0 - P.x0) / p, cb2 = (x1 - P.x0) / p;
      const lo = Math.ceil(Math.min(ca, cb2)), hi = Math.floor(Math.max(ca, cb2));
      for (let c = lo; c <= hi; c++) {
        const f = cb2 === ca ? 0 : (c - ca) / (cb2 - ca);
        const r = (y0 + f * dy - P.y0) / p, r0 = Math.floor(r), fr = r - r0, a = a0 + f * (a1 - a0);
        if (c < 0 || c >= P.cols) continue;
        if (r0 >= 0 && r0 < P.rows) cb(r0 * P.cols + c, 1 - fr, a);
        if (r0 + 1 >= 0 && r0 + 1 < P.rows) cb((r0 + 1) * P.cols + c, fr, a);
      }
    } else {
      const ra = (y0 - P.y0) / p, rb = (y1 - P.y0) / p;
      const lo = Math.ceil(Math.min(ra, rb)), hi = Math.floor(Math.max(ra, rb));
      for (let r = lo; r <= hi; r++) {
        const f = rb === ra ? 0 : (r - ra) / (rb - ra);
        const c = (x0 + f * dx - P.x0) / p, c0 = Math.floor(c), fc = c - c0, a = a0 + f * (a1 - a0);
        if (r < 0 || r >= P.rows) continue;
        if (c0 >= 0 && c0 < P.cols) cb(r * P.cols + c0, 1 - fc, a);
        if (c0 + 1 >= 0 && c0 + 1 < P.cols) cb(r * P.cols + c0 + 1, fc, a);
      }
    }
  }

  // The orbit for the current frame: the projected ellipse, one dot wide, Wu-split.
  function rasterOrbit(P) {
    const fr = P.fr, L = P.oList;
    for (let j = 0; j < L.length; j++) { const i = L[j]; P.ow[i] = 0; P.ohid[i] = 0; }
    L.length = 0;
    const proj = (th) => { const s = satDir(fr, th); return [P.cx + P.R * RO * s[0], P.cy - P.R * RO * s[1]]; };
    const NS = Math.ceil((TAU * P.R * RO) / (0.25 * P.p));
    let prev = proj(0);
    const mark = (i, wgt, th) => {
      if (wgt <= P.ow[i]) return;
      if (P.ow[i] === 0) L.push(i);
      P.ow[i] = wgt; P.oth[i] = th;
    };
    for (let k = 1; k <= NS; k++) {
      const th0 = ((k - 1) / NS) * TAU, th = (k / NS) * TAU, cur = proj(th);
      wuSegment(P, prev[0], prev[1], cur[0], cur[1], th0, th, mark);
      prev = cur;
    }
    // 360 screen samples of the visible orbit, for hit tests
    if (!P.oxy) P.oxy = new Float32Array(720);
    for (let k = 0; k < 360; k++) {
      const s = satDir(fr, (k / 360) * TAU), ox = P.cx + P.R * RO * s[0], oy = P.cy - P.R * RO * s[1];
      const hid = s[2] < 0 && (ox - P.cx) * (ox - P.cx) + (oy - P.cy) * (oy - P.cy) < P.R * P.R;
      P.oxy[2 * k] = hid ? -1e9 : ox; P.oxy[2 * k + 1] = oy;
    }
    const occ = P.R + 0.5 * P.p;
    for (let j = 0; j < L.length; j++) {
      const i = L[j];
      if (P.ow[i] <= 0.02) { P.ow[i] = 0; continue; }
      const s = satDir(fr, P.oth[i]);
      P.odp[i] = s[2];
      P.ohid[i] = s[2] < 0 && P.rp[i] < occ ? 1 : 0;
    }
    // colour mode: a paper gutter either side of the arc where it crosses the painted
    // globe, so the thin orange line reads as cut into the picture, not lost in it
    const M = P.om, ML = P.omList;
    for (let j = 0; j < ML.length; j++) M[ML[j]] = 0;
    ML.length = 0;
    for (let j = 0; j < L.length; j++) {
      const i = L[j];
      if (P.ow[i] < 0.5 || P.ohid[i] || P.kind[i] !== 1) continue;
      const ci = P.col[i], ri = P.row[i];
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        if (!a && !b) continue;
        const cc = ci + a, rr = ri + b;
        if (cc < 0 || rr < 0 || cc >= P.cols || rr >= P.rows) continue;
        const q = rr * P.cols + cc;
        if (P.ow[q] >= 0.5 || P.kind[q] !== 1) continue;
        const m = a && b ? 0.55 : 1;
        if (m > M[q]) { if (M[q] === 0) ML.push(q); M[q] = m; }
      }
    }
  }

  // Surface texel coordinates of every planet dot for the current frame.
  function remap(P) {
    const L = P.pl, fr = P.fr;
    if (fr.a === 0) { P.tx.set(P.tx0); P.ty.set(P.ty0); return; }
    const A = fr.AX, X = fr.E1, Y = fr.E2;
    for (let j = 0; j < L.length; j++) {
      const i = L[j], u = P.nu[i], v = P.nv[i], w = P.nw[i];
      const sl = u * A[0] + v * A[1] + w * A[2];
      const lat = Math.asin(sl > 1 ? 1 : sl < -1 ? -1 : sl);
      const lonV = Math.atan2(u * Y[0] + v * Y[1] + w * Y[2], u * X[0] + v * X[1] + w * X[2]);
      P.tx[i] = ((lonV + PI) / TAU) * TW - 0.5;
      const ty = ((PI / 2 - lat) / PI) * TH - 0.5;
      P.ty[i] = ty < 0 ? 0 : ty > TH - 1.001 ? TH - 1.001 : ty;
    }
  }

  // ---------------------------------------------------------------------------
  // Interaction state (survives resizes: kept on st._plI)
  // ---------------------------------------------------------------------------
  function newI() {
    return {
      spin: 0, w: 0, nudge: 0, tilt: 0, vt: 0, drag: false,
      bth: 0, bv: 0, bvT: 0, ackT0: -1e9, ackPend: -1e9,
      kick: null, ckT0: -1e9, ckX: 0, ckY: 0,   // boost while hidden: packet along the orbit, ring at the click
      pings: [], site: 0,
      last: 0, idleAmt: 0, idleT0: 0, beat: -1, px: -1e4, py: -1e4, hov: 0, hovT: 0,
      lx: -1e4, ly: -1e4, lfree: true,
    };
  }

  // A burst of speed. If it would leave EEPISAT behind the globe just while its trail is
  // longest (~1.5 τ in), it is carried on round the back instead, so it comes out on the
  // far side streaming the long trail: the payoff is never hidden.
  function boost(P, I, st, amt) {
    let a = Math.min(I.bvT + amt, BOOST * 1.6), tau = BOOST_TAU;
    const O = P && P.oxy, f = P && P.f;
    if (O && f && f.th != null) {
      const hid = (th) => { let k = Math.round((th / TAU) * 360) % 360; if (k < 0) k += 360; return O[2 * k] < -1e8; };
      const at = (a, tau) => f.th + W_SAT * tau * (0.777 * a + 1.5);   // where it is 1.5 τ in
      const th1 = at(a, tau);
      if (hid(th1)) {
        let th = th1, n = 0;
        while (hid(th) && n++ < 360) th += DEG;
        const need = th + 22 * DEG - f.th - W_SAT * tau * 1.5;
        const sc = Math.sqrt(Math.max(1, need / (W_SAT * tau * 0.777 * a)));
        a = Math.min(a * sc, BOOST * 2.4); tau = Math.min(tau * sc, 1.25);
      }
    }
    I.bvT = Math.max(I.bvT, a); I.btau = tau;
    I.ackT0 = st.now;
    // behind the globe it cannot be seen to answer: the ack is owed until it comes round
    if (P && satHidden(P)) I.ackPend = st.now;
  }
  // EEPISAT is behind the globe (last frame)
  const satHidden = (P) => { const f = P.f; return f.sw < 0 && (f.sx - P.cx) ** 2 + (f.sy - P.cy) ** 2 < f.occR2; };

  // Boost sent while EEPISAT is hidden: a packet runs along the visible orbit from orbit
  // sample k0 (degrees of θ) the short way toward the satellite, into the limb.
  function kick(P, I, st, k0) {
    const O = P.oxy, f = P.f;
    const ks = Math.round((f.th / TAU) * 360);
    let d = (ks - k0) % 360; if (d < 0) d += 360;
    const dir = d <= 180 ? 1 : -1;
    let n = 0;
    while (n < 360 && O[2 * ((((k0 + dir * n) % 360) + 360) % 360)] > -1e8) n++;
    const L = (3.2 * P.p) / (P.R * RO);                 // packet length (rad), ≈ 3 dots
    const span = n * DEG + L;                           // the tail slides in behind the limb too
    I.kick = { t0: st.now, th0: k0 * DEG, dir, span, L, T: clamp(span / KICK_W, 0.45, 0.9) };
  }

  // A ping at a view-space point n on the sphere (current frame + spin)
  const newPing = (lat, lon0, st, code) => ({ lat, lon0, t0: st.now, red: !!(st.reduced || st.still), upAt: -1, upOK: false,
    upS: -1, upLast: -1, aos: -1, los: -1, give: UP_GIVEUP, pend: false, code: code || '' });
  function pingAt(P, I, st, n) {
    const fr = P.fr;
    const lat = Math.asin(clamp(dot3(n, fr.AX), -1, 1));
    const lonV = Math.atan2(dot3(n, fr.E2), dot3(n, fr.E1));
    const pg = newPing(lat, lonV - P.f.phi, st, '');
    I.pings.push(pg);
    if (I.pings.length > 5) I.pings.shift();
    return pg;
  }
  function pingLatLon(P, I, st, latD, lonD, code) {
    I.pings.push(newPing(latD * DEG, lonD * DEG, st, code));
    if (I.pings.length > 5) I.pings.shift();
  }

  // the page's polite live region (hookPage), for outcomes the hand caused
  function say(st, msg) {
    const el = st._live;
    if (!el || !msg) return;
    if (el.textContent === msg) el.textContent = '';
    el.textContent = msg;
  }

  // What is under a point: 1 satellite or orbit, 2 globe, 0 nothing
  function hit(P, x, y) {
    const f = P.f, p = P.p, R = P.R;
    const satHid = f.sw < 0 && Math.hypot(f.sx - P.cx, f.sy - P.cy) < R;
    if (!satHid && Math.hypot(x - f.sx, y - f.sy) < Math.max(4.2 * p, 24)) return 1;
    let best = 1e9, bk = -1;
    const O = P.oxy;
    for (let k = 0; k < O.length; k += 2) {
      if (O[k] < -1e8) continue; // behind the planet
      const dd = Math.hypot(x - O[k], y - O[k + 1]);
      if (dd < best) { best = dd; bk = k >> 1; }
    }
    P.hitK = bk;                 // nearest visible orbit sample (degrees of θ)
    if (best < Math.max(2.3 * p, 13)) return 1;
    const u = (x - P.cx) / R, v = (P.cy - y) / R;
    return u * u + v * v < 1 ? 2 : 0;
  }

  // Dotted link between the satellite (ax, ay; S3 in planet radii) and a ground point g
  // (bx, by). Packets: phase = (a + shift) / 3, a = cells from the satellite. Only cells
  // within `reach` cells of the ground end are drawn (an uplink climbing).
  function drawLink(P, S3, g, ax, ay, bx, by, la, shift, reach, head) {
    const p = P.p, Lc = Math.hypot(bx - ax, by - ay) / p;
    for (let a = 3.0; a <= Lc - 1.9; a += 0.5) {
      if (Lc - a > reach) continue;
      const front = head && Lc - a > reach - 2;
      const u = a / Lc;
      const qu = S3[0] + u * (g[0] - S3[0]), qv = S3[1] + u * (g[1] - S3[1]), qw = S3[2] + u * (g[2] - S3[2]);
      if (qw < 0 && qu * qu + qv * qv < 1) continue;
      const x = ax + u * (bx - ax), y = ay + u * (by - ay);
      const c = Math.round((x - P.x0) / p), r = Math.round((y - P.y0) / p);
      if (c < 0 || r < 0 || c >= P.cols || r >= P.rows) continue;
      const i = r * P.cols + c;
      const ph = (a + shift) / 3, m = 0.5 + 0.5 * Math.cos(TAU * ph);
      const v = la * (front ? 0.86 : head ? 0.3 + 0.5 * m * m * m : 0.13 + 0.62 * m * m * m);
      if (v > P.lk[i]) { if (P.lk[i] === 0) P.lkList.push(i); P.lk[i] = v; }
    }
  }

  // ---------------------------------------------------------------------------
  // Page hooks (once per canvas). On the desktop hero the headline column is laid
  // over the left of the canvas: block boxes (.hero__inner, .hero__body, the full-width
  // title lines and flex rows) would swallow every pointer event over the globe. Let
  // events through everywhere except real glyphs, links and buttons, and keep a drag
  // that starts on the globe from selecting the headline it sweeps across.
  // The page cursor: over the canvas it gets .is-planet, so its label can follow what a
  // click will do (Drag / Boost) and, in colour mode, it turns from a difference-blend disc
  // (which repaints the globe in off-palette complements) into a paper reticle.
  // (The CSS belongs in main.css; injected here so the scene works on the page as shipped.
  // Once main.css carries it, set `--planet-css: 1` on :root there and this stops injecting.)
  // ---------------------------------------------------------------------------
  const HERO_PE = '@media (min-width: 1101px), (min-width: 761px) and (orientation: landscape){' +
    '.hero__inner,.hero__body,.hero__body *,.hero__title .line{pointer-events:none}' +
    '.hero__title:not(.hero__title--tone) .line>span,.hero__body a,.hero__body button,.hero__lede,' +
    '.hero__eyebrow>*,.hero__stats,.hero__scroll{pointer-events:auto}}';
  const CURSOR_CSS = '[data-ht-mode="color"] .cursor.is-planet,.cursor.is-planet.is-boost{mix-blend-mode:normal;' +
    'background:rgba(241,240,235,.16);box-shadow:inset 0 0 0 1.5px #F1F0EB,0 0 0 1px rgba(14,14,12,.3)}' +
    '[data-ht-mode="color"] .cursor.is-planet span,.cursor.is-planet.is-boost span{color:#0E0E0C;background:#F1F0EB;' +
    'padding:3px 6px 2px;border-radius:999px;box-shadow:0 0 0 1px rgba(14,14,12,.14)}';
  const KEYS_HINT = 'Arrow keys spin and tilt the globe. Enter pings the ground below the satellite ' +
    'EEPISAT, Space boosts it.';
  const hooked = new WeakSet();
  function hookPage(st) {
    const list = window.Halftone && window.Halftone.instances;
    if (!list || typeof document === 'undefined') return;
    let ht = null;
    list.forEach((h) => { if (h.st === st) ht = h; });
    if (!ht || !ht.o || !ht.o.autoplay || hooked.has(ht.c)) return;
    const c = ht.c;
    hooked.add(c);
    st._cv = c;
    c.style.userSelect = 'none';
    c.style.webkitUserSelect = 'none';
    // no text selection while the globe is held (focus stays native: no outline on click)
    const ptr = ht.st.pointer;
    document.addEventListener('selectstart', (e) => { if (ptr.down && !ht._dead) e.preventDefault(); });
    // the page cursor (main.js labels it on pointerover from data-cursor)
    const cur = document.querySelector('.cursor');
    if (cur) {
      st._cur = cur;
      st._curSpan = cur.querySelector('span');
      document.addEventListener('pointerover', (e) => {
        const on = e.target === c && !ht._dead;
        cur.classList.toggle('is-planet', on);
        if (!on) cur.classList.remove('is-boost');
        else cur.classList.toggle('is-boost', c.dataset.cursor === 'Boost');
      }, { passive: true });
    }
    // keyboard help for assistive tech, and a polite live region for outcomes
    const host = c.parentNode;
    if (host && !c.hasAttribute('aria-describedby')) {
      const id = (c.id || 'planet') + '-keys';
      const hint = document.createElement('span');
      hint.id = id; hint.hidden = true; hint.textContent = KEYS_HINT;
      const live = document.createElement('span');
      live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
      live.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
      host.appendChild(hint); host.appendChild(live);
      c.setAttribute('aria-describedby', id);
      st._live = live;
    }
    if (document.getElementById('planet-page-css')) return;
    const root = document.documentElement;
    if (getComputedStyle(root).getPropertyValue('--planet-css').trim() === '1') return;
    const s = document.createElement('style');
    s.id = 'planet-page-css';
    const hero = c.closest && c.closest('.hero');
    // the pointer-events pass-through only applies to the hero layout it was written for
    s.textContent = (hero && hero.querySelector('.hero__body') ? HERO_PE : '') + CURSOR_CSS;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------
  const scene = {
    layout: 'grid',
    palette: {
      mono: ['ink', 'muted', 'accent', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'accent', 'muted', 'accent', 'ink', 'ink',
        'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink'],
      color: ['#1E2052', '#A9B3C6', 'accent', '#4A93C2', '#2C6AA2', '#1C467C', '#2D6B45', '#8C9E4C', '#C9A262',
        '#FFFFFF', '#A9BACB', '#FFFFFF', '#34376F', '#FFC85C', '#58C6E2', '#F1B33C', '#172C5C', '#CFD9E3',
        '#5A9150', '#1D4A34', '#B2B36A', '#68783A', '#E4BF7E', '#A66C3C', '#7C6655', '#47A6B0', '#2B2E66'],
    },
    animated: true,
    interact: 'none',
    drag: 'x',
    cursor: 'Drag',
    label: 'Planet — drag to spin, click to ping',
    pitch(w, h) {
      if (w < 640) return 5;
      return clamp(Math.min(w, h) / 132, 6, 7);
    },

    /** Planet radius and centre for a canvas: shared by setup() and the page if it wants them. */
    layoutFor(w, h, p) {
      const mobile = w < 640;
      const m = Math.min(w, h);
      let R = (mobile ? 0.34 : 0.36 + 0.04 * sstep(1.15, 1.45, w / h)) * m;
      const kx = RO * Math.hypot(ORB_P[0], ORB_Q[0]), ky = RO * Math.hypot(ORB_P[1], ORB_Q[1]);
      if (mobile) {
        R = Math.min(R, (w / 2 - 22) / kx, (h / 2 - 16) / Math.max(1, ky));
        return { R, cx: w * 0.5, cy: h * 0.5 };
      }
      // left lobe keeps ≥ max(100, 0.1w) of paper toward the headline; right lobe ≥ 32 px
      const left = Math.max(100, 0.1 * w), right = Math.max(32, 4 * p);
      R = Math.min(R, (w - left - right) / (2 * kx), (h * 0.5 - 3 * p) / Math.max(1, ky));
      const hx = R * kx;
      const cx = clamp(w * 0.56, hx + left, w - hx - right);
      return { R, cx, cy: h * 0.5 };
    },

    async setup(st, H) {
      // textures are shared by every instance; the first setup builds them (time-sliced),
      // later setups (resizes) reuse them synchronously. Size is read after the await.
      const tex = TEX || (await (TEXP || (TEXP = buildTextures(H))));
      const { w, h, pitch: p } = st;
      const { n, xs, ys, cols, rows } = st.grid;
      const { R, cx, cy } = scene.layoutFor(w, h, p);
      if (!st._plI) st._plI = newI();
      hookPage(st);

      const P = {
        R, cx, cy, p, tex, x0: xs[0], y0: ys[0], cols, rows, n, fr: FR0,
        kind: new Uint8Array(n),          // 0 space, 1 planet, 2 atmosphere
        col: new Int16Array(n), row: new Int16Array(n), rp: new Float32Array(n),
        nu: new Float32Array(n), nv: new Float32Array(n), nw: new Float32Array(n),
        tx: new Float32Array(n), ty: new Float32Array(n), // surface texel coords at φ = 0 (current tilt)
        tx0: null, ty0: null,             // … at tilt 0
        pl: null,                         // indices of planet dots
        edge: new Float32Array(n),        // silhouette anti-alias
        limb: new Float32Array(n),        // limb darkening
        grain: new Float32Array(n),       // printed-paper texture
        hA: new Float32Array(n), hB: new Float32Array(n), hC: new Float32Array(n), // colour: per-dot dither thresholds
        rim: new Float32Array(n), eu: new Float32Array(n), ev: new Float32Array(n),
        star: new Float32Array(n), starW: new Float32Array(n), starPh: new Float32Array(n),
        ow: new Float32Array(n),           // orbit: Wu coverage weight
        oth: new Float32Array(n), odp: new Float32Array(n), // orbit: angle, depth (w)
        ohid: new Uint8Array(n), oList: [], // orbit dot hidden behind the planet; touched dots
        om: new Float32Array(n), omList: [], // colour: paper gutter along the arc over the globe
        lk: new Float32Array(n), lkList: [], // per frame: up/downlinks
        lkm: new Float32Array(n), lkmList: [], // colour: their gutter
        f: { stc: new Int32Array(6), str: new Int32Array(6), sta: new Float32Array(6), nst: 0, pg: [], np: 0, lab: [], nlab: 0, phi: 0, sx: -1e4, sy: -1e4, sw: 1 },
      };
      st._pl = P;

      const rimW = 2.2 * p;
      const pl = [];
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i];
        P.col[i] = i % cols; P.row[i] = (i / cols) | 0;
        const dx = x - cx, dy = y - cy, rp = Math.hypot(dx, dy);
        P.rp[i] = rp;
        const g = 0.045 * H.fbm2(x / 34 + 4.1, y / 34, 3) + 0.012 * (H.hash2(x * 3 + 11, y * 5 + 7) - 0.5);
        P.grain[i] = g;
        P.hA[i] = H.hash2(P.col[i] * 13 + 7, P.row[i] * 29 + 3);
        P.hB[i] = H.hash2(P.col[i] * 31 + 1, P.row[i] * 7 + 17);
        P.hC[i] = H.hash2(P.col[i] * 5 + 23, P.row[i] * 41 + 9);
        if (rp < R + 0.45 * p) {
          P.kind[i] = 1;
          pl.push(i);
          let u = dx / R, v = -dy / R;
          const r2 = u * u + v * v;
          if (r2 > 0.9995) { const s = Math.sqrt(0.9995 / r2); u *= s; v *= s; }
          const ww = Math.sqrt(Math.max(0, 1 - u * u - v * v));
          P.nu[i] = u; P.nv[i] = v; P.nw[i] = ww;
          P.edge[i] = sstep(R + 0.45 * p, R - 0.75 * p, rp);
          P.limb[i] = 0.72 + 0.28 * Math.sqrt(ww);
          const nv3 = [u, v, ww];
          const lat = Math.asin(clamp(dot3(nv3, AXIS), -1, 1));
          const lonV = Math.atan2(dot3(nv3, E2), dot3(nv3, E1));
          P.tx[i] = ((lonV + PI) / TAU) * TW - 0.5;
          P.ty[i] = clamp(((PI / 2 - lat) / PI) * TH - 0.5, 0, TH - 1.001);
        } else if (rp < R + rimW) {
          P.kind[i] = 2;
          P.rim[i] = 1 - (rp - R) / rimW;
          P.eu[i] = dx / rp; P.ev[i] = -dy / rp;
        }
      }
      P.pl = Int32Array.from(pl);
      P.tx0 = P.tx.slice(); P.ty0 = P.ty.slice();

      // orbit at rest (stars keep clear of it)
      rasterOrbit(P);
      const nearOrbit = new Uint8Array(n);
      for (const i of P.oList) {
        if (P.ow[i] <= 0) continue;
        const ci = P.col[i], ri = P.row[i];
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
          const cc = ci + a, rr = ri + b;
          if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) nearOrbit[rr * cols + cc] = 1;
        }
      }

      // --- stars: sparse, muted, a few a little larger ---
      for (let i = 0; i < n; i++) {
        if (P.kind[i] || nearOrbit[i]) continue;
        const ci = P.col[i], ri = P.row[i];
        if (P.rp[i] < R + 5 * p) continue;
        const hh = H.hash2(ci * 7 + 13, ri * 11 + 5);
        if (hh < 0.0105) {
          const big = hh < 0.0018;
          const h2 = H.hash2(ci * 3 + 1, ri * 17 + 2), h3 = H.hash2(ci * 19 + 4, ri * 5 + 9);
          P.star[i] = big ? 0.20 + 0.14 * h2 : 0.035 + 0.075 * h2;
          P.starW[i] = 0.6 + 1.6 * h3;
          P.starPh[i] = TAU * h2;
        }
      }
      // the frame state needs one pass before update()/hit() can use it
      scene._frame(P, st.t, st);
    },

    // -------------------------------------------------------------------------
    // Interaction: springs, inertia, timelines. Runs once per frame before sampling.
    // -------------------------------------------------------------------------
    update(st, dt, H) {
      const I = st._plI || (st._plI = newI());
      const P = st._pl;
      if (!P) return;
      const ptr = st.pointer, now = st.now, red = st.reduced || !!st.still;
      const R = P.R;
      let busy = false;

      // input bookkeeping: any pointer movement over the canvas holds off the ghost
      if (ptr.down || (ptr.inside && (Math.abs(ptr.x - I.px) > 0.5 || Math.abs(ptr.y - I.py) > 0.5))) I.last = now;
      if (ptr.down) I.nudge = 0;
      const moved = Math.abs(ptr.x - I.px) > 0.5 || Math.abs(ptr.y - I.py) > 0.5;
      I.px = ptr.x; I.py = ptr.y;
      const idle = !red && now - I.last > 3 && !ptr.down;
      if (idle && I.idleAmt === 0) { I.idleT0 = now; I.beat = -1; }
      if (dt > 0) {
        I.idleAmt += ((idle ? 1 : 0) - I.idleAmt) * (1 - Math.exp(-dt * (idle ? 0.7 : 5)));
        if (!idle && I.idleAmt < 0.003) I.idleAmt = 0;
      }

      // spin (longitude) and tilt (axis): drag follows the hand, then inertia / spring
      if (ptr.down && ptr.moved) {
        // a fling only counts if the hand was still moving (held still = no inertia)
        const fresh = performance.now() - ptr.lastT < 90;
        I.spin += ptr.dx / R;
        if (dt > 0) I.w = fresh ? clamp(ptr.vx / R, -W_MAX, W_MAX) : 0;
        let dy = ptr.dy / R;
        // rubber band past the limit: resistance grows toward an asymptote at 1.4× the limit
        if ((I.tilt > TILT_LIM && dy > 0) || (I.tilt < -TILT_LIM && dy < 0)) dy *= 0.3 * Math.max(0, 1 - (Math.abs(I.tilt) - TILT_LIM) / (0.4 * TILT_LIM));
        I.tilt = clamp(I.tilt + dy, -TILT_LIM * 1.4, TILT_LIM * 1.4);
        if (dt > 0) I.vt = fresh ? clamp(ptr.vy / R, -3, 3) : 0;
        I.drag = true;
        busy = true;
      } else if (dt > 0) {
        if (I.drag) { I.drag = false; if (red) { I.w *= 0.4; I.vt = 0; } }
        if (I.nudge > 0) { // the ghost's flick ramps in like a hand would
          const inj = I.nudge * (1 - Math.exp(-dt * 3.2));
          I.w += inj; I.nudge = I.nudge - inj < 0.003 ? 0 : I.nudge - inj;
          busy = true;
        }
        if (I.w !== 0) {
          I.spin += I.w * dt;
          I.w *= Math.exp(-dt * (red ? 5 : FRICTION));
          if (Math.abs(I.w) < 0.004) I.w = 0; else busy = true;
        }
        const sway = idle ? I.idleAmt * 3.2 * DEG * Math.sin(0.5 * (now - I.idleT0)) : 0;
        const K = SPRING[0], C = red ? 2 * Math.sqrt(K) : SPRING[1];
        const steps = Math.max(1, Math.ceil(dt / 0.01)), hh = dt / steps;
        for (let s = 0; s < steps; s++) {
          let a = -K * (I.tilt - sway) - C * I.vt;
          if (I.tilt > TILT_LIM) a -= 300 * (I.tilt - TILT_LIM); else if (I.tilt < -TILT_LIM) a -= 300 * (I.tilt + TILT_LIM);
          I.vt += a * hh; I.tilt += I.vt * hh;
        }
        if (Math.abs(I.tilt - sway) < 2e-4 && Math.abs(I.vt) < 2e-3 && sway === 0) { I.tilt = 0; I.vt = 0; }
        else if (sway === 0) busy = true;
      }

      // satellite boost: extra speed follows its target fast, the target decays
      if (dt > 0 && (I.bvT > 0 || I.bv > 0)) {
        I.bv += (I.bvT - I.bv) * (1 - Math.exp(-dt * 14));
        I.bvT *= Math.exp(-dt / (I.btau || BOOST_TAU));
        I.bth += I.bv * W_SAT * dt;
        if (I.bvT < 0.003 && I.bv < 0.003) { I.bv = 0; I.bvT = 0; } else busy = true;
      }

      // pings and acknowledgements: keep frames coming while anything plays. When the first
      // ring sweeps under EEPISAT (and we can see it), the satellite answers.
      const f = P.f, satVis = !satHidden(P);
      // an ack owed while EEPISAT was behind the globe is paid as it comes round
      if (satVis && now - I.ackPend < ACK_PEND) { I.ackT0 = now; I.ackPend = -1e9; }
      if (now - I.ackPend < ACK_PEND) busy = true;
      for (let q = I.pings.length - 1; q >= 0; q--) {
        const pg = I.pings[q], age = now - pg.t0;
        if (age > PING_LIFE) { I.pings.splice(q, 1); continue; }
        if (age < 4.4 || now - pg.aos < LABEL_LIFE || now - pg.los < LOS_LIFE || (pg.pend && age < pg.give + 0.6)) busy = true;
        // fallback ack (no uplink possible from there): when the first ring sweeps under EEPISAT
        if (!pg.acked && !pg.upOK && age > 0.1 && age < PING_DUR && f.s3) {
          const c = geo(P.fr, pg.lat, pg.lon0 + f.phi);
          const ang = Math.acos(clamp(dot3(c, f.s3), -1, 1));
          if (ang < PING_RMAX && PING_RMAX * (1 - (1 - age / PING_DUR) ** 2) >= ang) {
            pg.acked = true;
            if (satVis) { I.ackT0 = now; pg.aos = now; if (!pg.code) say(st, 'EEPISAT heard the ping.'); }
          }
        }
        // no contact: the marker says so (LOS) as soon as neither an uplink nor the rings can
        // reach EEPISAT in time, or when a waiting ping's window closes
        if (!pg.code && pg.aos < 0 && pg.los < 0 && pg.upAt < 0) {
          let lost = age >= pg.give;
          // an uplink was climbing but EEPISAT set before it arrived
          if (!lost && !pg.pend && pg.upS >= 0 && now - pg.upLast > 0.35) lost = true;
          if (!lost && !pg.pend && pg.upS < 0 && age >= 1.2) {
            lost = age >= PING_DUR;
            if (!lost && f.s3) {
              const c = geo(P.fr, pg.lat, pg.lon0 + f.phi);
              const ang = Math.acos(clamp(dot3(c, f.s3), -1, 1));
              lost = ang > PING_RMAX + W_SAT * (1 + I.bv) * (PING_DUR - age) + 4 * DEG;
            }
          }
          if (lost) { pg.los = now; say(st, 'No contact: EEPISAT is below the horizon there.'); }
        }
      }
      if (now - I.ackT0 < 0.9) busy = true;
      // boost sent while hidden: the packet's run and the ring at the click
      if (I.kick) { if (now - I.kick.t0 > I.kick.T + 0.1) I.kick = null; else busy = true; }
      if (now - I.ckT0 < 0.7) busy = true;

      // sun lean target: follows the cursor, held while dragging, and glides back to the
      // cursor after a release (no jump of the terminator the moment the hand lets go)
      if (ptr.down) I.lfree = false;
      else if (I.lfree || dt === 0 || I.lx < -1e3 || st.mk < 0.02) { I.lx = st.mx; I.ly = st.my; I.lfree = true; }
      else {
        const k = 1 - Math.exp(-dt * 3);
        I.lx += (st.mx - I.lx) * k; I.ly += (st.my - I.ly) * k;
        if (Math.abs(st.mx - I.lx) < 0.5 && Math.abs(st.my - I.ly) < 0.5) I.lfree = true; else busy = true;
      }

      // hover: the orbit brightens when the pointer is near enough to boost it
      if (moved || ptr.down) I.hovT = !ptr.down && ptr.inside && hit(P, ptr.x, ptr.y) === 1 ? 1 : 0;
      if (dt > 0) {
        const hv = I.hov + ((I.hovT || 0) - I.hov) * (1 - Math.exp(-dt * 9));
        I.hov = Math.abs(hv - (I.hovT || 0)) < 0.004 ? (I.hovT || 0) : hv;
        if (I.hov !== (I.hovT || 0)) busy = true;
      }
      // the page cursor names what a click will do here
      const cv = st._cv;
      if (cv) {
        const want = I.hovT === 1 ? 'Boost' : 'Drag';
        if (cv.dataset.cursor !== want) {
          cv.dataset.cursor = want;
          const cur = st._cur, sp = st._curSpan;
          if (cur && sp && cur.classList.contains('is-planet') && cur.classList.contains('is-label')) sp.textContent = want;
          // over the orbit the cursor becomes a reticle (mono too), so the arc stays orange under it
          if (cur) cur.classList.toggle('is-boost', want === 'Boost');
        }
      }

      // idle ghost: one gentle gesture every BEAT seconds — ping one of the owner's places,
      // nudge the globe, ping again, boost the satellite
      if (idle && I.idleAmt > 0.3) {
        const k = Math.floor((now - I.idleT0 - 2) / BEAT);
        const kind = k % 4;
        // the boost waits (within its beat) for EEPISAT to come round from behind the globe
        const wait = kind === 3 && !satVis && now - I.idleT0 - 2 - k * BEAT < BEAT - 0.6;
        if (k > I.beat && !wait) {
          I.beat = k;
          if (kind === 0 || kind === 2) {
            const phi = P.f.phi;
            let done = false;
            for (let j = 0; j < SITES.length && !done; j++) {
              const q = (I.site + j) % SITES.length, [la, lo, code] = SITES[q];
              const g = geo(P.fr, la * DEG, lo * DEG + phi);
              if (g[2] > 0.38) { pingLatLon(P, I, st, la, lo, code); I.site = q + 1; done = true; }
            }
            if (!done) pingAt(P, I, st, norm3([-0.3, 0.12, 0.95]));
          } else if (kind === 1) I.nudge = 0.42;
          else boost(P, I, st, BOOST * 0.7);
        }
      }
      st.busy = busy || st.busy;
    },

    onClick(x, y, st) {
      const P = st._pl, I = st._plI;
      if (!P || !I) return;
      I.last = st.now;
      const h = hit(P, x, y);
      if (h === 1) {
        const hid = satHidden(P);
        boost(P, I, st, BOOST);
        // it is behind the globe: show the command going out (ring at the click, a packet
        // running along the orbit after it); the satellite answers as it comes round
        if (hid) {
          I.ckT0 = st.now; I.ckX = x; I.ckY = y;
          if (P.hitK >= 0 && !(st.reduced || st.still)) kick(P, I, st, P.hitK);
        }
        say(st, hid ? 'Boost sent: EEPISAT is behind the globe and answers as it comes round.' : 'EEPISAT boosted.');
      } else if (h === 2) {
        const u = (x - P.cx) / P.R, v = (P.cy - y) / P.R;
        pingAt(P, I, st, [u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v))]);
      }
    },

    onKey(key, st) {
      const P = st._pl, I = st._plI;
      if (!P || !I) return false;
      I.last = st.now;
      switch (key) {
        case 'ArrowLeft': I.w = clamp(I.w - 0.5, -W_MAX, W_MAX); return true;
        case 'ArrowRight': I.w = clamp(I.w + 0.5, -W_MAX, W_MAX); return true;
        case 'ArrowUp': I.vt -= 2.4; return true;
        case 'ArrowDown': I.vt += 2.4; return true;
        case 'Enter': {
          // the sub-satellite point; round the back it swings onto the face, just inside the
          // limb nearest the satellite, so the rings and the marker are always seen. Behind
          // the globe it is called from where it will come out, so the answer appears there.
          const s = P.f.s3, hid = satHidden(P);
          let n = s[2] < ENTER_W ? norm3([s[0], s[1], ENTER_W]) : norm3(s), m = 0;
          if (hid) {
            const O = P.oxy;
            let k = Math.round((P.f.th / TAU) * 360);
            while (m < 360 && O[2 * (((k % 360) + 360) % 360)] < -1e8) { k++; m++; }
            k = ((k % 360) + 360) % 360;
            const du = O[2 * k] - P.cx, dv = P.cy - O[2 * k + 1], l = Math.hypot(du, dv) || 1;
            n = norm3([du / l, dv / l, ENTER_W]);
          }
          const pg = pingAt(P, I, st, n);
          // it always answers: at once if the uplink reaches it, else as it comes round
          pg.pend = true; pg.give = UP_WAIT;
          // hidden, it cannot hear us yet: a light boost brings it round sooner (with motion
          // reduced the satellite only moves when pushed, so the push carries it all the way out)
          if (hid) {
            const red = st.reduced || st.still;
            boost(P, I, st, red ? clamp(((m + 14) * DEG) / (BOOST_TAU * W_SAT), BOOST * 0.4, BOOST * 1.6) : BOOST * 0.4);
          }
          say(st, hid ? 'Ping sent: EEPISAT is behind the globe and answers as it comes round.' : 'Ping sent below EEPISAT.');
          return true;
        }
        case ' ': case 'Spacebar': {
          const hid = satHidden(P);
          boost(P, I, st, BOOST);
          if (hid && !(st.reduced || st.still)) {
            // chase it along the trail into the limb where it went
            const O = P.oxy, ks = Math.round((P.f.th / TAU) * 360);
            let k = ks, n = 0;
            while (n++ < 360 && O[2 * (((k % 360) + 360) % 360)] < -1e8) k--;
            kick(P, I, st, ((k - 70) % 360 + 360) % 360);
          }
          say(st, hid ? 'Boost sent: EEPISAT is behind the globe and answers as it comes round.' : 'EEPISAT boosted.');
          return true;
        }
        default: return false;
      }
    },

    // Per-frame state, computed once when the engine asks for dot 0.
    _frame(P, t, st) {
      const f = P.f, p = P.p, R = P.R;
      const I = st._plI || (st._plI = newI());
      const now = st.now;
      f.col = st.mode === 'color';
      if (P.fr.a !== I.tilt && (Math.abs(P.fr.a - I.tilt) > 1.5e-4 || I.tilt === 0)) {
        P.fr = I.tilt === 0 ? FR0 : makeFrame(I.tilt);
        remap(P);
        rasterOrbit(P);
      }
      const fr = P.fr;

      let Lu = SUN[0], Lv = SUN[1], Lw = SUN[2];
      if (st.mk > 0.001) {
        const mx = I.lx > -1e3 ? I.lx : st.mx, my = I.ly > -1e3 ? I.ly : st.my;
        const du = clamp((mx - P.cx) / (1.4 * R), -1, 1), dv = clamp((P.cy - my) / (1.4 * R), -1, 1);
        Lu += st.mk * 0.42 * du; Lv += st.mk * 0.42 * dv;
        const l = Math.hypot(Lu, Lv, Lw); Lu /= l; Lv /= l; Lw /= l;
      }
      f.Lu = Lu; f.Lv = Lv; f.Lw = Lw;
      const hl = Math.hypot(Lu, Lv, Lw + 1);
      f.Hu = Lu / hl; f.Hv = Lv / hl; f.Hw = (Lw + 1) / hl;

      const K = kin(t, I, fr);
      f.phi = K.phi;
      f.shiftS = (K.phi / TAU) * TW;
      f.shiftC = ((SAT0.phi + W_CLOUD * t + I.spin) / TAU) * CW;
      f.th = K.th - Math.floor(K.th / TAU) * TAU;
      const s = K.s;
      f.s3 = s;
      f.sx = P.cx + R * RO * s[0]; f.sy = P.cy - R * RO * s[1]; f.sw = s[2];
      // bus: the 2×2 block of cells centred nearest the satellite
      f.bc = Math.round((f.sx - P.x0) / p - 0.5);
      f.br = Math.round((f.sy - P.y0) / p - 0.5);
      f.occR2 = (R + 0.5 * p) * (R + 0.5 * p);
      // boost: a longer, brighter trail; hover: the whole ring a touch brighter
      const bAmt = clamp(I.bv / BOOST, 0, 1.4);
      f.trail = TRAIL * (1 + 1.25 * Math.min(1, bAmt));
      f.oLift = 0.16 * I.hov + 0.06 * Math.min(1, bAmt);

      // ground stations: Surabaya (0) + ping markers
      const g = K.g;
      f.nst = 0;
      const addStation = (gv, a) => {
        const k = f.nst++;
        f.sta[k] = a * sstep(0.03, 0.22, gv[2]);
        f.stc[k] = Math.round((P.cx + R * gv[0] - P.x0) / p);
        f.str[k] = Math.round((P.cy - R * gv[1] - P.y0) / p);
      };
      addStation(g, 1);

      // clear last frame's links
      for (const i of P.lkList) P.lk[i] = 0;
      P.lkList.length = 0;
      const S3 = [RO * s[0], RO * s[1], RO * s[2]];

      // downlink: satellite -> Surabaya while it is above the station's 10° mask
      f.el = K.el;
      const la = f.sta[0] * sstep(MASK, MASK + 5 * DEG, K.el);
      f.linkA = la;
      if (la > 0.001) drawLink(P, S3, g, f.sx, f.sy, P.cx + R * g[0], P.cy - R * g[1], la, -2 * t, 1e9);

      // pings: rings on the sphere, a station marker, an uplink if EEPISAT is in view
      f.np = 0;
      f.ackA = 0;
      f.labA = 0;
      f.nlab = 0;
      const satHid = f.sw < 0 && (f.sx - P.cx) ** 2 + (f.sy - P.cy) ** 2 < f.occR2;
      const wdU = 0.62 * p / R;               // ring half-width (gauss σ) in sphere units at the centre
      for (let q = 0; q < I.pings.length; q++) {
        const pg = I.pings[q], age = now - pg.t0;
        if (age < 0) continue;
        const c = geo(fr, pg.lat, pg.lon0 + K.phi);
        // marker: pops in, holds, fades
        const ma = sstep(0, 0.25, age) * (1 - sstep(PING_LIFE - 2, PING_LIFE, age));
        const added = f.nst < 6;
        if (added) addStation(c, ma);
        // a tag beside the marker, printed column by column: a ghost ping names its place
        // (callsign); a hand ping reports the pass, AOS (contact) or LOS (below the horizon)
        if (added && c[2] > 0.12 && f.nlab < 3) {
          let code = '', la = -1, life = LABEL_LIFE, m = M_ACC;
          if (pg.code) { code = pg.code; la = age; }
          else if (pg.aos >= 0) { code = 'AOS'; la = now - pg.aos + 0.2; }
          else if (pg.los >= 0) { code = 'LOS'; la = now - pg.los + 0.2; life = LOS_LIFE; m = M_NIGHT; }
          if (code && la < life) {
            const L = code === pg.labCode ? pg.lab : (pg.labCode = code, pg.lab = labelBits(code));
            const sc = f.stc[f.nst - 1], sr = f.str[f.nst - 1];
            const a = sstep(0.2, 0.45, la) * (1 - sstep(life - 0.8, life, la)) * sstep(0.12, 0.26, c[2]);
            if (a > 0.01) {
              const T = f.lab[f.nlab] || (f.lab[f.nlab] = {});
              T.a = a; T.w = L.w; T.bits = L.bits; T.m = m;
              T.c0 = c[0] > 0.3 ? sc - 3 - L.w + 1 : sc + 3;
              T.r0 = sr - 2;
              T.n = pg.red ? L.w : Math.max(0, Math.floor((la - 0.25) / 0.06) + 1);
              f.nlab++;
              if (a > f.labA) f.labA = a;
            }
          }
        }
        if (age < PING_DUR + 1.2) {
          const G = f.pg[f.np] || (f.pg[f.np] = { x: 0, y: 0, z: 0, cmin: 1, n: 0, r: new Float32Array(3), a: new Float32Array(3), fa: 0, fw: 0, wd: wdU });
          G.x = c[0]; G.y = c[1]; G.z = c[2]; G.wd = wdU;
          const nr = pg.red ? 1 : 3;
          let rmax = 0;
          G.n = 0;
          for (let k = 0; k < nr; k++) {
            const u = (age - k * PING_GAP) / PING_DUR;
            if (u <= 0 || u >= 1) continue;
            const r = PING_RMAX * (1 - (1 - u) * (1 - u)); // quadratic: the three rings stay apart
            const a = (1 - u) * (1 - u) * sstep(0, 0.05, u) * (k === 0 ? 1 : 0.8);
            G.r[G.n] = r; G.a[G.n] = a; G.n++;
            if (r > rmax) rmax = r;
          }
          G.fa = age < 0.38 ? 1 - age / 0.38 : 0;
          G.fw = 1.5 * p / R;
          G.cmin = Math.cos(Math.min(PI, rmax + 4 * wdU));
          if (G.n || G.fa > 0) f.np++;
        }
        // uplink: from the new station up to EEPISAT, if it is above the horizon there. The
        // front climbs ~2× faster than the satellite flies, so it always catches it; on arrival
        // EEPISAT answers (the ack ring) and the link holds a moment with packets streaming up.
        // A ping that went out while EEPISAT was hidden (Enter) waits for it: as it comes round
        // the uplink climbs if the station can see it, otherwise it answers straight away.
        if (c[2] > 0.03 && (pg.upAt < 0 ? age < pg.give : now - pg.upAt < UP_HOLD + 0.6)) {
          const el = elevation(S3, c);
          if (el > 2 * DEG && !satHid) {
            pg.upOK = true; pg.upLast = now;
            if (pg.upS < 0) pg.upS = Math.max(now, pg.t0 + UP_DELAY);
            const bx = P.cx + R * c[0], by = P.cy - R * c[1];
            const Lc = Math.hypot(bx - f.sx, by - f.sy) / p;
            let ua = sstep(2 * DEG, 6 * DEG, el) * sstep(0.03, 0.2, c[2]), reach = 1e9;
            if (pg.upAt < 0) {
              // the front climbs at UP_SPEED, or faster on a long link: it always arrives within
              // UP_RISE (a low pass sets fast; the radio itself is instant)
              const ut = Math.max(0, now - pg.upS);
              reach = Math.max(UP_SPEED * ut, Lc * ut / UP_RISE);
              if (reach >= Lc - 3.2 && ua > 0.05) {
                pg.upAt = now; pg.acked = true; I.ackT0 = now; reach = 1e9;
                if (pg.aos < 0) { pg.aos = now; if (!pg.code) say(st, 'AOS: EEPISAT acknowledged the uplink.'); }
              } else ua *= 1 - sstep(pg.give - 0.6, pg.give, age);
            } else ua *= 1 - sstep(UP_HOLD, UP_HOLD + 0.6, now - pg.upAt);
            if (ua > 0.001) drawLink(P, S3, c, f.sx, f.sy, bx, by, ua, UP_PKT * age, reach, reach < 1e8);
          } else if (pg.pend && !satHid && pg.aos < 0 && age > 0.15) {
            pg.acked = true; pg.aos = now; I.ackT0 = now;
            say(st, 'AOS: EEPISAT came round and answered.');
          }
        }
      }
      // colour: a paper gutter beside the links where they cross the painted globe
      for (let j = 0; j < P.lkmList.length; j++) P.lkm[P.lkmList[j]] = 0;
      P.lkmList.length = 0;
      if (f.col) {
        for (let j = 0; j < P.lkList.length; j++) {
          const i = P.lkList[j], ci = P.col[i], ri = P.row[i];
          for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
            const cc = ci + a, rr = ri + b;
            if ((!a && !b) || cc < 0 || rr < 0 || cc >= P.cols || rr >= P.rows) continue;
            const q = rr * P.cols + cc;
            if (P.lk[q] > 0 || P.kind[q] !== 1) continue;
            const m = (a && b ? 0.55 : 1) * Math.min(1, 1.6 * P.lk[i]);
            if (m > P.lkm[q]) { if (P.lkm[q] === 0) P.lkmList.push(q); P.lkm[q] = m; }
          }
        }
      }
      // the satellite acknowledges (a boost, or an uplink arriving): a ring that opens around it
      const ackAge = now - I.ackT0;
      if (ackAge >= 0 && ackAge < 0.9 && !satHid) {
        const u = ackAge / 0.9;
        f.ackA = (1 - u) * (1 - u);
        f.ackR = 3.2 + 6.5 * easeOut(u);
        f.ackX = (f.sx - P.x0) / p; f.ackY = (f.sy - P.y0) / p;
      }
      // boost sent while hidden: a small ring where the orbit was clicked …
      f.ckA = 0;
      const ckAge = now - I.ckT0;
      if (ckAge >= 0 && ckAge < 0.6) {
        const u = ckAge / 0.6;
        f.ckA = 0.95 * (1 - u) * (1 - u);
        f.ckR = 1.3 + 3.4 * easeOut(u);
        f.ckX = (I.ckX - P.x0) / p; f.ckY = (I.ckY - P.y0) / p;
      }
      // … and a packet running along the orbit after the satellite, into the limb
      f.kA = 0;
      const kk = I.kick;
      if (kk) {
        const u = clamp((now - kk.t0) / kk.T, 0, 1);
        if (u < 1) {
          f.kA = sstep(0, 0.08, u);
          f.kH = kk.th0 + kk.dir * kk.span * (0.35 * u + 0.65 * u * u); // it is being pushed: picks up speed
          f.kDir = kk.dir; f.kL = kk.L;
        }
      }
    },

    sample(x, y, t, st, out, i) {
      const P = st._pl;
      if (i === 0) scene._frame(P, t, st);
      const f = P.f, colr = f.col;
      const k = P.kind[i];
      let d = 0, c = 0;

      if (k === 1) {
        const nu = P.nu[i], nv = P.nv[i], nw = P.nw[i];
        // surface (bilinear, wrapped in longitude)
        let X = P.tx[i] - f.shiftS; X -= Math.floor(X / TW) * TW;
        const Y = P.ty[i];
        let x0 = X | 0; const fx = X - x0, y0 = Y | 0, fy = Y - y0;
        let x1 = x0 + 1; if (x1 === TW) x1 = 0;
        const S = P.tex.surf, r0 = y0 * TW, r1 = r0 + TW;
        const a0 = (r0 + x0) * 3, a1 = (r0 + x1) * 3, b0 = (r1 + x0) * 3, b1 = (r1 + x1) * 3;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const sea = S[a0] * w00 + S[a1] * w10 + S[b0] * w01 + S[b1] * w11;
        const ice = S[a0 + 1] * w00 + S[a1 + 1] * w10 + S[b0 + 1] * w01 + S[b1 + 1] * w11;
        const tone = S[a0 + 2] * w00 + S[a1 + 2] * w10 + S[b0 + 2] * w01 + S[b1 + 2] * w11;
        // clouds
        let CX = (P.tx[i] + 0.5) * (CW / TW) - 0.5 - f.shiftC; CX -= Math.floor(CX / CW) * CW;
        const CY = clamp((P.ty[i] + 0.5) * (CH / TH) - 0.5, 0, CH - 1.001);
        x0 = CX | 0; const gx = CX - x0, cy0 = CY | 0, gy = CY - cy0;
        x1 = x0 + 1; if (x1 === CW) x1 = 0;
        const C = P.tex.cloud, q0 = cy0 * CW, q1 = q0 + CW;
        const cl0 = (C[q0 + x0] + (C[q0 + x1] - C[q0 + x0]) * gx) * (1 - gy) + (C[q1 + x0] + (C[q1 + x1] - C[q1 + x0]) * gx) * gy;
        const cl = cl0 <= CLOUD_CUT[0] ? 0 : cl0 >= CLOUD_CUT[1] ? 1 : sstep(CLOUD_CUT[0], CLOUD_CUT[1], cl0); // crisp edge, soft core
        // light
        const ndl = nu * f.Lu + nv * f.Lv + nw * f.Lw;
        const lam = ndl > 0 ? ndl : 0;
        const day = sstep(TERM[0], TERM[1], ndl);
        const cl2 = cl * cl, cko = CLOUD_BODY * cl + (1 - CLOUD_BODY) * cl2 * cl2;
        const nh = nu * f.Hu + nv * f.Hv + nw * f.Hw;

        if (!colr) {
          const li = (lam * LUT_N) | 0;
          const landInk = LAND_LUT[li] * (1 - ice * 0.6);
          const dayInk = landInk + (OCEAN_LUT[li] - landInk) * sea + tone;
          const nightInk = NIGHT[0] - NIGHT[1] * (1 - sea);
          let ink = nightInk + (dayInk - nightInk) * day;
          ink = 1 - (1 - ink) * (1 - (1 - P.limb[i]) * (0.45 + 0.55 * sea)); // limb darkening, gentler on land
          // sun glint on open water
          if (nh > 0.985) { const g = Math.pow(nh, 700) * sea * (1 - cl); ink *= 1 - g; }
          // clouds are knockouts: thin cloud a lighter screen, thick cores paper-white;
          // they fade into the night but stay lighter than what they cross
          ink *= 1 - (CLOUD_KO[0] + CLOUD_KO[1] * day) * cko;
          ink *= 1 + 2.6 * P.grain[i];      // printed texture, relative so paper stays paper
          d = clamp(ink, 0, 1) * P.edge[i];
        } else {
          // Colour: one material per dot, picked with a per-dot dither so every boundary
          // (terminator, coast, biome, cloud edge) mixes like a pointillist painting.
          // Light is modelled twice, like a printed colour plate: dot SIZE follows the
          // tone (the sub-solar region opens up to paper, dots swell toward the terminator)
          // and dot COLOUR steps from sunlit tint to shade within each material.
          const B = P.tex.bio, RL = P.tex.rel;
          const hA = P.hA[i], hB = P.hB[i], hC = P.hC[i];
          const lim = 1 - P.limb[i];                    // 0 at the centre … 0.28 at the limb
          const sh = 1 - lam;                           // 0 at the sub-solar point … 1 at the terminator
          if (day > 0.06 + 0.88 * hA) {
            const glint = nh > 0.985 ? Math.pow(nh, 700) * sea * (1 - cl) : 0;
            if (cko > 0.06 + 0.9 * hB) {
              // white cores, pale grey-blue bodies, cool shade toward the terminator
              c = lam < 0.12 + 0.3 * hA ? M_SHADE : cl > 0.8 + 0.4 * hA ? M_CLOUD : M_CBODY;
              d = 0.6 + 0.36 * cl;
            } else if (ice > 0.25 + 0.5 * hB) {
              c = lam < 0.2 + 0.3 * hA ? M_SHADE : hB > 0.45 ? M_ICE : M_CBODY;
              d = 0.62 + 0.3 * sh;
            } else if (sea > 0.3 + 0.4 * hA) {
              if (glint > 0.12 + 0.8 * hB) { c = M_CLOUD; d = 0.7; } else {
                const shelf = B[a0 + 1] * w00 + B[a1 + 1] * w10 + B[b0 + 1] * w01 + B[b1 + 1] * w11;
                const v = lam + 0.5 * shelf - 1.1 * lim + 4 * tone + (hB - 0.5) * 0.26;
                c = shelf > 0.5 + 0.45 * hC && lam > 0.25 ? M_SHELF : v > 0.8 ? M_OC0 : v > 0.46 ? M_OC1 : M_OC2;
                d = OC_D[0] + OC_D[1] * Math.pow(sh, OC_D[2]) + 0.3 * lim;
              }
            } else {
              const dry = B[a0] * w00 + B[a1] * w10 + B[b0] * w01 + B[b1] * w11;
              const rl = RL[a0] * w00 + RL[a1] * w10 + RL[b0] * w01 + RL[b1] * w11;
              const sn = RL[a0 + 1] * w00 + RL[a1 + 1] * w10 + RL[b0 + 1] * w01 + RL[b1 + 1] * w11;
              const vr = RL[a0 + 2] * w00 + RL[a1 + 2] * w10 + RL[b0 + 2] * w01 + RL[b1 + 2] * w11;
              // light score: sun, limb, the ground's own texture, ridges in shade
              const v = LAND_V[0] * lam - LAND_V[1] * lim + LAND_V[2] * vr - LAND_V[3] * rl + (hC - 0.5) * LAND_V[4];
              if (sn > 0.12 + 0.76 * hB) {
                c = lam < 0.18 + 0.3 * hA ? M_SHADE : M_ICE;
                d = 0.62 + 0.3 * sh;
              } else if (rl > 0.42 + 0.5 * hB) {
                c = M_ROCK;
                d = LAND_D[0] + 0.08 + LAND_D[1] * Math.pow(sh, LAND_D[2]) + 0.3 * lim;
              } else {
                const b = dry + 0.34 * vr + (hB - 0.5) * 0.3;
                const cls = b < 0.36 ? 0 : b < 0.6 ? 1 : 2;
                c = LAND_C[cls][v > LAND_V[5] ? 0 : v > LAND_V[6] ? 1 : 2];
                d = LAND_D[0] + (cls === 2 ? -0.04 : 0) + LAND_D[1] * Math.pow(sh, LAND_D[2]) + 0.3 * lim;
              }
            }
          } else {
            const L = B[a0 + 2] * w00 + B[a1 + 2] * w10 + B[b0 + 2] * w01 + B[b1 + 2] * w11;
            const night = 1 - day;
            if (L * night * (1 - 0.6 * cko) > 0.1 + 0.2 * hB && sea < 0.6) {
              c = M_CITY; d = 0.2 + 0.6 * L;
            } else if (cko > 0.1 + 0.85 * hB) {
              c = M_NCLOUD; d = 0.7 + 0.2 * cl;
            } else if (sea > 0.5) {
              c = M_NIGHT; d = 0.95;
            } else {
              c = M_NLAND; d = 0.86;                  // a faint memory of the continents
            }
          }
          d *= 1 + 1.8 * P.grain[i];
          d = clamp(d, 0, 1) * P.edge[i];
          const om = P.om[i] > P.lkm[i] ? P.om[i] : P.lkm[i];
          if (om > 0) d *= 1 - 0.72 * om;            // gutter along the orbit and the links
        }

        // ping rings: drawn on the sphere, one dot wide on screen wherever they are
        if (f.np) {
          let rc = 0;
          for (let q = 0; q < f.np; q++) {
            const G = f.pg[q];
            const cs = nu * G.x + nv * G.y + nw * G.z;
            if (cs < G.cmin) continue;
            const ang = Math.acos(cs > 1 ? 1 : cs);
            if (G.fa > 0) { const z = ang / G.fw, v = G.fa * Math.exp(-z * z); if (v > rc) rc = v; }
            if (!G.n) continue;
            // screen-space gradient of the angle, so the ring keeps a constant width as it foreshortens
            const sa = Math.sqrt(Math.max(1e-6, 1 - cs * cs)), iw = 1 / (nw > 0.06 ? nw : 0.06);
            const gu = G.x - G.z * nu * iw, gv = G.y - G.z * nv * iw;
            const grad = Math.sqrt(gu * gu + gv * gv) / sa;
            const den = 1 / (grad * G.wd);
            for (let r = 0; r < G.n; r++) {
              const z = (ang - G.r[r]) * den;
              if (z > -2.2 && z < 2.2) { const v = G.a[r] * Math.exp(-z * z); if (v > rc) rc = v; }
            }
          }
          if (rc > 0.14) { d = 0.14 + 0.7 * rc; c = M_ACC; }
        }
      } else if (k === 2) {
        const lit = sstep(-0.15, 0.6, P.eu[i] * f.Lu + P.ev[i] * f.Lv + 0.25 * f.Lw);
        if (colr) { d = 0.5 * P.rim[i] * (0.25 + 0.75 * lit); c = M_ATMO; }
        else { d = 0.42 * P.rim[i] * lit; c = 1; }
      } else if (P.star[i] > 0) {
        d = P.star[i] * (0.72 + 0.28 * Math.sin(t * P.starW[i] + P.starPh[i]));
        c = M_STAR;
      }

      const ci = P.col[i], ri = P.row[i];

      // ground stations: a small accent ring that turns with the ground (Surabaya + pings)
      for (let q = 0; q < f.nst; q++) {
        const sa = f.sta[q];
        if (sa <= 0.01) continue;
        const sc = ci - f.stc[q], sr = ri - f.str[q];
        if (sc >= -1 && sc <= 1 && sr >= -1 && sr <= 1) {
          const ring = sc === 0 && sr === 0 ? 0 : sc === 0 || sr === 0 ? 0.62 : 0.4;
          if (ring === 0) d *= 1 - sa;
          else { d = d + (ring - d) * sa; c = M_ACC; }
          break;
        }
      }

      // tags beside the markers (callsign / AOS / LOS): dot-matrix letters on a small paper chip
      for (let q = 0; q < f.nlab; q++) {
        const T = f.lab[q], lc = ci - T.c0, lr = ri - T.r0;
        if (lc >= -1 && lc <= T.w && lr >= -1 && lr <= 5) {
          if (lc >= 0 && lc < T.w && lr >= 0 && lr < 5 && lc < T.n && T.bits[lr * T.w + lc]) {
            d = d * (1 - T.a) * 0.2 + 0.7 * T.a; c = T.m;
          } else d *= 1 - 0.9 * T.a;
          break;
        }
      }

      // orbit ring + fading trail (Wu weights; on the planet, the nearer dot wins outright)
      const ow = P.ow[i];
      if (ow > 0 && !P.ohid[i]) {
        const dep = P.odp[i];
        let dl = f.th - P.oth[i]; dl -= Math.floor(dl / TAU) * TAU; // angle behind the satellite
        const base = 0.12 + 0.16 * sstep(-0.12, 0.12, dep) + f.oLift;
        const tr = dl < f.trail ? 1 - dl / f.trail : 0;
        let cov = base + (0.84 - base) * tr * tr, ww = ow;
        if (f.kA > 0) { // the boost packet: a full bead with a paper gap fore and aft, so it
          // reads as a discrete pulse even where it runs down a bright trail
          let a = (f.kH - P.oth[i]) * f.kDir; a -= Math.floor(a / TAU) * TAU;
          if (a < f.kL) { cov = cov + (1 - cov) * f.kA; ww = ow + (Math.min(1, 1.8 * ow) - ow) * f.kA; }
          else if (a < 1.9 * f.kL || a > TAU - 0.8 * f.kL) cov *= 1 - 0.9 * f.kA;
        }
        if (k === 1) { if (ow >= 0.5) { d = colr ? 0.14 + 0.86 * cov : cov; c = M_ACC; } }
        else { d = ww * cov; c = M_ACC; }
      }

      // up/downlinks
      const lk = P.lk[i];
      if (lk > 0) { d = lk; c = M_ACC; }

      // acknowledgement ring around the satellite
      if (f.ackA > 0) {
        const ax = ci + 0.0 - f.ackX, ay = ri - f.ackY;
        if (ax > -f.ackR - 2 && ax < f.ackR + 2 && ay > -f.ackR - 2 && ay < f.ackR + 2) {
          const z = (Math.sqrt(ax * ax + ay * ay) - f.ackR) / 0.65;
          const v = f.ackA * Math.exp(-z * z);
          if (v > 0.12) { d = 0.12 + 0.6 * v; c = M_ACC; }
        }
      }
      if (f.ckA > 0) {
        const ax = ci - f.ckX, ay = ri - f.ckY;
        if (ax > -f.ckR - 2 && ax < f.ckR + 2 && ay > -f.ckR - 2 && ay < f.ckR + 2) {
          const z = (Math.sqrt(ax * ax + ay * ay) - f.ckR) / 0.6;
          const v = f.ckA * Math.exp(-z * z);
          if (v > 0.12) { d = 0.12 + 0.62 * v; c = M_ACC; }
        }
      }

      // satellite: accent bus, ink wings, a paper moat; occluded per dot behind the limb
      const gi = ci - f.bc, gj = ri - f.br;
      if (gi >= -GO && gi <= GO + 1 && gj >= -GO && gj <= GO + 1 && !(f.sw < 0 && P.rp[i] * P.rp[i] < f.occR2)) {
        const gk = (gj + GO) * GS + (gi + GO);
        const gd = G_D[gk];
        if (gd > 0) { d = gd; c = colr ? (G_C[gk] === 2 ? M_BUS : M_PANEL) : G_C[gk]; }
        else d *= G_W[gk];
      }
      out.d = d; out.c = c;
    },

    revealKey(x, y, st) {
      const P = st._pl;
      const r = Math.hypot(x - P.cx, y - P.cy) / (P.R * 2.1);
      return 0.86 * clamp(r, 0, 1) + 0.14 * Halftone.utils.hash2(x * 3 + 1, y * 7 + 3);
    },

    /** ms spent building the (shared, cached) surface + cloud textures; null before first setup. */
    textureMs() { return TEX ? TEX.ms : null; },

    telemetry(st) {
      const P = st && st._pl;
      if (!P) return null;
      const I = st._plI, fr = P.fr;
      const K = kin(st.t, I, fr), s = K.s, g = K.g;
      const lat = Math.asin(clamp(dot3(s, fr.AX), -1, 1)) / DEG;
      let lon = (Math.atan2(dot3(s, fr.E2), dot3(s, fr.E1)) - K.phi) / DEG;
      lon = ((lon % 360) + 540) % 360 - 180;
      const x = P.cx + P.R * RO * s[0], y = P.cy - P.R * RO * s[1];
      const visible = g[2] > 0;
      return {
        lat, lon, altKm: Math.round((RO - 1) * EARTH_KM), x, y, front: s[2] >= 0,
        hidden: s[2] < 0 && Math.hypot(x - P.cx, y - P.cy) < P.R, periodS: PERIOD,
        elevDeg: K.el / DEG, contact: visible && K.el > MASK,
        station: { lat: HOME.lat, lon: HOME.lon, x: P.cx + P.R * g[0], y: P.cy - P.R * g[1], visible },
      };
    },
  };

  window.Halftone.scenes.planet = scene;
})();
