// The RF signal as a halftone field. Inlined into assets/js/fig-link.js (the page
// draws every frame of it), so no imports.
//
// The dots sit on a fixed hexagonal screen in the link plane (y = 0), the way a
// printed halftone does: they never move, only their size changes. A dot's area is
// the received power at its distance from the whip, in dB above the receiver's
// sensitivity, so the field thins out toward the ground station, and grows or
// shrinks when the antenna or the data rate changes. Crests travel outward through
// it at a fixed spacing. Along the bench the path is read on the same log scale as
// the ruler, from 10 m out to the can's distance, so the field at the station is
// exactly as strong as the budget says.
//
// signalField(model, project, S) returns field(share, phase, gain, sens) → path d.
// The dots' places and shapes depend only on where the can is, so they are worked
// out once per position. The margin is linear in gain − sensitivity, so a dot keeps
// its margin at a reference setting and shifts it by the difference: an antenna or
// rate change, and a frame where only the crests drift, redraw from cached dots.
export function signalField(model, project, S) {
  const tau = Math.PI * 2;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  // a dot's radius snaps to steps of 0.04 viewBox px (well under a device pixel),
  // so each size's two arcs are one cached string
  const STEP = 0.04;
  const arcs = [];
  const arcOf = (q) => {
    if (arcs[q]) return arcs[q];
    const r = Math.round(q * STEP * 100) / 100;
    const two = Math.round(q * STEP * 200) / 100;
    return (arcs[q] = `m${-r} 0a${r} ${r} 0 1 0 ${two} 0a${r} ${r} 0 1 0 ${-two} 0`);
  };
  // the reference setting the cached margins are taken at
  const G0 = 0;
  const S0 = -100;
  let placed = NaN;
  let count = 0;
  let starts = [];
  let rhos = new Float32Array(0);
  let shapes = new Float32Array(0);
  let margins = new Float32Array(0);
  function layout(share) {
    placed = share;
    count = 0;
    starts = [];
    const km = model.kmOfShare(share);
    const xc = S.x0 + share * S.travel;
    const end = xc - S.stop;
    const span = end - S.rhoMin;
    if (span <= 2) return;
    const lnStart = Math.log(0.01);
    const lnEnd = Math.log(Math.max(km, 0.0101));
    // the soft ends shrink with a short path, so a can parked at the antenna still
    // shows a short field of big dots rather than two ramps and nothing between
    const nearSoft = Math.min(7, span * 0.22);
    const farSoft = Math.min(8, span * 0.22);
    const rho = [];
    const shape = [];
    const margin = [];
    const r0 = Math.ceil(S.zLow / S.gz);
    const r1 = Math.floor(S.zHigh / S.gz);
    for (let row = r0; row <= r1; row++) {
      const z = row * S.gz;
      const dz = z - S.zw;
      const odd = row & 1 ? 0.5 : 0;
      const c0 = Math.ceil(S.stop / S.gx - odd);
      const c1 = Math.floor((xc - S.rhoMin) / S.gx - odd);
      const ez = smooth((z - S.zLow) / S.soft) * smooth((S.zHigh - z) / S.soft);
      if (ez <= 0) continue;
      for (let col = c0; col <= c1; col++) {
        const x = (col + odd) * S.gx;
        const dx = xc - x;
        const r = Math.sqrt(dx * dx + dz * dz);
        if (r < S.rhoMin) continue;
        // a soft wedge toward the station, no hard edge anywhere
        const psi = Math.abs(Math.atan2(dz, dx));
        const beam = smooth((S.psiMax - psi) / S.psiSoft);
        if (beam <= 0) continue;
        const f = beam * ez * smooth((r - S.rhoMin) / nearSoft) * smooth((end - dx) / farSoft);
        // a dot that stays under the smallest size even at full power is never drawn
        if (S.rMax * Math.sqrt(f) < S.rMin) continue;
        const u = Math.min(1, (r - S.rhoMin) / span);
        const p = project([x, 0, z]);
        starts.push(`M${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`);
        rho.push(r);
        shape.push(f);
        margin.push(model.marginDb(Math.exp(lnStart + u * (lnEnd - lnStart)), G0, S0));
      }
    }
    count = starts.length;
    rhos = Float32Array.from(rho);
    shapes = Float32Array.from(shape);
    margins = Float32Array.from(margin);
  }
  return (share, phase, gain, sens) => {
    if (share !== placed) layout(share);
    const shift = gain - G0 - (sens - S0);
    const full = 1 / S.fullDb;
    const k = tau / S.wave;
    const top = 1 - S.floor;
    const big = S.rMax / STEP;
    const least = S.rMin / STEP;
    let d = "";
    for (let i = 0; i < count; i++) {
      // a dot's area is its power above sensitivity, as a share of the strongest
      const cover = (margins[i] + shift) * full;
      if (cover <= 0) continue;
      const c = 0.5 + 0.5 * Math.cos(k * (rhos[i] - phase));
      const q = big * Math.sqrt((cover < 1 ? cover : 1) * shapes[i] * (S.floor + top * c * c));
      if (q < least) continue;
      d += starts[i] + arcOf(Math.round(q));
    }
    return d;
  };
}
