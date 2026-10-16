// The parts of Fig 01 that turn: the seven elements of the Moxon–Yagi (two Moxon
// rectangles and five directors) fold on their hinges and the stock whip stands up
// on its knuckle. Shared by the build (first frame, shapes for the audit) and the
// page (every frame of a swap); inlined into assets/js/fig-link.js, so no imports.
//
// pose.fold 0..1: 0 = every element up in the link plane, 1 = folded flat for the bag.
//   The elements fold one after another, the front director first and the rear
//   Moxon last (and rise in the opposite order): element e starts once fold passes
//   its share of A.stagger, so a swap reads as seven separate parts. Element 0 is
//   the rear Moxon rectangle (the reflector), 1 the front one (the driven element,
//   fed by the pigtail), 2… the directors from the driven element forward.
//   Every element is split at the boom into a top and a bottom half, each on a
//   hinge pin that runs along the boom on the top or bottom face of its clamp block.
//   A Moxon half is two Ls of bent rod (an arm up or down from its own block and a
//   tail along the boom toward the open tip gap), both on one pin line, so the
//   half turns as one flat piece and its gap never closes. Every half folds back,
//   behind the boom, side by side like a pocket knife, so nothing ever lies across
//   the boom as a working element would. A top half lies flat; a Moxon's bottom
//   half stops at A.lowStop of a right angle (70°), where it tucks in behind the
//   boom from the camera's side: lying flat, the tip of its front tail would land
//   on the top half's arm on screen. On its way a
//   bottom Moxon half turns through the plane that holds the line of sight, where
//   its front L is briefly seen edge-on; the build's audit names that as the one
//   mid-swing exception.
// pose.whip 0..1: 1 = the stock whip upright, 0 = folded back along the boom.
// A is the geometry from the build (DATA.ant); local element paths are [x, s]
// pairs: x where the point sits along the boom, s its distance from the hinge pin
// along the element. A.moxons lists the two rectangles from the mast forward:
// { x0, x1, rear, front } (x0 the rear U's arm, x1 the front U's; rear and front
// the two Ls' paths); A.dirs the directors: { x, tipS, rod }.
//
// Painter's order inside each layer is fixed by where a rod meets its hinge: a rod
// that leaves the visible side of a barrel is drawn after it, one that leaves the
// hidden side before it. Elements follow each other from the mast forward (the
// nearer one last); a turning half only ever moves toward the camera's side of its
// pin line, so neighbours never meet on screen. The "under" layer is drawn before
// every other item (the bottom halves hang below the blocks, which hide their
// hinges, and only ever swing back behind the boom); the
// "over" layer after every item (the top halves only ever rise above the blocks or
// lie behind the boom above them). The build proves both placements with the
// audit, for several poses.
export function elementFold(fold, e, A) {
  const n = A.dirs.length + A.moxons.length - 1;
  const f = (fold - ((n - e) / n) * A.stagger) / (1 - A.stagger);
  return f <= 0 ? 0 : f >= 1 ? 1 : f;
}
export function antennaParts(pose, A) {
  const ph = (1 - pose.whip) * Math.PI * 0.5;
  const turnOf = (e, stop = 1) => {
    const f = elementFold(pose.fold, e, A);
    const th = f * stop * Math.PI * 0.5;
    return { f, sin: Math.sin(th), cos: Math.cos(th), tan: Math.tan(th) };
  };
  // a half on a pin along the boom at height z: dir is its arm's direction
  const place = (z, dir) => ([x, s]) => [x, dir[1] * s, z + dir[2] * s];
  // id names one rod for the page's picture cache, turn the angle it was drawn at
  const tube = (id, name, local, at, turn, ends = [true, true]) => ({ kind: "tube", id, turn, name, points: local.map(at), r: A.rod, ends, cls: "rl-alu" });
  const fixed = (id, name, home, offset = [0, 0, 0]) => ({ kind: "fixed", id, name, home, offset, at: [home[0] + offset[0], home[1] + offset[1], home[2] + offset[2]] });
  // a director's tip balls turn with it; they are round, so a turn is a plain move
  const swing = (s, dir, rest) => [0, dir[1] * s - rest[1] * s, dir[2] * s - rest[2] * s];
  const barrel = (id, name, x, z) => ({ ...fixed(id, name, [x, 0, z]), axis: "x" });
  // which side of its barrel a rod leaves: a top arm turning back leaves the seen
  // side while tan(fold) < seeTop; a bottom arm turning back always the hidden one
  const pair = (seen, rod, hinge) => (seen ? [hinge, rod] : [rod, hinge]);
  const over = [];
  const under = [];
  // the whip: knuckle on the mast head, a sleeve, the rod and its tip ball
  const w = [-Math.sin(ph), 0, Math.cos(ph)];
  const along = (s) => [A.whipX + w[0] * s, 0, A.whipZ + w[2] * s];
  const whipSeen = Math.tan(ph) < A.seeSide;
  const knuckle = fixed("knuckle", "whip.knuckle", [A.whipX, 0, A.whipZ]);
  const sleeve = { kind: "disc", name: "whip.sleeve", o: [A.whipX, 0, A.whipZ], a: w, s0: A.sleeve[0], s1: A.sleeve[1], r: A.sleeveR, cls: "rl-whip" };
  const rod = { kind: "tube", id: "W", turn: pose.whip, name: "whip.rod", points: [along(A.sleeve[1]), along(A.rodEnd)], r: A.whipR, cls: "rl-whip" };
  const ball = { ...fixed("whipTip", "whip.tip", [A.whipX, 0, A.whipZ + A.ballS], [w[0] * A.ballS, 0, (w[2] - 1) * A.ballS]), cls: "rl-whip" };
  over.push(...(whipSeen ? [knuckle, sleeve, rod, ball] : [ball, rod, sleeve, knuckle]));
  // the two Moxon rectangles: per half, the rear U's L (its tail ends in the air at
  // the gap, so only the pin end sits on a mount) and the front U's
  A.moxons.forEach((m, i) => {
    const t = turnOf(i);
    const b = turnOf(i, A.lowStop);
    const up = [0, -t.sin, t.cos];
    const down = [0, -b.sin, -b.cos];
    const name = i ? "moxon.driven" : "moxon.reflector";
    const top = place(A.zTop, up);
    const low = place(A.zLow, down);
    over.push(...pair(t.tan < A.seeTop, tube(`M${i}RT`, name, m.rear, top, t.f, [true, false]), barrel(`hingeM${i}RT`, "hinge.barrel", m.x0, A.zTop)));
    over.push(...pair(t.tan < A.seeTop, tube(`M${i}FT`, name, m.front, top, t.f, [false, true]), barrel(`hingeM${i}FT`, "hinge.barrel", m.x1, A.zTop)));
    under.push(...pair(false, tube(`M${i}RB`, name, m.rear, low, t.f, [true, false]), barrel(`hingeM${i}RB`, "hinge.barrel", m.x0, A.zLow)));
    under.push(...pair(false, tube(`M${i}FB`, name, m.front, low, t.f, [false, true]), barrel(`hingeM${i}FB`, "hinge.barrel", m.x1, A.zLow)));
  });
  A.dirs.forEach((d, i) => {
    const t = turnOf(i + A.moxons.length);
    const up = [0, -t.sin, t.cos];
    const down = [0, -t.sin, -t.cos];
    const tipTop = { ...fixed(`tip${i}T`, "director.tip", [d.x, 0, A.zTop + d.tipS], swing(d.tipS, up, [0, 0, 1])), cls: "rl-cap" };
    const tipLow = { ...fixed(`tip${i}B`, "director.tip", [d.x, 0, A.zLow - d.tipS], swing(d.tipS, down, [0, 0, -1])), cls: "rl-cap" };
    const top = { kind: "sort", items: [tube(`F${i}T`, "director.rod", d.rod, place(A.zTop, up), t.f), tipTop] };
    const low = { kind: "sort", items: [tube(`F${i}B`, "director.rod", d.rod, place(A.zLow, down), t.f), tipLow] };
    over.push(...pair(t.tan < A.seeTop, top, barrel(`hingeF${i}T`, "hinge.barrel", d.x, A.zTop)));
    under.push(...pair(false, low, barrel(`hingeF${i}B`, "hinge.barrel", d.x, A.zLow)));
  });
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
