// Fig 01 — The 4 km link.
// A bench model of the EEPISAT CanSat downlink: a log-scale rail carries the can
// from 0.1 to 4 km away from a homemade Moxon–Yagi on a tripod (two Moxon
// rectangles, the reflector and the driven element, then five directors); the RSSI
// meter reads the free-space budget. Click the antenna and its seven elements fold
// flat on their hinges, one after another, while the stock whip stands up; flip the
// radio's rate lever and the meter's fade zone moves.
//
//   node tools/anatomy/radio-link/build.mjs            writes assets/js/fig-link.js and assets/css/iso.css
//   node tools/anatomy/radio-link/build.mjs --audit    also proves the geometry in every pose (ends "audit passed")
//   node tools/anatomy/radio-link/build.mjs --audit --quick | --folded   only the rest pose (and the folded one)
//   node tools/anatomy/radio-link/build.mjs --test DIR also writes DIR/index.html, a page that mimics the site
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../kit/tube.mjs";
import * as A from "../kit/audit.mjs";
import * as M from "./model.mjs";
import * as AN from "./antenna.mjs";
import { shake, compactMarkup, stripComments } from "./pack.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const DEG = Math.PI / 180;
const argAfter = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : process.argv[at + 1];
};

// ---------------------------------------------------------------- world layout
// World units are about 1 px of the model; x runs along the rail, y toward the
// front, z up. The link plane is y = 0: both whips, the elements and the boom sit in it.
const AZ = 68;
const EL = 30;
const W = 640;
const H = 330;

// The rail starts a can's width ahead of the boom's front cap (so the can, parked at
// 0.1 km, still has a short field of dots between it and the last director) and runs
// one log decade per 85 units to 4 km.
const X0 = 44; // 0.1 km on the ruler
const X1 = X0 + 136; // 4 km on the ruler: the far end of the rail and the field-test mark
const xOfKm = (km) => X0 + M.shareOfKm(km) * (X1 - X0);
const TRAVEL = X1 - X0;
const MOVE = [TRAVEL, 0, 0];

const PLATE = { x: -276, y: -34, w: X1 + 54 + 276, d: 96, r: 9 };
const PLATE_H = 12;
const FOOT_H = 8;

const RAIL = { x: X0 - 32, y: -6, w: TRAVEL + 74, d: 12, r: 1.5 };
const RAIL_H = 7;
const STRIP = { x: X0 - 10, y: 25, w: TRAVEL + 24, d: 13, r: 1 };
const TICK = { km: [3.2, 4.4, 6.2], dbm: [2.6, 5] }; // minor, half (5s), decade · minor, ten
const STRIP_H = 0.8;
const STRIP_MID = STRIP.y + STRIP.d / 2 + 0.6; // the rule between the two scales
const STRIP_FRONT = STRIP.y + STRIP.d - 0.35;

// carriage (built with its index at X0, moved by share · MOVE)
const RUN_Z = RAIL_H;
const RUN_H = 4.5;
const CAR_Z = RUN_Z + RUN_H;
const CAR_H = 4;
const CAR_TOP = CAR_Z + CAR_H;
const CAR = { x: X0 - 26, y: -22, w: 52, d: 44, r: 3 };
const PUCK_R = 17.8;
const PUCK_H = 3;
const CAN_Z = CAR_TOP + PUCK_H;
const CAN_R = 15;
const CAN_TOP = CAN_Z + 56;
const WHIP_Z0 = CAN_TOP + 1.5 + 4.4;
const WHIP_Z1 = WHIP_Z0 + 32;
const ZW = (WHIP_Z0 + WHIP_Z1) / 2; // whip centre, the link height

// ground station
const XM = -214; // tripod and mast axis
const ZC = ZW; // boom axis
const HUB = { z0: 30, z1: 38, r: 5.5 };
const MAST_LOW = { r: 2.6, z1: 62 };
const COLLAR = { r: 3.4, z1: 66 };
const MAST_UP = { r: 2.0 };
const CLAMP = { x: XM - 4, y: -4, w: 8, d: 8, r: 1.2 };
const CLAMP_Z = ZC - 4;
const BOOM_R = 2.2;
// The Moxon rectangle for 915 MHz (A : B : C : D close to the usual Moxon regression
// for 3 mm rod). A = 58 units is 0.37 λ, which sets the figure's scale for the
// antenna: one wavelength (327.6 mm) is LAMBDA units. A rectangle is E = B + C + D =
// 0.14 λ deep: a rear U with tails D and a front U with tails B, tips facing across
// the gap C (0.019 λ, about 6 mm).
const MOX = { A: 58, B: 7.6, C: 3, D: 11.4 };
const MOX_E = MOX.B + MOX.C + MOX.D;
const LAMBDA = MOX.A / 0.37;
// Two whole rectangles on the boom, 0.15 λ apart: the rear one is the reflector,
// the front one the driven element (the pigtail feeds its front U). The rear one
// sits just ahead of the boom clamp.
const MOX_GAP = 0.15;
const X_R = -200; // the reflector rectangle's rear U
const X_D = X_R + MOX_E + Math.round(MOX_GAP * LAMBDA * 10) / 10 + MOX_E; // the driven rectangle's front U: the feed
const MOXONS = [X_R, X_D - MOX_E].map((x0) => ({ x0, x1: x0 + MOX_E }));
// Five straight directors, the classic Yagi taper: each a little shorter than the
// one before (0.42 λ down to 0.39 λ tip to tip), the first 0.15 λ ahead of the feed
// and then 0.18 λ apart, so the last sits 1.3 λ ahead of the reflector's rear U.
// at: distance ahead of the feed.
const DIR_AT = [0.15, 0.33, 0.51, 0.69, 0.87];
const DIR_LEN = [0.42, 0.4125, 0.405, 0.3975, 0.39];
const DIRS = DIR_AT.map((at, i) => ({ x: X_D + Math.round(at * LAMBDA * 10) / 10, half: Math.round(DIR_LEN[i] * LAMBDA * 5) / 10 }));
const X_F = DIRS[0].x; // the first director
const X_L = DIRS[DIRS.length - 1].x; // the last
const DIR_HALF = DIRS[0].half; // the longest
const ROD_R = 0.65;
// every element hangs on clamp blocks on the boom (a Moxon on two, one per U): a
// hinge barrel on each block's top face and one under its bottom face, all pins
// along the boom (the top halves fold back behind it; the bottom halves fold back
// under it and stop at 70°, tucked out of sight)
const BLOCK = { y: -3.4, d: 6.8, z: ZC - 3.6, h: 7.2, r: 1 };
const MOX_BLOCKS = [X_R, MOXONS[0].x1, MOXONS[1].x0].map((x) => ({ ...BLOCK, x: x - 2.5, w: 5 }));
const REF_BLOCK = MOX_BLOCKS[0];
const FEED = { ...BLOCK, x: X_D - 3, w: 6 };
const DIR_BLOCKS = DIRS.map((d) => ({ ...BLOCK, x: d.x - 2.5, w: 5 }));
const BARREL = { r: 1.2, half: 2.2 };
const Z_TOP = BLOCK.z + BLOCK.h + BARREL.r; // top hinge pin
const Z_LOW = BLOCK.z - BARREL.r; // bottom hinge pin
const ROD_S0 = BARREL.r - 0.1; // a rod's rim lands on its barrel (0.1 in at the middle, 0.08 proud at the sides)
const BAND_R = 2.75;
const TAPE_R = [REF_BLOCK.x - 3.5, REF_BLOCK.x];
const TAPE_F = [X_L + 2.5, X_L + 6];
const MOX_TOP = ZC + MOX.A / 2;
// the corners are bent round a former, about two rod diameters
const MOX_BEND = 2.8;
const MOX_LOW = ZC - MOX.A / 2;
const TIP_R = 0.85;
const BOOM = { back: -222, cap: 2.5, front: TAPE_F[1] + 3 };
// the stock whip on the mast head: a boss on the boom clamp, a knuckle (pin across
// the boom), a sleeve, the rod and a tip ball
const WHIP = { boss: { r: 1.6, h: 2 }, knuckle: { r: 1.25, half: 1.7 }, sleeveR: 0.85, sleeve: 4, rodR: 0.45, rod: 22, ballR: 0.75 };
const WHIP_ZB = CLAMP_Z + 8; // the clamp's top face
const WHIP_Z = WHIP_ZB + WHIP.boss.h + WHIP.knuckle.r;
const WHIP_S0 = Math.sqrt(WHIP.knuckle.r ** 2 - WHIP.sleeveR ** 2);
const WHIP_ROD_END = WHIP_S0 + WHIP.sleeve + WHIP.rod;
const WHIP_BALL_S = WHIP_ROD_END + Math.sqrt(WHIP.ballR ** 2 - WHIP.rodR ** 2);

const BOX = { x: -265, y: -16, w: 31, d: 20, r: 2 };
const BOX_H = 12;
// the meter stands in front, under the middle of the boom, with the RSSI lead from
// the radio box running along the bench's front edge
const METER = { x: -112, y: 20, w: 42, depth: 28, front: 5, slope: 30 };
const JACK_Z = 6;
const TRIPOD_DEG = [14, 134, 262];
const WIRE_A = BOX.x + BOX.w - 5;
const WIRE_B = METER.x + 8;
const METER_BACK = METER.front + METER.depth * Math.tan(METER.slope * DEG);

// ------------------------------------------------------------------ camera
const FIT = [
  ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
  [X_R - 2, 0, MOX_TOP + 1],
  ...DIRS.map((d) => [d.x, 0, ZC + d.half + 1]),
  [XM, 0, WHIP_Z + WHIP_BALL_S + 1],
  [X0, 0, WHIP_Z1 + 2],
  [X1, 0, WHIP_Z1 + 2],
];
const P = k.fitProjection(FIT, W, H, { pad: 16, azimuth: AZ, elevation: EL });
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const FADE = [0.04, 0.42];
// a material for the site's colour mode (plywood, black rubber, brass …): a group
// whose class sets the tone variables; in mono it changes nothing
const mat = (cls, svg) => `<g class="${cls}">${svg}</g>`;
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const fine = (value) => Math.round(value * 100) / 100;

// the turning parts, in the shape antenna.mjs reads (local paths are [x, s])
const local = (points) => points.map(([x, s]) => [fine(x), fine(s)]);
const TAIL = MOX_TOP - Z_TOP;
// each rectangle's two Ls: the rear U's tail (D) and the front U's (B) point at each
// other across the open gap C; nothing bridges it
const ANT = {
  rod: ROD_R,
  zTop: Z_TOP,
  zLow: Z_LOW,
  moxons: MOXONS.map(({ x0, x1 }) => ({
    x0,
    x1,
    rear: local(G.fillet([[x0, ROD_S0, 0], [x0, TAIL, 0], [x0 + MOX.D, TAIL, 0]], MOX_BEND, 12)),
    front: local(G.fillet([[x1 - MOX.B, TAIL, 0], [x1, TAIL, 0], [x1, ROD_S0, 0]], MOX_BEND, 12)),
  })),
  // each director: where it sits, its tip ball's distance from the pin, and its rod
  dirs: DIRS.map((d) => ({ x: d.x, tipS: fine(d.half - (Z_TOP - ZC) + Math.sqrt(TIP_R ** 2 - ROD_R ** 2)), rod: [[d.x, fine(ROD_S0)], [d.x, fine(d.half - (Z_TOP - ZC))]] })),
  // the share of a swap over which the seven elements start one after another
  stagger: 0.42,
  // a Moxon's bottom half folds through this share of a right angle (70°): it tucks
  // in behind the boom, out of sight, its bends and tips clear of every other line
  lowStop: 70 / 90,
  // a top rod leaves its barrel's visible side while tan(fold) < seeTop (a bottom
  // one once tan(fold) > seeTop); the whip, turning in the link plane, crosses from
  // one side of its knuckle to the other where tan(angle) = seeSide
  seeTop: V[2] / V[1],
  seeSide: V[2] / V[0],
  whipX: XM,
  whipZ: WHIP_Z,
  sleeve: [WHIP_S0, WHIP_S0 + WHIP.sleeve],
  sleeveR: WHIP.sleeveR,
  whipR: WHIP.rodR,
  rodEnd: WHIP_ROD_END,
  ballS: WHIP_BALL_S,
};
const TUBE = { maxLength: 12, spacing: 1 };
// the data-rate toggle: a bat-handle lever big enough to read at 1x (about 10 px)
const LEVER = { up: 50, down: -40, r0: 0.5, r1: 0.42, len: 6.2, tipR: 0.9, ballR: 0.95, z: 6.4, bush: 1.75 };

// ---------------------------------------------------------------- recorder
const SPRING = { stagger: 0.035, stiffness: 64, damping: 16, substeps: 4 };
let R = null;
let back = [];
// which control a part belongs to, for hover emphasis and hit testing
const HITS = [["car.", "carriage"], ["can.", "carriage"], ["boom.", "antenna"], ["feed.", "antenna"], ["ant.", "antenna"], ["moxon.", "antenna"], ["director.", "antenna"], ["hinge.", "antenna"], ["whip.", "antenna"], ["mast.clamp", "antenna"], ["mast.neck", "antenna"], ["mast.thumb", "antenna"], ["box.", "radio"], ["meter.", "meter"]];
const hitOf = (name) => HITS.find(([prefix]) => name.startsWith(prefix))?.[1] ?? "";

function put(piece, ref, svg, shapes, { bias = 0, name, route, chunk, key, live } = {}) {
  return R.put({ piece, at: ref, bias, key, live, svg, move: piece === "carriage" ? MOVE : [0, 0, 0], shapes, name: name ?? R.nameFor(`${piece}.item`), route, chunk });
}
const rec = (shape) => R.solid(shape);
const centreOf = (plan, z, h) => [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];

function slab(piece, name, plan, z, h, style = {}, { steps = 3, bevel = 0, extra = "", inner = "", bias = 0 } = {}) {
  const id = R.nameFor(name);
  const shape = rec(A.slab(plan, z, h, { name: id }, steps));
  return put(piece, centreOf(plan, z, h), S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, name: id });
}
function post(piece, name, cx, cy, r, z, h, style = {}, { steps, bevel = 0, extra = "", inner = "", bias = 0 } = {}) {
  const id = R.nameFor(name);
  const shape = rec(A.cylinder(cx, cy, r, z, h, { name: id }));
  const n = steps ?? G.stepsFor(r, 20, 72, KS);
  return put(piece, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, n, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, name: id });
}
function disc(piece, name, F, s0, s1, r, style = {}, { extra = "", inner = "", bias = 0, owner, bevel = 0, key, live } = {}) {
  const id = R.nameFor(name);
  const shape = rec(A.disc(F, s0, s1, r, { name: id, owner }));
  return put(piece, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.disc(s0, s1, r, F, P, { bevel }), { tone: "mid", ...style, inner }) + extra, [shape], { bias, name: id, key, live });
}
function turned(piece, name, F, profile, style = {}, { extra = "", inner = "", bias = 0, owner } = {}) {
  const id = R.nameFor(name);
  const shape = rec(A.solid(F, profile, { name: id, owner }));
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  return put(piece, G.add3(F.o, G.mul3(F.a, mid)), S(G.solidOf(profile, F, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias, name: id });
}
function ball(piece, name, c, r, style = {}, { bias = 0, owner, key, live } = {}) {
  const id = R.nameFor(name);
  const shape = rec(A.ball(c, r, { name: id, owner }));
  return put(piece, c, S(G.sphereOf(c, r, P, { steps: G.stepsFor(r, 24, 64, KS) }), { tone: "mid", ...style }), [shape], { bias, name: id, key, live });
}
function prism(piece, name, F, polygon, s0, s1, style = {}, { extra = "", bias = 0 } = {}) {
  const id = R.nameFor(name);
  const shape = rec(A.prism(F, polygon, s0, s1, { name: id }));
  const cx = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const cy = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  const centre = G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.add3(G.mul3(F.u, cx), G.mul3(F.v, cy)));
  return put(piece, centre, S(G.prismOf(F, polygon, s0, s1, P), { tone: "mid", ...style }) + extra, [shape], { bias, name: id });
}
function route(piece, name, points, r, { tone = "hi", gaps = [], ends = [true, true], rims, limp = false, maxLength = 12, spacing = 1, bias = 0, caps = true, free, className = "", breaks = [] } = {}) {
  const id = R.nameFor(name);
  R.route(id, points, r, { owner: id, limp, gaps, ends, rims, free, piece, move: piece === "carriage" ? MOVE : [0, 0, 0] });
  tubePieces(points, r, P, { maxLength, spacing, gaps, caps, breaks }).forEach((part, index) => {
    const svg = tubeSvg(part, { tone });
    put(piece, part.mid, className ? `<g class="${className}">${svg}</g>` : svg, [A.tube(part.points, part.radii)], { bias, name: `${id}:${index}`, route: id, chunk: index });
  });
  return id;
}
// convex hull of points in a plane (Andrew's monotone chain), counter-clockwise
function hullOf(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
const circlePts = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, j) => [cx + r * Math.cos((j / n) * 2 * Math.PI), cy + r * Math.sin((j / n) * 2 * Math.PI)]);
// arc length along a polyline where coordinate `axis` first passes `value`
function lengthAt(points, axis, value, after = 0) {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const step = G.len3(G.sub3(b, a));
    if (total + step >= after && (a[axis] - value) * (b[axis] - value) <= 0 && a[axis] !== b[axis]) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      if (total + step * t >= after) return total + step * t;
    }
    total += step;
  }
  return null;
}
const along = (o) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const upAt = (x, y, z = 0) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const TAPE = (F, s0, s1, r, phase = 0) => {
  const ribs = G.ribsOf(F, s0, s1, r, 30, P, { fade: [0.08, 0.6], phase });
  return Faded(ribs, { tone: "faint" });
};

// ------------------------------------------------- the turning parts' pictures
// Barrels and tip balls are round about the axis they turn on, so
// the page draws each once and moves it; rods and the whip sleeve are rebuilt.
const KNUCKLE_F = G.frameOf([XM, 0, WHIP_Z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
// a hinge barrel's frame: along the boom, centred on the pin
const barrelFrame = (x, z) => G.frameOf([x, 0, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
function barrelSvg(x, z) {
  const F = barrelFrame(x, z);
  const seams = Ln(G.arcOf(F, -0.8, BARREL.r, P) + G.arcOf(F, 0.8, BARREL.r, P), { tone: "faint" });
  // the pin's peened end shows on the barrel's seen face
  return S(G.disc(-BARREL.half, BARREL.half, BARREL.r, F, P, { bevel: 0.2 }), { tone: "mid", inner: seams }) + Dots([at(G.add3(F.o, G.mul3(F.a, BARREL.half)))], { size: 0.38, tone: "mid" });
}
const tipSvg = (c, r) => S(G.sphereOf(c, r, P, { steps: G.stepsFor(r, 24, 64, KS) }), { tone: "hi" });
const knuckleSvg = () => S(G.disc(-WHIP.knuckle.half, WHIP.knuckle.half, WHIP.knuckle.r, KNUCKLE_F, P, { bevel: 0.2 }), { tone: "mid", inner: Ln(G.arcOf(KNUCKLE_F, -0.6, WHIP.knuckle.r, P) + G.arcOf(KNUCKLE_F, 0.6, WHIP.knuckle.r, P), { tone: "faint" }) }) + Dots([at([XM, WHIP.knuckle.half, WHIP_Z])], { size: 0.38, tone: "mid" });
const discSvg = (part) => S(G.disc(part.s0, part.s1, part.r, G.frameAlong(part.o, part.a), P, { bevel: 0.15 }), { tone: "hi", crease: "lo" });
const FIXED = {
  knuckle: knuckleSvg(),
  whipTip: tipSvg([XM, 0, WHIP_Z + WHIP_BALL_S], WHIP.ballR),
};
ANT.moxons.forEach((m, i) => {
  for (const [u, x] of [["R", m.x0], ["F", m.x1]]) {
    FIXED[`hingeM${i}${u}T`] = barrelSvg(x, Z_TOP);
    FIXED[`hingeM${i}${u}B`] = barrelSvg(x, Z_LOW);
  }
});
ANT.dirs.forEach((d, i) => {
  FIXED[`hingeF${i}T`] = barrelSvg(d.x, Z_TOP);
  FIXED[`hingeF${i}B`] = barrelSvg(d.x, Z_LOW);
  FIXED[`tip${i}T`] = tipSvg([d.x, 0, Z_TOP + d.tipS], TIP_R);
  FIXED[`tip${i}B`] = tipSvg([d.x, 0, Z_LOW - d.tipS], TIP_R);
});
const CTX = { P, tubePieces, tubeSvg, depthOf: k.depthOf, axisVector: k.axisVector, discSvg, fixed: FIXED, tube: TUBE };

// the lever, as the page redraws it
const LEVER_PIVOT = [BOX.x + 7, BOX.y + BOX.d + 1.1 + LEVER.ballR, LEVER.z];
LEVER.pivot = LEVER_PIVOT;
LEVER.start = Math.sqrt(LEVER.ballR ** 2 - LEVER.r0 ** 2);
LEVER.tipS = LEVER.len + Math.sqrt(LEVER.tipR ** 2 - LEVER.r1 ** 2);
LEVER.steps = G.stepsFor(LEVER.tipR, 24, 64, KS);
function leverSvg(slow) {
  const { axis, tip } = AN.leverOf(slow, LEVER);
  return S(G.solidOf([[LEVER.start, LEVER.r0], [LEVER.len, LEVER.r1]], G.frameAlong(LEVER_PIVOT, axis), P), { tone: "hi" }) + S(G.sphereOf(tip, LEVER.tipR, P, { steps: LEVER.steps }), { tone: "hi" });
}

// ------------------------------------------------------------ meter geometry
const METER_F = G.frameOf([METER.x, METER.y, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const METER_POLY = [[0, 0], [METER.depth, 0], [METER.depth, METER.front], [0, METER_BACK]];
const faceZ = (y) => METER_BACK - (y - METER.y) * Math.tan(METER.slope * DEG);
const N = G.unit3([0, Math.sin(METER.slope * DEG), Math.cos(METER.slope * DEG)]);
const RIGHT = [1, 0, 0];
const UP = G.cross3(N, RIGHT).map((v) => -v); // up the slope
const DIAL_C = [METER.x + METER.w / 2, METER.y + METER.depth / 2, faceZ(METER.y + METER.depth / 2)];
const DIAL = { body: 13.2, depth: 3.4, bezelIn: 11.6, bezelOut: 13.8, bezel: 1.4, sweep: 120, zone: [5.5, 8.5], rim: 10.7 };
const DF = G.frameOf(DIAL_C, N, RIGHT, G.cross3(N, RIGHT));
const facePoint = (r, deg, s = DIAL.depth + 0.02) => G.add3(G.add3(DIAL_C, G.mul3(N, s)), G.add3(G.mul3(RIGHT, r * Math.sin(deg * DEG)), G.mul3(UP, r * Math.cos(deg * DEG))));
// a point offset (dx right, dy up) from the face point at (r, deg)
const faceAt = (r, deg, dx, dy) => G.add3(facePoint(r, deg), G.add3(G.mul3(RIGHT, dx), G.mul3(UP, dy)));
const faceRing = (r, deg, radius, n = 20) => k.pathOf(Array.from({ length: n }, (_, j) => at(faceAt(r, deg, radius * Math.cos((j / n) * 2 * Math.PI), radius * Math.sin((j / n) * 2 * Math.PI)))), true);
const angleOf = (dbm) => -DIAL.sweep + ((dbm - M.METER_LOW) / (M.METER_HIGH - M.METER_LOW)) * DIAL.sweep * 2;
// the zones and the two threshold marks move with the data rate: the page redraws
// them from the same functions (live.js keeps a copy of these three lines)
const arcD = (r0, r1, a0, a1, n = 40) => {
  const outer = Array.from({ length: n + 1 }, (_, j) => at(facePoint(r1, a0 + ((a1 - a0) * j) / n)));
  const inner = Array.from({ length: n + 1 }, (_, j) => at(facePoint(r0, a1 - ((a1 - a0) * j) / n)));
  return k.pathOf([...outer, ...inner], true);
};
const markD = (r0, r1, deg) => k.pathOf([at(facePoint(r0, deg)), at(facePoint(r1, deg))]);
function zonesOf(sens) {
  const s = angleOf(sens);
  const f = angleOf(sens + M.FADE_DB);
  return { dead: arcD(DIAL.zone[0], DIAL.zone[1], angleOf(M.METER_LOW), s), fade: arcD(DIAL.zone[0], DIAL.zone[1], s, f), sens: markD(DIAL.zone[0], DIAL.rim, s), fadeMark: markD(DIAL.zone[0], DIAL.zone[1], f) };
}

// =================================================================== THE SCENE
// Everything is drawn into R for one pose of the turning parts, so the audit can
// prove the figure in each pose the page shows.
function drawScene(pose) {
  R = A.recorder(P, { order: ["carriage"], spring: SPRING });
  back = [];
  drawBase();
  drawRail();
  drawCarriage();
  drawCan();
  drawMast();
  drawHead(pose);
  drawCoax();
  drawFeed();
  drawBox(pose);
  drawMeter(pose);
  drawWire();
  return R;
}

// =================================================================== BASE
function drawBase() {
  back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
  // rubber feet: a flange on the bench, a foot up to the plate; inset 9 so the
  // front ones show under the plate's edge
  const FOOT_IN = 9;
  const FEET = byDepth([...k.corners(PLATE, FOOT_IN), [PLATE.x + PLATE.w / 2, PLATE.y + FOOT_IN], [PLATE.x + PLATE.w / 2, PLATE.y + PLATE.d - FOOT_IN]]);
  for (const [x, y] of FEET) {
    back.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H, 1.8, P, 32, 0.3), { tone: "lo", className: "rl-rubber" }));
    back.push(S(k.cylinder(x, y, 4.6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 32), { tone: "mid", className: "rl-rubber", inner: Ln(k.sideArc(x, y, 4.6, -PLATE_H - 2.4, P, 24), { tone: "faint" }) }));
    rec(A.cylinder(x, y, 6, -PLATE_H - FOOT_H, 1.8, { name: "stand.foot.flange" }));
    rec(A.cylinder(x, y, 4.6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, { name: "stand.foot" }));
  }
  back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", className: "rl-ply", inner: Ln(k.sideSeam(PLATE, -PLATE_H + 4, P, 8), { tone: "faint" }) }));
  rec(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate" }));
  back.push(mat("rl-ply", Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "faint" })));
  {
    const screws = k.corners(PLATE, 10);
    back.push(mat("rl-ply", Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 20)).join(""), { tone: "lo" }) + Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 })));
  }
  // soft halos under the parts that stand on the plate
  const softHalo = (plan, blur = 3, opacity = 0.5) => `<path class="iso-halo" style="filter:blur(${blur}px);opacity:calc(var(--anatomy-halo-opacity) * ${opacity})" d="${k.haloOf(plan, 0, 0.1, P)}"/>`;
  back.push(softHalo(k.insetPlan(BOX, -1)), softHalo({ x: METER.x - 1, y: METER.y - 1, w: METER.w + 2, d: METER.depth + 2, r: 2 }), softHalo(k.insetPlan(RAIL, -2), 2.5, 0.45));

  // the bench top is a breadboard: a grid of tapped holes the parts bolt into
  {
    const holes = [];
    for (let x = PLATE.x + 14; x <= PLATE.x + PLATE.w - 12; x += 12) for (let y = PLATE.y + 10; y <= PLATE.y + PLATE.d - 9; y += 12) holes.push(at([x, y, 0]));
    back.push(mat("rl-ply", Dots(holes, { size: 0.42, tone: "faint" })));
  }
  // ruler strip, read like a slide rule: distance (log km) on the back edge and,
  // on the front edge, the received power it gives (dBm). P_rx is linear in log d,
  // so the two scales run side by side; the front one slides with the antenna gain.
  back.push(S(k.slabOf(STRIP, 0, STRIP_H, P, 3), { tone: "lo", crease: "none" }));
  rec(A.slab(STRIP, 0, STRIP_H, { name: "stand.strip" }, 3));
  {
    const edge = STRIP.y + 0.35;
    const tick = (km, length) => k.lineOnTop([xOfKm(km), edge], [xOfKm(km), edge + length], STRIP_H, P);
    const minor = [];
    const half = [];
    // 0.2 … 0.9 km (0.5 a half tick), then 2 and 3 km; majors at 0.1, 1 and 4 km
    for (const km of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 2, 3]) (km === 0.5 ? half : minor).push(tick(km, km === 0.5 ? TICK.km[1] : TICK.km[0]));
    const ticks = (d, tone) => Ln(d, { tone, className: "rl-tick" });
    back.push(ticks(minor.join(""), "mid"), ticks(half.join(""), "mid"), ticks(tick(0.1, TICK.km[2]) + tick(1, TICK.km[2]) + tick(M.D_MAX_KM, TICK.km[2]), "hi"));
    // the field-test mark is the rail's far end: the one engraved label
    back.push(k.faceTextSvg(k.topMatrix([xOfKm(M.FIELD_KM) + 2.4, STRIP.y + 5.2], STRIP_H, P, "x"), `${M.FIELD_KM} km`, { size: 3.8, tone: "hi" }));
    // (the dBm scale is drawn by the page, in a layer of its own: it slides with the
    // antenna's gain)
    // the rule between the two scales runs end to end
    back.push(Ln(k.lineOnTop([STRIP.x + 0.2, STRIP_MID], [STRIP.x + STRIP.w - 0.2, STRIP_MID], STRIP_H, P), { tone: "faint" }));
    back.push(Dots([at([STRIP.x + 2.2, STRIP.y + 3, STRIP_H]), at([STRIP.x + STRIP.w - 2.2, STRIP.y + 3, STRIP_H]), at([STRIP.x + 2.2, STRIP.y + STRIP.d - 3, STRIP_H]), at([STRIP.x + STRIP.w - 2.2, STRIP.y + STRIP.d - 3, STRIP_H])], { size: 0.42 }));
  }
  // label plate with three rule lines standing for text
  {
    // on the front edge between the meter and the ruler, where the bench is bare
    const plan = { x: X0 - 78, y: 40, w: 50, d: 10, r: 2 };
    rec(A.slab(plan, 0, 0.8, { name: "stand.label" }, 4));
    const rows = [[8, 46], [8, 34], [8, 40]];
    back.push(
      mat(
        "rl-brass",
        S(k.slabOf(plan, 0, 0.8, P, 4), { tone: "lo" }) +
          Ln(k.planOutline(k.insetPlan(plan, 1.6), 0.8, P, 4), { tone: "faint" }) +
          Ln(rows.map(([a, b], row) => k.lineOnTop([plan.x + a, plan.y + 3.6 + row * 2.4], [plan.x + b, plan.y + 3.6 + row * 2.4], 0.8, P)).join(""), { tone: "lo", free: true }) +
          Dots([at([plan.x + 3.6, plan.y + plan.d / 2, 0.8]), at([plan.x + plan.w - 3.6, plan.y + plan.d / 2, 0.8])], { size: 0.45 }),
      ),
    );
  }
}

// =================================================================== RAIL
function drawRail() {
  const bolts = [];
  for (let x = RAIL.x + 22; x < RAIL.x + RAIL.w - 10; x += 46) bolts.push(x);
  slab("rail", "rail.beam", RAIL, 0, RAIL_H, { tone: "mid", className: "rl-anod" }, {
    steps: 3,
    bevel: 0.6,
    inner: Ln(k.sideSeam(RAIL, 2.2, P, 3) + k.sideSeam(RAIL, 4.8, P, 3), { tone: "faint" }),
    extra: Ln(bolts.map((x) => k.ring(x, 0, 1.7, RAIL_H, P, 16)).join(""), { tone: "lo" }) + Dots(bolts.map((x) => at([x, 0, RAIL_H])), { size: 0.42 }),
  });
  for (const x of [RAIL.x, RAIL.x + RAIL.w - 5]) {
    const plan = { x, y: -6, w: 5, d: 12, r: 1 };
    slab("rail", "rail.stop", plan, RAIL_H, 5, { tone: "mid", className: "rl-rubber" }, { steps: 3, bevel: 0.5, extra: Dots([at([x + 2.5, -3, RAIL_H + 5]), at([x + 2.5, 3, RAIL_H + 5])], { size: 0.42 }) });
  }
}

// =================================================================== CARRIAGE (at share 0)
function drawCarriage() {
  const C = "carriage";
  for (const dx of [-21, 6]) {
    const plan = { x: X0 + dx, y: -6, w: 15, d: 12, r: 1.4 };
    const halo = dx < 0 ? `<path class="iso-halo" style="filter:blur(3px);opacity:calc(var(--anatomy-halo-opacity) * .55)" d="${k.haloOf(k.insetPlan(CAR, 4), RUN_Z, 0.1, P)}"/>` : "";
    slab(C, "car.runner", plan, RUN_Z, RUN_H, { tone: "mid", className: "rl-rubber" }, { steps: 3, bevel: 0.4, inner: Ln(k.sideSeam(plan, RUN_Z + 1.4, P, 3), { tone: "faint" }) });
    if (halo) R.items[R.items.length - 1].svg = halo + R.items[R.items.length - 1].svg;
  }
  const screws = k.corners(CAR, 3.6).map(([x, y]) => at([x, y, CAR_TOP]));
  slab(C, "car.plate", CAR, CAR_Z, CAR_H, { tone: "mid", className: "rl-anod" }, {
    steps: 5,
    bevel: 0.6,
    extra: mat("rl-anod", Ln(k.planOutline(k.insetPlan(CAR, 2.2), CAR_TOP, P, 4), { tone: "faint" }) + Dots(screws, { size: 0.42 })),
  });
  // index plate hanging from the front face, reading the ruler
  const index = { x: X0 - 1.6, y: CAR.y + CAR.d, w: 3.2, d: 1.2, r: 0.3 };
  const FINGER_Z = 2.2;
  slab(C, "car.index", index, FINGER_Z, CAR_TOP - FINGER_Z, { tone: "mid" }, { steps: 2 });
  {
    const y0 = index.y + index.d;
    const tip = STRIP_MID;
    const ring = [[X0 - 1.6, y0], [X0 + 1.6, y0], [X0 + 1.6, tip - 1.8], [X0, tip], [X0 - 1.6, tip - 1.8]];
    const id = "car.finger";
    const shape = rec(A.extruded(ring, FINGER_Z, 0.8, { name: id }));
    put(C, [X0, (y0 + tip) / 2, FINGER_Z + 0.4], S(k.extrude(ring, FINGER_Z, 0.8, P), { tone: "hi", crease: "lo" }) + Ln(k.lineOnTop([X0, y0], [X0, tip], FINGER_Z + 0.8, P), { tone: "hi" }), [shape], { name: id });
  }
  // lock knob on the right face
  const neck = { x: CAR.x + CAR.w, y: -1.2, w: 2.4, d: 2.4, r: 0.6 };
  slab(C, "car.neck", neck, CAR_Z + 1, 2.2, { tone: "mid", crease: "none" }, { steps: 2 });
  const kx = CAR.x + CAR.w + 2.4 + 2.4;
  post(C, "car.knob", kx, 0, 2.4, CAR_Z - 0.8, 6, { tone: "mid", className: "rl-rubber" }, { extra: mat("rl-rubber", Ln(k.knurl(kx, 0, 2.4, CAR_Z - 0.8, CAR_Z + 5.2, 20, P), { tone: "lo" }) + Ln(k.ring(kx, 0, 1, CAR_Z + 5.2, P, 12), { tone: "lo" })) });
  // turntable puck with a bolt circle and three locating pins
  const FP = upAt(X0, 0);
  post(C, "car.puck", X0, 0, PUCK_R, CAR_TOP, PUCK_H, { tone: "mid", className: "rl-anod" }, {
    bevel: 0.6,
    extra: Dots(G.dotsOf(FP, CAN_Z, 15.2, 12, P, { all: true, phase: 15 * DEG }), { size: 0.4 }),
  });
  for (const deg of [-30, 90, 210]) {
    const px = X0 + (CAN_R + 0.6 + 1.15) * Math.cos(deg * DEG);
    const py = (CAN_R + 0.6 + 1.15) * Math.sin(deg * DEG);
    post(C, "car.pin", px, py, 1.1, CAN_Z, 5, { tone: "mid" }, { steps: 16, extra: Dots([at([px, py, CAN_Z + 5])], { size: 0.35, tone: "lo" }) });
  }
}

// =================================================================== CANSAT
// The can, cut away to show its avionics stack. One item: the shell, the window
// and everything seen through it, clipped to the opening.
const FC = upAt(X0, 0, CAN_Z);
const CAN_PROFILE = [[0, CAN_R + 0.6], [2.6, CAN_R + 0.6], [2.6, CAN_R], [51.6, CAN_R], [51.6, CAN_R + 0.6], [55.2, CAN_R + 0.6], [56, CAN_R - 0.3]];
const WIN = { s0: 5.4, s1: 49, half: 50 * DEG, inner: CAN_R - 1 };
function canSvg() {
  const shell = G.solidOf(CAN_PROFILE, FC, P);
  const face = G.angleToward(FC, V);
  const t0 = face - WIN.half;
  const t1 = face + WIN.half;
  const ring = (s, r, a, b, n = 36) => Array.from({ length: n + 1 }, (_, j) => at(G.pointOf(FC, s, r, a + ((b - a) * j) / n)));
  const opening = [...ring(WIN.s0, CAN_R, t0, t1), ...ring(WIN.s1, CAN_R, t1, t0)];
  const clip = k.pathOf(opening, true);
  const z = (s) => CAN_Z + s;
  const inside = [];
  // the cavity: darker paper, then the far inner wall's floor ring
  inside.push(`<path class="rl-cavity-bg" d="${clip}"/>`);
  const level = (s, h) => ({ s, h });
  const BOARDS = [level(10.2, 0.8), level(21, 0.8), level(31.6, 0.8), level(42, 0.8)];
  const standoffs = [45, 135, 225, 315].map((deg) => [X0 + 9.6 * Math.cos(deg * DEG), 9.6 * Math.sin(deg * DEG)]);
  const parts = []; // [depthKey, svg]
  const push = (centre, svg) => parts.push([k.depthOf(centre, P), svg]);
  const slabAt = (plan, s, h, style = {}, extra = "") => push(centreOf(plan, z(s), h), S(k.slabOf(plan, z(s), h, P, 2, 0), { tone: "mid", ...style }) + extra);
  // what each part is made of: black epoxy packages, tinned shields, white plastic
  const ic = (plan, s, h, extra = "") => slabAt(plan, s, h, { tone: "mid", className: "rl-ic" }, extra);
  const metal = (plan, s, h, extra = "") => slabAt(plan, s, h, { tone: "mid", className: "rl-metal" }, extra);
  const chip = (plan, s, h, extra = "") => slabAt(plan, s, h, { tone: "mid", className: "rl-chip-part" }, extra);
  const pins = (points, size = 0.3) => `<g class="rl-gold">${Dots(points, { size, tone: "hi" })}</g>`;
  const layers = [];
  // floor and battery: a 2S LiPo pack with its two cells, a label band and the balance lead plug
  layers.push(() => {
    const pack = { x: X0 - 7.5, y: -5, w: 15, d: 10, r: 1.2 };
    slabAt(pack, 2.6, 6.6, { tone: "mid", className: "rl-cell" }, Ln(k.lineOnTop([pack.x + 0.6, 0], [pack.x + pack.w - 0.6, 0], z(9.2), P), { tone: "lo" }));
    chip({ x: X0 + 3.4, y: 4.4, w: 3.2, d: 1.8, r: 0.3 }, 9.2, 0.9);
  });
  // power board: the regulator's shielded inductor, the regulator, the arming switch
  layers.push(() => {
    push([X0 + 4, 4.4, z(11.7)], S(k.cylinder(X0 + 4, 4.4, 1.8, z(11), 1.5, P, 20), { tone: "mid", className: "rl-ic" }) + Ln(k.ring(X0 + 4, 4.4, 0.7, z(12.5), P, 12), { tone: "faint" }));
    ic({ x: X0 - 6.4, y: 2.4, w: 4.4, d: 3.2, r: 0.4 }, 11, 1.2, pins([0, 1, 2].map((i) => at([X0 - 5.4 + i * 1.2, 5.6, z(11)])), 0.28));
    metal({ x: X0 - 2, y: 6.4, w: 3, d: 2, r: 0.3 }, 11, 1.3);
    chip({ x: X0 - 1.2, y: 6.9, w: 1.2, d: 1, r: 0.2 }, 12.3, 0.8);
  });
  // Teensy 4.1 on its carrier: the long board with its pin rows, the i.MX RT chip,
  // the flash and the micro-SD slot
  layers.push(() => {
    const teensy = { x: X0 - 8.6, y: -3.2, w: 17.2, d: 6.4, r: 0.5 };
    const row = (y) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => at([teensy.x + 1.2 + i * 1.14, y, z(22.7)]));
    slabAt(teensy, 21.8, 0.9, { tone: "mid", className: "rl-pcb" }, pins([...row(teensy.y + teensy.d - 0.6), ...row(teensy.y + 0.6)]));
    ic({ x: X0 - 1.6, y: -1.8, w: 3.4, d: 3.4, r: 0.2 }, 22.7, 0.6);
    ic({ x: X0 + 3.6, y: -1.6, w: 2.6, d: 2, r: 0.2 }, 22.7, 0.6);
    metal({ x: X0 - 8.2, y: -1.2, w: 2.6, d: 2.4, r: 0.3 }, 22.7, 0.9);
  });
  // the XBee-PRO 900HP on its two black header rows, with its tinned RF shield, and
  // the GPS with its ceramic patch
  layers.push(() => {
    const x0 = X0 - 8;
    const y0 = -5;
    const xb = [[x0, y0], [x0 + 7.4, y0], [x0 + 7.4, y0 + 7.8], [x0 + 5.6, y0 + 9.9], [x0 + 1.8, y0 + 9.9], [x0, y0 + 7.8]];
    ic({ x: x0 + 0.2, y: y0 + 0.6, w: 1, d: 7, r: 0.2 }, 32.4, 1.1);
    ic({ x: x0 + 6.2, y: y0 + 0.6, w: 1, d: 7, r: 0.2 }, 32.4, 1.1);
    push([x0 + 3.7, y0 + 4.9, z(33.8)], S(k.extrude(xb, z(33.5), 0.6, P), { tone: "mid", className: "rl-pcb" }));
    metal({ x: x0 + 1.2, y: y0 + 1, w: 5, d: 5.2, r: 0.3 }, 34.1, 0.7);
    slabAt({ x: X0 + 2.2, y: -3.6, w: 6.4, d: 6.4, r: 0.4 }, 32.4, 0.8, { tone: "mid", className: "rl-pcb" });
    slabAt({ x: X0 + 3, y: -2.8, w: 4.8, d: 4.8, r: 0.3 }, 33.2, 0.9, { tone: "mid", className: "rl-patch" }, Dots([at([X0 + 5.4, -0.4, z(34.1)])], { size: 0.45, tone: "hi" }));
  });
  // sensors: the barometer and IMU breakouts, a buzzer
  layers.push(() => {
    slabAt({ x: X0 - 6.4, y: -2.2, w: 4.2, d: 4.2, r: 0.4 }, 42.8, 0.6, { tone: "mid", className: "rl-pcb" }, pins([at([X0 - 5.6, 1.4, z(43.4)]), at([X0 - 4.6, 1.4, z(43.4)]), at([X0 - 3.6, 1.4, z(43.4)])], 0.26));
    metal({ x: X0 - 5.2, y: -1, w: 1.8, d: 1.8, r: 0.1 }, 43.4, 0.6);
    slabAt({ x: X0 + 0.4, y: 1.2, w: 4.6, d: 3.6, r: 0.4 }, 42.8, 0.6, { tone: "mid", className: "rl-pcb" });
    ic({ x: X0 + 1.8, y: 2.2, w: 1.8, d: 1.6, r: 0.1 }, 43.4, 0.4);
    push([X0 + 4.4, -4.2, z(43.8)], S(k.cylinder(X0 + 4.4, -4.2, 1.9, z(42.8), 2.1, P, 20), { tone: "mid", className: "rl-ic" }) + Ln(k.ring(X0 + 4.4, -4.2, 0.5, z(44.9), P, 10), { tone: "faint" }));
  });
  // assemble, bottom to top: under each board the standoff segments and the level's parts
  let below = 2.6;
  const levels = [...BOARDS, { s: 51.6, h: 0, top: true }];
  levels.forEach((board, index) => {
    parts.length = 0;
    layers[index]?.();
    for (const [x, y] of standoffs) push([x, y, z((below + board.s) / 2)], S(k.cylinder(x, y, 0.5, z(below), board.s - below, P, 12), { tone: "mid", crease: "none" }));
    parts.sort((a, b) => a[0] - b[0]);
    inside.push(...parts.map(([, svg]) => svg));
    if (!board.top) {
      inside.push(S(G.disc(board.s, board.s + board.h, CAN_R - 1.2, FC, P), { tone: "mid", className: "rl-pcb" }) + Dots(standoffs.map(([x, y]) => at([x, y, z(board.s + board.h)])), { size: 0.45, tone: "mid" }));
      below = board.s + board.h;
    }
  });
  // cut faces of the wall: the sill and the two jambs
  const sill = k.pathOf([...ring(WIN.s0, CAN_R, t0, t1), ...ring(WIN.s0, WIN.inner, t1, t0)], true);
  const jamb = (t) => k.pathOf([at(G.pointOf(FC, WIN.s0, CAN_R, t)), at(G.pointOf(FC, WIN.s1, CAN_R, t)), at(G.pointOf(FC, WIN.s1, WIN.inner, t)), at(G.pointOf(FC, WIN.s0, WIN.inner, t))], true);
  const cuts = `<path class="iso-top" d="${sill}"/><path class="iso-shade" data-shade="1" d="${jamb(t0)}"/><path class="iso-shade" data-shade="2" d="${jamb(t1)}"/>`;
  const innerEdge = k.pathOf([at(G.pointOf(FC, WIN.s1, WIN.inner, t0)), at(G.pointOf(FC, WIN.s0, WIN.inner, t0)), ...ring(WIN.s0, WIN.inner, t0, t1), at(G.pointOf(FC, WIN.s1, WIN.inner, t1))]);
  const seams = Ln(G.arcOf(FC, 2.6, CAN_R, P) + G.arcOf(FC, 51.6, CAN_R, P), { tone: "faint" });
  const bolts = Dots(G.dotsOf(FC, 53.4, CAN_R + 0.6, 12, P, { fade: FADE, phase: 7 * DEG }), { size: 0.42, tone: "mid" });
  // the lid: a parachute hatch outline with its three screws
  const hatch = Ln(G.circleOf(FC, 56, 8.6, P, 64), { tone: "faint" }) + Dots(G.dotsOf(FC, 56, 10.2, 3, P, { all: true, phase: 30 * DEG }), { size: 0.4, tone: "mid" });
  return (
    S(shell, { tone: "hi", crease: "lo", inner: seams }) +
    bolts +
    hatch +
    `<clipPath id="rl-win"><path d="${clip}"/></clipPath><g clip-path="url(#rl-win)" class="rl-cavity">${inside.join("")}</g>` +
    `<g class="iso-solid">${cuts}<path class="iso-line" data-tone="lo" d="${innerEdge}"/><path class="iso-line iso-edge" data-tone="hi" d="${clip}"/></g>`
  );
}
function drawCan() {
  const id = "can.body";
  const shape = rec(A.solid(FC, CAN_PROFILE, { name: id }));
  put("carriage", [X0, 0, CAN_Z + 26], canSvg(), [shape], { name: id });
  // SMA bulkhead, whip sleeve, whip and its tip
  const nut = upAt(X0, 0, CAN_TOP);
  disc("carriage", "can.sma", nut, 0, 1.5, 1.7, { tone: "hi", crease: "lo" }, { extra: Ln(G.circleOf(nut, 1.5, 0.8, P, 16), { tone: "lo" }) });
  turned("carriage", "can.sleeve", nut, [[1.5, 1.15], [5.9, 1.15]], { tone: "hi", crease: "lo" }, { inner: Ln(G.arcOf(nut, 3.7, 1.15, P), { tone: "lo" }) });
  turned("carriage", "can.whip", nut, [[5.9, 0.45], [WHIP_Z1 - CAN_TOP, 0.45]], { tone: "hi" });
  ball("carriage", "can.tip", [X0, 0, WHIP_Z1 + 0.62], 0.9, { tone: "hi" });
}

// =================================================================== TRIPOD AND MAST
// The coax from the boom tail runs down the mast's screen-left side, held by
// three duct-tape wraps; the mast is cut at each wrap so nothing is sunk.
const COAX_ID = "coax.cable";
const COAX_R = 0.85;
const COAX_U = [-Math.sin(AZ * DEG), Math.cos(AZ * DEG)]; // across the screen, at the mast axis' depth
const COAX_OFF = COLLAR.r + COAX_R + 0.5; // clears the lock collar by more than half its radius
const CX = XM + COAX_U[0] * COAX_OFF;
const CY = COAX_U[1] * COAX_OFF;
const TAPE_H = 3.2;
const TAPES = [
  { z: 80, m: MAST_UP.r },
  { z: 70.4, m: MAST_UP.r },
  { z: 55, m: MAST_LOW.r },
].map((t) => ({ ...t, z0: t.z - TAPE_H / 2, z1: t.z + TAPE_H / 2, ring: hullOf([...circlePts(XM, 0, t.m + 0.25, 48), ...circlePts(CX, CY, COAX_R + 0.3, 24)]) }));
// a mast tube from z0 to z1, cut where a tape wrap sits
const mastRuns = (z0, z1) => {
  const cuts = TAPES.filter((t) => t.z0 > z0 && t.z1 < z1).sort((p, q) => p.z0 - q.z0);
  const runs = [];
  let from = z0;
  for (const t of cuts) {
    runs.push([from, t.z0]);
    from = t.z1;
  }
  runs.push([from, z1]);
  return runs;
};
function drawMast() {
  const T = "station";
  post(T, "tripod.hub", XM, 0, HUB.r, HUB.z0, HUB.z1 - HUB.z0, { tone: "mid", className: "rl-rubber" }, {
    bevel: 0.5,
    extra: mat("rl-rubber", Ln(k.ring(XM, 0, 3.2, HUB.z1, P, 24), { tone: "faint" })),
  });
  const LUG_R = 8.4;
  const LUG_Z = (HUB.z0 + HUB.z1) / 2 - 1;
  const KNUCKLE = 1.75;
  const LEG_R = 1.0;
  const FOOT = 24;
  const PAD = { r: 2.8, h: 1.2 };
  // turned so the three legs fan apart on screen and none lands on the radio box or its coax
  for (const deg of TRIPOD_DEG) {
    const d = [Math.cos(deg * DEG), Math.sin(deg * DEG), 0];
    const stemF = G.frameAlong([XM, 0, LUG_Z], d);
    const knuckle = G.add3([XM, 0, LUG_Z], G.mul3(d, LUG_R));
    disc(T, "tripod.stem", stemF, HUB.r - 0.02, LUG_R - Math.sqrt(KNUCKLE ** 2 - 0.9 ** 2), 0.9, { tone: "mid", className: "rl-rubber" });
    ball(T, "tripod.knuckle", knuckle, KNUCKLE, { tone: "mid", className: "rl-rubber" });
    const fx = XM + FOOT * d[0];
    const fy = FOOT * d[1];
    post(T, "tripod.pad", fx, fy, PAD.r, 0, PAD.h, { tone: "mid", className: "rl-rubber" }, { steps: 24, bevel: 0.3 });
    const footBall = [fx, fy, PAD.h + KNUCKLE];
    ball(T, "tripod.foot", footBall, KNUCKLE, { tone: "mid", className: "rl-rubber" });
    const axis = G.sub3(footBall, knuckle);
    const length = G.len3(axis);
    const LF = G.frameAlong(knuckle, axis);
    const rim = Math.sqrt(KNUCKLE ** 2 - LEG_R ** 2);
    const collar = length * 0.56;
    turned(T, "tripod.leg", LF, [[rim, LEG_R], [collar - 1.2, LEG_R]], { tone: "mid", className: "rl-anod" });
    disc(T, "tripod.lock", LF, collar - 1.2, collar + 1.2, 1.55, { tone: "mid", className: "rl-rubber" }, { inner: Ln(G.arcOf(LF, collar, 1.55, P), { tone: "faint" }) });
    turned(T, "tripod.leg", LF, [[collar + 1.2, LEG_R * 0.86], [length - Math.sqrt(KNUCKLE ** 2 - (LEG_R * 0.86) ** 2), LEG_R * 0.86]], { tone: "mid", className: "rl-anod" });
  }
  // telescoping mast with a knurled lock ring, cut at the tape wraps
  mastRuns(HUB.z1, MAST_LOW.z1).forEach(([z0, z1], i) =>
    post(T, "mast.low", XM, 0, MAST_LOW.r, z0, z1 - z0, { tone: "mid", crease: "none", className: "rl-anod" }, i === 0 ? { inner: Ln(k.sideArc(XM, 0, MAST_LOW.r, HUB.z1 + 6, P, 20), { tone: "faint" }) } : {}),
  );
  post(T, "mast.lock", XM, 0, COLLAR.r, MAST_LOW.z1, COLLAR.z1 - MAST_LOW.z1, { tone: "mid", className: "rl-rubber" }, { extra: mat("rl-rubber", Ln(k.knurl(XM, 0, COLLAR.r, MAST_LOW.z1, COLLAR.z1, 24, P), { tone: "lo" })) });
  mastRuns(COLLAR.z1, CLAMP_Z).forEach(([z0, z1]) => post(T, "mast.up", XM, 0, MAST_UP.r, z0, z1 - z0, { tone: "mid", crease: "none", className: "rl-anod" }));
  // duct-tape wraps round the mast and the coax: a band whose plan is the hull of both
  for (const t of TAPES) {
    const id = R.nameFor("coax.tape");
    const shape = rec(A.extruded(t.ring, t.z0, TAPE_H, { name: id, owner: COAX_ID }));
    const seam = Ln(k.ringSeam(t.ring, t.z0 + 1.15, P) + k.ringSeam(t.ring, t.z0 + 2.2, P), { tone: "faint" });
    put(T, [(XM + CX) / 2, CY / 2, t.z], S(k.extrude(t.ring, t.z0, TAPE_H, P), { tone: "mid", inner: seam, className: "rl-tape" }), [shape], { name: id });
  }
  // boom clamp on the mast head, with its thumb screw
  slab(T, "mast.clamp", CLAMP, CLAMP_Z, 8, { tone: "mid" }, {
    steps: 3,
    bevel: 0.5,
    extra: Dots([at([CLAMP.x + 1.8, CLAMP.y + 1.8, CLAMP_Z + 8]), at([CLAMP.x + CLAMP.w - 1.8, CLAMP.y + CLAMP.d - 1.8, CLAMP_Z + 8])], { size: 0.42 }),
  });
  const neck = { x: XM - 1.2, y: CLAMP.y + CLAMP.d, w: 2.4, d: 2.2, r: 0.6 };
  slab(T, "mast.neck", neck, CLAMP_Z + 1.4, 2.4, { tone: "mid", crease: "none" }, { steps: 2 });
  post(T, "mast.thumb", XM, neck.y + neck.d + 2.3, 2.3, CLAMP_Z - 0.6, 6, { tone: "mid", className: "rl-rubber" }, { extra: mat("rl-rubber", Ln(k.knurl(XM, neck.y + neck.d + 2.3, 2.3, CLAMP_Z - 0.6, CLAMP_Z + 5.4, 20, P), { tone: "lo" })) });
}

// =================================================================== MOXON–YAGI HEAD
let FEED_HOST = null; // the boom piece the feed pigtail's grommet sits on
const LIVE_UNDER = -1e6;
const LIVE_OVER = 1e6;
function drawHead(pose) {
  const T = "station";
  const F = along([0, 0, ZC]);
  const pvc = (a, b) => disc(T, "boom.pvc", F, a, b, BOOM_R, { tone: "mid", crease: "none" });
  const tape = (a, b, phase) => disc(T, "boom.tape", F, a, b, BAND_R, { tone: "mid", className: "rl-tape" }, { extra: TAPE(F, a, b, BAND_R, phase) });
  const block = (name, plan) =>
    slab(T, name, plan, plan.z, plan.h, { tone: "mid" }, {
      steps: 2,
      bevel: 0.4,
      extra: Dots([at([plan.x + plan.w / 2 - 1.4, plan.y + plan.d, ZC + 1.8]), at([plan.x + plan.w / 2 + 1.4, plan.y + plan.d, ZC - 1.8])], { size: 0.42 }),
    });
  // PVC boom in pieces between the clamp, the tape bands and the nine clamp blocks
  // (two per Moxon, one per director); the coax comes in at the boom's tail and runs
  // inside it to the feed
  disc(T, "boom.cap", F, BOOM.back - BOOM.cap, BOOM.back, 2.6, { tone: "mid" }, { bevel: 0.3 });
  pvc(BOOM.back, CLAMP.x);
  pvc(CLAMP.x + CLAMP.w, TAPE_R[0]);
  tape(TAPE_R[0], TAPE_R[1], 0.3);
  let from = TAPE_R[1];
  for (const [name, plan] of [...MOX_BLOCKS.map((plan) => ["ant.block", plan]), ["ant.feed", FEED], ...DIR_BLOCKS.map((plan) => ["ant.block", plan])]) {
    if (plan.x > from + 0.01) pvc(from, plan.x);
    if (name === "ant.feed") FEED_HOST = R.solids[R.solids.length - 1];
    block(name, plan);
    from = plan.x + plan.w;
  }
  tape(TAPE_F[0], TAPE_F[1], 0.5);
  pvc(TAPE_F[1], BOOM.front);
  disc(T, "boom.cap", F, BOOM.front, BOOM.front + BOOM.cap, 2.6, { tone: "mid" }, { bevel: 0.3 });
  // the stock whip's boss on the boom clamp
  post(T, "whip.boss", XM, 0, WHIP.boss.r, WHIP_ZB, WHIP.boss.h, { tone: "mid" }, { bevel: 0.3, extra: Ln(k.ring(XM, 0, WHIP.boss.r - 0.5, WHIP_ZB + WHIP.boss.h, P, 20), { tone: "faint" }) });
  // the turning parts, in their two layers, in the page's own drawing order
  const parts = AN.antennaParts(pose, ANT);
  for (const [layer, base] of [["under", LIVE_UNDER], ["over", LIVE_OVER]]) {
    const drawn = AN.antennaDrawables(parts[layer], CTX);
    const routed = new Set();
    drawn.forEach(({ part, piece }, index) => {
      const key = base + index;
      if (piece) {
        if (!routed.has(part)) {
          routed.add(part);
          part.id = R.nameFor(part.name);
          part.index = 0;
          R.route(part.id, part.points, part.r, { owner: part.id, piece: T, ends: part.ends ?? [true, true] });
        }
        put(T, piece.mid, tubeSvg(piece, { tone: "hi" }), [A.tube(piece.points, piece.radii)], { name: `${part.id}:${part.index}`, route: part.id, chunk: part.index++, key, live: layer });
      } else if (part.kind === "disc") {
        const id = R.nameFor(part.name);
        const shape = rec(A.disc(G.frameAlong(part.o, part.a), part.s0, part.s1, part.r, { name: id }));
        put(T, part.o, discSvg(part), [shape], { name: id, key, live: layer });
      } else {
        const id = R.nameFor(part.name);
        let shape;
        if (part.id.startsWith("hinge")) shape = A.disc(barrelFrame(part.at[0], part.at[2]), -BARREL.half, BARREL.half, BARREL.r, { name: id });
        else if (part.id === "knuckle") shape = A.disc(KNUCKLE_F, -WHIP.knuckle.half, WHIP.knuckle.half, WHIP.knuckle.r, { name: id });
        else shape = A.ball(part.at, part.id === "whipTip" ? WHIP.ballR : TIP_R, { name: id });
        const [dx, dy] = k.axisVector(P, part.offset);
        put(T, part.at, `<g transform="translate(${fine(dx)} ${fine(dy)})">${FIXED[part.id]}</g>`, [rec(shape)], { name: id, key, live: layer });
      }
    });
  }
}

// =================================================================== COAX: boom tail → drip loop → down the mast → XBee box
function drawCoax() {
  const T = "station";
  const F = along([0, 0, ZC]);
  const nut = [BOOM.back - BOOM.cap - 1.1, BOOM.back - BOOM.cap];
  disc(T, "coax.bulkhead", F, nut[0], nut[1], 1.5, { tone: "hi", crease: "lo" });
  const wrap = [nut[0] - 4.2, nut[0]];
  disc(T, "coax.boot", F, wrap[0], wrap[1], 1.75, { tone: "mid", className: "rl-tape" }, { extra: TAPE(F, wrap[0], wrap[1], 1.75, 0.2) });
  // SMA jack on the box's right side face
  const JX = BOX.x + BOX.w;
  const JY = BOX.y + BOX.d / 2;
  const jack = G.frameOf([JX, JY, JACK_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  disc(T, "coax.jack", jack, 0, 1.2, 1.7, { tone: "hi", crease: "lo" });
  disc(T, "coax.shell", jack, 1.2, 4, 1.3, { tone: "mid" }, { bevel: 0.2 });
  const r = COAX_R;
  const points = G.fillet(
    [
      [wrap[0], 0, ZC],
      [wrap[0] - 6.4, 0, ZC],
      [wrap[0] - 7.6, CY * 0.3, ZC - 7.4],
      [CX, CY, ZC - 10.4],
      [CX, CY, 52],
      [JX + 9.5, JY + 0.4, 41],
      [JX + 9.5, JY, JACK_Z],
      [JX + 4, JY, JACK_Z],
    ],
    4.2,
    14,
    { P, tube: r },
  );
  const gaps = TAPES.map((t) => [lengthAt(points, 2, t.z1), lengthAt(points, 2, t.z0)]).sort((p, q) => p[0] - q[0]);
  route(T, COAX_ID, points, r, { tone: "hi", limp: true, maxLength: 10, rims: [1.75, 1.3], gaps, className: "rl-coax" });
}

// =================================================================== FEED: the SMA pigtail at the driven element
// The coax from the radio comes in at the boom's tail and runs inside the PVC. Inside
// the driven Moxon it leaves the boom through a rubber grommet as a short SMA pigtail
// whose plug screws onto the jack on the feed block's front face, where the front
// U's two halves are soldered. Nothing on it moves in a swap: it loops in front of
// the boom at the boom's height, above where the bottom halves swing back under the
// boom and in front of where the top halves fold back.
// A pad grown out of a curved host (after the Raptor's): its base follows the host's
// surface, found by bisection against the host's true shape.
function pad(piece, name, point, outward, a, h, hosts, style) {
  const inside = (p) => hosts.some((shape) => A.sdf(shape, p) < 0);
  const axis = G.unit3(outward);
  const F = G.frameAlong(point, axis);
  const start = (angle) => {
    let lo = -2.5 * a;
    let hi = h;
    if (!inside(G.pointOf(F, lo, a, angle))) return 0;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      if (inside(G.pointOf(F, mid, a, angle))) lo = mid;
      else hi = mid;
    }
    return hi;
  };
  const low = Math.min(...Array.from({ length: 48 }, (_, index) => start((index / 48) * Math.PI * 2)));
  const id = R.nameFor(name);
  const shape = rec(A.disc(F, low - 0.05, h, a, { name: id, seated: true, cut: hosts }));
  put(piece, G.add3(point, G.mul3(axis, h / 2)), S(G.saddleOf(F, a, start, h, P), { tone: "mid", ...style }), [shape], { name: id });
  return G.add3(point, G.mul3(axis, h));
}
const FEED_PLUG = 3.6; // the plug's far end, from the block's front face
function drawFeed() {
  const T = "station";
  const face = FEED.y + FEED.d;
  const jack = G.frameOf([X_D, face, ZC], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  // the jack's flange, the plug's coupling nut, then its boot
  disc(T, "feed.jack", jack, 0, 0.9, 1.45, { tone: "hi", crease: "lo", className: "rl-gold-part" }, { bevel: 0.2 });
  disc(T, "feed.nut", jack, 0.9, 2.5, 1.2, { tone: "mid", className: "rl-gold-part" }, { bevel: 0.2, inner: Ln(G.arcOf(jack, 1.7, 1.2, P), { tone: "faint" }) });
  disc(T, "feed.boot", jack, 2.5, FEED_PLUG, 0.95, { tone: "mid", className: "rl-rubber" }, { bevel: 0.2 });
  // the grommet on the boom's front face, a little below its equator, between the
  // driven Moxon's two blocks
  const gx = X_D - 9.5;
  const n = G.unit3([0, 1, -0.32]);
  const top = pad(T, "feed.grommet", [gx, n[1] * BOOM_R, ZC + n[2] * BOOM_R], n, 1.3, 1, [FEED_HOST], { className: "rl-rubber" });
  const r = 0.6;
  const out = G.add3(top, G.mul3(n, 3.4));
  const points = G.fillet(
    [
      [X_D, face + FEED_PLUG, ZC],
      [X_D, face + FEED_PLUG + 3.4, ZC],
      [X_D - 4.8, face + FEED_PLUG + 4.4, ZC - 1.5],
      out,
      top,
    ],
    2.6,
    12,
    { P, tube: r },
  );
  route(T, "feed.pigtail", points, r, { tone: "hi", limp: true, maxLength: 6, rims: [0.95, 1.3], className: "rl-coax" });
}

// =================================================================== XBEE BOX
function drawBox(pose) {
  const T = "station";
  const lid = BOX_H;
  slab(T, "box.case", BOX, 0, BOX_H, { tone: "mid", className: "rl-enamel" }, {
    steps: 4,
    bevel: 0.8,
    inner: Ln(k.sideSeam(BOX, BOX_H - 3, P, 4), { tone: "faint" }),
    extra: mat("rl-enamel", Ln(k.planOutline(k.insetPlan(BOX, 1.6), lid, P, 4), { tone: "faint" }) + Dots(k.corners(BOX, 2.6).map(([x, y]) => at([x, y, lid])), { size: 0.42 })),
  });
  const BOARD = { x: BOX.x + 11, y: BOX.y + 2.5, w: 18, d: 15, r: 1 };
  for (const [x, y] of byDepth(k.corners(BOARD, 1.6))) post(T, "box.standoff", x, y, 0.75, lid, 2.2, { tone: "mid" }, { steps: 12 });
  slab(T, "box.board", BOARD, lid + 2.2, 0.9, { tone: "mid", crease: "lo", className: "rl-pcb" }, {
    steps: 2,
    extra: Dots(k.corners(BOARD, 1.6).map(([x, y]) => at([x, y, lid + 3.1])), { size: 0.4, tone: "mid" }) + `<g class="rl-leds">${Dots([at([BOARD.x + 13.4, BOARD.y + 12.8, lid + 3.1]), at([BOARD.x + 15, BOARD.y + 12.8, lid + 3.1]), at([BOARD.x + 16.6, BOARD.y + 12.8, lid + 3.1])], { size: 0.45, tone: "hi" })}</g>`,
  });
  const z0 = lid + 3.1;
  const x0 = BOARD.x + 2.4;
  const y0 = BOARD.y + 2;
  const xb = [[x0, y0], [x0 + 8, y0], [x0 + 8, y0 + 8.4], [x0 + 6, y0 + 10.8], [x0 + 2, y0 + 10.8], [x0, y0 + 8.4]];
  slab(T, "box.header", { x: x0 + 0.2, y: y0 + 0.6, w: 1.1, d: 7.6, r: 0.2 }, z0, 1.3, { tone: "mid", className: "rl-ic" }, { steps: 2 });
  slab(T, "box.header", { x: x0 + 6.7, y: y0 + 0.6, w: 1.1, d: 7.6, r: 0.2 }, z0, 1.3, { tone: "mid", className: "rl-ic" }, { steps: 2 });
  {
    const id = "box.xbee";
    const shape = rec(A.extruded(xb, z0 + 1.3, 0.7, { name: id }));
    put(T, [x0 + 4, y0 + 5.4, z0 + 1.65], S(k.extrude(xb, z0 + 1.3, 0.7, P, { bevel: 0.25 }), { tone: "mid", crease: "lo", className: "rl-pcb" }) + `<g class="rl-gold">${Dots([at([x0 + 4, y0 + 9.6, z0 + 2])], { size: 0.45, tone: "hi" })}</g>`, [shape], { name: id });
  }
  slab(T, "box.can", { x: x0 + 1.2, y: y0 + 1, w: 5.6, d: 5.8, r: 0.4 }, z0 + 2, 1.2, { tone: "mid", className: "rl-metal" }, { steps: 2, bevel: 0.3 });
  slab(T, "box.usb", { x: BOARD.x + 12.4, y: BOARD.y - 0.6, w: 4.4, d: 3.4, r: 0.4 }, z0, 1.6, { tone: "mid", className: "rl-metal" }, { steps: 2 });
  // the data-rate lever and the link LED on the front face
  {
    const face = BOX.y + BOX.d;
    const bush = G.frameOf([BOX.x + 7, face, LEVER.z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    disc(T, "box.bushing", bush, 0, 1.1, LEVER.bush, { tone: "mid" }, { inner: Ln(G.circleOf(bush, 1.1, LEVER.bush - 0.35, P, 24), { tone: "faint" }) });
    ball(T, "box.pivot", LEVER_PIVOT, LEVER.ballR, { tone: "hi" });
    const { axis, tip } = AN.leverOf(pose.slow, LEVER);
    const id = "box.lever";
    const shapes = [rec(A.solid(G.frameAlong(LEVER_PIVOT, axis), [[LEVER.start, LEVER.r0], [LEVER.len, LEVER.r1]], { name: id })), rec(A.ball(tip, LEVER.tipR, { name: `${id}.tip` }))];
    put(T, G.add3(LEVER_PIVOT, G.mul3(axis, LEVER.len / 2)), `<g data-part="lever">${leverSvg(pose.slow)}</g>`, shapes, { name: id });
    const led = G.frameOf([BOX.x + 13.5, face, 6.2], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    disc(T, "box.led", led, 0, 0.7, 0.9, { tone: "hi", crease: "lo", className: "rl-led" });
  }
  // RSSI socket on the front face
  slab(T, "box.socket", { x: WIRE_A - 2.5, y: BOX.y + BOX.d, w: 5, d: 1.6, r: 0.5 }, 3, 4, { tone: "mid" }, { steps: 2 });
}

// =================================================================== RSSI METER
let DIAL_FACE = "";
function drawMeter(pose) {
  const T = "station";
  const onFace = (x, y) => [x, y, faceZ(y)];
  prism(T, "meter.case", METER_F, METER_POLY, 0, METER.w, { tone: "mid", className: "rl-bakelite" }, {
    extra: mat(
      "rl-bakelite",
      Dots([onFace(METER.x + 3.4, METER.y + 3), onFace(METER.x + METER.w - 3.4, METER.y + 3), onFace(METER.x + 3.4, METER.y + METER.depth - 3), onFace(METER.x + METER.w - 3.4, METER.y + METER.depth - 3)].map(at), { size: 0.45 }) +
        Ln(k.pathOf([at([METER.x, METER.y + METER.depth, METER.front - 1.4]), at([METER.x + METER.w, METER.y + METER.depth, METER.front - 1.4])]), { tone: "faint" }),
    ),
  });
  disc(T, "meter.body", DF, 0, DIAL.depth, DIAL.body, { tone: "mid" });
  // the face: zones, scale, sensitivity mark and the zero screw, clipped to the bezel opening
  const minor = [];
  const major = [];
  for (let dbm = M.METER_LOW; dbm <= M.METER_HIGH; dbm += 2) {
    const big = dbm % 10 === 0;
    const a = angleOf(dbm);
    (big ? major : minor).push(k.pathOf([at(facePoint(big ? 8.6 : 9.5, a)), at(facePoint(DIAL.rim, a))]));
  }
  const rim = k.pathOf(Array.from({ length: 81 }, (_, j) => at(facePoint(DIAL.rim, -DIAL.sweep + (j / 80) * DIAL.sweep * 2))));
  const zones = zonesOf(M.sensOf(pose.slow));
  const face = [
    `<path class="rl-zone" data-zone="dead" data-part="zoneDead" d="${zones.dead}"/>`,
    `<path class="rl-zone" data-zone="fade" data-part="zoneFade" d="${zones.fade}"/>`,
    Ln(rim, { tone: "lo" }),
    Ln(minor.join(""), { tone: "lo" }),
    Ln(major.join(""), { tone: "mid" }),
    `<path class="iso-line" data-tone="hi" data-part="sensMark" d="${zones.sens}"/>`,
    `<path class="iso-line" data-tone="mid" data-part="fadeMark" d="${zones.fadeMark}"/>`,
    Ln(faceRing(5.2, 180, 1.1) + k.pathOf([at(faceAt(5.2, 180, -1.1, 0)), at(faceAt(5.2, 180, 1.1, 0))]), { tone: "lo" }),
  ];
  const clipD = G.circleOf(DF, DIAL.depth + DIAL.bezel, DIAL.bezelIn, P, 72);
  disc(T, "meter.bezel", DF, DIAL.depth, DIAL.depth + DIAL.bezel, DIAL.bezelOut, { tone: "mid", crease: "lo" });
  // The face seen through the bezel: zones, scale, marks, needle and hub, clipped to
  // the opening, and the opening's edge. The page puts it in the top layer (nothing
  // stands in front of the dial), so a swinging needle repaints only that layer.
  DIAL_FACE =
    `<g data-hit="meter"><path class="rl-face" d="${clipD}"/>` +
    `<clipPath id="rl-dial"><path d="${clipD}"/></clipPath><g clip-path="url(#rl-dial)">${face.join("")}` +
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1"/>` +
    `${Ln(G.circleOf(DF, DIAL.depth + 0.32, 1.25, P, 20), { tone: "hi" })}${Dots([at(facePoint(0, 0, DIAL.depth + 0.32))], { size: 0.55, tone: "hi" })}</g>` +
    Ln(clipD, { tone: "lo" }) +
    `</g>`;
  // RSSI socket on the case front, fed from the XBee's RSSI PWM pin
  slab(T, "meter.socket", { x: WIRE_B - 2.5, y: METER.y + METER.depth, w: 5, d: 1.6, r: 0.5 }, 1, 3.4, { tone: "mid" }, { steps: 2 });
}

// =================================================================== RSSI WIRE
function drawWire() {
  const T = "station";
  const r = 0.55;
  const fromF = G.frameOf([WIRE_A, BOX.y + BOX.d + 1.6, 5], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const toF = G.frameOf([WIRE_B, METER.y + METER.depth + 1.6, 2.7], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  disc(T, "wire.shell", fromF, 0, 2.2, 1.1, { tone: "mid", className: "rl-rubber" }, { bevel: 0.2 });
  disc(T, "wire.shell", toF, 0, 2.2, 1.1, { tone: "mid", className: "rl-rubber" }, { bevel: 0.2 });
  const points = G.fillet(
    [
      [WIRE_A, BOX.y + BOX.d + 3.8, 5],
      [WIRE_A, BOX.y + BOX.d + 7, 5],
      [WIRE_A, 55.6, 1],
      [WIRE_B, 55.6, 1],
      [WIRE_B, METER.y + METER.depth + 7, 2.7],
      [WIRE_B, METER.y + METER.depth + 3.8, 2.7],
    ],
    4,
    12,
    { P, tube: r },
  );
  route(T, "wire.rssi", points, r, { tone: "mid", limp: true, maxLength: 10, rims: [1.1, 1.1], className: "rl-wire" });
}

// =================================================================== SETTLE
// The live layers must stay where the page draws them: "under" before every
// other item, "over" after, each in its own order. Settling only ever moves keys
// later, so any rule against that shows up here as a moved key.
function checkLive(Rx, label) {
  const keyed = Rx.items.map((item, index) => ({ item, index }));
  const under = keyed.filter(({ item }) => item.live === "under");
  const over = keyed.filter(({ item }) => item.live === "over");
  const rest = keyed.filter(({ item }) => !item.live);
  const problems = [];
  const restMin = Math.min(...rest.map(({ item }) => item.key));
  const restMax = Math.max(...rest.map(({ item }) => item.key + Math.max(0, G.dot3(item.move, V))));
  for (const { item } of under) if (item.key >= restMin) problems.push(`${item.name} (under) settled after ${restMin.toFixed(2)}`);
  for (const { item } of over) if (item.key <= restMax) problems.push(`${item.name} (over) settled before ${restMax.toFixed(2)}`);
  for (const list of [under, over]) for (let i = 1; i < list.length; i++) if (list[i].item.key <= list[i - 1].item.key) problems.push(`${list[i].item.name} reordered inside its layer`);
  console.log(`live layers [${label}]: ${problems.length} problems`);
  for (const line of problems) console.log("  " + line);
  if (problems.length && process.argv.includes("--audit")) process.exitCode = 1;
}

const POSE0 = { fold: 0, whip: 0, slow: 0 };
drawScene(POSE0);
A.settle(R, P);
checkLive(R, "rest");
const MAIN = R;
const BACK = back;
const SHARE0 = M.shareOfKm(M.FIELD_KM);
const keyAt = (item, share) => item.key + G.dot3(item.move, V) * share;
const sorted = MAIN.items.filter((item) => !item.live).sort((a, b) => keyAt(a, SHARE0) - keyAt(b, SHARE0));
const MOVE_SCREEN = k.axisVector(P, MOVE);
const groups = sorted.map((item) => {
  const moving = item.piece === "carriage";
  const lift = G.dot3(item.move, V);
  const transform = moving ? ` transform="translate(${fine(MOVE_SCREEN[0] * SHARE0)} ${fine(MOVE_SCREEN[1] * SHARE0)})"` : "";
  const hit = hitOf(item.name);
  return `<g class="it" data-k="${item.key.toFixed(3)}"${hit ? ` data-hit="${hit}"` : ""}${moving ? ` data-l="${lift.toFixed(3)}" data-move=""` : ""}${transform}>${item.svg}</g>`;
});
// the turning parts are drawn by the page on mount (antenna.mjs), into these layers
const underSvg = `<g class="rl-under" data-hit="antenna"></g>`;
const overSvg = `<g class="rl-over" data-hit="antenna"></g>`;

// =================================================================== SIGNAL
// A halftone field in the link plane: a fixed hexagonal screen of dots whose area
// is the received power at that distance, in dB above sensitivity.
const SIG_GX = 3.6;
const SIGNAL = {
  zw: ZW,
  rhoMin: 9,
  gx: SIG_GX,
  gz: SIG_GX * 0.866,
  wave: 10.5,
  speed: 15,
  floor: 0.06,
  psiMax: 38 * DEG,
  psiSoft: 14 * DEG,
  zLow: CAN_TOP + 1.5,
  zHigh: ZW + 25,
  soft: 8,
  stop: BOOM.front + BOOM.cap + 3,
  rMax: fine(SIG_GX * KS * 0.34),
  rMin: 0.3,
  fullDb: M.marginDb(0.01),
};
// (the signal is drawn by the page, signal.mjs, in the top layer)

// =================================================================== HIT REGIONS
// Screen hulls (viewBox units) the page tests the pointer against.
const boxPts = (x0, x1, y0, y1, z0, z1) => [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => at([x, y, z]))));
const hull2 = (points) => hullOf(points).map(([x, y]) => [fine(x), fine(y)]);
const REGIONS = {
  carriage: [hull2(boxPts(CAR.x - 2, CAR.x + CAR.w + 9, CAR.y - 2, STRIP_MID, RUN_Z, CAR_TOP + 2)), hull2(boxPts(X0 - CAN_R - 1.5, X0 + CAN_R + 1.5, -CAN_R - 1.5, CAN_R + 1.5, CAR_TOP, WHIP_Z1 + 3))],
  antenna: [
    // the elements up (and the feed pigtail in front), and folded back behind the boom
    hull2(boxPts(X_R - 4, BOOM.front + BOOM.cap + 2, -4, 12, ZC - DIR_HALF - 2, ZC + DIR_HALF + 3)),
    hull2(boxPts(X_R - 4, BOOM.front + BOOM.cap + 2, -DIR_HALF - 2, 4, Z_LOW - 3, Z_TOP + 3)),
    hull2(boxPts(BOOM.back - BOOM.cap - 14, X_R - 4, -6, 13, CLAMP_Z - 2, WHIP_Z + WHIP_BALL_S + 2)),
  ],
  radio: [hull2(boxPts(BOX.x - 1, BOX.x + BOX.w + 1, BOX.y - 1, BOX.y + BOX.d + 6, 0, BOX_H + 6))],
  meter: [hull2([...boxPts(METER.x - 1, METER.x + METER.w + 1, METER.y - 1, METER.y + METER.depth + 3, 0, METER.front), ...boxPts(METER.x - 1, METER.x + METER.w + 1, METER.y - 1, METER.y + 1, 0, METER_BACK + 4)])],
  band: [hull2(boxPts(RAIL.x - 4, PLATE.x + PLATE.w - 6, RAIL.y - 8, STRIP.y + STRIP.d + 6, 0, RAIL_H + 3))],
};

// =================================================================== FIGURE
const LABEL =
  "A bench model of a CanSat radio link. On the left a tripod carries a Moxon–Yagi antenna on a PVC boom wrapped with duct tape: two Moxon rectangles of bent aluminium rod, one behind the other, each made of two U-shaped halves whose tips face each other across a small gap; the rear rectangle is the reflector and the front one the driven element, fed by an SMA pigtail. Ahead of them stand five straight directors, each a little shorter than the one before. Every element is hinged on clamp blocks on the boom. A stock whip folds on a knuckle at the mast head. The coax runs down the mast to an XBee radio box with a data-rate lever, which drives an analogue RSSI meter. On the right a CanSat, cut away to show its stack of boards, stands on a carriage that slides along a log-scale rail from 0.1 to 4 km. A halftone field of orange dots spreads from the can's whip toward the antenna, its dots smaller the further the signal travels, and the meter needle reads the received power.";
// Four stacked <svg>s with one viewBox: the bench (static), the dBm scale with the
// folding parts under the boom, the items (the carriage moves in them), and on top
// the parts above the boom, the dial face and the signal. The two live layers are
// composited on their own, so a swap or a drifting crest repaints only them.
const layerSvg = (cls, body) => `<svg class="iso-svg rl-layer ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${body}</svg>`;
const ticksSvg = `<path class="iso-line rl-tick" data-tone="lo" data-part="dbmMinor"/><path class="iso-line rl-tick" data-tone="mid" data-part="dbmMajor"/>`;
const svg =
  k.figureSvg({ width: W, height: H, label: LABEL, body: BACK }) +
  layerSvg("rl-moving", ticksSvg + underSvg) +
  layerSvg("rl-mid", `<g class="rl-items">${groups.join("")}</g>`) +
  layerSvg("rl-moving", overSvg + DIAL_FACE + `<path class="rl-sig" data-part="signal"/>`);
const readout = M.readoutOf(M.FIELD_KM, M.G_YAGI_DBI, M.SENS_FAST_DBM);
const round = (value) => Math.round(value);
const MOX_W = (MOX.A / LAMBDA).toFixed(2);
const MOX_DEEP = (MOX_E / LAMBDA).toFixed(2);
const MOX_APART = ((MOXONS[1].x0 - MOXONS[0].x1) / LAMBDA).toFixed(2);
const DIR_STEP = DIRS.slice(1).map((d, i) => ((d.x - DIRS[i].x) / LAMBDA).toFixed(2));
const DIR_APART = [...new Set([Math.min(...DIR_STEP), Math.max(...DIR_STEP)].map((v) => v.toFixed(2)))].join("–");
const BOOM_L = ((X_L - X_R) / LAMBDA).toFixed(1); // reflector to last director
const minus = (value) => (value < 0 ? "−" + Math.abs(value) : String(value));
const caption =
  `A free-space budget for the EEPISAT downlink at ${M.F_MHZ} MHz (λ ≈ ${Math.round(M.LAMBDA_MM)} mm). The XBee-PRO 900HP sends ${M.TX_DBM} dBm from a ${M.G_CAN_DBI} dBi whip on the can, and ${M.LOSS_DB} dB goes in coax and connectors. ` +
  `At the ground the Moxon–Yagi gives about ${M.G_YAGI_DBI} dBi with two Moxon rectangles — reflector and driven element — and five directors, on a PVC boom ${BOOM_L} λ long. Each rectangle is bent aluminium rod, two U halves with their tips facing across a small gap, ${MOX_W} λ wide and ${MOX_DEEP} λ deep; the two stand ${MOX_APART} λ apart, and an SMA pigtail feeds the front one. The straight directors taper from ${DIR_LEN[0]} λ to ${DIR_LEN[DIR_LEN.length - 1]} λ, ${DIR_APART} λ apart. The stock whip gives ${M.G_STOCK_DBI}. ` +
  `At ${M.RATE_FAST_KBPS} kb/s the radio hears down to ${minus(M.SENS_FAST_DBM)} dBm, at ${M.RATE_SLOW_KBPS} kb/s down to ${minus(M.SENS_SLOW_DBM)}. ` +
  `At the ${M.FIELD_KM} km field-test mark free space takes ${M.fsplDb(M.FIELD_KM).toFixed(1)} dB, so the Moxon–Yagi receives ${minus(round(M.rxDbm(M.FIELD_KM)))} dBm and leaves ${round(M.marginDb(M.FIELD_KM))} dB at ${M.RATE_FAST_KBPS} kb/s (${round(M.marginDb(M.FIELD_KM, M.G_YAGI_DBI, M.SENS_SLOW_DBM))} at ${M.RATE_SLOW_KBPS} kb/s), the whip ${round(M.marginDb(M.FIELD_KM, M.G_STOCK_DBI))}. ` +
  `On the meter the dead zone ends where the radio stops hearing and the fade reserve keeps the next ${M.FADE_DB} dB in hand; ${M.marginDb(M.D_MAX_KM, M.G_STOCK_DBI) > M.FADE_DB ? "with either antenna the needle stays clear of the reserve along the whole rail" : "the whip reaches the reserve before the rail’s end"}, and at ${M.RATE_SLOW_KBPS} kb/s both zones sit ${M.SENS_FAST_DBM - M.SENS_SLOW_DBM} dB lower. ` +
  `Real flights lose more than this: the can tumbles, the ground reflects and the Fresnel zone is never fully clear, which is why the flight kept 99% of packets rather than all of them.`;
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function swatch(mark) {
  // the meter's two zones: a band of the dial's arc, filled as on the dial
  if (mark.startsWith("zone")) return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 9.5A6.5 6.5 0 0 1 14.5 9.5H11A3 3 0 0 0 5 9.5Z"/></svg>`;
  if (mark === "raised") return `<svg class="iso-swatch" data-mark="raised" viewBox="0 0 16 10" aria-hidden="true"><path d="M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z"/><path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/></svg>`;
  return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
const KEYS = [
  ["lit", "Needle: received power, dBm"],
  ["dotted", "Signal: dot area is power above sensitivity"],
  ["raised", `Ruler: log distance ${M.D_MIN_KM}–${M.D_MAX_KM} km over the dBm it gives`],
  ["zone-dead", "Dead zone: below what the radio hears"],
  ["zone-fade", `Fade reserve: the next ${M.FADE_DB} dB (R moves both)`],
];
const chip = (act, label, value, key) => `<button type="button" class="rl-chip" data-act="${act}" aria-keyshortcuts="${key}"><span class="rl-chip-k">${label}</span><span class="rl-chip-v" data-val="${act}">${esc(value)}</span><kbd aria-hidden="true">${key}</kbd></button>`;
const plate =
  `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">` +
  `<span class="iso-plate-corner" data-corner="fig">Fig 01</span><span class="iso-plate-corner" data-corner="title">The 4 km link</span>` +
  `<span class="iso-plate-corner" data-corner="hint">Drag the CanSat · click the antenna or radio</span><span class="iso-plate-corner" data-corner="readout" data-readout>${esc(readout)}</span></div>` +
  `<div class="rl-stage" data-cursor="none" tabindex="0" role="slider" aria-label="Radio link bench. Arrow keys move the CanSat between ${M.D_MIN_KM} and ${M.D_MAX_KM} kilometres; A swaps the ground antenna between the Moxon–Yagi (two Moxon rectangles and five directors) and the stock whip; R switches the data rate." aria-valuemin="${M.D_MIN_KM}" aria-valuemax="${M.D_MAX_KM}" aria-valuenow="${M.FIELD_KM}" aria-valuetext="${esc(M.spokenOf(M.FIELD_KM))}">${svg}</div><span class="rl-live" aria-live="polite"></span></div>` +
  `<figcaption class="iso-legend"><span class="rl-chips" role="group" aria-label="Link settings">${chip("antenna", "Antenna", M.antennaText(1), "A")}${chip("rate", "Rate", M.rateText(0), "R")}</span>` +
  `<span class="iso-keys">${KEYS.map(([mark, label]) => `<span class="iso-key">${swatch(mark)}${esc(label)}</span>`).join("")}</span>` +
  `<span class="iso-caption">${esc(caption)}</span></figcaption></figure>`;

// =================================================================== OUTPUTS
const DATA = {
  P,
  W,
  H,
  X0,
  TRAVEL,
  moveScreen: MOVE_SCREEN,
  share0: SHARE0,
  stops: M.STOPS_KM,
  field: M.FIELD_KM,
  dial: { c: DIAL_C, n: N, right: RIGHT, up: UP, s: DIAL.depth + 0.3, face: DIAL.depth + 0.02, tail: -2.6, tip: 10.3, sweep: DIAL.sweep, low: M.METER_LOW, high: M.METER_HIGH, zone: DIAL.zone, rim: DIAL.rim },
  ruler: { x0: X0, x1: X1, strip: [STRIP.x + 1.6, STRIP.x + STRIP.w - 1.6], front: STRIP_FRONT, z: STRIP_H, ticks: TICK.dbm },
  signal: { ...SIGNAL, x0: X0, travel: TRAVEL },
  ant: ANT,
  tube: TUBE,
  fixed: FIXED,
  lever: LEVER,
  regions: REGIONS,
  // pointer mapping: the index's screen x at both ends of the travel, as fractions of the viewBox width
  reach: [at([X0, 0, RUN_Z])[0] / W, at([X1, 0, RUN_Z])[0] / W],
};
const inline = (file, name) => {
  const source = stripComments(readFileSync(file, "utf8")).replace(/^import .*$/gm, "");
  const names = [...source.matchAll(/^export (?:const|function) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  return `const ${name} = (() => {\n${source.replace(/^export /gm, "")}\nreturn { ${names.join(", ")} };\n})();`;
};
// The page's own code, and the kit functions it reaches. The kit modules are shaken
// down to what that code names (G.x for the lathe, TB.x for the tube module, bare
// names for the core), and each module to what the others need from it.
const KIT_DIR = join(HERE, "../kit");
// (the shipped copy drops whole-line comments; the sources here keep them)
const read = (file) => stripComments(readFileSync(file, "utf8"));
const own = [read(join(HERE, "antenna.mjs")), read(join(HERE, "signal.mjs")), read(join(HERE, "live.js"))].join("\n");
const refs = (text, ns) => [...new Set([...text.matchAll(new RegExp(`\\b${ns}\\.([A-Za-z_$][\\w$]*)`, "g"))].map((m) => m[1]))];
const kitSource = read(join(KIT_DIR, "iso-kit.mjs"));
const kitNames = new Set([...kitSource.matchAll(/^export (?:const|function) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]));
const TBX = shake(read(join(KIT_DIR, "tube.mjs")), refs(own, "TB"));
const GX = shake(read(join(KIT_DIR, "lathe.mjs")), [...refs(own, "G"), ...refs(TBX.source, "G")]);
const words = (text) => new Set(text.match(/[A-Za-z_$][\w$]*/g));
const KX = shake(kitSource, [...new Set([...words(own), ...GX.free, ...TBX.free])].filter((name) => kitNames.has(name)));
const module = (name, x, exported) => `const ${name} = (() => {\n${x.source}\nreturn { ${exported.filter((n) => x.names.includes(n)).join(", ")} };\n})();`;
const bundle = [
  "// Generated by tools/anatomy/radio-link/build.mjs — do not edit by hand.",
  "// Isometric kit: Anatomy (MIT, see tools/anatomy/kit/LICENSE), shaken to what the page uses.",
  KX.source,
  module("G", GX, [...refs(own, "G"), ...refs(TBX.source, "G")]),
  module("TB", TBX, refs(own, "TB")),
  inline(join(HERE, "model.mjs"), "LINK"),
  inline(join(HERE, "antenna.mjs"), "AN"),
  `const DATA = ${JSON.stringify(DATA)};`,
  read(join(HERE, "signal.mjs")).replace(/^export /gm, ""),
  `const MARKUP = ${JSON.stringify(compactMarkup(plate))};`,
  read(join(HERE, "live.js")),
].join("\n");

const THEME_CSS = `
.iso[data-theme="light"]{
  --anatomy-page:#F1F0EB;--anatomy-card:#F7F6F2;--anatomy-text:#55554F;--anatomy-strong:#0E0E0C;--anatomy-muted:#8E8D86;
  --anatomy-paper:#F7F6F2;--anatomy-face:#FBFAF7;--anatomy-top:#FDFCF9;
  --anatomy-shade-0:#DCDAD3;--anatomy-shade-1:#E4E2DC;--anatomy-shade-2:#ECEAE5;--anatomy-shade-3:#F3F2ED;
  --anatomy-lit-top:#FDFCF9;--anatomy-lit-shade:#ECEAE5;
  --anatomy-hi:#1A1A18;--anatomy-mid:#8A8983;--anatomy-lo:#B5B3AC;--anatomy-faint:#D6D4CD;--anatomy-lit:#0E0E0C;
  --anatomy-halo:#8A8676;--anatomy-halo-opacity:.3;--anatomy-dot:#2A2A27;
  --anatomy-accent:#FF4A1C;
  --anatomy-mono:"Geist Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --rl-cavity:#C9C5BB;--rl-zone-dead:#BDB9AF;--rl-zone-fade:#F9C3B0;
}
.iso{--anatomy-accent:#FF5A26;--rl-cavity:#0e0e0e;--rl-zone-dead:#3a3a3a;--rl-zone-fade:#4a2418}
.iso .iso-figure{margin:0}
.iso[data-theme="light"] .iso-plate{box-shadow:0 0 0 1px rgba(14,14,12,.12)}
.iso .iso-legend{font-size:13px;line-height:1.55}
.iso .iso-keys{font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.02em}
.iso .iso-key:nth-child(2) .iso-swatch path{stroke:var(--anatomy-accent)}
.iso .rl-stage{position:relative;outline:none;touch-action:pan-y;cursor:default;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.iso .rl-stage[data-hot="band"]{cursor:ew-resize}
.iso .rl-stage[data-hot="carriage"]{cursor:grab}
.iso .rl-stage[data-drag]{cursor:grabbing}
.iso .rl-stage[data-hot="antenna"],.iso .rl-stage[data-hot="radio"],.iso .rl-stage[data-hot="meter"]{cursor:pointer}
.iso .rl-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.iso .rl-stage .iso-edge,.iso .rl-stage .tb-edge{transition:stroke .18s ease}
.iso .rl-stage[data-hot="antenna"] [data-hit="antenna"] .iso-edge,.iso .rl-stage[data-hot="antenna"] [data-hit="antenna"] .tb-edge,
.iso .rl-stage[data-hot="radio"] [data-hit="radio"] .iso-edge,.iso .rl-stage[data-hot="meter"] [data-hit="meter"] .iso-edge,
.iso .rl-stage[data-hot="carriage"] [data-hit="carriage"] .iso-edge,.iso .rl-stage[data-drag] [data-hit="carriage"] .iso-edge{stroke:var(--anatomy-strong)}
.iso .rl-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.iso .rl-stage .rl-layer{position:absolute;left:0;top:0;pointer-events:none}
.iso .rl-stage .rl-moving{will-change:transform}
.iso path.rl-sig{fill:var(--anatomy-accent);stroke:none}
.iso .rl-face{fill:var(--anatomy-face);stroke:none}
.iso .rl-zone{stroke:none}
.iso .rl-zone[data-zone="dead"]{fill:var(--rl-zone-dead)}
.iso .rl-zone[data-zone="fade"]{fill:var(--rl-zone-fade)}
.iso .iso-swatch[data-mark="zone-dead"] path{fill:var(--rl-zone-dead);stroke:none}
.iso .iso-swatch[data-mark="zone-fade"] path{fill:var(--rl-zone-fade);stroke:none}
.iso .rl-cavity-bg{fill:var(--rl-cavity);stroke:none}
.iso[data-theme="light"] .rl-coax{--anatomy-shade-2:#55544F;--anatomy-top:#7C7B75;--anatomy-shade-0:#33322F}
.iso[data-theme="light"] .rl-cavity{--anatomy-paper:#DCD9D1;--anatomy-top:#E6E3DC;--anatomy-face:#E6E3DC;--anatomy-shade-0:#C6C3BA;--anatomy-shade-1:#CDCAC2;--anatomy-shade-2:#D4D1C9;--anatomy-shade-3:#DBD8D0;--anatomy-hi:#3A3A36}
.iso[data-theme="light"] .rl-pcb{--anatomy-paper:#A9A79D;--anatomy-top:#B4B2A8;--anatomy-shade-0:#8F8D84;--anatomy-shade-1:#97958C;--anatomy-shade-2:#9F9D94;--anatomy-shade-3:#A7A59C;--anatomy-mid:#6E6D66}
.iso[data-theme="light"] .rl-chip-part{--anatomy-paper:#F4F2EC;--anatomy-top:#FAF9F5;--anatomy-shade-0:#D9D6CE;--anatomy-shade-1:#E1DED7;--anatomy-shade-2:#E8E6DF;--anatomy-shade-3:#EFEDE7;--anatomy-mid:#6E6D66}
.iso[data-theme="light"] .rl-cell{--anatomy-top:#ECE9E2;--anatomy-mid:#6E6D66}
.iso[data-theme="light"] .rl-ic{--anatomy-paper:#3B3A36;--anatomy-top:#4D4C47;--anatomy-face:#4D4C47;--anatomy-shade-0:#2B2A27;--anatomy-shade-1:#31302C;--anatomy-shade-2:#373632;--anatomy-shade-3:#3E3D39;--anatomy-mid:#1E1E1B;--anatomy-hi:#0E0E0C;--anatomy-lo:#2A2A27;--anatomy-faint:#6A6963}
.iso[data-theme="light"] .rl-metal{--anatomy-paper:#E3E2DC;--anatomy-top:#F3F2ED;--anatomy-face:#F3F2ED;--anatomy-shade-0:#C3C1BA;--anatomy-shade-1:#CBC9C2;--anatomy-shade-2:#D3D1CA;--anatomy-shade-3:#DBD9D2;--anatomy-mid:#6E6D66}
.iso[data-theme="light"] .rl-patch{--anatomy-paper:#E4DFD2;--anatomy-top:#EEEAE0;--anatomy-shade-0:#CCC6B7;--anatomy-shade-1:#D3CDBF;--anatomy-shade-2:#DAD5C7;--anatomy-shade-3:#E0DBCE;--anatomy-mid:#6E6D66}
.iso[data-theme="light"] .rl-gold{--anatomy-dot:#F4F2EB}
.iso[data-theme="light"] .rl-gold-part{--anatomy-paper:#E3E2DC;--anatomy-top:#F3F2ED;--anatomy-face:#F3F2ED;--anatomy-shade-0:#C3C1BA;--anatomy-shade-1:#CBC9C2;--anatomy-shade-2:#D3D1CA;--anatomy-shade-3:#DBD9D2;--anatomy-mid:#6E6D66}
.iso .rl-tick{stroke-width:.8px}
/* colour mode (the site's Mono / Color switch): every part in its natural colour */
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-pcb{--anatomy-paper:#3E7B56;--anatomy-top:#4B8A64;--anatomy-face:#4B8A64;--anatomy-shade-0:#2D5E41;--anatomy-shade-1:#326647;--anatomy-shade-2:#376E4D;--anatomy-shade-3:#3D7653;--anatomy-mid:#1F3E2D;--anatomy-lo:#2A4F3A;--anatomy-faint:#62987A}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-metal{--anatomy-paper:#DADDDF;--anatomy-top:#EDEFF0;--anatomy-face:#EDEFF0;--anatomy-shade-0:#B6BBBF;--anatomy-shade-1:#BFC3C7;--anatomy-shade-2:#C8CCCF;--anatomy-shade-3:#D1D4D7;--anatomy-mid:#5F6467}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-patch{--anatomy-paper:#CDB88E;--anatomy-top:#DAC79F;--anatomy-shade-0:#B29D74;--anatomy-shade-1:#BAA57B;--anatomy-shade-2:#C2AD83;--anatomy-shade-3:#C9B48A;--anatomy-mid:#6B5C42}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-cell{--anatomy-paper:#6F8FB0;--anatomy-top:#86A3C1;--anatomy-face:#86A3C1;--anatomy-shade-0:#506F90;--anatomy-shade-1:#577798;--anatomy-shade-2:#5F7FA0;--anatomy-shade-3:#6787A8;--anatomy-mid:#2E4864;--anatomy-lo:#3B5874}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-gold{--anatomy-dot:#D9A934}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-gold-part{--anatomy-paper:#D9B45A;--anatomy-top:#E8C978;--anatomy-face:#E8C978;--anatomy-shade-0:#A9832F;--anatomy-shade-1:#B58F3A;--anatomy-shade-2:#C29C46;--anatomy-shade-3:#CDA851;--anatomy-mid:#7A5C1C;--anatomy-lo:#8E7030;--anatomy-faint:#B89443}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-leds circle:nth-child(1){fill:#E5533D}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-leds circle:nth-child(2){fill:#F2B33D}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-leds circle:nth-child(3){fill:#3DAF6B}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-leds circle{opacity:1}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-led{--anatomy-paper:#7CCB98;--anatomy-top:#A9E2BD;--anatomy-face:#A9E2BD;--anatomy-shade-0:#4FA672;--anatomy-shade-1:#5AAF7C;--anatomy-shade-2:#66B886;--anatomy-shade-3:#72C190;--anatomy-hi:#1F5B39;--anatomy-lo:#2F7A50}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-alu{--anatomy-paper:#E4E7EA;--anatomy-top:#F2F4F5;--anatomy-face:#F2F4F5;--anatomy-shade-0:#AEB4B9;--anatomy-shade-1:#BAC0C4;--anatomy-shade-2:#C9CED2;--anatomy-shade-3:#D6DADD}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-whip,:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-cap{--anatomy-paper:#3A3A38;--anatomy-top:#5E5E5A;--anatomy-face:#5E5E5A;--anatomy-shade-0:#242422;--anatomy-shade-1:#2A2A28;--anatomy-shade-2:#31312E;--anatomy-shade-3:#393936}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-tape{--anatomy-paper:#C9CCCE;--anatomy-top:#DCDFE0;--anatomy-face:#DCDFE0;--anatomy-shade-0:#A6AAAD;--anatomy-shade-1:#AFB3B6;--anatomy-shade-2:#B8BCBE;--anatomy-shade-3:#C1C4C6;--anatomy-faint:#9A9EA1}
:root[data-ht-mode="color"] .iso[data-theme="light"]{--rl-zone-dead:#E79A8C;--rl-zone-fade:#F7CF7E}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-ply{--anatomy-paper:#EADDC4;--anatomy-top:#F1E8D6;--anatomy-face:#F1E8D6;--anatomy-shade-0:#CBB693;--anatomy-shade-1:#D4C09F;--anatomy-shade-2:#DCCBAC;--anatomy-shade-3:#E4D5BA;--anatomy-mid:#A08C6C;--anatomy-lo:#BCA886;--anatomy-faint:#D8C7A8;--anatomy-dot:#6E5B3E}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-rubber{--anatomy-paper:#3B3B39;--anatomy-top:#4D4D4A;--anatomy-face:#4D4D4A;--anatomy-shade-0:#262624;--anatomy-shade-1:#2C2C2A;--anatomy-shade-2:#333331;--anatomy-shade-3:#3A3A38;--anatomy-mid:#1A1A18;--anatomy-hi:#111110;--anatomy-lo:#5C5C58;--anatomy-faint:#62625E}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-anod{--anatomy-paper:#E0E4E7;--anatomy-top:#EEF1F3;--anatomy-face:#EEF1F3;--anatomy-shade-0:#B2B9BF;--anatomy-shade-1:#BDC4C9;--anatomy-shade-2:#C9CFD4;--anatomy-shade-3:#D5DADE;--anatomy-mid:#7C858C;--anatomy-lo:#A3ABB2;--anatomy-faint:#C2C8CD;--anatomy-dot:#4F575D}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-enamel{--anatomy-paper:#7D92A4;--anatomy-top:#93A7B8;--anatomy-face:#93A7B8;--anatomy-shade-0:#5B6F82;--anatomy-shade-1:#63778A;--anatomy-shade-2:#6C8093;--anatomy-shade-3:#75899C;--anatomy-mid:#3D4E5D;--anatomy-lo:#506273;--anatomy-faint:#A8B9C7;--anatomy-dot:#22303C}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-bakelite{--anatomy-paper:#3F3D39;--anatomy-top:#54514C;--anatomy-face:#54514C;--anatomy-shade-0:#2A2825;--anatomy-shade-1:#302E2B;--anatomy-shade-2:#363431;--anatomy-shade-3:#3D3B37;--anatomy-mid:#1B1A18;--anatomy-lo:#5F5C56;--anatomy-faint:#68655F;--anatomy-dot:#CFCBC2}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-brass{--anatomy-paper:#D3B266;--anatomy-top:#E0C47D;--anatomy-face:#E0C47D;--anatomy-shade-0:#A8863E;--anatomy-shade-1:#B39249;--anatomy-shade-2:#BE9E54;--anatomy-shade-3:#C9A85D;--anatomy-mid:#7C6126;--anatomy-lo:#8E7435;--anatomy-faint:#B6984F;--anatomy-dot:#5A461B}
:root[data-ht-mode="color"] .iso[data-theme="light"] .rl-wire{--anatomy-shade-2:#B9483B;--anatomy-top:#D9786A;--anatomy-shade-0:#86291F;--anatomy-mid:#6E2219}
.iso .rl-chips{display:flex;flex-wrap:wrap;gap:8px}
.iso .rl-chip{display:inline-flex;align-items:center;gap:8px;margin:0;padding:6px 8px 6px 10px;border:1px solid rgba(14,14,12,.14);border-radius:0;background:transparent;color:var(--anatomy-text);font:500 11px/1.2 var(--anatomy-mono);letter-spacing:.02em;cursor:pointer;transition:border-color .2s ease,background-color .2s ease}
.iso .rl-chip:hover{border-color:rgba(14,14,12,.4)}
.iso .rl-chip:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:3px}
.iso .rl-chip-k{color:var(--anatomy-muted);text-transform:uppercase;letter-spacing:.08em}
.iso .rl-chip-v{color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.iso .rl-chip kbd{font:inherit;color:var(--anatomy-muted);border:1px solid rgba(14,14,12,.14);padding:0 4px;line-height:15px}
@media (max-width:560px){.iso .iso-plate{padding:46px 0 64px;overflow:hidden}.iso .iso-plate-corners{inset:16px 14px}.iso .iso-legend{padding:0 2px}.iso .rl-chip kbd{display:none}}
@media (hover:none){.iso .rl-chip kbd{display:none}}
`;
// scope the kit's class rules under .iso so nothing reaches outside the figure
const scoped = (text) => text.replace(/(^|[{},])(\s*)(\.(?:iso|tb)-)/g, "$1$2.iso $3").replace(/(^|[{},])(\s*)(\.tb\b)/g, "$1$2.iso $3");
const css = scoped(k.ISO_CSS) + THEME_CSS;

mkdirSync(join(REPO, "assets/js"), { recursive: true });
mkdirSync(join(REPO, "assets/css"), { recursive: true });
writeFileSync(join(REPO, "assets/js/fig-link.js"), bundle);
writeFileSync(join(REPO, "assets/css/iso.css"), css);
console.log(`wrote assets/js/fig-link.js ${(bundle.length / 1024).toFixed(0)} KB (${(gzipSync(bundle, { level: 9 }).length / 1024).toFixed(1)} KB gzipped) · ${MAIN.items.length} items · ${MAIN.solids.length} solids · ${MAIN.tubes.length} tube runs · scale ${KS.toFixed(3)}`);

const test = argAfter("--test");
if (test) {
  mkdirSync(join(test, "assets/js"), { recursive: true });
  mkdirSync(join(test, "assets/css"), { recursive: true });
  writeFileSync(join(test, "assets/js/fig-link.js"), bundle);
  writeFileSync(join(test, "assets/css/iso.css"), css);
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fig 01 test</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/iso.css">
<style>*{box-sizing:border-box}img,svg,canvas{display:block;max-width:100%}body{margin:0;background:#F1F0EB;color:#0E0E0C;font:16px/1.6 Geist,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.col{width:min(760px,100% - 32px);margin:64px auto 96px}.col h2{font-weight:500;letter-spacing:-.04em;font-size:40px;margin:0 0 8px}.col p{color:#55554F;margin:0 0 32px}</style></head>
<body><main class="col"><h2>The 4 km link</h2><p>A homemade Moxon–Yagi, an XBee and a CanSat.</p><div class="iso" data-theme="light" id="fig-link"></div><p style="margin-top:32px">Text after the figure.</p></main>
<script type="module">import("./assets/js/fig-link.js");</script></body></html>`;
  writeFileSync(join(test, "index.html"), page);
  console.log("wrote", join(test, "index.html"));
}

// =================================================================== AUDIT
// The rest pose (what the page loads with), then the swap and rate change part
// way and fully over. Each pose is drawn, settled and audited on its own.
if (process.argv.includes("--audit")) {
  console.log("\n=== pose: rest (Moxon–Yagi up: two Moxon rectangles and five directors; whip folded; 200 kb/s)");
  A.auditOrExit(MAIN, P);
  if (process.argv.includes("--quick")) process.exit(process.exitCode ?? 0);
  if (process.argv.includes("--folded")) {
    drawScene({ fold: 1, whip: 1, slow: 1 });
    A.settle(R, P);
    console.log("\n=== pose: folded");
    checkLive(R, "folded");
    A.auditOrExit(R, P);
    process.exit(process.exitCode ?? 0);
  }
  // A swap folds the seven elements one after another, so a pose's fold is a mix
  // of element angles. Besides the even steps, audit either side of every place an
  // element's rods change sides on their barrels (the order in its layer flips there).
  const n = ANT.dirs.length + ANT.moxons.length - 1;
  const toFold = (e, f) => ((n - e) / n) * ANT.stagger + f * (1 - ANT.stagger);
  const top = Math.atan(ANT.seeTop) / (Math.PI / 2);
  const flips = Array.from({ length: n + 1 }, (_, e) => [e, top]).flatMap(([e, f]) => [toFold(e, f) - 0.012, toFold(e, f) + 0.012]);
  const POSES = [
    { label: "fold 0.15 · whip 0 · rate 0.5", fold: 0.15, whip: 0, slow: 0.5 },
    { label: "fold 0.3 · whip 0 · rate 1", fold: 0.3, whip: 0, slow: 1 },
    { label: "fold 0.45 · whip 0.1", fold: 0.45, whip: 0.1, slow: 0 },
    { label: "fold 0.6 · whip 0.25 · rate 1", fold: 0.6, whip: 0.25, slow: 1 },
    { label: "fold 0.75 · whip 0.5", fold: 0.75, whip: 0.5, slow: 0 },
    { label: "fold 0.9 · whip 0.75", fold: 0.9, whip: 0.75, slow: 1 },
    { label: "swapped: Moxon–Yagi folded, whip up, 10 kb/s", fold: 1, whip: 1, slow: 1 },
    { label: "fold 0.5 · whip 1", fold: 0.5, whip: 1, slow: 0 },
    { label: "fold 0.97 · whip 0.95", fold: 0.97, whip: 0.95, slow: 0.8 },
    ...flips.map((fold, i) => ({ label: `fold ${fold.toFixed(3)} (an element's barrel side) · whip ${i % 3 ? 0.4 : 0}`, fold, whip: i % 3 ? 0.4 : 0, slow: 0 })),
  ];
  // Mid-swing only, two things are named and excused; at rest and folded every check
  // runs in full:
  //  - a bottom half turning back crosses behind the boom (or the feed pigtail) on
  //    screen, 20–30 units behind it: it passes, it does not meet it;
  //  - a bottom Moxon half turns through the plane that holds the line of sight
  //    (about 43–72° into its swing), where its front L is seen edge-on and the
  //    tube's outline folds back on itself for a few frames.
  const PASSING = [["director.rod", "boom.pvc"], ["moxon.*", "boom.pvc"], ["moxon.*", "feed.pigtail"]];
  const EDGE_ON = (name) => /^moxon\./.test(name);
  for (const pose of POSES) {
    drawScene(pose);
    A.settle(R, P);
    console.log(`\n=== pose: ${pose.label}`);
    checkLive(R, pose.label);
    if (!(pose.fold > 0 && pose.fold < 1)) {
      A.auditOrExit(R, P);
      continue;
    }
    const result = A.audit(R, P, { crowd: PASSING });
    const folds = result.folds.filter((f) => !EDGE_ON(f.name));
    const self = result.self.filter((f) => !EDGE_ON(f.name));
    const excused = result.folds.length - folds.length + result.self.length - self.length;
    const kept = { ...result, folds, self };
    console.log(A.report(kept));
    if (excused) console.log(`(excused mid-swing: ${excused} edge-on frame${excused === 1 ? "" : "s"} of a bottom Moxon half)`);
    const count = A.failures(kept);
    console.log(count ? `audit failed: ${count} problem${count === 1 ? "" : "s"}` : "audit passed");
    if (count) process.exitCode = 1;
  }
}
