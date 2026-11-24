// The editor's edits, pure. Each asks the whole pipeline, so the board refuses exactly what the issues list would.
import type { Issue } from "./checks";
import { nextId, withoutEmptyPulses, type ClockSpec, type Draft, type Geometry, type Piece, type V } from "./draft";
import { barCorners, entryParts, frame } from "./gg1";
import { pieceName } from "./names";
import { clampTo, handlesOf, middleOf, QUARTER, setHandle, snap, type HandleKey } from "./handles";
import { CELL } from "./lane";
import { entry as entryIn, type PaletteEntry, type Range } from "./palette";
import { about, mayOverlap, segSeg, validate, within, type ValidateOptions } from "./pipeline";
import { cap, pt, theWorld } from "./rules";
import { refusalOf } from "./explain";
import { segDist } from "../terrain";
import { pastLimits } from "./limits";
import { applySurface, narrowed, owned, surfaceIn, type Green } from "./surface";

/** A piece's settings at placement: each within its entry's range, its default when left out. */
export interface PlaceParams {
  size?: number;
  thick?: number;
  bounce?: number;
  scale?: number;
  grade?: number;
  /** a tunnel's way out */
  to?: V;
}

/** The clock a timed piece starts with: on for half of a 40-substep cycle. */
export const START_SUBSTEPS = { every: 40, on: 20, phase: 0 };

const pick = (v: number | undefined, r: Range | undefined) => (r ? clampTo(v ?? r.def, r) : undefined);
/** A size within its range, on the quarter grid. */
const gridSize = (v: number | undefined, r: Range) => Math.max(r.min, Math.min(r.max, Math.round(clampTo(v ?? r.def, r) * 4) / 4));

/** The entry as a piece along x. at: a post's centre, a rail's or a bar's first end, a zone's low corner. Settings left out take their defaults. */
export function placePiece(e: PaletteEntry, id: string, at: V, p: PlaceParams = {}): Piece {
  const params: Piece["params"] = {};
  const bounce = pick(p.bounce, e.bounce), scale = pick(p.scale, e.scale), grade = pick(p.grade, e.grade);
  if (bounce) params.bounce = bounce;
  if (scale !== undefined) params.scale = scale;
  if (grade !== undefined) (params.grade = grade), (params.dir = [1, 0]);
  if (e.kind === "tunnel" || e.kind === "loop") params.to = p.to ?? [at[0] + 8, at[1]];
  const c = e.clocks[0];
  const clock: ClockSpec = c === "substep" ? { k: "substep", ...START_SUBSTEPS } : c === "stroke" ? { k: "stroke", pulse: 0 } : { k: "fixed" };
  let geometry: Piece["geometry"];
  if (e.kind === "post") geometry = { t: "post", c: at, r: pick(p.size, e.size)! };
  else if (e.kind === "rail") geometry = { t: "rail", a: at, b: [at[0] + gridSize(p.size, e.size), at[1]] };
  else if (e.kind === "bar") geometry = { t: "bar", a: at, b: [at[0] + gridSize(p.size, e.size), at[1]], thick: pick(p.thick, e.thick)! };
  else {
    const s = gridSize(p.size, e.size), shape = e.shapes?.[0] ?? "rect";
    const max: V = [at[0] + s, at[1] + s];
    geometry = shape === "poly" ? { t: "poly", pts: [at, [at[0] + s, at[1]], [at[0], at[1] + s]] } : { t: shape === "round" ? "round" : "rect", min: at, max };
  }
  return { id, entry: e.id, geometry, params, clock };
}

/** The armed entry's piece centred under the pointer, every point of it on the grid of step from origin. */
export function ghostAt(e: PaletteEntry, id: string, pointer: V, step: number, origin: V): Piece {
  const p = placePiece(e, id, pointer), m = middleOf(p);
  return placePiece(e, id, snap([2 * pointer[0] - m[0], 2 * pointer[1] - m[1]], step, origin));
}

/** Where a piece is, for a sentence: its first point. */
export const whereOf = (g: Geometry): V => (g.t === "rail" || g.t === "bar" ? g.a : g.t === "post" ? g.c : g.t === "poly" ? g.pts[0] : g.min);

/** The draft in another world, each piece on the same skin's entry there. Refused naming each piece that world has no entry for. */
export function changeWorld(d: Draft, world: string, palette: readonly PaletteEntry[]): Draft | { refused: string[] } {
  const refused: string[] = [], match = matchIn(palette);
  const pieces = d.pieces.map((p) => {
    const id = match(entryParts(p.entry));
    if (!id) refused.push(`${pieceName(p)} at ${pt(whereOf(p.geometry))}`);
    return id ? { ...p, entry: id } : p;
  });
  return refused.length ? { refused } : { ...d, world, pieces, proofs: [] };
}

/** changeWorld, only if the draft holds there: else refused with the first error the move would bring. o: this world's checks. */
export function toWorld(d: Draft, world: string, palette: readonly PaletteEntry[], o: ValidateOptions): Draft | { refused: string[] } | { why: string } {
  const r = changeWorld(d, world, palette);
  if ("refused" in r) return r;
  const why = newErrors(errorsOf(d, o), r, { ...o, palette });
  return why.length ? { why: refusalOf(why[0]) } : r;
}

/** Why an opened draft is refused: a piece whose entry is not in its world's palette. null: none. */
export function unknownEntry(d: Draft, palette: readonly PaletteEntry[]): string | null {
  const ids = new Set(palette.map((e) => e.id));
  const p = d.pieces.find((q) => !ids.has(q.entry));
  return p ? `Piece ${p.id} is no piece of ${theWorld(d.world)}'s.` : null;
}

/** A world's matcher from a hole's piece to its entry id, the world's own drawing first. null: none. */
export const matchIn = (palette: readonly PaletteEntry[]) => (p: { kind: string; skin: string }): string | null =>
  (palette.find((e) => e.kind === p.kind && e.skin === p.skin && e.world !== "*") ?? palette.find((e) => e.kind === p.kind && e.skin === p.skin))?.id ?? null;

/** An error's identity: its rule and its piece, "-" for the whole hole. */
const keyOf = (i: Issue) => `${i.rule} ${i.piece ?? "-"}`;

/** The errors an edit brings: those of after about the piece, and any other the hole as it was did not have. Never compared with the hole without the piece: a lane with a rail taken out is open. */
function editErrors(was: Draft, after: Draft, id: string, o: ValidateOptions, before?: readonly Issue[]): Issue[] {
  const had = new Set((before ?? errorsOf(was, o)).map(keyOf));
  const v = validate(after, o);
  return v.issues.filter((i) => i.severity === "error" && (about(i, id, v.refs) || !had.has(keyOf(i))));
}

/** The draft as kept after an edit, or why nothing changes. */
export type Dropped = Draft | { why: string };
const verdict = (next: Draft, why: readonly Issue[]): Dropped => (why.length ? { why: refusalOf(why[0]) } : next);

/** The edit gate's reasons, in order: past the Builder's limits, a green narrower than a ball plays, then the errors the edit brings. */
function barred(d: Draft, after: Draft, errs: () => Issue[]): Issue[] {
  const full = pastLimits(d, after);
  if (full.length) return full;
  const narrow = after.surface && after.surface !== d.surface ? narrowed(surfaceIn(d), after.surface) : [];
  return narrow.length ? narrow : errs();
}
/** The editor's gate: after if it brings d no new error, passes no limit and leaves no green too narrow; else why not. before: the errors of d, when the caller has them. */
export const gate = (d: Draft, after: Draft, o: ValidateOptions, before?: readonly Issue[]): Dropped =>
  verdict(after, barred(d, after, () => newErrors(before ?? errorsOf(d, o), after, o)));

/** Why the piece may not be where it is in after, by default d with the piece put in or put back. Empty: it may. */
export function canPlace(d: Draft, piece: Piece, o: ValidateOptions, before?: readonly Issue[], after: Draft = { ...d, pieces: [...d.pieces.filter((p) => p.id !== piece.id), piece] }): Issue[] {
  return barred(d, after, () => editErrors(d, after, piece.id, o, before));
}
/** A drag's checks, each asked once per place or shape: a pointer moves many times within one snapped place. */
export function dragCheck(start: Draft, given: ValidateOptions) {
  const o = untrapped(given); // no trap search while it moves: the drop runs it
  let base: readonly Issue[] | null = null, green: Green | null | undefined;
  const said = new Map<string, Issue[]>(), once = (key: string, run: () => Issue[]) => {
    if (!said.has(key)) said.set(key, run());
    return said.get(key)!;
  };
  const was = () => (base ??= errorsOf(start, o));
  const greens = new Map<string, string>(), greenKey = (s: { cells: readonly V[]; open: readonly V[] }) => `${s.cells.map(String).sort().join(";")}|${s.open.map(String).sort().join(";")}`;
  return {
    piece: (p: Piece) => once(`${p.id} ${p.entry} ${JSON.stringify(p.geometry)} ${JSON.stringify(p.params)}`, () => canPlace(start, p, o, was())),
    end: (which: "tee" | "pin", at: V) => once(`${which} ${at[0]} ${at[1]}`, () => newErrors(was(), { ...start, [which]: at }, o)),
    /** Why the green may not become s; "" if it may. */
    surface(s: { cells: readonly V[]; open: readonly V[] }): string {
      const k = greenKey(s), known = greens.get(k);
      if (known !== undefined) return known;
      const r = gate(start, applySurface(start, s, green === undefined ? (green = owned(start)) : green), o, was()), why = "why" in r ? r.why : "";
      greens.set(k, why);
      return why;
    },
    /** Why not, if s was judged already; null if not yet. */
    known: (s: { cells: readonly V[]; open: readonly V[] }) => greens.get(greenKey(s)) ?? null,
  };
}

/** The options without the trap search, the dearest check, for what is checked many times a gesture. One object per options, so validate's cache holds. */
export function untrapped(o: ValidateOptions): ValidateOptions {
  if (o.traps === false) return o;
  let q = quicks.get(o);
  if (!q) quicks.set(o, (q = { ...o, traps: false }));
  return q;
}
const quicks = new WeakMap<ValidateOptions, ValidateOptions>();

/** validate's issues without the warnings. */
export const errorsOf = (d: Draft, o: ValidateOptions) => validate(d, o).issues.filter((i) => i.severity === "error");

/** The piece moved so that whereOf is at to. A tunnel's way out stays: it has a handle of its own. */
export function movePiece(p: Piece, to: V): Piece {
  const at = whereOf(p.geometry), dx = to[0] - at[0], dy = to[1] - at[1], m = (v: V): V => [v[0] + dx, v[1] + dy];
  const g = p.geometry;
  const geometry: Geometry = g.t === "rail" || g.t === "bar" ? { ...g, a: m(g.a), b: m(g.b) } : g.t === "post" ? { ...g, c: m(g.c) } : g.t === "poly" ? { ...g, pts: g.pts.map(m) } : { ...g, min: m(g.min), max: m(g.max) };
  return { ...p, geometry };
}

/** v on the hole's quarter grid. origin: the tee, or the cup when the tee itself moves. */
const onQuarter = (v: V, origin: V): V => snap(v, QUARTER, origin);

/** A solid for a walk's cheap check: a rail's segment, a bar's four sides and outline, a post's disc. */
type Solid = { segs: [V, V][]; discs: [V, number][]; outline?: [V, V][] };
const solidOf = (g: Geometry): Solid | null => {
  if (g.t === "rail") return { segs: [[g.a, g.b]], discs: [] };
  if (g.t === "post") return { segs: [], discs: [[g.c, g.r]] };
  if (g.t !== "bar") return null;
  const c = barCorners(g.a, g.b, g.thick), sides = c.map((q, k): [V, V] => [q, c[(k + 1) % 4]]);
  return { segs: sides, discs: [], outline: sides };
};
/** Whether two solids meet: their segments touch or cross, a disc touches a segment or a disc, one lies in the other's outline. */
function meet(x: Solid, y: Solid): boolean {
  for (const [a, b] of x.segs) for (const [c, e] of y.segs) if (segSeg(a, b, c, e) < 1e-9) return true;
  for (const [s, t] of [[x, y], [y, x]] as const) {
    for (const [c, r] of s.discs) {
      if (t.segs.some(([a, b]) => segDist(c[0], c[1], a, b) < r - 1e-9) || t.discs.some(([q, r2]) => Math.hypot(c[0] - q[0], c[1] - q[1]) < r + r2 - 1e-9)) return true;
      if (t.outline && within(c, t.outline)) return true;
    }
    if (t.outline && s.segs.some(([a]) => within(a, t.outline!))) return true;
  }
  return false;
}
/** A walk's cheap check for piece p: whether, where at puts it, it meets no rail, bar or post it did not meet before. Pairs the palette lets meet are left out; a zone moves freely. */
function clearOf(d: Draft, p: Piece, at: (v: V) => Piece, palette: readonly PaletteEntry[]): (v: V) => boolean {
  const mine = solidOf(p.geometry);
  if (!mine) return () => true;
  const may = mayOverlap(palette);
  const others = d.pieces.filter((q) => q.id !== p.id && !may(p, q, q.geometry.t === "post" ? "post" : "wall")).map((q) => solidOf(q.geometry)).filter((q): q is Solid => !!q && !meet(mine, q));
  return (v) => {
    const s = solidOf(at(v).geometry);
    return !s || !others.some((q) => meet(s, q));
  };
}

/** The last point from from toward to that ok takes. The cheap check (clear) walks the way first; then the whole check, bisected: a few whole checks however long the drag. */
function walk(from: V, to: V, ok: (v: V) => boolean, origin: V, clear: (v: V) => boolean = () => true): V {
  const on = (v: V) => onQuarter(v, origin), at = (f: number) => [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f] as V;
  to = on(to);
  const n = Math.ceil(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) / QUARTER);
  if (!n) return to;
  // The halves between quarters are looked at too: an eighth is thinner than any rail, post or bar.
  let far = 0;
  for (let k = 1; k <= n && clear(at((k - 0.5) / n)) && clear(on(at(k / n))); k++) far = k;
  const q = (k: number) => (k === n ? to : on(at(k / n)));
  if (!far) return from;
  if (ok(q(far))) return q(far);
  let lo = 0, hi = far;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ok(q(mid))) lo = mid;
    else hi = mid;
  }
  return lo ? q(lo) : from;
}

/** A clamp's last word: the place a walk found, judged with the trap search too. If refused, bisects back toward from, three whole checks at most. */
function settle(from: V, last: V, ok: (v: V) => boolean, origin: V): V {
  if (last[0] === from[0] && last[1] === from[1]) return last;
  if (ok(last)) return last;
  let lo = from, hi = last;
  for (let k = 0; k < 3; k++) {
    const mid = onQuarter([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], origin);
    if ((mid[0] === lo[0] && mid[1] === lo[1]) || (mid[0] === hi[0] && mid[1] === hi[1])) break;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

const without = (d: Draft, id: string) => ({ ...d, pieces: d.pieces.filter((q) => q.id !== id) });
const replace = (d: Draft, p: Piece) => frame({ ...d, pieces: d.pieces.map((q) => (q.id === p.id ? p : q)) });

/** Where a drag of piece id toward to stops: the last place on the way where it may go, or where it is. */
export function clampMove(d: Draft, id: string, to: V, o: ValidateOptions): V {
  const p = d.pieces.find((q) => q.id === id);
  if (!p) return to;
  const q = untrapped(o), before = errorsOf(d, q), from = whereOf(p.geometry);
  const last = walk(from, to, (v) => canPlace(d, movePiece(p, v), q, before).length === 0, d.tee, clearOf(d, p, (v) => movePiece(p, v), o.palette));
  if (q === o) return last;
  const had = errorsOf(d, o);
  return settle(from, last, (v) => canPlace(d, movePiece(p, v), o, had).length === 0, d.tee);
}

/** A drag of one of a piece's handles toward to, stopped at the last place the hole holds. The draft is framed. */
export function clampHandle(d: Draft, id: string, key: HandleKey, to: V, o: ValidateOptions): Draft {
  const p = d.pieces.find((q) => q.id === id), e = p && entryIn(p.entry, o.palette), h = p && handlesOf(p).find((x) => x.key === key);
  if (!p || !e || !h) return d;
  const q = untrapped(o), before = errorsOf(d, q);
  let last = walk(h.at, to, (v) => canPlace(d, setHandle(p, key, v, e, d.tee), q, before).length === 0, d.tee, clearOf(d, p, (v) => setHandle(p, key, v, e, d.tee), o.palette));
  if (q !== o) {
    const had = errorsOf(d, o);
    last = settle(h.at, last, (v) => canPlace(d, setHandle(p, key, v, e, d.tee), o, had).length === 0, d.tee);
  }
  return replace(d, setHandle(p, key, last, e, d.tee));
}

/** A drag of the tee or the cup toward to, stopped at the last place that brings the hole no new error. */
export function clampEnd(d: Draft, which: "tee" | "pin", to: V, o: ValidateOptions): V {
  const q = untrapped(o), had = errorsOf(d, q), origin = which === "tee" ? d.pin : d.tee;
  const last = walk(d[which], to, (v) => newErrors(had, { ...d, [which]: v }, q).length === 0, origin);
  if (q === o) return last;
  const full = errorsOf(d, o);
  return settle(d[which], last, (v) => newErrors(full, { ...d, [which]: v }, o).length === 0, origin);
}


/** A piece let go after a drag: clamped with the fast checks (quick), then judged with the census (full) before it is kept, framed. */
export function dropMove(start: Draft, id: string, to: V, quick: ValidateOptions, full: ValidateOptions): Dropped {
  const p = start.pieces.find((q) => q.id === id);
  if (!p) return { why: "" };
  const at = clampMove(start, id, to, quick), next = frame({ ...start, pieces: start.pieces.map((q) => (q.id === id ? movePiece(p, at) : q)) });
  return verdict(next, editErrors(start, next, id, full));
}

/** A handle let go, as dropMove. */
export function dropHandle(start: Draft, id: string, key: HandleKey, to: V, quick: ValidateOptions, full: ValidateOptions): Dropped {
  const next = clampHandle(start, id, key, to, quick);
  return verdict(next, editErrors(start, next, id, full));
}

/** The tee or the cup let go, as dropMove. */
export function dropEnd(start: Draft, which: "tee" | "pin", to: V, quick: ValidateOptions, full: ValidateOptions): Dropped {
  const next = frame({ ...start, [which]: clampEnd(start, which, to, quick) });
  return verdict(next, newErrors(errorsOf(start, full), next, full));
}

/** The errors after has that before did not, by rule and piece. */
export function newErrors(before: readonly Issue[], after: Draft, o: ValidateOptions): Issue[] {
  const had = new Set(before.map(keyOf));
  return errorsOf(after, o).filter((i) => !had.has(keyOf(i)));
}


/** The draft without the piece, and without a pulse it leaves empty. */
export const removePiece = (d: Draft, id: string): Draft => withoutEmptyPulses(without(d, id));

/** The nearest place where p may go in rest, on rings a grid step apart from r0. null: none among the FIX_TRIES nearest. */
function nearest(rest: Draft, p: Piece, o: ValidateOptions, r0 = CELL): Piece | null {
  const q = untrapped(o), before = errorsOf(rest, q), from = whereOf(p.geometry), seen = new Set<string>();
  for (let r = r0; ; r += CELL) {
    for (let k = 0; k < FIX_DIRECTIONS; k++) {
      const a = (2 * Math.PI * k) / FIX_DIRECTIONS, v = onQuarter([from[0] + r * Math.cos(a), from[1] + r * Math.sin(a)], rest.tee), key = v.join(" ");
      if (seen.has(key) || (v[0] === from[0] && v[1] === from[1])) continue;
      if (seen.size >= FIX_TRIES) return null; // each try is a whole check
      seen.add(key);
      const moved = movePiece(p, v);
      // The trap search, the dearest check, only for a place the others take.
      if (canPlace(rest, moved, q, before).length === 0 && (q === o || canPlace(rest, moved, o).length === 0)) return moved;
    }
  }
}

/** A piece for a screen reader: "The rock obstacle at (13.5, 6.5)". */
export const pieceLabel = (p: Piece) => {
  const n = pieceName(p);
  return `${cap(n)} at ${pt(whereOf(p.geometry))}`;
};

/** Why one more piece like p would pass the Builder's limits; "" if it would not. */
export const roomFor = (d: Draft, p: Piece): string => {
  const why = pastLimits(d, { pieces: [...d.pieces, { ...p, id: nextId(d) }] });
  return why.length ? refusalOf(why[0]) : "";
};

/** The keyboard's drop: the entry placed at to, or at the nearest place the hole holds. Searched with the fast checks, since a census per try froze the board for seconds; the place found is judged with the census. null: none near. */
export function placeNear(d: Draft, e: PaletteEntry, to: V, quick: ValidateOptions, full: ValidateOptions): { draft: Draft; id: string } | { why: string } | null {
  const id = nextId(d), p = placePiece(e, id, onQuarter(to, d.tee));
  if (roomFor(d, p)) return null;
  const put = canPlace(d, p, quick).length === 0 ? p : nearest(d, p, quick);
  if (!put) return null;
  const next = { ...d, pieces: [...d.pieces, put] }, why = canPlace(d, put, full, undefined, next);
  return why.length ? { why: refusalOf(why[0]) } : { draft: frame(next), id };
}

/** How far a copy goes to clear its piece: a post's width, a unit for a rail or a bar, a zone's longest side. */
const sizeOf = (g: Geometry) => {
  const box = (pts: readonly V[]) => Math.max(Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1])));
  const s = g.t === "post" ? 2 * g.r : g.t === "rail" || g.t === "bar" ? 1 : g.t === "poly" ? box(g.pts) : box([g.min, g.max]);
  return Math.max(CELL, Math.ceil(s / CELL) * CELL);
};

/** A copy of piece id at the nearest place it may go, the draft framed. null: none near, or the limits are reached. */
export function copyPiece(d: Draft, id: string, o: ValidateOptions): Draft | null {
  const p = d.pieces.find((q) => q.id === id);
  if (p && roomFor(d, p)) return null;
  // The search starts a piece's size away, clear of the piece copied.
  const c = p && nearest(d, { ...p, id: nextId(d) }, o, sizeOf(p.geometry));
  return c ? frame({ ...d, pieces: [...d.pieces, c] }) : null;
}

/** In how many directions a fix or a copy looks on each ring. */
const FIX_DIRECTIONS = 16;
/** The places a fix or a copy tries at most, nearest first. */
const FIX_TRIES = 64;

/** The one-click fix of an issue: its piece moved to the nearest place where it may go. null: the issue is the whole hole's, or no place near is free. */
export function fixOf(issue: Issue, d: Draft, o: ValidateOptions): Draft | null {
  const p = issue.piece ? d.pieces.find((q) => q.id === issue.piece) : undefined;
  const moved = p && nearest(without(d, p.id), p, o);
  return moved ? replace(d, moved) : null;
}
