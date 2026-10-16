// The parts of Fig 01 that turn: the Moxon–Yagi's elements fold on their hinges
// and the stock whip stands up on its knuckle. Shared by the build (first frame,
// shapes for the audit) and the page (every frame of a swap); inlined into
// assets/js/fig-link.js, so no imports.
//
// pose.fold 0..1: 0 = every element up in the link plane, 1 = folded for the bag.
//   The Moxon's four halves (each an L of bent rod: an arm up or down from the boom
//   and a tail along it, toward the open gap) hinge on pins that run across the
//   boom, so they swing in the link plane and lie down along it: the reflector's
//   back toward the mast, the driven element's forward toward the director, every
//   tail turned away from the boom. The straight director hinges on pins along the
//   boom, and both its halves fold back behind it, side by side like a pocket knife.
//   Nothing ever lies across the boom as a working element would. Every L stays in
//   the link plane, which faces the camera, so no bend is ever seen edge-on.
// pose.whip 0..1: 1 = the stock whip upright, 0 = folded back along the boom.
// A is the geometry from the build (DATA.ant); local element paths are [x, s]
// pairs: x where the point sits along the boom when the element is up, s its
// distance from the hinge pin along the element.
//
// Painter's order inside each layer is fixed by where a rod meets its hinge: a rod
// that leaves the visible side of a barrel is drawn after it, one that leaves the
// hidden side before it. The "under" layer is drawn before every other item (the
// bottom halves hang below the blocks, which hide their hinges, and only ever swing
// along the boom below it or back behind it); the "over" layer after every item (the
// top halves only ever rise above the blocks or lie along or behind the boom above
// them). The build proves both placements with the audit, for several poses.
export function antennaParts(pose, A) {
  const th = pose.fold * Math.PI * 0.5;
  const ph = (1 - pose.whip) * Math.PI * 0.5;
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  const tan = Math.tan(th);
  // a Moxon half on a pin across the boom at (px, pz): sx -1 folds back, +1 forward;
  // sz +1 is a top half, -1 a bottom one. Local x turns with the arm in the link plane.
  const swingAt = (px, pz, sx, sz) => {
    const es = [sx * sin, sz * cos];
    const eu = [cos, -sx * sz * sin];
    return ([x, s]) => {
      const u = x - px;
      return [px + u * eu[0] + s * es[0], 0, pz + u * eu[1] + s * es[1]];
    };
  };
  // a director half on a pin along the boom: both halves fold back (-y)
  const place = (z, dir) => ([x, s]) => [x, dir[1] * s, z + dir[2] * s];
  const up = [0, -sin, cos];
  const down = [0, -sin, -cos];
  // id names one rod for the page's picture cache, turn the angle it was drawn at
  const tube = (id, name, local, at, ends = [true, true]) => ({ kind: "tube", id, turn: pose.fold, name, points: local.map(at), r: A.rod, ends, cls: "rl-alu" });
  const fixed = (id, name, home, offset = [0, 0, 0]) => ({ kind: "fixed", id, name, home, offset, at: [home[0] + offset[0], home[1] + offset[1], home[2] + offset[2]] });
  // the director's tip balls turn with it; they are round, so a turn is a plain move
  const swing = (s, dir, rest) => [0, dir[1] * s - rest[1] * s, dir[2] * s - rest[2] * s];
  const tipTop = { ...fixed("tipTop", "director.tip", [A.dirX, 0, A.zTop + A.tipS], swing(A.tipS, up, [0, 0, 1])), cls: "rl-cap" };
  const tipLow = { ...fixed("tipLow", "director.tip", [A.dirX, 0, A.zLow - A.tipS], swing(A.tipS, down, [0, 0, -1])), cls: "rl-cap" };
  const barrel = (id, name, x, z, axis) => ({ ...fixed(id, name, [x, 0, z]), axis });
  // the tails end in the air across the gap: only the hinge end sits on a mount
  const refTop = tube("RT", "moxon.reflector", A.reflector, swingAt(A.refX, A.zTop, -1, 1), [true, false]);
  const drvTop = tube("DT", "moxon.driver", A.driver, swingAt(A.drvX, A.zTop, 1, 1), [false, true]);
  const refLow = tube("RB", "moxon.reflector", A.reflector, swingAt(A.refX, A.zLow, -1, -1), [true, false]);
  const drvLow = tube("DB", "moxon.driver", A.driver, swingAt(A.drvX, A.zLow, 1, -1), [false, true]);
  const dirTop = { kind: "sort", items: [tube("FT", "director.rod", A.director, place(A.zTop, up)), tipTop] };
  const dirLow = { kind: "sort", items: [tube("FB", "director.rod", A.director, place(A.zLow, down)), tipLow] };
  const hRT = barrel("hingeRT", "hinge.barrel", A.refX, A.zTop, "y");
  const hDT = barrel("hingeDT", "hinge.barrel", A.drvX, A.zTop, "y");
  const hFT = barrel("hingeFT", "hinge.barrel", A.dirX, A.zTop, "x");
  const hRB = barrel("hingeRB", "hinge.barrel", A.refX, A.zLow, "y");
  const hDB = barrel("hingeDB", "hinge.barrel", A.drvX, A.zLow, "y");
  const hFB = barrel("hingeFB", "hinge.barrel", A.dirX, A.zLow, "x");
  // which side of its barrel a rod leaves: a Moxon arm turning back over the top,
  // or forward under the bottom, passes from the barrel's seen side to its hidden
  // side when tan(fold) crosses seeSide; the director's top arm when it crosses seeTop
  const pair = (seen, rod, hinge) => (seen ? [hinge, rod] : [rod, hinge]);
  // the whip: knuckle on the mast head, a sleeve, the rod and its tip ball
  const w = [-Math.sin(ph), 0, Math.cos(ph)];
  const along = (s) => [A.whipX + w[0] * s, 0, A.whipZ + w[2] * s];
  const whipSeen = Math.tan(ph) < A.seeSide;
  const knuckle = fixed("knuckle", "whip.knuckle", [A.whipX, 0, A.whipZ]);
  const sleeve = { kind: "disc", name: "whip.sleeve", o: [A.whipX, 0, A.whipZ], a: w, s0: A.sleeve[0], s1: A.sleeve[1], r: A.sleeveR, cls: "rl-whip" };
  const rod = { kind: "tube", id: "W", turn: pose.whip, name: "whip.rod", points: [along(A.sleeve[1]), along(A.rodEnd)], r: A.whipR, cls: "rl-whip" };
  const ball = { ...fixed("whipTip", "whip.tip", [A.whipX, 0, A.whipZ + A.ballS], [w[0] * A.ballS, 0, (w[2] - 1) * A.ballS]), cls: "rl-whip" };
  const over = [
    ...(whipSeen ? [knuckle, sleeve, rod, ball] : [ball, rod, sleeve, knuckle]),
    ...pair(tan < A.seeSide, refTop, hRT),
    ...pair(true, drvTop, hDT),
    ...pair(tan < A.seeTop, dirTop, hFT),
  ];
  const under = [...pair(false, refLow, hRB), ...pair(tan > A.seeSide, drvLow, hDB), ...pair(false, dirLow, hFB)];
  return { under, over };
}

// One layer in drawing order: [{ part, piece }] where piece is a tube chunk (or null).
// ctx: { P, tubePieces(points, r, P, options, part), depthOf, tube: tubePieces options }
export function antennaDrawables(list, ctx) {
  const out = [];
  const chunks = (part) => ctx.tubePieces(part.points, part.r, ctx.P, ctx.tube, part).map((piece) => ({ part, piece, key: ctx.depthOf(piece.mid, ctx.P) }));
  const centre = (part) => (part.kind === "disc" ? [part.o[0] + part.a[0] * (part.s0 + part.s1) * 0.5, part.o[1] + part.a[1] * (part.s0 + part.s1) * 0.5, part.o[2] + part.a[2] * (part.s0 + part.s1) * 0.5] : part.at);
  const one = (part) => (part.kind === "tube" ? chunks(part) : [{ part, piece: null, key: ctx.depthOf(centre(part), ctx.P) }]);
  for (const entry of list) {
    if (entry.kind === "sort") {
      const all = entry.items.flatMap(one);
      all.sort((a, b) => a.key - b.key);
      out.push(...all);
    } else out.push(...one(entry));
  }
  return out;
}

// One layer as keyed items in drawing order, for the page: { key, cls, transform,
// piece | svg }. A rod chunk carries its tube piece (the page writes its paths'
// d attributes in place); a fixed part keeps its svg and only moves; the whip's
// sleeve is redrawn. ctx also needs { axisVector, discSvg(part), fixed: { id: svg } }.
export function antennaItems(list, ctx) {
  const count = new Map();
  return antennaDrawables(list, ctx).map(({ part, piece }) => {
    // cls names the material, for the site's colour mode (aluminium, black rubber)
    const cls = part.cls ?? "";
    if (piece) {
      const index = count.get(part) ?? 0;
      count.set(part, index + 1);
      // names are unique within a layer, and a rod keeps its chunk count as it turns
      return { key: `${part.id}#${index}`, cls, transform: "", piece };
    }
    if (part.kind === "disc") return { key: part.name, cls, transform: "", svg: ctx.discSvg(part) };
    const [dx, dy] = ctx.axisVector(ctx.P, part.offset);
    const transform = Math.abs(dx) + Math.abs(dy) < 0.005 ? "" : `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`;
    return { key: part.id, cls, transform, svg: ctx.fixed[part.id], fixed: true };
  });
}

// The data-rate toggle on the radio box: a bat-handle lever on a ball pivot. slow 0
// points it up (200 kb/s), slow 1 down (10 kb/s); it always leaves the visible side
// of its pivot, so it is drawn after it in both positions.
export function leverOf(slow, L) {
  const a = ((L.up + (L.down - L.up) * slow) * Math.PI) / 180;
  const axis = [0, Math.cos(a), Math.sin(a)];
  return { axis, tip: [L.pivot[0], L.pivot[1] + axis[1] * L.tipS, L.pivot[2] + axis[2] * L.tipS] };
}
