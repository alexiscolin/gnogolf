// The Builder's own checks of a hole: what the chain accepts and a player would trip on, such as a cup inside a wall.
import { closest, inZone, segDist, wallDist } from "../terrain";
import type { PieceRef } from "../scene/census";
import { RULES } from "../chain";
import { LIMITS } from "./gg1";
import { cap, MIN_SHOT_WORK, pt } from "./rules";
import { CELL, laneOf, movers, moves, outline, reach, shapeOf, traps, type Trap } from "./lane";
import type { HoleIn, PostIn, V, WallIn, ZoneIn } from "./types";
import type { Cost } from "./wasm";

export type Rule = "L0" | "E1" | "E1b" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9" | "E10" | "E11" | "E12" | "E13" | "E14" | "E15" | "E16" | "E17" | "L2";
export interface Issue {
  rule: Rule;
  severity: "error" | "warning";
  text: string;
  /** the hole's piece it is about; the draft's checks add piece, its id in the draft */
  ref?: PieceRef;
  piece?: string;
  at?: V;
  /** the other pieces it is about */
  also?: PieceRef[];
}

/** E2: a ball at the tee keeps its radius and this from every wall. */
export const TEE_GAP = 0.05;
/** E7: a pulse must come and go within a round's strokes. */
export const ROUND_STROKES = 60;
/** E11: the share of a work limit past which the gauge warns. */
export const WORK_WARN = 0.8;
/** E5: a hazard or a tunnel is at least this across, or a fast ball steps over it. */
export const MOUTH = 1.5;
/** E14: a passage the ball must use is this much wider than the ball. */
export const PASSAGE = 0.25;
/** E15: a piece keeps this far from a rail, or the kerb swallows it. */
export const KERB_GAP = 0.5;
/** E17: a piece that comes back keeps the ball's radius and this from water. UnstickIn sets the ball 0.02 clear of the piece, and water takes a ball by its centre. */
export const PUSH_GAP = 0.05;

type Each<T> = { item: T; ref: PieceRef };
function each<T>(h: HoleIn, set: PieceRef["set"]): Each<T>[] {
  const key = set === "wall" ? "walls" : set === "post" ? "posts" : "zones";
  const out: Each<T>[] = (h[key] as readonly T[]).map((item, i) => ({ item, ref: { set, i } }));
  h.pulses.forEach((p, k) => (p[key] as readonly T[]).forEach((item, i) => out.push({ item, ref: { set, i, pulse: k } })));
  return out;
}
const pieceOf = (h: HoleIn, r: PieceRef) => {
  const list = r.pulse === undefined ? h : h.pulses[r.pulse];
  return (r.set === "wall" ? list.walls : r.set === "post" ? list.posts : list.zones)[r.i];
};
const centreOf = (z: ZoneIn): V => [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2];

/** A piece's name in a sentence: "the hedge wall", "the plain post", "the water hazard". */
export type Namer = (r: PieceRef) => string;
export const nameIn = (h: HoleIn): Namer => (r) => {
  const p = pieceOf(h, r), kind = r.set === "zone" ? (p as ZoneIn).kind : r.set;
  return `the ${p.skin || "plain"} ${kind}${r.pulse !== undefined ? ` (pulse ${r.pulse + 1})` : ""}`;
};

const err = (rule: Rule, text: string, ref?: PieceRef, at?: V, also?: PieceRef[]): Issue => ({ rule, severity: "error", text, ...(ref && { ref }), ...(at && { at }), ...(also && { also }) });

/** The pieces of any clock that block a disc of radius rad at p. */
function blocked(h: HoleIn, p: V, rad: number, zoneHit: (z: ZoneIn) => boolean, judged: Judged = () => true): PieceRef[] {
  const out: PieceRef[] = [];
  for (const { item, ref } of each<WallIn>(h, "wall")) if (segDist(p[0], p[1], item.a, item.b) < rad) out.push(ref);
  for (const { item, ref } of each<PostIn>(h, "post")) if (Math.hypot(p[0] - item.c[0], p[1] - item.c[1]) < item.r + rad) out.push(ref);
  for (const { item, ref } of each<ZoneIn>(h, "zone")) if (moves(item) && zoneHit(item)) out.push(ref);
  return out.filter(judged);
}

/** E1: a zone Fit cut to nothing because it lay off the board. */
function board(h: HoleIn, name: Namer): Issue[] {
  return each<ZoneIn>(h, "zone").filter(({ item }) => !(item.max[0] > item.min[0] && item.max[1] > item.min[1])).map(({ ref }) => err("E1", `${cap(name(ref))} lies off the board once the hole is fitted`, ref));
}

/** E2: the tee is in the lane, clear of every wall and post, and in no zone that moves a ball. */
function tee(h: HoleIn, lane: (p: V) => boolean, name: Namer, judged: Judged): Issue[] {
  const out: Issue[] = [];
  if (!lane(h.tee)) out.push(err("E2", `The tee at ${pt(h.tee)} is outside the lane`, undefined, h.tee));
  for (const ref of blocked(h, h.tee, h.ballR + TEE_GAP, (z) => inZone(shapeOf(z), h.tee[0], h.tee[1]), judged)) out.push(err("E2", `The tee touches ${name(ref)} at ${pt(h.tee)}`, ref, h.tee));
  return out;
}

/** E3: the cup's whole disc is in the lane and touches no wall, post or zone that moves a ball. */
function cup(h: HoleIn, lane: (p: V) => boolean, name: Namer, judged: Judged): Issue[] {
  const out: Issue[] = [], rad = h.cupR, [x, y] = h.pin;
  const rim: V[] = [h.pin, ...Array.from({ length: 24 }, (_, k): V => [x + rad * Math.cos((k * Math.PI) / 12), y + rad * Math.sin((k * Math.PI) / 12)])];
  if (!rim.every(lane)) out.push(err("E3", `The cup at ${pt(h.pin)} is not wholly in the lane`, undefined, h.pin));
  for (const ref of blocked(h, h.pin, rad, (z) => rim.some((p) => inZone(shapeOf(z), p[0], p[1])), judged)) out.push(err("E3", `The cup touches ${name(ref)} at ${pt(h.pin)}`, ref, h.pin));
  return out;
}

/** E4: the cup is reached from the tee, the timed and pulsed pieces left out. E14: and no gap on the way is one a ball only just threads. */
function way(h: HoleIn, name: Namer): Issue[] {
  const loose = LOOSE(h), from = reach(h, loose);
  if (!from.reached) {
    // The end shut in is the one with the smaller room round it.
    const shut = from.size <= reach({ ...h, tee: h.pin }, loose).size ? "the tee is closed in" : "the cup is closed off";
    return [err("E4", `The cup cannot be reached from the tee: ${shut}`, undefined, shut === "the tee is closed in" ? h.tee : h.pin)];
  }
  // E4: the gaps no ball passes. E14: the others, which a ball only just fits through.
  const ball = 2 * h.ballR, shut = passages(h, 0), same = (p: Passage, q: Passage) => p.mid[0] === q.mid[0] && p.mid[1] === q.mid[1];
  const needs = (need: number) => (need === ball ? `the ball (${ball})` : `the ball (${need} beside a hazard)`);
  return [
    ...shut.map(({ gap, need, mid, a, b }) => err("E4", `The cup cannot be reached from the tee: ${between(name, gap, mid, a, b)}, narrower than ${needs(need)}`, a, mid, [b])),
    ...passages(h, PASSAGE).filter((p) => !shut.some((q) => same(p, q))).map(({ gap, need, mid, a, b }) =>
      err("E14", `${cap(between(name, gap, mid, a, b))}, and the way to the cup goes through it: at least ${need + PASSAGE}, or a ball only just fits`, a, mid, [b])),
  ];
}
const between = (name: Namer, gap: number, mid: V, a: PieceRef, b: PieceRef) => `the gap at ${pt(mid)} between ${name(a)} and ${name(b)} is ${+gap.toFixed(2)} wide`;

/** The flood's clearance: a cell is shut only if no ball fits anywhere in it, so a playable hole is never refused. */
export const LOOSE = (h: HoleIn) => h.ballR - CELL * Math.SQRT1_2;

/** A gap between two fixed solids on the way to the cup. need: the width a ball needs there; mid: its narrowest place. */
export interface Passage {
  gap: number;
  need: number;
  mid: V;
  a: PieceRef;
  b: PieceRef;
}

/** The gaps between fixed solids that the way to the cup needs, narrower than a ball needs plus slack. None if the cup is not reached. */
export function passages(h: HoleIn, slack: number): Passage[] {
  const loose = LOOSE(h), base = reach(h, loose);
  if (!base.reached) return [];
  // keep: the room a ball's centre needs from the solid. Its radius, or none from a hazard's edge.
  const of: (Solid & { keep: number; zone?: ZoneIn })[] = [], refs: PieceRef[] = [];
  for (const { item, ref } of each<WallIn>(h, "wall")) if (!item.every && ref.pulse === undefined) of.push({ kind: "wall", a: item.a, b: item.b, keep: h.ballR }), refs.push(ref);
  for (const { item, ref } of each<PostIn>(h, "post")) if (ref.pulse === undefined) of.push({ kind: "post", c: item.c, r: item.r, keep: h.ballR }), refs.push(ref);
  for (const { item: z, ref } of each<ZoneIn>(h, "zone")) {
    if (z.kind !== "hazard" || z.every || ref.pulse !== undefined) continue;
    const pts = outline(z);
    pts.forEach((a, k) => (of.push({ kind: "wall", a, b: pts[(k + 1) % pts.length], keep: 0, zone: z }), refs.push(ref)));
  }
  // A gap is closed by a post at its middle.
  const gaps: (Passage & { post: PostIn })[] = [];
  // Two solids are never nearer than their boxes: boxes too far apart have no such gap.
  const box = of.map((s) => (s.kind === "post" ? [s.c[0] - s.r, s.c[1] - s.r, s.c[0] + s.r, s.c[1] + s.r] : [Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1])]));
  for (let i = 0; i < of.length; i++) {
    for (let j = i + 1; j < of.length; j++) {
      const need = of[i].keep + of[j].keep, p = box[i], q = box[j], far = need + slack + 1e-9;
      if (q[0] - p[2] > far || p[0] - q[2] > far || q[1] - p[3] > far || p[1] - q[3] > far) continue;
      const [gap, mid] = gapOf(of[i], of[j]);
      // The gap between two edges of one hazard, across its inside, is no passage.
      if (!(gap > 1e-9 && gap < need + slack) || (of[i].zone && of[i].zone === of[j].zone && inZone(shapeOf(of[i].zone!), mid[0], mid[1]))) continue;
      gaps.push({ gap, need, mid, a: refs[i], b: refs[j], post: { c: mid, r: Math.max(gap / 2, CELL) } });
    }
  }
  type Gap = (typeof gaps)[number];
  const closing = (closed: readonly Gap[]) => reach({ ...h, posts: [...h.posts, ...closed.map((g) => g.post)] }, loose);
  // A way passes a gap when one of its cells is within reach of the gap's post.
  const passes = (path: readonly V[], g: Gap) => path.some((p) => Math.hypot(p[0] - g.mid[0], p[1] - g.mid[1]) < g.post.r + loose + 1e-9);
  // Close the gaps on the way, then those on the way found round them, until the cup is lost.
  // A way that passes none proves the cup needs none of them.
  const onWay = gaps.filter((g) => passes(base.path, g)), shut: Gap[] = [];
  let way = base;
  for (let fresh = onWay; fresh.length && way.reached; fresh = gaps.filter((g) => !shut.includes(g) && passes(way.path, g))) {
    shut.push(...fresh);
    way = closing(shut);
  }
  if (way.reached) return [];
  // Needed alone: closing it loses the cup. Needed together: each shut gap is reopened in turn,
  // and stays open while the cup stays lost.
  const needed = new Set(onWay.filter((g) => !closing([g]).reached));
  if (shut.length > 1) {
    for (const g of [...shut]) {
      const rest = shut.filter((x) => x !== g);
      if (!closing(rest).reached) shut.splice(shut.indexOf(g), 1);
    }
  }
  for (const g of shut) needed.add(g);
  return gaps.filter((g) => needed.has(g)).map(({ gap, need, mid, a, b }) => ({ gap, need, mid, a, b }));
}


type Solid = { kind: "wall"; a: V; b: V } | { kind: "post"; c: V; r: number };
/** The gap between two solids and the middle of its narrowest place. */
function gapOf(a: Solid, b: Solid): [number, V] {
  const seg = (p: V, s: { a: V; b: V }): [number, V] => {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / l2)) : 0;
    const q: V = [s.a[0] + u * dx, s.a[1] + u * dy];
    return [Math.hypot(p[0] - q[0], p[1] - q[1]), q];
  };
  const mid = (p: V, q: V): V => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  if (a.kind === "post" && b.kind === "post") {
    const d = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]), u: V = [(b.c[0] - a.c[0]) / d, (b.c[1] - a.c[1]) / d];
    return [d - a.r - b.r, mid([a.c[0] + u[0] * a.r, a.c[1] + u[1] * a.r], [b.c[0] - u[0] * b.r, b.c[1] - u[1] * b.r])];
  }
  if (a.kind === "post" || b.kind === "post") {
    const p = (a.kind === "post" ? a : b) as { c: V; r: number }, w = (a.kind === "wall" ? a : b) as { a: V; b: V };
    const [d, q] = seg(p.c, w), u: V = d ? [(q[0] - p.c[0]) / d, (q[1] - p.c[1]) / d] : [0, 0];
    return [d - p.r, mid([p.c[0] + u[0] * p.r, p.c[1] + u[1] * p.r], q)];
  }
  // Two walls: the nearest of each one's ends to the other. Walls that cross have no gap.
  if (crosses(a.a, a.b, b.a, b.b)) return [0, a.a];
  let best: [number, V] = [Infinity, a.a];
  for (const [p, s] of [[a.a, b], [a.b, b], [b.a, a], [b.b, a]] as const) {
    const [d, q] = seg(p, s);
    if (d < best[0]) best = [d, mid(p, q)];
  }
  return best;
}

/** The diameter of the widest circle inside a polygon, returned as soon as it reaches enough. A coarse grid, then a fine one round its best points. */
function inscribed(poly: readonly V[], enough: number): number {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), lo: V = [Math.min(...xs), Math.min(...ys)];
  const shape = { min: lo, max: [Math.max(...xs) + 1e-9, Math.max(...ys) + 1e-9] as V, round: false, poly };
  const depth = (x: number, y: number) => {
    let d = Infinity;
    for (let k = 0; k < poly.length; k++) d = Math.min(d, segDist(x, y, poly[k], poly[(k + 1) % poly.length]));
    return inZone(shape, x, y) ? d : -d;
  };
  const COARSE = 0.25, FINE = 0.05, reach = COARSE * Math.SQRT1_2, coarse: [number, number, number][] = [];
  let best = 0;
  for (let x = lo[0]; x <= shape.max[0]; x += COARSE) {
    for (let y = lo[1]; y <= shape.max[1]; y += COARSE) {
      const d = depth(x, y);
      if ((best = Math.max(best, d)) * 2 >= enough) return 2 * best;
      coarse.push([x, y, d]);
    }
  }
  for (const [cx, cy, d] of coarse) {
    if (d + reach < best) continue;
    for (let x = cx - COARSE / 2; x <= cx + COARSE / 2; x += FINE) {
      for (let y = cy - COARSE / 2; y <= cy + COARSE / 2; y += FINE) if ((best = Math.max(best, depth(x, y))) * 2 >= enough) return 2 * best;
    }
  }
  return 2 * best;
}

/** E5: every hazard and tunnel is at least MOUTH across. A polygon is measured by the widest circle in it. */
function mouths(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const { item: z, ref } of each<ZoneIn>(h, "zone")) {
    if (z.kind !== "hazard" && z.kind !== "tunnel") continue;
    if (z.outside) continue; // the sea round a lane: as wide as the board
    const w = z.poly?.length ? inscribed(z.poly, MOUTH - 1e-9) : Math.min(z.max[0] - z.min[0], z.max[1] - z.min[1]);
    if (w < MOUTH - 1e-9) out.push(err("E5", `${cap(name(ref))} is ${+w.toFixed(2)} across: at least ${MOUTH}, or a fast ball steps over it`, ref, z.min));
  }
  return out;
}

/** E6: a tunnel's way out is in the lane, clear of walls and posts, in no zone that moves the ball, and at least MOUTH from its own mouth. */
function exits(h: HoleIn, lane: (p: V) => boolean, name: Namer): Issue[] {
  const out: Issue[] = [], zones = each<ZoneIn>(h, "zone");
  for (const { item: z, ref } of zones) {
    if (z.kind !== "tunnel" || !z.vec) continue;
    const v = z.vec;
    const why = !lane(v) ? "outside the lane"
      : blocked(h, v, h.ballR, () => false).length ? "on a wall or a post"
      : zones.some(({ item: q }) => moves(q) && inZone(shapeOf(q), v[0], v[1])) ? "in a zone that moves the ball on" : "";
    if (why) { out.push(err("E6", `${cap(name(ref))} comes out at ${pt(v)}, ${why}`, ref, v)); continue; }
    // Its own mouth only: near another tunnel's, the ball goes on through that one.
    const pts = outline(z), d = wallDist(v[0], v[1], pts.map((a, k) => ({ a, b: pts[(k + 1) % pts.length] })));
    if (d < MOUTH - 1e-9) out.push(err("E6", `${cap(name(ref))} comes out at ${pt(v)}, ${+d.toFixed(2)} from its own mouth: at least ${MOUTH}, or the ball runs straight back in`, ref, v));
  }
  return out;
}

/** E17: no place a ball from the tee can come to rest that the cup is never reached from. */
function noTraps(h: HoleIn, name: Namer): Issue[] {
  return traps(h, LOOSE(h)).map((t) => {
    const ref: PieceRef | undefined = t.zone >= 0 ? { set: "zone", i: t.zone } : undefined;
    return err("E17", trapSaid(t, ref ? name(ref) : ""), ref, t.at);
  });
}

/** E17: no piece that comes back beside water, which it would push a resting ball into. */
function noPushes(h: HoleIn, lane: (p: V) => boolean, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const m of movers(h)) {
    if (m.set === "zone") continue;
    const ref: PieceRef = { set: m.set, i: m.i, ...(m.pulse !== undefined && { pulse: m.pulse }) };
    let near: { ref: PieceRef } | null, at: V;
    if (m.set === "post") {
      const q = m.item as PostIn;
      near = pushedInto(h, lane, (x, y) => Math.hypot(x - q.c[0], y - q.c[1]) - q.r, () => q.c, [q.c[0] - q.r, q.c[1] - q.r], [q.c[0] + q.r, q.c[1] + q.r]);
      at = q.c;
    } else {
      // A wall pushes the ball out from its nearest point, as UnstickIn does.
      const w = m.item as WallIn;
      near = pushedInto(h, lane, (x, y) => segDist(x, y, w.a, w.b), (x, y) => { const c = closest(x, y, w.a, w.b); return [c.x, c.z]; },
        [Math.min(w.a[0], w.b[0]), Math.min(w.a[1], w.b[1])], [Math.max(w.a[0], w.b[0]), Math.max(w.a[1], w.b[1])]);
      at = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    }
    if (near) out.push(err("E17", pushSaid(h, name(ref), name(near.ref)), ref, at, [near.ref]));
  }
  return out;
}

/** E17's sentences: a trap, and a piece that comes back beside water. */
export const trapSaid = (t: Trap, it: string) =>
  t.kind === "tunnel" ? `${cap(it)} lets the ball out at ${pt(t.at)}, where it can never get back to the cup`
  : t.kind === "slope" ? `${cap(it)} sends the ball down at ${pt(t.at)}, where it can never get back to the cup`
  : t.kind === "climb" ? `The cup cannot be reached from the tee: ${it} is too long for a ball to climb`
  : t.kind === "cut" ? "The cup cannot be reached from the tee"
  : `A jump off ${it} lands the ball at ${pt(t.at)}, where it can never get back to the cup`;
export const pushSaid = (h: Pick<HoleIn, "ballR">, it: string, water: string) =>
  `${cap(it)} comes back on a ball beside ${water} and would push it in: at least ${h.ballR + PUSH_GAP} between them`;

/** The hazard a piece that comes back would push a resting ball into, or null. gap: a point's distance from the piece, negative inside; from: where the push comes from; lo, hi: the piece's box. */
export function pushedInto(h: HoleIn, lane: (p: V) => boolean, gap: (x: number, y: number) => number, from: (x: number, y: number) => V, lo: V, hi: V): { ref: PieceRef } | null {
  const room = h.ballR + PUSH_GAP, { zones, walls } = pushing(h);
  if (!zones.length) return null;
  for (let x = lo[0] - room; x <= hi[0] + room + 1e-9; x += CELL / 2) {
    for (let y = lo[1] - room; y <= hi[1] + room + 1e-9; y += CELL / 2) {
      if (gap(x, y) >= room) continue;
      // The water test first: it is the cheapest.
      const z = zones.find((q) => inZone(q.sh, x, y));
      if (!z) continue;
      const f = from(x, y), lx = Math.min(f[0], x), hx = Math.max(f[0], x), ly = Math.min(f[1], y), hy = Math.max(f[1], y);
      const rests = (b: V) => lane(b) && wallDist(b[0], b[1], walls) >= h.ballR - 1e-6;
      if (!rests([f[0] + (x - f[0]) * 0.1, f[1] + (y - f[1]) * 0.1]) && !rests([(f[0] + x) / 2, (f[1] + y) / 2])) continue;
      // The push never crosses a fixed wall.
      if (walls.some((w) => w.hi[0] >= lx && w.lo[0] <= hx && w.hi[1] >= ly && w.lo[1] <= hy && crosses(f, [x, y], w.a, w.b))) continue;
      return { ref: z.ref };
    }
  }
  return null;
}
/** What pushedInto reads of a hole, computed once: its hazards of every clock, its fixed walls and their boxes. */
const pushing = (h: HoleIn) => {
  let p = pushers.get(h);
  if (!p) {
    p = {
      zones: each<ZoneIn>(h, "zone").filter(({ item }) => item.kind === "hazard").map(({ item, ref }) => ({ sh: shapeOf(item), ref })),
      walls: h.walls.filter((w) => !w.every).map((w) => ({ a: w.a, b: w.b, lo: [Math.min(w.a[0], w.b[0]), Math.min(w.a[1], w.b[1])] as V, hi: [Math.max(w.a[0], w.b[0]), Math.max(w.a[1], w.b[1])] as V })),
    };
    pushers.set(h, p);
  }
  return p;
};
const pushers = new WeakMap<HoleIn, { zones: { sh: ReturnType<typeof shapeOf>; ref: PieceRef }[]; walls: { a: V; b: V; lo: V; hi: V }[] }>();

/** E7: a timed piece is on for part of its cycle, never all or none of it; a pulse both comes and goes within a round's strokes. */
function clocks(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const set of ["wall", "zone"] as const) {
    for (const { item, ref } of each<WallIn | ZoneIn>(h, set)) {
      if (item.every && !((item.on ?? 0) >= 1 && (item.on ?? 0) <= item.every - 1)) {
        out.push(err("E7", `${cap(name(ref))} is on for ${item.on ?? 0} of ${item.every} substeps: 1 to ${item.every - 1}`, ref));
      }
    }
  }
  h.pulses.forEach((p, k) => {
    const on = Array.from({ length: ROUND_STROKES }, (_, s) => (((s + p.phase) % p.every) + p.every) % p.every < p.on);
    if (p.every < 2 || !on.includes(true) || !on.includes(false)) {
      out.push(err("E7", `Pulse ${k + 1} (on for ${p.on} of every ${p.every} strokes) never ${on.includes(true) ? "goes" : "comes"} in a round's ${ROUND_STROKES} strokes`));
    }
  });
  return out;
}

/** The hole's counts, pulses included, each with its GG1 limit. */
export function counts(h: HoleIn) {
  const zs = each<ZoneIn>(h, "zone").map((z) => z.item), skins = new Set<string>();
  for (const s of ["wall", "post", "zone"] as const) for (const { item } of each<{ skin?: string }>(h, s)) skins.add(item.skin ?? "");
  return {
    walls: [each(h, "wall").length, LIMITS.walls],
    posts: [each(h, "post").length, LIMITS.posts],
    zones: [zs.length, LIMITS.zones],
    points: [zs.reduce((n, z) => n + (z.poly?.length ?? 0), 0), LIMITS.polyTotal],
    pulses: [h.pulses.length, LIMITS.pulses],
    skins: [skins.size, LIMITS.skins],
  } satisfies Record<string, [number, number]>;
}

/** E8: the counts within GG1's limits, and each polygon within its own. */
function limits(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const [what, [n, max]] of Object.entries(counts(h))) if (n > max) out.push(err("E8", `Too many ${what}: ${n} of ${max}`));
  for (const { item, ref } of each<ZoneIn>(h, "zone")) {
    if (item.poly && item.poly.length > LIMITS.poly) out.push(err("E8", `${cap(name(ref))} has ${item.poly.length} points: at most ${LIMITS.poly}`, ref));
  }
  return out;
}

/** Whether a ball from the tee gets within rad of a point. */
export type Reaches = (p: V, rad?: number) => boolean;
/** E10: a post or a zone no ball from the tee gets near. */
function inReach(h: HoleIn, reaches: Reaches, name: Namer): Issue[] {
  const out: Issue[] = [], near = h.ballR + CELL;
  for (const { item, ref } of each<PostIn>(h, "post")) if (!reaches(item.c, item.r + near)) out.push(err("E10", `${cap(name(ref))} at ${pt(item.c)} is outside the lane: no ball reaches it`, ref, item.c));
  for (const { item, ref } of each<ZoneIn>(h, "zone")) {
    if (item.outside) continue;
    const c = centreOf(item), half = Math.max(item.max[0] - item.min[0], item.max[1] - item.min[1]) / 2;
    if (!reaches(c, half + near)) out.push(err("E10", `${cap(name(ref))} at ${pt(c)} is outside the lane: no ball reaches it`, ref, c));
  }
  return out;
}

/** Whether segments a→b and c→d cross at a point inside both (meeting at an end is not crossing). */
export function crosses(a: V, b: V, c: V, d: V) {
  const o = (p: V, q: V, r: V) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d), e = 1e-9;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}
// Two zones' shapes are compared on a grid of OVER at least, with at most OVER_STEPS a side.
const OVER = 0.05, OVER_STEPS = 256;
/** Whether two zones overlap with an area; touching edges do not. The grid is set off by odd fractions, so it never samples a shared edge. */
function overlap(a: ZoneIn, b: ZoneIn): boolean {
  const lo: V = [Math.max(a.min[0], b.min[0]), Math.max(a.min[1], b.min[1])], hi: V = [Math.min(a.max[0], b.max[0]), Math.min(a.max[1], b.max[1])];
  if (!(hi[0] - lo[0] > 1e-9 && hi[1] - lo[1] > 1e-9)) return false;
  if (!a.round && !a.poly?.length && !b.round && !b.poly?.length) return true;
  const step = Math.max(OVER, (hi[0] - lo[0]) / OVER_STEPS, (hi[1] - lo[1]) / OVER_STEPS), sa = shapeOf(a), sb = shapeOf(b);
  for (let x = lo[0] + 0.371 * step; x < hi[0]; x += step) for (let y = lo[1] + 0.613 * step; y < hi[1]; y += step) if (inZone(sa, x, y) && inZone(sb, x, y)) return true;
  return false;
}
/** A piece's palette entry, or none for a piece the Builder did not place: that one is not judged. */
export type EntryOf = (r: PieceRef) => { overlaps?: readonly string[] } | undefined;
type Judged = (r: PieceRef) => boolean;
/** A piece's kind as overlaps names it: "wall", "post", or a zone's kind. */
const kindOf = (h: HoleIn, r: PieceRef) => (r.set === "zone" ? (pieceOf(h, r) as ZoneIn).kind : r.set);

/** E13: no post on a post, on a wall or in a zone that moves the ball, and no two zones overlapping, unless the palette lets the pair meet. */
function overlaps(h: HoleIn, name: Namer, entryOf: EntryOf): Issue[] {
  const out: Issue[] = [], posts = each<PostIn>(h, "post"), walls = each<WallIn>(h, "wall"), zones = each<ZoneIn>(h, "zone");
  const may = (a: PieceRef, b: PieceRef) => !!entryOf(a)?.overlaps?.includes(kindOf(h, b));
  // Asked before the shapes are compared: it is cheaper.
  const free = (a: PieceRef, b: PieceRef) => !entryOf(a) || !entryOf(b) || may(a, b) || may(b, a);
  const say = (a: PieceRef, b: PieceRef, what: string, at: V) => out.push(err("E13", `${cap(name(a))} ${what} ${name(b)} at ${pt(at)}`, a, at, [b]));
  posts.forEach(({ item: p, ref }, k) => {
    for (const { item: q, ref: r } of posts.slice(k + 1)) if (!free(ref, r) && Math.hypot(p.c[0] - q.c[0], p.c[1] - q.c[1]) < p.r + q.r - 1e-9) say(ref, r, "overlaps", p.c);
    for (const { item: w, ref: r } of walls) if (!free(ref, r) && segDist(p.c[0], p.c[1], w.a, w.b) < p.r - 1e-9) say(ref, r, "stands on", p.c);
    for (const { item: z, ref: r } of zones) if (!free(ref, r) && moves(z) && inZone(shapeOf(z), p.c[0], p.c[1])) say(ref, r, "stands in", p.c);
  });
  zones.forEach(({ item: z, ref }, k) => {
    for (const { item: y, ref: r } of zones.slice(k + 1)) if (!free(ref, r) && !z.outside && !y.outside && overlap(z, y)) say(ref, r, "lies over", z.min);
  });
  return out;
}

/** E15: no post in the scenery round the lane, such as the sea or the rooftops. */
function scenery(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [], round = h.zones.filter((z) => z.outside && moves(z));
  for (const { item: p, ref } of each<PostIn>(h, "post")) {
    const z = round.find((q) => inZone(shapeOf(q), p.c[0], p.c[1]));
    if (z) out.push(err("E15", `${cap(name(ref))} at ${pt(p.c)} stands in the ${z.skin || "hazard"} round the lane: the world draws over it`, ref, p.c));
  }
  return out;
}


/** The hole's checks, errors first. entryOf: the palette's view of each piece; one with no entry is not judged. */
export function checkHole(h: HoleIn, { name = nameIn(h), entryOf = () => ({}), traps: search = true }: { name?: Namer; entryOf?: EntryOf; traps?: boolean } = {}): Issue[] {
  const lane = laneOf(h), judged: Judged = (r) => !!entryOf(r);
  const ends = [...tee(h, lane, name, judged), ...cup(h, lane, name, judged)];
  // With the tee or the cup on a piece, E4 would only say so again. An end that is only
  // out of the lane may mean the other end is shut in, so the way is still asked.
  const asked = !ends.length || (!ends.some((i) => i.ref) && (lane(h.tee) || lane(h.pin)));
  const ways = asked ? way(h, name).filter((i) => !ends.length || !i.ref) : []; // with an end out, only "no way" is said, never a gap
  const out = [...board(h, name), ...ways, ...(search && asked && !ways.length && !ends.length ? noTraps(h, name) : []), ...noPushes(h, lane, name), ...ends, ...mouths(h, name), ...exits(h, lane, name),
    ...clocks(h, name), ...limits(h, name), ...(ends.length ? [] : inReach(h, reach(h, LOOSE(h)).reaches, name)), ...overlaps(h, name, entryOf), ...scenery(h, name)];
  return out.filter((i) => !i.ref || judged(i.ref)).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

/** What the hole uses of the room the realm leaves it. A share past 1 is refused. */
export interface Gauge {
  used: number;
  of: number;
  share: number;
}
const W = RULES.work;
/** The most one shot costs on a hole with no wall. */
export const SHOT_FLOOR = W.shot + (RULES.maxWork + RULES.maxWorkStep) * W.unit;
/** The realm's worst first shot on a hole with nothing in it. */
export const STORM_FLOOR = W.shot + (RULES.maxWorkStep + MIN_SHOT_WORK) * W.unit;
/** The hole's work against the realm's limits, counted over the floor every hole pays: a gauge on the whole would sit at 95% for a plain lane. E11 warns as one nears its limit. */
export function work(c: Cost, warnAt = WORK_WARN): { shot: Gauge; storm: Gauge; issues: Issue[] } {
  const g = (used: number, of: number): Gauge => ({ used, of, share: used / of });
  const shot = g(c.bound - SHOT_FLOOR, c.maxShot - SHOT_FLOOR), storm = g(c.worst - STORM_FLOOR, c.budget - STORM_FLOOR), issues: Issue[] = [];
  if (shot.share > warnAt) issues.push({ rule: "E11", severity: "warning", text: `Its walls and moving pieces take ${Math.round(shot.share * 100)}% of what one shot may cost` });
  if (storm.share > warnAt) issues.push({ rule: "E11", severity: "warning", text: `In its dearest weather, a first shot has ${c.room.toLocaleString("en")} units of room, at least ${c.minShot.toLocaleString("en")}` });
  return { shot, storm, issues };
}
