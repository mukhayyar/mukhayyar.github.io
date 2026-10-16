// Live behaviour for Fig 01 (inlined into assets/js/fig-link.js after the kit, the
// lathe and tube modules as G and TB, the model as LINK, antenna.mjs as AN, DATA,
// signalField and MARKUP). Touches nothing outside #fig-link.
//
// Controls: hover the ruler or drag the CanSat to move it along the log rail
// (0.1 to 4 km; arrow keys step through the stops, Home and End go to the ends);
// click the antenna (or press A) to fold the Moxon–Yagi flat (its two Moxon
// rectangles and five directors, one element after another) and raise the stock
// whip; click the radio box or the meter (or press R) to switch the data rate.
//
// Cost: the antenna layers, the dBm scale and the signal field are drawn here on
// mount, not shipped as markup. They sit in two composited <svg> layers over and
// under the items (the bench never repaints for them): a swap, a swinging needle or
// a drifting crest repaints only those. While nothing but the crests moves they
// redraw at 30 fps, and only while the figure is near the middle of the viewport.
// A swap redraws a rod only when it has turned by about a quarter of a pixel at its
// tip, and rewrites its paths' d attributes in place.
(() => {
  const host = document.getElementById("fig-link");
  if (!host) return;
  host.innerHTML = MARKUP;

  const P = DATA.P;
  const S = DATA.signal;
  const D = DATA.dial;
  const stage = host.querySelector(".rl-stage");
  const svg = stage.querySelector("svg"); // the bench; the layers over it share its viewBox
  const layer = stage.querySelector(".rl-items");
  const under = stage.querySelector(".rl-under");
  const over = stage.querySelector(".rl-over");
  const entries = [...layer.children].map((el) => ({ el, k: parseFloat(el.dataset.k), l: el.dataset.l ? parseFloat(el.dataset.l) : 0, moving: el.hasAttribute("data-move") }));
  const moving = entries.filter((entry) => entry.moving);
  let order = entries.slice();
  const part = (name) => stage.querySelector(`[data-part="${name}"]`);
  const needle = part("needle");
  const signal = part("signal");
  const zone = { dead: part("zoneDead"), fade: part("zoneFade"), sens: part("sensMark"), fadeMark: part("fadeMark") };
  const dbm = { minor: part("dbmMinor"), major: part("dbmMajor") };
  const lever = part("lever");
  const readout = host.querySelector("[data-readout]");
  const hint = host.querySelector('[data-corner="hint"]');
  const touchOnly = matchMedia("(hover: none)").matches;
  if (hint && touchOnly) hint.textContent = "Drag the CanSat · tap the antenna or radio";
  const announcer = host.querySelector(".rl-live");
  const chipValue = { antenna: host.querySelector('[data-val="antenna"]'), rate: host.querySelector('[data-val="rate"]') };
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  // the site's "Pause motion" switch (WCAG 2.2.2) marks <html data-ht-still>: no idle
  // tour and no drifting crests, but every control still answers and eases
  const root = document.documentElement;
  let paused = root.hasAttribute("data-ht-still");
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const project = (point) => iso(point, P);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const field = signalField(LINK, project, S);
  const setD = (el, d) => {
    if (el.getAttribute("d") !== d) el.setAttribute("d", d);
  };

  // ---- drawing helpers: the same geometry the build used.
  // Rod pictures are kept from one frame to the next by rod and angle, so a swap only
  // rebuilds the rods that are turning (the whip waits while the elements fold).
  let pieces = new Map();
  let piecesBefore = new Map();
  const piecesOf = (points, r, proj, options, rod) => {
    const key = `${rod.id}|${rod.turn}`;
    let out = pieces.get(key) ?? piecesBefore.get(key);
    if (!out) out = TB.tubePieces(points, r, proj, options);
    pieces.set(key, out);
    return out;
  };
  const CTX = {
    P,
    tubePieces: piecesOf,
    depthOf,
    axisVector,
    discSvg: (p) => solidSvg(G.disc(p.s0, p.s1, p.r, G.frameAlong(p.o, p.a), P, { bevel: 0.15 }), { tone: "hi", crease: "lo" }),
    fixed: DATA.fixed,
    tube: DATA.tube,
  };
  const facePoint = (r, deg, s = D.face) => {
    const a = (deg * Math.PI) / 180;
    return add(add(D.c, scale(D.n, s)), add(scale(D.right, r * Math.sin(a)), scale(D.up, r * Math.cos(a))));
  };
  const angleOf = (dbmValue) => -D.sweep + ((clamp(dbmValue, D.low - 3, D.high + 3) - D.low) / (D.high - D.low)) * D.sweep * 2;
  const needleD = (deg) => pathOf([project(facePoint(D.tail, deg, D.s)), project(facePoint(D.tip, deg, D.s))]);
  const arcD = (r0, r1, a0, a1, n = 40) => {
    const outer = Array.from({ length: n + 1 }, (_, j) => project(facePoint(r1, a0 + ((a1 - a0) * j) / n)));
    const inner = Array.from({ length: n + 1 }, (_, j) => project(facePoint(r0, a1 - ((a1 - a0) * j) / n)));
    return pathOf([...outer, ...inner], true);
  };
  const markD = (r0, r1, deg) => pathOf([project(facePoint(r0, deg)), project(facePoint(r1, deg))]);
  const xOfKm = (km) => DATA.ruler.x0 + LINK.shareOfKm(km) * (DATA.ruler.x1 - DATA.ruler.x0);
  // The ruler's front scale reads the received power at each distance, so it depends
  // on the ground antenna's gain: a swap slides the whole scale along the ruler.
  function dbmTicks(gain) {
    const R = DATA.ruler;
    const minor = [];
    const major = [];
    const top = Math.floor(LINK.rxDbm(LINK.D_MIN_KM, gain) + 6);
    for (let value = Math.ceil(LINK.rxDbm(LINK.D_MAX_KM, gain) - 6); value <= top; value++) {
      if (value % 2) continue;
      const x = xOfKm(Math.pow(10, (LINK.rxDbm(1, gain) - value) / 20));
      if (x < R.strip[0] || x > R.strip[1]) continue;
      (value % 10 ? minor : major).push(lineOnTop([x, R.front], [x, R.front - R.ticks[value % 10 ? 0 : 1]], R.z, P));
    }
    return { minor: minor.join(""), major: major.join("") };
  }
  function leverSvg(slow) {
    const L = DATA.lever;
    const { axis, tip } = AN.leverOf(slow, L);
    return solidSvg(G.solidOf([[L.start, L.r0], [L.len, L.r1]], G.frameAlong(L.pivot, axis), P), { tone: "hi" }) + solidSvg(G.sphereOf(tip, L.tipR, P, { steps: L.steps }), { tone: "hi" });
  }

  // ---- state: every control sets a target; parts follow on springs
  const spring = (x) => ({ x, v: 0, target: x, at: 0, next: x });
  const fold = spring(0); // 0 = elements up, 1 = folded flat (top halves back, bottom halves tucked back under the boom)
  const whip = spring(0); // 1 = stock whip upright
  const rate = spring(0); // 1 = 10 kb/s (the receiver's sensitivity eases between)
  const flip = spring(0); // the rate lever
  let yagi = true;
  let slow = false;
  let share = DATA.share0;
  let target = share;
  let carVel = 0; // share per second
  let dragging = null;
  let pending = null; // a touch on the rail or the can, until it shows it is not a scroll
  let press = null;
  let clock = 0;
  const gainNow = () => LINK.gainOf(1 - fold.x);
  const sensNow = () => LINK.sensOf(rate.x);
  const coil = { a: angleOf(LINK.rxDbm(LINK.kmOfShare(share), gainNow())), v: 0 };
  let phase = 0;
  let shown = "";
  let spoken = "";
  let frame = 0;
  let last = 0;
  let visible = false;
  let centred = false; // near the middle of the viewport: the tour and the crests run
  let touring = !still.matches && !paused;
  let tourClock = 0;
  let tourStep = -1;
  let toggled = false; // once the reader flips a switch, the tour leaves the switches alone
  let idleTimer = 0;
  let announceTimer = 0;
  let placedShare = NaN;
  let signalAt = -1;
  let signalKey = "";
  // a rod is redrawn when its tip has moved about a quarter of a pixel: 1/400 of a turn
  const TURN = 400;
  const quant = (x) => Math.round(x * TURN) / TURN;
  const drawn = { fold: NaN, whip: NaN, gain: NaN, sens: LINK.SENS_FAST_DBM, flip: 0, needle: "" };
  // keep one <g> per antenna part: a fixed part only moves, a rod chunk rewrites its
  // paths' d in place, and the layer is re-ordered only when its order changed
  const kept = new Map([[under, new Map()], [over, new Map()]]);
  function paint(node, item) {
    const p = item.piece;
    if (!p) {
      if (node.svg !== item.svg) {
        node.el.innerHTML = item.svg;
        node.svg = item.svg;
      }
      return;
    }
    if (node.piece === p) return;
    const shape = p.wide ? 4 : 2;
    if (node.shape !== shape || (p.rings && p.rings.length)) {
      node.el.innerHTML = TB.tubeSvg(p, { tone: "hi" });
      node.paths = [...node.el.querySelectorAll("path")];
      node.shape = p.rings && p.rings.length ? 0 : shape;
    } else {
      const [body, a, b, c] = node.paths;
      setD(body, p.body);
      if (p.wide) {
        setD(a, p.shine);
        setD(b, p.shade);
        setD(c, p.edges);
      } else setD(a, p.edges);
    }
    node.piece = p;
  }
  function sync(group, items) {
    const nodes = kept.get(group);
    const next = new Map();
    let moved = group.children.length !== items.length;
    items.forEach((item, index) => {
      let node = nodes.get(item.key);
      if (!node) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "g");
        if (item.cls) el.setAttribute("class", item.cls);
        node = { el, svg: null, piece: null, shape: -1, paths: [], transform: "" };
      }
      paint(node, item);
      if (node.transform !== item.transform) {
        if (item.transform) node.el.setAttribute("transform", item.transform);
        else node.el.removeAttribute("transform");
        node.transform = item.transform;
      }
      next.set(item.key, node);
      if (group.children[index] !== node.el) moved = true;
    });
    if (moved) {
      const fragment = document.createDocumentFragment();
      for (const { key } of items) fragment.appendChild(next.get(key).el);
      group.replaceChildren(fragment);
    }
    kept.set(group, next);
  }

  const shareOfKm = (km) => clamp(LINK.shareOfKm(km));
  const TOUR = [
    { km: 4, hold: 3.2, yagi: true, slow: false },
    { km: 4, hold: 3.6, yagi: false, slow: false },
    { km: 4, hold: 2.4, yagi: true, slow: false },
    { km: 4, hold: 3.0, yagi: true, slow: true },
    { km: 4, hold: 1.4, yagi: true, slow: false },
    { km: 3, hold: 2.0, yagi: true, slow: false },
    { km: 2, hold: 2.2, yagi: true, slow: false },
    { km: 0.5, hold: 2.2, yagi: true, slow: false },
    { km: 0.1, hold: 2.6, yagi: true, slow: false },
    { km: 1, hold: 2.2, yagi: true, slow: false },
  ];
  const TOUR_LENGTH = TOUR.reduce((sum, step) => sum + step.hold, 0);
  const stepAt = (t) => {
    let left = ((t % TOUR_LENGTH) + TOUR_LENGTH) % TOUR_LENGTH;
    for (let index = 0; index < TOUR.length; index++) {
      if (left < TOUR[index].hold) return index;
      left -= TOUR[index].hold;
    }
    return 0;
  };

  // ---- springs. The elements and the whip swing on pinned hinges with hard stops
  // at both ends: a little under-damped, they settle onto the stop with one soft
  // knock. The rate is a value, so it eases without overshoot.
  function swing(s, dt, stiffness, damping, calm) {
    if (s.at && clock >= s.at) {
      s.target = s.next;
      s.at = 0;
    }
    if (calm) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      s.v += (stiffness * (s.target - s.x) - damping * s.v) * h;
      s.x += s.v * h;
      if (s.x > 1) (s.x = 1), (s.v = -s.v * 0.22);
      if (s.x < 0) (s.x = 0), (s.v = -s.v * 0.22);
    }
    if (Math.abs(s.target - s.x) < 5e-4 && Math.abs(s.v) < 5e-3) {
      s.x = s.target;
      s.v = 0;
    }
    return s.x !== s.target || s.v !== 0 || s.at !== 0;
  }
  function ease(s, dt, seconds, calm) {
    if (calm) {
      s.x = s.target;
      s.v = 0;
      return false;
    }
    const w = 1 / seconds;
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      s.v += (w * w * (s.target - s.x) - 2 * w * s.v) * h;
      s.x += s.v * h;
    }
    if (Math.abs(s.target - s.x) < 1e-4 && Math.abs(s.v) < 1e-4) {
      s.x = s.target;
      s.v = 0;
    }
    return s.x !== s.target;
  }
  // two hinged parts in sequence: the one that must clear the way goes first and
  // the other follows once it is on its way. Reversing mid-swap reschedules only
  // what changes, so nothing waits behind a part that never left.
  function schedule(first, firstTo, second, secondTo) {
    first.at = 0;
    first.target = firstTo;
    const away = Math.abs(first.x - firstTo);
    if (away < 0.02) {
      second.at = 0;
      second.target = secondTo;
    } else {
      second.at = clock + 0.22 * away + 0.06;
      second.next = secondTo;
      if (second.target !== secondTo && Math.abs(second.x - second.target) < 0.02) second.target = second.x;
    }
  }
  function setAntenna(on, { fromTour = false } = {}) {
    if (on === yagi) return;
    yagi = on;
    if (yagi) schedule(whip, 0, fold, 0);
    else schedule(fold, 1, whip, 1);
    chipValue.antenna.textContent = LINK.antennaText(yagi);
    if (!fromTour) say(LINK.spokenAntenna(yagi, LINK.kmOfShare(target), slow ? 1 : 0));
    run();
  }
  function setRate(on, { fromTour = false } = {}) {
    if (on === slow) return;
    slow = on;
    rate.target = slow ? 1 : 0;
    flip.target = slow ? 1 : 0;
    chipValue.rate.textContent = LINK.rateText(slow);
    if (!fromTour) say(LINK.spokenRate(slow, LINK.kmOfShare(target), yagi ? 1 : 0));
    run();
  }

  function place() {
    if (share === placedShare) return;
    placedShare = share;
    const transform = `translate(${(DATA.moveScreen[0] * share).toFixed(2)} ${(DATA.moveScreen[1] * share).toFixed(2)})`;
    for (const entry of moving) entry.el.setAttribute("transform", transform);
    const next = entries.slice().sort((a, b) => a.k + a.l * share - (b.k + b.l * share));
    if (next.some((entry, index) => entry !== order[index])) {
      const fragment = document.createDocumentFragment();
      for (const entry of next) fragment.appendChild(entry.el);
      layer.appendChild(fragment);
      order = next;
    }
  }

  // drift: whether this frame should move the crests on (30 fps while nothing else moves)
  function draw(drift = true) {
    place();
    const gain = gainNow();
    const sens = sensNow();
    const f = quant(fold.x);
    const w = quant(whip.x);
    if (f !== drawn.fold || w !== drawn.whip) {
      piecesBefore = pieces;
      pieces = new Map();
      const parts = AN.antennaParts({ fold: f, whip: w }, DATA.ant);
      sync(under, AN.antennaItems(parts.under, CTX));
      sync(over, AN.antennaItems(parts.over, CTX));
      drawn.fold = f;
      drawn.whip = w;
    }
    // the dBm scale moves 0.1 viewBox px per 0.05 dB or so: redraw on that step
    const g = Math.round(gain * 40) / 40;
    if (g !== drawn.gain) {
      const ticks = dbmTicks(g);
      setD(dbm.minor, ticks.minor);
      setD(dbm.major, ticks.major);
      drawn.gain = g;
    }
    if (sens !== drawn.sens) {
      const s = angleOf(sens);
      const fz = angleOf(sens + LINK.FADE_DB);
      zone.dead.setAttribute("d", arcD(D.zone[0], D.zone[1], angleOf(D.low), s));
      zone.fade.setAttribute("d", arcD(D.zone[0], D.zone[1], s, fz));
      zone.sens.setAttribute("d", markD(D.zone[0], D.rim, s));
      zone.fadeMark.setAttribute("d", markD(D.zone[0], D.zone[1], fz));
      drawn.sens = sens;
    }
    if (flip.x !== drawn.flip) {
      lever.innerHTML = leverSvg(flip.x);
      drawn.flip = flip.x;
    }
    const nd = needleD(coil.a);
    if (nd !== drawn.needle) {
      needle.setAttribute("d", nd);
      drawn.needle = nd;
    }
    const key = `${share}|${gain}|${sens}`;
    if (key !== signalKey || (drift && clock - signalAt >= 1 / 31)) {
      signal.setAttribute("d", field(share, phase, gain, sens));
      signalKey = key;
      signalAt = clock;
    }
    const text = LINK.readoutOf(LINK.kmOfShare(share), gain, sens);
    if (text !== shown) {
      readout.textContent = text;
      shown = text;
    }
  }

  function describe() {
    const km = LINK.kmOfShare(target);
    const words = LINK.spokenOf(km, yagi ? 1 : 0, slow ? 1 : 0);
    stage.setAttribute("aria-valuenow", km.toFixed(2));
    stage.setAttribute("aria-valuetext", words);
    return words;
  }
  function say(words) {
    describe();
    announcer.textContent = words;
    spoken = words;
  }
  function announce() {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      const words = describe();
      if (document.activeElement === stage && words !== spoken) {
        announcer.textContent = words;
        spoken = words;
      }
    }, 700);
  }

  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    clock = now / 1000;
    const calm = still.matches;
    const lively = !calm && !paused && centred;
    if (touring && lively) {
      tourClock += dt;
      const index = stepAt(tourClock);
      if (index !== tourStep) {
        tourStep = index;
        const step = TOUR[index];
        target = shareOfKm(step.km);
        if (!toggled) {
          setAntenna(step.yagi, { fromTour: true });
          setRate(step.slow, { fromTour: true });
        }
      }
    }
    // carriage: a critically damped spring along the log rail, stiffer under the hand;
    // it keeps its speed through a release, and the rail's end stops are hard
    if (calm) {
      share = target;
      carVel = 0;
    } else {
      const w = dragging ? 22 : 6.5;
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        carVel += (w * w * (target - share) - 2 * w * carVel) * h;
        share += carVel * h;
      }
      if (share < 0 || share > 1) {
        share = clamp(share);
        carVel = 0;
      }
      if (Math.abs(target - share) < 1e-4 && Math.abs(carVel) < 1e-3) {
        share = target;
        carVel = 0;
      }
    }
    let busy = false;
    // the seven elements share one swing (each takes its own slice of it, antenna.mjs):
    // slow enough that the reader sees them go one after another
    busy = swing(fold, dt, 38, 8.4, calm) || busy;
    busy = swing(whip, dt, 90, 11, calm) || busy;
    busy = swing(flip, dt, 520, 24, calm) || busy;
    busy = ease(rate, dt, 0.16, calm) || busy;
    // needle: a moving-coil movement, slightly under-damped (about 1.3 Hz, zeta 0.5)
    const want = angleOf(LINK.rxDbm(LINK.kmOfShare(share), gainNow()));
    if (calm) {
      coil.a = want;
      coil.v = 0;
    } else {
      const w = 2 * Math.PI * 1.3;
      const zeta = 0.5;
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        coil.v += (w * w * (want - coil.a) - 2 * zeta * w * coil.v) * h;
        coil.a += coil.v * h;
      }
      if (Math.abs(want - coil.a) < 0.02 && Math.abs(coil.v) < 0.02) {
        coil.a = want;
        coil.v = 0;
      }
    }
    if (lively) phase += S.speed * dt;
    draw(lively);
    const settled = share === target && carVel === 0 && coil.v === 0 && coil.a === want && !busy;
    frame = visible && (lively || !settled) ? requestAnimationFrame(tick) : 0;
  }

  const run = () => {
    if (!frame && visible) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  };

  function takeOver() {
    touring = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (still.matches || paused) return;
      touring = true;
      // resume the tour from the stop nearest to where the can is, switches as they are
      const km = LINK.kmOfShare(share);
      let at = 0;
      let found = false;
      for (const step of TOUR) {
        if (Math.abs(Math.log10(step.km) - Math.log10(km)) < 0.05 && step.yagi === yagi && step.slow === slow) {
          found = true;
          break;
        }
        at += step.hold;
      }
      tourClock = found ? at : 0;
      tourStep = found ? stepAt(at) : -1;
      run();
    }, 3600);
  }
  function steer(next, { keyboard = false } = {}) {
    takeOver();
    target = clamp(next);
    if (keyboard) describe();
    announce();
    run();
  }
  const toggle = (what) => {
    takeOver();
    toggled = true;
    if (what === "antenna") setAntenna(!yagi);
    else setRate(!slow);
  };

  // ---- pointer: the stage maps to the viewBox; regions are screen hulls from the build
  const toView = (event) => {
    const box = svg.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * DATA.W, ((event.clientY - box.top) / box.height) * DATA.H];
  };
  const inside = (poly, [x, y]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  function regionAt(point) {
    const shifted = [point[0] - DATA.moveScreen[0] * share, point[1] - DATA.moveScreen[1] * share];
    if (DATA.regions.carriage.some((poly) => inside(poly, shifted))) return "carriage";
    for (const name of ["antenna", "radio", "meter", "band"]) if (DATA.regions[name].some((poly) => inside(poly, point))) return name;
    return "";
  }
  const shareFromPointer = (event) => {
    const box = svg.getBoundingClientRect();
    const fx = (event.clientX - box.left) / box.width;
    return (fx - DATA.reach[0]) / (DATA.reach[1] - DATA.reach[0]);
  };
  // the site draws its own cursor and labels it from the nearest [data-cursor]
  const CURSOR = { carriage: "Drag", band: "Slide", antenna: "Swap", radio: "Rate", meter: "Rate" };
  // (it reads it on pointerover only, so a change re-dispatches one, as the pi scene does)
  const hot = (name) => {
    if (name) stage.dataset.hot = name;
    else delete stage.dataset.hot;
    const label = CURSOR[name] || "none";
    if (stage.dataset.cursor === label) return;
    stage.dataset.cursor = label;
    let event;
    try {
      event = new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" });
    } catch {
      event = new Event("pointerover", { bubbles: true });
    }
    stage.dispatchEvent(event);
  };
  function grab(event, offset) {
    const raw = shareFromPointer(event);
    dragging = { id: event.pointerId, offset, raw, t: performance.now(), v: 0, from: target };
    stage.dataset.drag = "";
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {}
    steer(raw + offset);
  }
  stage.addEventListener("pointermove", (event) => {
    if (pending && pending.id === event.pointerId) {
      // a touch only slides the can once it moves sideways; a vertical pan is the
      // page scrolling (the browser takes it and cancels the pointer)
      const dx = event.clientX - pending.x;
      const dy = event.clientY - pending.y;
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        const start = pending;
        pending = null;
        grab(event, start.offset);
      } else if (Math.abs(dy) > 6) pending = null;
      return;
    }
    if (dragging && dragging.id === event.pointerId) {
      const now = performance.now();
      const raw = shareFromPointer(event);
      const dtm = Math.max(1, now - dragging.t);
      dragging.v = dragging.v * 0.6 + (((raw - dragging.raw) / dtm) * 1000) * 0.4;
      dragging.raw = raw;
      dragging.t = now;
      steer(raw + dragging.offset);
      return;
    }
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) press = null;
    if (event.pointerType === "touch") return;
    const region = regionAt(toView(event));
    hot(region);
    if (region === "band") steer(shareFromPointer(event));
  });
  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const region = regionAt(toView(event));
    if (region === "carriage" || region === "band") {
      // the can keeps its grab offset; the rail steers to the pointer
      const offset = region === "carriage" ? target - shareFromPointer(event) : 0;
      if (event.pointerType === "touch") pending = { id: event.pointerId, x: event.clientX, y: event.clientY, region, offset, tap: shareFromPointer(event) };
      else grab(event, offset);
    } else if (region) press = { region, x: event.clientX, y: event.clientY };
  });
  const release = (event, cancelled) => {
    if (pending && pending.id === event.pointerId) {
      // a tap on the rail places the can there; a tap on the can leaves it
      if (!cancelled && pending.region === "band") steer(pending.tap);
      pending = null;
    }
    if (dragging && dragging.id === event.pointerId) {
      // a flick carries on a little, as a carriage on a greased rail would; a drag the
      // browser took over for a scroll puts the can back where it was
      if (cancelled) steer(dragging.from);
      else if (performance.now() - dragging.t < 80) steer(target + clamp(dragging.v, -3, 3) * 0.12);
      dragging = null;
      delete stage.dataset.drag;
    }
    try {
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    } catch {}
    if (!cancelled && press) {
      const region = press.region;
      press = null;
      toggle(region === "antenna" ? "antenna" : "rate");
    }
    press = null;
  };
  stage.addEventListener("pointerup", (event) => release(event, false));
  stage.addEventListener("pointercancel", (event) => release(event, true));
  stage.addEventListener("pointerleave", () => {
    if (!dragging) hot("");
  });
  stage.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key === "a" || key === "A" || key === "r" || key === "R") {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      toggle(key.toLowerCase() === "a" ? "antenna" : "rate");
      return;
    }
    const from = LINK.kmOfShare(touring ? share : target);
    const stops = DATA.stops;
    let km = null;
    if (key === "ArrowRight" || key === "ArrowUp") km = stops.find((stop) => stop > from * 1.02) ?? stops[stops.length - 1];
    if (key === "ArrowLeft" || key === "ArrowDown") km = [...stops].reverse().find((stop) => stop < from / 1.02) ?? stops[0];
    if (key === "Home") km = stops[0];
    if (key === "End") km = stops[stops.length - 1];
    if (km === null) return;
    event.preventDefault();
    steer(shareOfKm(km), { keyboard: true });
  });
  stage.addEventListener("focus", () => {
    announcer.textContent = describe();
    spoken = announcer.textContent;
  });
  for (const button of host.querySelectorAll(".rl-chip")) button.addEventListener("click", () => toggle(button.dataset.act));
  still.addEventListener?.("change", () => {
    touring = !still.matches && !paused;
    run();
  });
  new MutationObserver(() => {
    const now = root.hasAttribute("data-ht-still");
    if (now === paused) return;
    paused = now;
    touring = !still.matches && !paused;
    if (touring) tourStep = -1;
    run();
  }).observe(root, { attributes: true, attributeFilter: ["data-ht-still"] });

  // on screen (with a margin): frames may run. Near the middle of the viewport: the
  // tour and the crests run too; elsewhere the figure settles and its loop stops.
  new IntersectionObserver(
    (list) => {
      visible = list[list.length - 1].isIntersecting;
      if (visible) run();
    },
    { rootMargin: "120px 0px" },
  ).observe(stage);
  new IntersectionObserver(
    (list) => {
      centred = list[list.length - 1].isIntersecting;
      if (centred) run();
    },
    { rootMargin: "-22% 0px -22% 0px" },
  ).observe(stage);
  draw();
})();
