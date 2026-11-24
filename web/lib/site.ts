import { isLoopback } from "./network";
import { CUPS as COURSE, CUP_NAMES, type Cup } from "./card";

// The site's public address, for what needs absolute URLs. On Netlify a preview is at DEPLOY_PRIME_URL, production at URL.
// NEXT_PUBLIC_SITE_URL, when set, wins in production.
export const PREVIEW = !!process.env.CONTEXT && process.env.CONTEXT !== "production";
export const SITE = ((PREVIEW && process.env.DEPLOY_PRIME_URL) || process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "http://localhost:3300").replace(/\/$/, "");

/** The public address of a page of the game, link being its "?cup=…&hole=…": the page's own site, or SITE on this machine, never a local dev address. */
export function siteURL(link = "") {
  const here = typeof window !== "undefined" ? window.location.origin + window.location.pathname.replace(/\/(h|g|build)\/.*$/, "/") : ""; // a hole's page, the shop's and the Builder's link from the site's root
  const origin = typeof window !== "undefined" && isLoopback(window.location.hostname) ? SITE : here.replace(/\/$/, "");
  return origin + (link ? "/" + link.replace(/^\/?/, "") : "");
}
/** The site's name as a player types it: gnogolf.xyz. */
export const siteHost = () => new URL(siteURL()).host;

/** A new issue on the game's repository. */
export const ISSUES = "https://github.com/alexiscolin/gnogolf/issues/new";
/** A new issue reporting a community hole, its title and body filled in. */
export const reportHole = (id: string) =>
  `${ISSUES}?title=${encodeURIComponent(`Report: ${id}`)}&body=${encodeURIComponent(`Hole: ${id}\nPlay it: ${siteURL(`?hole=${id}`)}\n\nWhy? (offensive name or note, impossible to hole, broken, other)\n`)}`;

// The home page's words, also its text for crawlers: a title of 50 to 60 characters and a description under 160, as search results show them.
export const TITLE = "Gnogolf: free 3D mini-golf in your browser, on-chain";
export const DESCRIPTION =
  "A free 3D mini-golf in your browser: every hole lives on gno.land and every shot is computed by the chain. Pick a gnome and play, no wallet needed.";

/** What every shared text ends with. */
export const SHARE_TAGS = " #gnoland @_gnoland";

/** The course's cups, in order, and how one is called. */
export const CUPS: readonly string[] = COURSE;
export const cupName = (w: string) => CUP_NAMES[w as Cup] || w[0].toUpperCase() + w.slice(1);
