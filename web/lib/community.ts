// The game's gate on community holes. Anyone can publish one with gnokey, past the Builder: the chain checks the format,
// not how a hole plays. So the game shows one only once the Builder's rules pass it and its author holds a best on it.
import { isVersion, whichOf, type Chain, type Which } from "./chain";
import { authorOf, knownAuthor } from "./builder/holes";
import { inTurn } from "./duel";
import { bytesOf, sha256, sha256Bytes } from "./sha";
import { takenDown } from "./takedown";
import type { DayRow, HoleRow } from "./types";
import type { Verdict } from "./builder/verdict";
import type { Level } from "./builder/levels";
import type { BuilderHost } from "./builder/wasm";
import type { ValidateOptions } from "./builder/pipeline";

export type { Verdict };

/** The rules' version the kept verdicts were judged under: raise it with any change to the Builder's rules. */
export const VERDICT_RULES = 2;
/** Where a verdict is kept: this, the rules' version, then the data's sha, or the chain's realm and the version's id. */
export const VERDICT_KEY = "gnogolf.verdict";
/** What the game says of a community hole it will not show. */
export const NOT_BUILDER = "This hole was not made with the Builder rules.";
/** What the game says of a community hole its author has not holed yet. */
export const NOT_HOLED = "This hole opens once its maker has holed it.";
/** The two modes a best is kept in. */
export const MODES = ["assisted", "pro"] as const;

// a store that throws reads as empty and keeps nothing
const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {}
};
/** The UTC day of a time (ms): "2026-10-22". */
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** What judging reads of a chain: a hole's data, its author's best, and which chain's realm it is. */
export type Judging = Pick<Chain, "holeData" | "bests"> & Which;

/** What judging needs: builder.wasm's host and the render census. */
export interface JudgeDeps {
  load: () => Promise<{ host: BuilderHost; census: NonNullable<ValidateOptions["census"]> }>;
}
const builder: JudgeDeps = {
  load: () => Promise.all([import("./builder/load"), import("./builder/drawn")]).then(([l, d]) => l.loadBuilder().then((host) => ({ host, census: d.census }))),
};

const keyOf = async (hex: string) => `${VERDICT_KEY}|${VERDICT_RULES}|${await sha256(bytesOf(hex))}`;
/** A version's key on its chain's realm: its data never changes. null for an alias. */
const idKeyOf = async (chain: Judging, id: string) => (isVersion(id) ? `${VERDICT_KEY}|${VERDICT_RULES}|${await whichOf(chain)}|${id}` : null);
const kept = (key: string): Verdict | null => {
  const v = stored(key);
  return v == null ? null : v === "" ? { ok: true } : { ok: false, why: v };
};
const keep = (key: string, v: Verdict) => store(key, v.ok ? "" : v.why);

/** The Builder's verdict on a community hole's version, judged at most once a browser. Throws, nothing kept, if its data or the rules cannot be read now. */
export async function verdictOf(chain: Judging, id: string, deps: JudgeDeps = builder): Promise<Verdict> {
  const idKey = await idKeyOf(chain, id), known = idKey && kept(idKey);
  if (known) return known;
  const hex = await chain.holeData(id);
  const key = await keyOf(hex);
  let v = kept(key);
  if (!v) {
    const [{ judge }, { host, census }] = await Promise.all([import("./builder/verdict"), deps.load()]);
    v = await judge(hex, host, census);
  }
  for (const k of [key, idKey]) if (k) keep(k, v);
  return v;
}

/** Where it is kept that a version's author holds a best on it, and that a version or an alias was published from this browser: this, the chain's realm, the id. */
export const HOLED_KEY = "gnogolf.holed", OWN_KEY = "gnogolf.own";
// a hole's best by its version only; this browser's own also by its alias, which its link names
const flag = async (chain: Which, key: string, id: string) => (isVersion(id) || key === OWN_KEY ? `${key}|${await whichOf(chain)}|${id}` : null);
const flagged = async (chain: Which, key: string, id: string) => {
  const k = await flag(chain, key, id);
  return !!k && stored(k) === "1";
};
const setFlag = async (chain: Which, key: string, id: string) => {
  const k = await flag(chain, key, id);
  if (k) store(k, "1");
};
/** Marks a hole as published from this browser, so its author plays it here before they hold a best. landed: the chain was seen naming it, so its alias is marked too. Only for a transaction sent. */
export const keepOwn = (chain: Which, id: string, landed = false) =>
  Promise.all([setFlag(chain, OWN_KEY, id), landed ? setFlag(chain, OWN_KEY, aliasOf({ id, slot: "" })) : null]).then(() => {});

/** Whether a community hole's author holds a best on it, in either mode. Kept once they do; throws if it cannot be read now. */
export async function authorHoled(chain: Pick<Chain, "bests"> & Which, id: string): Promise<boolean> {
  const author = authorOf(id);
  if (!author || (await flagged(chain, HOLED_KEY, id))) return true;
  const rows = await Promise.all(MODES.map((m) => chain.bests(id, m, [author])));
  if (!rows.some((b) => b.rows.length)) return false;
  await setFlag(chain, HOLED_KEY, id);
  return true;
}

/** Whether a community hole is open to this player: its author holds a best on it, or it is theirs. self: the account connected, else the address this browser knows. Throws if the best cannot be read now. */
export async function heldFor(chain: Pick<Chain, "bests"> & Which, id: string, self?: string | null): Promise<boolean> {
  const author = authorOf(id);
  if (!author || (self ?? knownAuthor()) === author || (await flagged(chain, OWN_KEY, id))) return true;
  return authorHoled(chain, id);
}

/** The community holes of a chain's list, none taken down. None while the takedown list is unknown (null). */
export const communityOf = (list: readonly HoleRow[], taken: ReadonlySet<string> | null): HoleRow[] =>
  taken ? list.filter((h) => !h.next && h.official === false && !takenDown(taken, h.id)) : [];

/** Why the game will not play a hole: "" it plays, "unchecked" the Builder's rules refuse it, "unheld" its author holds no best on it yet. */
export type Gate = "" | "unchecked" | "unheld";
/** A hole's gate. A course hole always plays. Rejects when the rules or the best cannot be read now. */
export async function gateOf(chain: Judging, id: string, deps: JudgeDeps = builder, self?: string | null): Promise<Gate> {
  if (!authorOf(id)) return "";
  const [v, held] = await Promise.all([verdictOf(chain, id, deps), heldFor(chain, id, self)]);
  return !v.ok ? "unchecked" : held ? "" : "unheld";
}

/** The verdict this browser already has for a version, null if none. Never a judging: the phone's /build loads no builder.wasm. */
export async function knownVerdict(chain: Judging, id: string): Promise<Verdict | null> {
  try {
    const idKey = await idKeyOf(chain, id);
    return (idKey && kept(idKey)) || kept(await keyOf(await chain.holeData(id)));
  } catch {
    return null;
  }
}

/** The rows this browser already passed and that are open, in their order: a list that judges none. */
export async function knownOnly(chain: Judging, rows: readonly HoleRow[], self?: string | null): Promise<HoleRow[]> {
  const turn = inTurn(BESTS_AT_ONCE);
  const open = await Promise.all(rows.map((h) => turn(async () => (await knownVerdict(chain, h.id))?.ok === true && (await heldFor(chain, h.id, self).catch(() => false)))));
  return rows.filter((_, i) => open[i]);
}

/** How many authors' bests the phone's list asks the chain at once. */
export const BESTS_AT_ONCE = 4;

/** A list's verdicts by hole id, null for one not read now. */
export type Verdicts = ReadonlyMap<string, Verdict | null>;
/** Whether each hole of a list is open to the player, by id, null for one not read now. */
export type Helds = ReadonlyMap<string, boolean | null>;

/** The rows a list shows: those the Builder's rules passed and open to the player. */
export const shownOnly = (rows: readonly HoleRow[], verdicts: Verdicts, held: Helds) => rows.filter((h) => verdicts.get(h.id)?.ok === true && held.get(h.id) === true);

/** A list's first n rows: those shown, whether some are still being judged, whether some could not be read, how many rows lie beyond. */
export function pageOf(rows: readonly HoleRow[], n: number, verdicts: Verdicts, held: Helds) {
  const page = rows.slice(0, n), known = (h: HoleRow) => verdicts.has(h.id) && (verdicts.get(h.id)?.ok !== true || held.has(h.id));
  return { rows: shownOnly(page, verdicts, held), judging: !page.every(known), unread: page.some((h) => verdicts.get(h.id) === null || (verdicts.get(h.id)?.ok && held.get(h.id) === null)), more: rows.length - page.length };
}

/** How many holes the day's pick judges, at most, for one the Builder's rules pass. */
export const DAY_TRIES = 8;

/** A listed hole's alias: its slot, or its version id less "/v<n>". */
export function aliasOf(h: Pick<HoleRow, "id" | "slot">) {
  return h.slot || h.id.replace(/\/v\d+$/, "");
}

// the characters of an address after its "g1" (bech32's), in their byte order
const BECH32 = "023456789acdefghjklmnpqrstuvwxyz";
/** Where in alias order the UTC day's pick starts: the day's sha-256 spelled as an address, so any author's alias is as likely to follow it. */
export function dayPoint(now: number): string {
  const h = sha256Bytes(new TextEncoder().encode(utcDay(now)));
  return "g1" + Array.from(h.subarray(0, 13), (b) => BECH32[b & 31]).join("");
}

/** How many candidates one DayCandidates read takes. */
const DAY_PAGE = 25;

/** The hole of the day's candidates, a page at a time: every community hole from the day's point on and round to it, each once, none taken down. The holes published before the day keep their order from the point: the day's hole is the same for everyone, no server. A page not read throws. */
export async function* dayRows(chain: Pick<Chain, "dayCandidates">, now: number, taken: ReadonlySet<string>, n = DAY_PAGE): AsyncGenerator<DayRow[]> {
  const at = dayPoint(now);
  // from the point to the end, then from the start up to it
  for (const [from, upTo] of [[at, null], ["", at]] as const) {
    let after: string = from;
    do {
      const p = await chain.dayCandidates(after, n);
      const rows = p.rows.filter((h) => (upTo === null || aliasOf(h) < upTo) && !takenDown(taken, h.id));
      if (rows.length) yield rows;
      after = p.next;
    } while (after && (upTo === null || after < upTo));
  }
}

/** The UTC day's first moment (ms). */
export const dayStart = (now: number) => now - (now % 864e5);

/** The most candidates the day's pick passes over for want of their author's best before the day began. */
export const DAY_SKIPS = 4 * DAY_TRIES;

/** What the day's pick waits on: a candidate's alias birth, its author's best before the day, the rules' verdict. */
export type DayNeed = { what: "born" | "held" | "verdict"; h: Pick<HoleRow, "id" | "slot"> };

/** The day's hole among its candidates: the first whose alias was published and whose author held a best before the day began, and that the rules pass. Null with need while one before it is not known yet, or with unread when one could not be read: never skipped, so never another hole than everyone else's. */
export function dayHole<H extends Pick<HoleRow, "id" | "slot">>(candidates: readonly H[], born: ReadonlyMap<string, boolean | null>, verdicts: Verdicts, held: Helds = new Map()): { day: H | null; unread: boolean; need?: DayNeed; done?: boolean } {
  let tried = 0, skipped = 0;
  for (const h of candidates) {
    const b = born.get(aliasOf(h));
    if (b === false) continue;
    if (b !== true) return { day: null, unread: b === null, ...(b === undefined && { need: { what: "born" as const, h } }) };
    const before = held.get(h.id);
    if (before !== true && before !== false) return { day: null, unread: before === null, ...(before === undefined && { need: { what: "held" as const, h } }) };
    if (!before) {
      if (++skipped >= DAY_SKIPS) return { day: null, unread: false, done: true };
      continue;
    }
    const v = verdicts.get(h.id);
    if (!v) return { day: null, unread: v === null, ...(v === undefined && { need: { what: "verdict" as const, h } }) };
    if (v.ok) return { day: h, unread: false };
    if (++tried >= DAY_TRIES) return { day: null, unread: false, done: true };
  }
  return { day: null, unread: false };
}

/** Where this browser keeps the day's pick: this, the rules' version, the chain's realm, the UTC day. */
export const DAY_KEY = "gnogolf.day";
const dayKeyOf = async (chain: Which, now: number) => `${DAY_KEY}|${VERDICT_RULES}|${await whichOf(chain)}|${utcDay(now)}`;
/** The day's pick this browser kept, null for none or one not of a community hole's shape. */
export async function keptDay(chain: Which, now: number): Promise<DayRow | null> {
  try {
    const r = JSON.parse(stored(await dayKeyOf(chain, now)) ?? "null") as DayRow | null;
    return r && typeof r === "object" && isVersion(r.id) && authorOf(r.id) && typeof r.slot === "string" && typeof r.name === "string" && typeof r.world === "string" && Number.isFinite(r.par) ? r : null;
  } catch {
    return null;
  }
}
/** Keeps the day's pick in this browser for the UTC day: a best bettered today reads as today's, and the pick must not change under a player. */
export const keepDay = async (chain: Which, now: number, row: DayRow) => store(await dayKeyOf(chain, now), JSON.stringify(row));

/** Whether a community hole's author held a best on it before a time (ms), by their best's block time. A best set or bettered since is not. Throws if it cannot be read now. */
export async function heldBefore(chain: Pick<Chain, "ghost" | "blockTime"> & Which, id: string, at: number): Promise<boolean> {
  const author = authorOf(id);
  if (!author) return true;
  const ghosts = await Promise.all(MODES.map((m) => chain.ghost(id, m, author)));
  if (ghosts.some((g) => g)) await setFlag(chain, HOLED_KEY, id);
  for (const g of ghosts) if (g?.height != null && (await chain.blockTime(g.height)) < at) return true;
  return false;
}

/** Where the time an alias was first published is kept (ms): this, the chain's realm, the alias. */
export const BORN_KEY = "gnogolf.born";
/** Whether a candidate's alias was first published before a time, by its block's time, kept once known. born 0: long before. Throws if it cannot be read now. */
export async function bornBefore(chain: Pick<Chain, "blockTime"> & Which, h: DayRow, at: number): Promise<boolean> {
  if (!h.born) return true;
  const key = `${BORN_KEY}|${await whichOf(chain)}|${aliasOf(h)}`, was = Number(stored(key) ?? NaN);
  const ms = Number.isFinite(was) ? was : await chain.blockTime(h.born);
  if (!Number.isFinite(was)) store(key, String(ms));
  return ms < at;
}

/** How the community holes are listed: newest first as the chain lists them, by plays, or by the meter's level. */
export type SortBy = "new" | "played" | "hard";
/** The rows in that order, a copy: a tie stays in the chain's order, a hole not rated yet goes last. */
export function sortHoles(rows: readonly HoleRow[], by: SortBy, levels: ReadonlyMap<string, number | null>): HoleRow[] {
  const key = (h: HoleRow) => (by === "played" ? h.plays : by === "hard" ? (levels.get(h.id) ?? -1) : 0);
  return rows.map((h, i) => ({ h, i })).sort((x, y) => key(y.h) - key(x.h) || x.i - y.i).map(({ h }) => h);
}
/** The community's holes, those their author has holed first, each group in its own order. */
export const authorFirst = <H extends { id: string }>(list: readonly H[], holed: ReadonlyMap<string, boolean>) =>
  [...list.filter((h) => holed.get(h.id) === true), ...list.filter((h) => holed.get(h.id) !== true)];
/** A community hole's mark: whether its author has holed it, nothing until the chain has said. */
export const authorMark = (holed: boolean | undefined) => (holed === undefined ? "" : holed ? "Holed by its author" : "Not yet holed by its author");

/** Where a hole's level on the meter is kept: this, the chain's realm, its version's id. */
export const HARD_KEY = "gnogolf.hardness";
const hardKeyOf = async (chain: Which, id: string) => (isVersion(id) ? `${HARD_KEY}|${await whichOf(chain)}|${id}` : null);
/** The level kept for a version on its chain, null if none. */
export async function keptLevel(chain: Which, id: string): Promise<Level | null> {
  try {
    const key = await hardKeyOf(chain, id), v = key && stored(key);
    return v === "0" || v === "1" || v === "2" || v === "3" ? (Number(v) as Level) : null;
  } catch {
    return null;
  }
}
/** Keeps a version's level on its chain, never an alias's. */
export async function keepLevel(chain: Which, id: string, level: Level): Promise<void> {
  try {
    const key = await hardKeyOf(chain, id);
    if (key) store(key, String(level));
  } catch {}
}
