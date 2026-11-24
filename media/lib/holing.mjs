// @ts-check
// A holing round of the weather now, found through the Builder test mode's own
// chain (its ?camlog hook, window.__g): each shot the one ending nearest the
// cup, within 40 degrees of it, until one holes. For the headless walk through
// the Builder (scripts/builderwalk.ts): an expression to evaluate in the page,
// the round's shots as [angle, power], null if none holes.

/** @param {number} strokes the most a round may take */
export const holingRound = (strokes) => `(async () => {
  const g = window.__g, id = g.current(), p = await g.chain.period(), s = await g.chain.state(id);
  const pin = s.cup, shots = [];
  let rest = s.start;
  const of = (a, pw) => a.toFixed(4) + "," + pw.toFixed(4);
  for (let k = 0; k < ${strokes}; k++) {
    let best = null;
    const toward = Math.atan2(pin[1] - rest[1], pin[0] - rest[0]) * 180 / Math.PI;
    for (let da = -40; da <= 40; da += 2) for (let pw = 0.5; pw <= 10; pw += 0.25) {
      const a = Math.round((toward + da) * 100) / 100;
      let r;
      try { r = k === 0 ? await g.chain.simulateRound(id, [of(a, pw)], p) : await g.chain.simulateFrom(id, rest, of(a, pw), k, p); } catch { continue; }
      if (r.holed) return [...shots, [a, pw]];
      const d = Math.hypot(r.rest[0] - pin[0], r.rest[1] - pin[1]);
      if (!best || d < best.d) best = { a, pw, rest: r.rest, d };
    }
    if (!best) return null;
    shots.push([best.a, best.pw]);
    rest = best.rest;
  }
  return null;
})()`;
