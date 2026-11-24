// A line said over a hole: what each hole of the Crystal Mines is about, said
// once on its first visit (too many clocks to read otherwise), its signature
// in one line; and how long a line stays up.

import { minesOrder, sight } from "./scene/data";

const MINES_HINTS = [
  "The cage waits a quarter of the time: catch it, or take the man-way down.",
  `A dark gallery: your lamp sees ${sight(false, true)} units ahead. The crystals sing and kick.`,
  "The turntable turns each stroke; three carts cross on three clocks.",
  "The pickaxe swings; the rope bridges sway. Or take the old drift round.",
  "Crystal facets kick the ball back, and the floor is ice.",
  "No ball rests on the belt: ride between the stamps, or take the walkway.",
  "The lava rises with your strokes: low, mid, high.",
  "The cage is at another landing each stroke: green lamp, go; red, the shaft.",
  "Time the drill's gaps; the gallery collapses behind you; the dynamite blows on stroke four.",
  "Stop on a geyser's pad, or run over it as it spouts: it throws you up a terrace.",
  "The chute loops the loop when the points are set: one tick in six.",
  "Steam jets, pistons, an iron vein pulling you to the drop; the ledge crumbles from stroke five.",
  "Two lava falls on two clocks: their gaps line up only now and then.",
  "The red cart takes you down to the lower drift, the blue one to a dead end; the boulder rolls every other stroke.",
  "A dark hall: bats move each stroke, stalactites drop on a clock.",
  "A gauntlet of doors: the dial says which vault door is open next.",
  "A ledge round a bottomless shaft, each quarter its own trap. Or the cable car.",
  "The Mother Lode: the cart or the drift, the tide, then the Heart.",
];
/** A mines hole's signature line, by its id or slot ("mines/7/v1"), "" off the mines. */
export const minesHint = (id: string | null | undefined) => MINES_HINTS[minesOrder({ hole: id || "" }) - 1] || "";

/** How long a line stays up to be read: 6 s at least, 2 s and 60 ms a character past that (95 characters: 7.7 s). */
export const readMs = (text: string) => Math.max(6000, 2000 + 60 * text.length);
