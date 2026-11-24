// The Builder's own piece limits, stricter than the chain's on purpose: a hole must read at a glance.
import type { Issue } from "./checks";
import type { Draft, Piece } from "./draft";

/** The busiest course hole has 50 pieces, 6 of them moving: the Builder allows a little more. */
export const BUILDER_LIMITS = { pieces: 60, moving: 8 } as const;

/** A piece that comes and goes: in a pulse, or timed within a stroke. */
export const isMoving = (p: Pick<Piece, "clock">) => p.clock.k !== "fixed";

export const pieceCounts = (d: Pick<Draft, "pieces">) => ({ pieces: d.pieces.length, moving: d.pieces.filter(isMoving).length });

const err = (text: string): Issue => ({ rule: "E16", severity: "error", text });
const over = (n: number, max: number, what: string) => (n > max ? [err(`Too many ${what}: ${n} of ${max}`)] : []);

/** E16: the counts of a draft past the Builder's limits. */
export function builderLimits(d: Pick<Draft, "pieces">): Issue[] {
  const c = pieceCounts(d);
  return [...over(c.pieces, BUILDER_LIMITS.pieces, "pieces"), ...over(c.moving, BUILDER_LIMITS.moving, "moving pieces")];
}

/** The counts an edit takes past their limit, or further past it. A draft already past may still shrink. */
export function pastLimits(before: Pick<Draft, "pieces">, after: Pick<Draft, "pieces">): Issue[] {
  const a = pieceCounts(before), b = pieceCounts(after);
  return [...(b.pieces > a.pieces ? over(b.pieces, BUILDER_LIMITS.pieces, "pieces") : []), ...(b.moving > a.moving ? over(b.moving, BUILDER_LIMITS.moving, "moving pieces") : [])];
}
