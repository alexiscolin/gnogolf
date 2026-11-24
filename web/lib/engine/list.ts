// The chain's hole list as the game keeps it: the cups' holes in their order,
// everyone else's apart, and the hole a link names.
import { cupOf, oldToSlot } from "../card";
import { communityOf } from "../community";
import type { HoleRow } from "../types";
import type { GameState, Link } from "./types";

// the community's holes are listed only in a build that asks for them
const COMMUNITY = process.env.NEXT_PUBLIC_COMMUNITY === "1";

/** What these rules read and set of the game's state. */
type Lists = Pick<GameState, "list" | "all" | "community" | "taken" | "world">;

/** hole2 before hole10: the chain's order, else the number in the id (an older realm gives no order). */
const byNumber = (a: HoleRow, b: HoleRow) => {
  const n = (h: HoleRow) => {
    if (typeof h.order === "number") return h.order;
    const m = h.id.match(/(\d+)/);
    return m ? Number(m[1]) : Infinity;
  };
  return n(a) - n(b) || a.id.localeCompare(b.id);
};
/** A cup's holes (the cup played, unless one is given). */
export const inWorld = (g: Lists, w = g.world) => g.list.filter((h) => cupOf(h) === w);

/** The hole a link names: an id or alias, or a cup and a place in it (the chain's order, else the nth). null when it names nothing on this chain. */
export function linked(g: Lists, link: Link | null): HoleRow | null {
  if (!link) return null;
  // an archived hole too, by its id; an alias (a slot, "<address>/<slug>")
  // is its current version, and so is a course hole's old realm id
  if ("id" in link) {
    const all = g.all || g.list, alias = oldToSlot(link.id) || link.id;
    return all.find((h) => h.id === link.id) || all.find((h) => h.slot === alias && !h.next) || null;
  }
  const { cup: want, n } = link;
  if (!want || !n) return null;
  const cup = g.list.filter((h) => cupOf(h) === want);
  return cup.find((h) => Math.round(h.order) === n) || cup[n - 1] || null;
}

/** The chain's hole list taken in: every hole, the cups', the community's. */
export function setList(g: Lists, list: HoleRow[]) {
  // a replaced hole stays playable by its link; only the current one fills the cup
  g.all = list;
  // the cups hold the course's own holes; anyone else's is a community hole, listed apart and ranked nowhere
  g.list = list.filter((h) => !h.next && h.official !== false).sort(byNumber);
  // none until the takedown list is known
  g.community = COMMUNITY ? communityOf(list, g.taken ?? null) : [];
}
