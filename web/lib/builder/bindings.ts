// What each kind of piece is to the physics, skin by skin. Plain data: a worker reads it without the scene.
import { MAX_BOUNCE } from "./rules";
import type { Kind } from "../scene/worlds";

/** A zone's shape: its box, the ellipse in it, a polygon, or all of the box but a polygon. */
export type Shape = "rect" | "round" | "poly" | "outside";
/** How a piece comes and goes: always there, within a stroke (Every/On/Phase), from stroke to stroke (a pulse). */
export type Clock = "fixed" | "substep" | "stroke";
export interface Range {
  min: number;
  max: number;
  step: number;
  def: number;
}
/** What a piece is to the physics: what an author may set, and within what. */
export interface Binding {
  /** zones: the shapes it may take */
  shapes?: readonly Shape[];
  /** a post's radius, a bar's or a rail's length, a zone's side */
  size: Range;
  /** a bar's thickness */
  thick?: Range;
  /** above MAX_BOUNCE only for a skin that kicks */
  bounce?: Range;
  /** a surface's rolling resistance; a loop's speed to go round */
  scale?: Range;
  /** a slope's or air's push (|Vec|), at most G·MaxSin */
  grade?: Range;
  /** the clocks it may take; the first is its default */
  clocks: readonly Clock[];
  /** drawn as the plain form on purpose */
  plain?: boolean;
  /** the kinds it may overlap: "wall" for a rail or a bar, "post", or a zone's kind */
  overlaps?: readonly string[];
}
const r = (min: number, max: number, step: number, def: number): Range => ({ min, max, step, def });
const PASSIVE = r(0, MAX_BOUNCE, 0.05, 0); // 0: the field's bounce

/** Each kind's binding. The ranges keep a piece drawn as itself: a bar at most 1.6 thick, a surface's scale above 1 only for ice. */
export const KIND: Record<Kind, Binding> = {
  rail: { size: r(0.5, 93, 0.25, 6), bounce: PASSIVE, clocks: ["fixed"] }, // 93: the board's 96 less Fit's margins
  bar: { size: r(0.5, 40, 0.25, 3), thick: r(0.25, 1.6, 0.05, 0.5), bounce: PASSIVE, clocks: ["fixed", "substep", "stroke"] },
  post: { size: r(0.3, 4.5, 0.05, 0.8), bounce: PASSIVE, clocks: ["fixed", "stroke"] },
  surface: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 6), scale: r(0.3, 1, 0.01, 0.5), clocks: ["fixed"], overlaps: ["slope", "hazard"] },
  // A slope is the ground's relief: what lies on it is drawn on it.
  slope: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 8), grade: r(0.05, 0.35, 0.01, 0.2), clocks: ["fixed"], overlaps: ["surface", "hazard", "tunnel"] },
  air: { shapes: ["rect", "round"], size: r(2, 40, 0.25, 6), grade: r(0.05, 0.35, 0.01, 0.25), clocks: ["substep", "fixed"] },
  // A mouth at least 1.5 across: a fast ball steps over a thinner one.
  tunnel: { shapes: ["round", "rect"], size: r(1.5, 8, 0.25, 3), clocks: ["fixed"], overlaps: ["slope"] },
  hazard: { shapes: ["rect", "round", "poly"], size: r(1.5, 80, 0.25, 6), clocks: ["fixed", "stroke"], overlaps: ["slope", "surface"] },
  loop: { shapes: ["rect"], size: r(1.5, 6, 0.1, 2), scale: r(1, 3.5, 0.1, 2), clocks: ["fixed"] },
};

const KICK = { bounce: r(0, 1.5, 0.05, 1.2) };
const ICE = { scale: r(1.01, 1.3, 0.01, 1.18) };
const BIG = { size: r(1, 4.5, 0.05, 2.2) };
// Rocks in a cluster, or set into a rock wall, read as one outcrop.
const ROCKY = { overlaps: ["wall", "post"] };

/** Each skin's changes to its kind's binding. A skin with no entry is not in the palette. */
export const BINDINGS: Record<Kind, Record<string, Partial<Binding>>> = {
  rail: { "": {}, rampart: {} },
  bar: {
    "": {}, driftwood: {}, plank: {}, "clock hand": { clocks: ["substep", "fixed"] }, stall: {}, awning: {}, wheelbarrow: {},
    logs: {}, hay: {}, gate: {}, "gate door": {}, hedge: {}, "rowing boat": {}, rail: {}, ledge: {}, net: {},
  },
  post: {
    "": {}, bumper: { ...KICK, plain: true }, scarecrow: {}, sunflower: {}, lantern: {}, sandcastle: { ...BIG, overlaps: ["wall"] }, palm: {}, coral: {}, buoy: {}, crab: {},
    // A clock's hands turn over it.
    lamp: {}, clock: { overlaps: ["wall"] }, roundabout: BIG, chimney: {}, outcrop: {}, driftwood: {}, house: BIG, "gnome statue": {}, rock: {}, stump: {},
    cat: {}, bandstand: BIG, obelisk: {}, pigeon: {}, stall: {},
    pine: {}, boulder: ROCKY, snowman: {}, chalet: BIG, skater: {},
  },
  surface: {
    "": {}, sand: {}, wetsand: {}, flowerbed: {}, soil: {}, bridge: { scale: r(1, 1, 0.01, 1) }, ice: ICE, molehill: { scale: r(1, 1, 0.01, 1) },
    brick: { scale: r(0.8, 1, 0.01, 0.92) }, herringbone: { scale: r(0.8, 1, 0.01, 0.88) }, marble: { scale: r(1, 1.2, 0.01, 1.05) },
    "plank bridge": { scale: r(1, 1, 0.01, 1) }, snowdrift: {},
  },
  slope: {
    "": {}, dune: {}, stairs: {}, "quarter pipe": {}, funbox: {}, "moon bridge": {},
    kicker: {}, terrace: {}, downhill: {}, slope: {}, "saddle crest": {}, bank: {},
  },
  // The snow cannon is drawn blowing in bursts, never all the time.
  air: { gust: { clocks: ["substep"] } },
  tunnel: {
    "": {}, cave: {}, well: {}, door: {}, shipwreck: {}, warp: {}, "ice cave": {},
    // It spouts now and then, from the round hole its rim is drawn on.
    blowhole: { shapes: ["round"], clocks: ["substep"] },
  },
  hazard: {
    "": {}, water: {}, wave: {}, lagoon: {}, tidepool: {}, fountain: {}, canal: {},
    // The serac's ice falls now and then.
    cliff: {}, serac: { clocks: ["substep", "fixed"] }, crevasse: {},
  },
  loop: {},
};

