// What the interface is told: the game's state as one snapshot, handed to onChange when it changes and never otherwise.
import { boardWork } from "../adena";
import { cupOf } from "../card";
import { inWorld } from "./list";
import { HOT as HOT_FIELDS, type GameState, type Snapshot, type Tier } from "./types";
import type { Chain } from "../chain";
import type { HoleRow, Mode } from "../types";

interface Needs {
  alive: () => boolean;
  onChange: (snap: Snapshot) => void;
  /** a snapshot was told: a still scene draws for it */
  woke: (now: number) => void;
  /** the latest load's hole is still being built and compiled */
  warming: () => boolean;
  /** the pulses' pieces seen so far on this hole */
  pulse: () => { walls: number; posts: number; pieces: number };
  mode: () => Mode;
  tier: () => Tier;
  rival: () => Pick<Snapshot, "rival" | "rivalIn" | "rivalTurn" | "rivalPeek">;
}

export function makePublisher(g: GameState, chain: Chain, { alive, onChange, woke, warming, pulse, mode, tier, rival }: Needs) {
  // A publish that changes nothing tells nothing. During a replay, a change of the HOT fields
  // alone is told 10 times a second at most.
  const HOT = new Set<keyof Snapshot>(HOT_FIELDS), HOT_MS = 100, NONE: readonly never[] = [];
  let told: Snapshot | null = null, toldAt = 0, toldLater: ReturnType<typeof setTimeout> | undefined;
  const lists: { list: HoleRow[] | null; world: string | undefined | null; holes: HoleRow[]; worlds: Record<string, number> } = { list: null, world: null, holes: [], worlds: {} };
  const perList = () => {
    if (lists.list !== g.list || lists.world !== g.world) {
      lists.list = g.list;
      lists.world = g.world;
      lists.holes = inWorld(g);
      lists.worlds = g.list.reduce<Record<string, number>>((m, h) => ((m[cupOf(h)] = (m[cupOf(h)] || 0) + 1), m), {});
    }
    return lists;
  };
  function publish() {
    if (!alive()) return;
    const snap = snapshot();
    let changed = !told, hotOnly = !!told;
    if (told) for (const k in snap) {
      const field = k as keyof Snapshot;
      if (snap[field] !== told[field]) (changed = true), HOT.has(field) || (hotOnly = false);
    }
    if (!changed) return;
    clearTimeout(toldLater);
    const now = performance.now();
    if (hotOnly && g.flying && now - toldAt < HOT_MS) {
      toldLater = setTimeout(publish, HOT_MS - (now - toldAt));
      return;
    }
    told = snap;
    toldAt = now;
    woke(now);
    onChange(snap);
  }
  const snapshot = (): Snapshot => ({
      holes: perList().holes,
      allHoles: g.list, // every cup's, for the cup totals and the grand slam
      world: g.world,
      linked: !!g.linked,
      ready: !!g.course && !warming(), // the hole is built and its shaders ready: the curtain may open
      // the hole's place in its cup, for links; 0 for a hole in no cup, linked by its id
      place: g.s ? perList().holes.findIndex((h) => h.id === g.id) + 1 : 0,
      // a course hole another has replaced: playable by its link, in no cup
      archived: !!(g.id && g.all && g.all.find((h) => h.id === g.id)?.next),
      look: (g.s && g.s.world) || g.world || "garden", // the world this hole is dressed as
      // how many holes each world has on this chain, for the world screen
      worlds: perList().worlds,
      id: g.id,
      name: g.s ? g.s.name : "",
      source: g.s ? chain.sourceURL(g.id) : "#",
      official: !g.s || g.s.official !== false, // one of the course's holes (a community hole is not)
      community: g.community || NONE,
      strokes: g.strokes,
      timed: !!(g.s && g.s.timed),
      time: g.course ? g.course.userData.time : "day",
      // what the realm's work model counts, for the save's split and its gas:
      // the walls and pieces of the hole and its pulses, and each shot's share of setting the pulses up
      ...boardWork(g.s, pulse(), (g.forecast && g.forecast.zones) || []),
      kind: (g.forecast && g.forecast.kind) || "",
      pts: g.pts,
      works: g.works,
      fixed: (g.forecast && g.forecast.gas) || 0,
      shots: g.shots,
      flying: g.flying,
      aiming: g.aiming,
      power: g.power,
      spin: g.spin || 0,
      holed: g.holed,
      error: g.error,
      weather: g.weather || null,
      flash: g.flash || 0,
      mode: mode(), // the aim mode set now
      cam: g.cam,
      roundMode: g.roundMode || null, // the mode this round is played in, from its first stroke
      period: g.period == null ? null : g.period, // the round's weather period: what a record is played in
      cause: g.cause || null,
      errorKind: (g.error && g.errorKind) || null,
      failed: g.error ? g.failed || null : null,
      view: g.view,
      tier: tier(),
      ...rival(), // a duel's rival: their strokes replayed so far (null: no duel), and their ball in
      done: !!g.done,
    });

  return {
    publish,
    /** The cup's holes and each cup's count, worked out once per list and cup. */
    perList,
    /** No snapshot held back is told any more. */
    stop: () => clearTimeout(toldLater),
  };
}
