// The game's own links: a hole's, a dare's, and each network's share page for one.

import { isAddress } from "./chain";
import type { ShareSrc } from "./analytics";

/** A new query for one of the game's links: a page pointed at another chain (?rpc=, ?web=) keeps pointing there, and nothing else is kept. */
export function chainQuery() {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  for (const k of ["rpc", "web"]) {
    const v = keep.get(k);
    if (v) q.set(k, v);
  }
  return q;
}

/** This hole's address, for the bar and for shared links. by: the sharer, whose best the friend is dared to beat. src: where it was shared from. */
export function holeLink(s: { id: string | null; place: number }, gnome: string, by = "", src?: ShareSrc) {
  const q = chainQuery();
  // a cup's hole by its own page; one in no cup by its id, never as place 1
  const slot = s.place ? /^([a-z]+)\/(\d+)(\/v\d+)?$/.exec(s.id || "") : null;
  if (!slot) q.set("hole", s.id || "");
  if (gnome) q.set("gnome", gnome);
  if (by && isAddress(by)) q.set("by", by);
  if (src) q.set("src", src);
  return (slot ? `h/${slot[1]}-${slot[2]}/` : "") + (String(q) ? `?${q}` : "");
}

/** A dare to the whole course: friends race the player's ghost on every hole they have a best on. */
export function dareLink(by: string, src?: ShareSrc) {
  const q = chainQuery();
  if (isAddress(by)) q.set("by", by);
  if (src) q.set("src", src);
  return String(q) ? `?${q}` : "";
}

const enc = encodeURIComponent;
/** Each network's share page for this text and link. X shows the card of a post's last link; the others preview the first, and the text names gno.land: ours goes first there. */
export function shareLinks(text: string, url: string): [string, string][] {
  const post = enc(pasted(text, url));
  return [
    ["X", `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`],
    ["WhatsApp", `https://wa.me/?text=${post}`],
    ["Bluesky", `https://bsky.app/intent/compose?text=${post}`],
  ];
}
/** The message a copied link pastes: the link first, for its card. */
export const pasted = (text: string, url: string) => `${url}\n\n${text}`;
