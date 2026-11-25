// What this browser remembers of the player: the camera, the Builder's Inspector, the gnome, the gnomes and badges earned.
import { GNOMES, gnomeById } from "./scene/gnome";
import { reducedMotion } from "./device";
import { lowGfx } from "./engine/pace";
import type { CamMode } from "./engine/types";

/** The camera modes, in the order the button goes through them. A page opens in Classic; a pick is kept for the tab's session only. */
export const CAM_ORDER: readonly CamMode[] = ["classic", "third", "far"];
const CAM_KEY = "gnogolf.cam.session";
export function savedCam(): CamMode {
  try {
    localStorage.removeItem("gnogolf.cam"); // the lasting choice an older build kept
    const c = sessionStorage.getItem(CAM_KEY);
    return CAM_ORDER.find((m) => m === c) ?? "classic";
  } catch {
    return "classic";
  }
}
export function saveCam(m: CamMode) {
  try { sessionStorage.setItem(CAM_KEY, m); } catch {}
}

// the Builder's Inspector: its Details stay open until the player folds them, kept for the visit
const DETAILS_KEY = "gnogolf.builder.details";
export function detailsOpen() {
  try {
    return sessionStorage.getItem(DETAILS_KEY) !== "shut";
  } catch {
    return true;
  }
}
export function saveDetailsOpen(open: boolean) {
  try { sessionStorage.setItem(DETAILS_KEY, open ? "open" : "shut"); } catch {}
}

const GNOME_KEY = "gnogolf.gnome";
/** Whether this player ever picked a gnome. */
export function hadGnome() {
  try {
    return !!localStorage.getItem(GNOME_KEY);
  } catch {
    return false;
  }
}

/** The gnome this player picked, if it is still theirs to play; the first one otherwise. */
export function savedGnome() {
  try {
    const id = localStorage.getItem(GNOME_KEY);
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || (gn.unlock && !earned().includes(gn.id))) return GNOMES[0].id;
    return gn.id;
  } catch {
    return GNOMES[0].id;
  }
}
export function saveGnome(id: string) {
  try { localStorage.setItem(GNOME_KEY, id); } catch {}
}

/** The gnome a shared link asks for (?gnome=), and whether this player has it. */
export function linkedGnome() {
  const want = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("gnome");
  const gn = want ? GNOMES.find((x) => x.id === want) : undefined;
  return gn && { id: gn.id, name: gn.name, open: !gn.unlock || earned().includes(gn.id) };
}
/** The locked gnome a shared link asked for, said once: null when there is none. */
export function lockedNote() {
  const gn = linkedGnome();
  if (!gn || gn.open) return null;
  const mine = gnomeById(savedGnome());
  return `${gn.name.replace(/^The /, "")} is locked — playing as ${mine.name.replace(/^The /, "")}`;
}

// A list of ids this browser keeps for good. Read back as strings only: a hand edit must not blank the page.
function kept(key: string): string[] {
  try {
    const e: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(e) ? e.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function keep(key: string, ids: readonly string[]) {
  try {
    const e = kept(key), add = ids.filter((id) => !e.includes(id));
    if (add.length) localStorage.setItem(key, JSON.stringify([...e, ...add]));
  } catch {}
}

/** The gnomes earned in this browser. */
export const earned = () => kept("gnogolf.earned");
/** A gnome earned, kept for good. */
export const remember = (id: string) => keep("gnogolf.earned", [id]);
/** The badges earned in this browser. */
export const badgesEarned = () => kept("gnogolf.badges");
/** Keeps new badges for good, and the hole each was earned on. Returns the new ones. */
export const rememberBadges = (ids: readonly string[], at: string) => {
  const had = badgesEarned(), add = ids.filter((id) => !had.includes(id));
  if (!add.length) return add;
  keep("gnogolf.badges", add);
  try {
    if (at) localStorage.setItem(AT_KEY, JSON.stringify({ ...badgesAt(), ...Object.fromEntries(add.map((id) => [id, at])) }));
  } catch {}
  return add;
};
const AT_KEY = "gnogolf.badges.at";
/** Where each badge was earned: its hole's id. */
export function badgesAt(): Record<string, string> {
  try {
    const e: unknown = JSON.parse(localStorage.getItem(AT_KEY) || "{}");
    return e && typeof e === "object" && !Array.isArray(e) ? Object.fromEntries(Object.entries(e).filter((x): x is [string, string] => typeof x[1] === "string")) : {};
  } catch {
    return {};
  }
}
/** The mines' holes whose signature was said on a first visit, by slot. */
export const minesHinted = () => kept("gnogolf.hint.mines");
export const minesHintSaid = (slot: string) => keep("gnogolf.hint.mines", [slot]);
/** The weathers a hole was finished in, "" the calm one. */
export const weathersSeen = () => kept("gnogolf.weathers");
export const seeWeather = (kind: string) => keep("gnogolf.weathers", [kind]);
/** A new game: the badges, where they were earned and the weathers go with the scorecard. The gnomes stay. */
export function forgetBadges() {
  try {
    for (const k of ["gnogolf.badges", AT_KEY, "gnogolf.weathers"]) localStorage.removeItem(k);
  } catch {}
}

declare global {
  interface Navigator {
    // the Network Information API, Chromium only: not in the DOM types
    connection?: { saveData?: boolean; effectiveType?: string };
  }
}
/** A data saver or a slow link, as the browser says it (one that says nothing: neither): nothing is fetched ahead of its screen. */
export function leanLink() {
  try {
    const c = navigator.connection;
    return !!c && (!!c.saveData || /2g/.test(c.effectiveType || ""));
  } catch {
    return true;
  }
}
/** Stills and no clips on the cup cards: reduced motion, a data saver, a slow link or the Low graphics tier. */
export const stillsOnly = () => reducedMotion() || leanLink() || lowGfx(true); // (storage blocked: stills, as with the rest unknown)
