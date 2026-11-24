// What the interface is told: the game's state as one snapshot, handed to
// onChange each time it changes and never otherwise.
import { boardWork } from "../adena";
import { cupOf } from "../card";
import { inWorld } from "./list";
import { HOT as HOT_FIELDS, type GameState, type Snapshot, type Tier } from "./types";
import type { Chain } from "../chain";
import type { HoleRow, Mode } from "../types";

/** Who is told, and what a snapshot reads of the game's other parts, as they are now. */
interface Needs {
  alive: () => boolean;
  onChange: (snap: Snapshot) => void;
  /** a snapshot told: a still scene draws for it (engine/loop.ts) */
  woke: (now: number) => void;
  /** the hole of the latest load still being built and compiled (engine/loader.ts) */
  warming: () => boolean;
  /** the pulses' pieces seen so far on this hole (engine/extras.ts) */
  pulse: () => { walls: number; posts: number; pieces: number };
  mode: () => Mode;
  tier: () => Tier;
  /** a duel's rival (engine/rival.ts) */
  rival: () => Pick<Snapshot, "rival" | "rivalIn" | "rivalTurn" | "rivalPeek">;
}

export function makePublisher(g: GameState, chain: Chain, { alive, onChange, woke, warming, pulse, mode, tier, rival }: Needs) {
  // The interface is told only what changed: the last snapshot is kept, and a
  // publish that changes nothing tells nothing. During a replay, a change of
  // the fast-moving fields alone (HOT) is told 10 times a second at most.
  // The world's hole list and counts are worked out once per list and world.
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
      linked: !!g.linked, // the page's link named a hole that exists
      ready: !!g.course && !warming(), // the hole is built and its shaders ready: the curtain may open
      // this hole's place in its cup, for the address bar and shared links; 0
      // for a hole in no cup (a community or an archived one): linked by its id
      place: g.s ? perList().holes.findIndex((h) => h.id === g.id) + 1 : 0,
      // a course hole another has replaced: playable by its link, in no cup
      archived: !!(g.id && g.all && g.all.find((h) => h.id === g.id)?.next),
      look: (g.s && g.s.world) || g.world || "garden", // the world this hole is dressed as
      // how many holes each world has on this chain, for the world screen
      worlds: perList().worlds,
      id: g.id,
      name: g.s ? g.s.name : "",
      // the hole's data: what a player can read
      source: g.s ? chain.sourceURL(g.id) : "#",
      official: !g.s || g.s.official !== false, // one of the course's holes (a community hole is not)
      community: g.community || NONE, // everyone else's holes, playable outside the cups
      strokes: g.strokes,
      timed: !!(g.s && g.s.timed),
      time: g.course ? g.course.userData.time : "day",
      // what the realm's work model (golf.gno newWork) counts, for the save's
      // split and its gas: the walls of the hole and of its pulses, every
      // piece on the board (the hole's, its pulses' as if always there, the
      // forecast's zones; a polygon's every edge) and every shot's share of
      // setting its pulses up (boardWork), the forecast's kind, each stroke's
      // path length and work, and what the realm says a commit spends before
      // its shots
      ...boardWork(g.s, pulse(), (g.forecast && g.forecast.zones) || []),
      kind: (g.forecast && g.forecast.kind) || "",
      pts: g.pts,
      works: g.works,
      fixed: (g.forecast && g.forecast.gas) || 0,
      shots: g.shots,
      flying: g.flying,
      aiming: g.aiming,
      power: g.power,
      spin: g.spin || 0, // third person's aim turning on past its zone: -1 left, 1 right (the cue)
      holed: g.holed,
      error: g.error,
      weather: g.weather || null, // { wind: [x, y] | null, rain, fog, storm } for the HUD
      flash: g.flash || 0,
      mode: mode(), // the aim mode set now
      cam: g.cam,
      roundMode: g.roundMode || null, // the mode this round is played in, from its first stroke
      period: g.period == null ? null : g.period, // the round's weather period (five minutes): what a record is played in
      cause: g.cause || null, // a word on why the ball speeds up or drifts, once a shot
      errorKind: (g.error && g.errorKind) || null,
      failed: g.error ? g.failed || null : null, // the hole a load failed on (Try again)
      view: g.view,
      tier: tier(), // what the graphics setting gives on this device
      ...rival(), // a duel's rival: their strokes replayed so far (null: no duel), and their ball in
      done: !!g.done, // no more shots (holed, even before the banner)
    });

  return {
    publish,
    /** The cup's holes and each cup's count, for the list and the cup as they are now. */
    perList,
    /** No snapshot held back is told any more. */
    stop: () => clearTimeout(toldLater),
  };
}
