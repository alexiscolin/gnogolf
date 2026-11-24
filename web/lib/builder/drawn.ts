// Its own module: it loads the scene (three.js), which the checks do not.
import { buildHole } from "../scene/course";
import { keyOf } from "./gg1";
import type { Drawn } from "../scene/census";
import type { Hole } from "../scene/data";

/** What buildHole drew for each of a hole's pieces, by keyOf ("wall4", "post0", "zone2p1"). */
export function census(s: Hole): Map<string, Drawn> {
  const out = new Map<string, Drawn>();
  buildHole(s, { defer: true, census: (p, d) => out.set(keyOf(p), d) }); // defer: the merge reports nothing to the census
  return out;
}
