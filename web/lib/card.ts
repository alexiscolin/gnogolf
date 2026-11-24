// The scorecard: the latest round's score on each hole, kept in this browser. The chain keeps the best.
import type { HoleRow } from "./types";
import type { ChainBest } from "./chain";
import { skyOf } from "./sky";
import { counted, holesWord } from "./words";

/** A hole as the card reads it: a row of Holes(), or as much of one as is known. */
type CardHole = Pick<HoleRow, "id"> & Partial<Pick<HoleRow, "slot" | "par" | "world">>;
/** The scorecard: a best per cardKey. */
export type Card = Record<string, number>;

/** A hole's par as the chain says it. One that does not say is a par 3. */
export const parOf = (h: Partial<Pick<HoleRow, "par">> | null | undefined) => (h && h.par) || 3;
/** The par of the hole being played. */
export const parHere = (s: { id: string | null; holes: readonly HoleRow[]; allHoles?: readonly HoleRow[] }) => parOf(s.holes.find((h) => h.id === s.id) || (s.allHoles || []).find((h) => h.id === s.id));

const KEY = "gnogolf.card";
const VKEY = "gnogolf.card.v"; // 2: keyed by slot
const save = (card: Card) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
    localStorage.setItem(VKEY, "2");
  } catch {}
  return card;
};
/** A hole's cup: its world, the garden when it says nothing. */
export const cupOf = (h: Partial<Pick<HoleRow, "world">>) => h.world || "garden";

// The garden's old realm under each slot. Every other cup's slot "<world>/<n>" was the realm "<world><n>".
const OLD_GARDEN: Record<string, string> = {
  "garden/1": "hole1", "garden/2": "hole2", "garden/3": "hole3", "garden/4": "hole4", "garden/5": "hole5",
  "garden/6": "hole6", "garden/7": "hole7", "garden/8": "hole8", "garden/9": "hole9", "garden/10": "hole11",
  "garden/11": "hole12", "garden/12": "hole13", "garden/13": "hole14", "garden/14": "hole15", "garden/15": "hole17",
  "garden/16": "hole18", "garden/17": "hole19", "garden/18": "hole20",
};
const OLD_REALM = "gno.land/r/gnogolf/";
const OLD_WORLDS: Record<string, number> = { island: 18, town: 18, mountain: 18 };

/** The realm a course slot's hole was before it became data ("garden/17" → "gno.land/r/gnogolf/hole19"), "" for a slot that had none. */
export function legacyOf(slot: string | null | undefined) {
  const m = /^([a-z]+)\/(\d+)$/.exec(slot || "");
  if (!m) return "";
  if (OLD_GARDEN[m[0]]) return OLD_REALM + OLD_GARDEN[m[0]];
  const n = Number(m[2]);
  return OLD_WORLDS[m[1]] && n >= 1 && n <= OLD_WORLDS[m[1]] ? OLD_REALM + m[1] + n : "";
}

// the old realm → its slot, for the migration and for old links
let slotOfOld: Record<string, string> | null = null;
/** The slot a course hole's old realm became ("gno.land/r/gnogolf/hole19" → "garden/17"), or "". */
export function oldToSlot(id: string) {
  if (!slotOfOld) {
    const map: Record<string, string> = (slotOfOld = {});
    for (const slot of Object.keys(OLD_GARDEN)) map[legacyOf(slot)] = slot;
    for (const [w, n] of Object.entries(OLD_WORLDS)) for (let i = 1; i <= n; i++) map[`${OLD_REALM}${w}${i}`] = `${w}/${i}`;
  }
  return slotOfOld[id] || "";
}

/** The key a hole's score is kept under: its slot, the same through every version, so a new version keeps the player's best. A realm hole's id otherwise. */
export const cardKey = (h: Pick<CardHole, "id" | "slot"> | null | undefined) => (h && (h.slot || h.id)) || "";
/** A player's best on a hole, from the card. */
export const scoreOf = (card: Card, h: Pick<CardHole, "id" | "slot">): number | undefined => card[cardKey(h)];

// The strokes a save put on the chain, per cardKey: a cell shows the seal while its score is that one.
const CHAIN_KEY = "gnogolf.onchain";
/** The scores saved on-chain, per cardKey. */
export function loadOnChain(): Card {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAIN_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? migrate(v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
/** A score saved on-chain, kept. Returns them all. */
export function markOnChain(key: string, strokes: number) {
  return keepOnChain({ ...loadOnChain(), [key]: strokes });
}
const keepOnChain = (all: Card) => {
  try { localStorage.setItem(CHAIN_KEY, JSON.stringify(all)); } catch {}
  return all;
};

/** Fills this card from a player's chain records saved after block since: a hole with no score here, or a better one played elsewhere. Also the badges and weathers they prove. all: the course's current holes. height: the next sync's since. */
export function fromChain(rows: readonly ChainBest[], all: readonly CardHole[], since = 0) {
  const card = loadCard(), onChain = loadOnChain(), best = new Map<string, ChainBest>(), badges: { id: string; at: string }[] = [], kinds = new Set<SkyKind>(), none = cupTotals({}, []);
  let height = 0;
  for (const r of rows) {
    height = Math.max(height, r.height);
    const key = cardKey(r);
    // this browser's own save: a New game or a cup's reset is not filled back
    if (r.height <= since || (since > 0 && onChain[key] === r.strokes)) continue;
    const kind = skyOf(r.id, r.world, r.period);
    kinds.add(kind);
    for (const id of [...badgesFor({ strokes: r.strokes, par: r.par, pro: r.mode === "pro", kind, timed: false, cups: none, weathers: [] }, []), ...(r.top ? ["first"] : [])]) badges.push({ id, at: r.id });
    if (!best.has(key) || r.strokes < best.get(key)!.strokes) best.set(key, r);
  }
  const filled = [...best].filter(([key, r]) => !card[key] || (r.strokes < card[key] && onChain[key] !== r.strokes)).map(([key, r]) => ((card[key] = onChain[key] = r.strokes), key));
  if (best.size) badges.push({ id: "chain", at: "" });
  if (filled.length) {
    for (const id of badgesFor({ strokes: 0, par: 0, pro: false, kind: "", timed: false, cups: cupTotals(card, all), weathers: [] }, [])) badges.push({ id, at: "" });
    save(card);
    keepOnChain(onChain);
  }
  return { card, onChain, filled, badges, kinds: [...kinds], height };
}

// How far this browser has taken in each address's records: the next sync takes only newer ones.
const SYNC_KEY = "gnogolf.synced";
const synced = (): Record<string, number> => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((x): x is [string, number] => Number.isSafeInteger(x[1]))) : {};
  } catch {
    return {};
  }
};
/** The block height up to which this browser has an address's records (0: none yet). */
export function syncedTo(addr: string) {
  const at = synced()[addr];
  if (at !== undefined) return at;
  try {
    // an address restored before the height was kept counts as all taken in
    const old: unknown = JSON.parse(localStorage.getItem("gnogolf.restored") || "[]");
    return Array.isArray(old) && old.includes(addr) ? Number.MAX_SAFE_INTEGER : 0;
  } catch {
    return 0;
  }
}
export function markSynced(addr: string, height: number) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ ...synced(), [addr]: height })); } catch {}
}

/** A card kept by realm id rewritten by slot, the lower score kept where two land on one slot. A key it cannot map stays. */
export function migrate(old: Record<string, unknown> | null | undefined) {
  const card: Card = {};
  for (const [k, v] of Object.entries(old || {})) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) continue;
    const key = oldToSlot(k) || k;
    if (!card[key] || v < card[key]) card[key] = v;
  }
  return card;
}

export function loadCard(): Card {
  try {
    const card = (JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, unknown> | null) || {};
    // a hand edit must not break a finish: only whole scores are read
    return localStorage.getItem(VKEY) === "2" ? Object.fromEntries(Object.entries(card).filter((x): x is [string, number] => Number.isInteger(x[1]) && Number(x[1]) >= 1)) : save(migrate(card));
  } catch {
    return {};
  }
}

/** The latest round on a hole replaces the one before, under its cardKey. Returns the card. */
export function recordScore(id: string, strokes: number | undefined) {
  const card = loadCard();
  // a score is a whole number of strokes; anything else is a bug upstream, not a score
  if (!id || strokes === undefined || !Number.isInteger(strokes) || strokes < 1) return (console.warn("gnogolf: no score recorded for", id, strokes), card);
  card[id] = strokes;
  return save(card);
}

/** A new game: the card starts empty. Gnomes earned and the chain's records stay. */
export function clearCard(): Card {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return {};
}

/** Clears one cup's holes, by cardKey, from the card. Returns the card. */
export function clearCup(ids: Iterable<string>) {
  const card = loadCard();
  for (const id of ids) delete card[id];
  return save(card);
}

export function totals(card: Card, holes: readonly CardHole[]) {
  let done = 0, strokes = 0, par = 0, aces = 0, under = 0;
  for (const h of holes) {
    const sc = scoreOf(card, h);
    if (!sc) continue;
    done++;
    strokes += sc;
    par += parOf(h);
    if (sc === 1) aces++;
    if (sc < parOf(h)) under++;
  }
  return { done, strokes, par, aces, under, all: holes.length > 0 && done === holes.length };
}

/** The cups a player can win, in order. A hole's cup is its world. */
export const CUPS = ["garden", "island", "town", "mountain", "mines"] as const;
export type Cup = (typeof CUPS)[number];
/** The four classic cups, the grand slam's: not the mines. */
export const CLASSIC = ["garden", "island", "town", "mountain"] as const satisfies readonly Cup[];
// The worlds as the game names them, alone and in a sentence: a world never goes by two names.
const WORLDS: Readonly<Record<string, readonly [name: string, said: string]>> = {
  garden: ["Garden", "the Garden"], island: ["Island", "the Island"], town: ["Mushroom Town", "Mushroom Town"], mountain: ["Mountain", "the Mountain"],
  mines: ["Crystal Mines", "the Crystal Mines"], volcano: ["Volcano", "the Volcano"], storm: ["Storm", "the Storm"],
};
/** A world's name: "Garden", "Mushroom Town". One the game has no name for: its id with a capital. */
export const worldName = (w: string) => (Object.hasOwn(WORLDS, w) ? WORLDS[w][0] : cap(w));
/** A world in a sentence: "the Garden", "Mushroom Town". */
export const theWorld = (w: string) => (Object.hasOwn(WORLDS, w) ? WORLDS[w][1] : `the ${cap(w)}`);
/** A cup's name: its world's, "Garden Cup". The town and the mines go by their own. */
export const CUP_NAMES = Object.fromEntries(CUPS.map((c) => [c, c === "town" || c === "mines" ? worldName(c) : `${worldName(c)} Cup`])) as Readonly<Record<Cup, string>>;
/** How the expert cup says what it asks. */
export const HARD = "a few minutes a hole";
/** The cup a link names ("?hole=town/3", "/h/mines-3/", "island7"), the garden when it names none. */
export const guessCup = (link: string): Cup => CUPS.find((c) => link.includes(c)) || "garden";

/** A score against par as the game prints it: E, +3, −2 with a real minus sign. */
export const vsPar = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : `−${-n}`);
/** A score against par in words: "level par", else vsPar's +3, −2. */
export const vsParWords = (n: number) => (n === 0 ? "level par" : vsPar(n));
/** A row's score against par. A hole's row has no par: its strokes. */
export const standingVs = (r: { strokes: number; par?: number }) => r.strokes - (r.par || 0);
/** The course ranking's rule, as its boards caption it. */
export const RANKED_BY = "most holes, then best score against par";
/** The course ranking's order, golf.gno's rankKey: most holes, then the best score against par. */
export const byStanding = (a: { holes?: number; strokes: number; par?: number }, z: { holes?: number; strokes: number; par?: number }) =>
  (z.holes || 0) - (a.holes || 0) || standingVs(a) - standingVs(z);
/** What the next stroke n is worth on a par, called out before it. Past bogey: how far over par the round already is. */
export const strokeFor = (n: number, par: number) =>
  n === 1 ? "For an ace!" : n <= par - 3 ? "For albatross!" : n === par - 2 ? "For eagle!" : n === par - 1 ? "For birdie!" : n === par ? "For par!" : n === par + 1 ? "For bogey" : `${n - 1 - par} over par`;

/** A score in golf's own words, from the strokes against par. */
export function golfTerm(strokes: number, par: number) {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  return d <= -3 ? "Albatross!" : d === -2 ? "Eagle!" : d === -1 ? "Birdie!" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Double bogey" : d === 3 ? "Triple bogey" : `${d} over par`;
}

/** A hole's number: its place in its cup's course as the chain orders it. "–" for a hole in no cup, never "1". */
export function holeNumber(holes: readonly Pick<HoleRow, "id">[], id: string | null) {
  const i = holes.findIndex((h) => h.id === id);
  return i >= 0 ? String(i + 1) : "–";
}

/** The cups that have holes on the chain, and their holes: the Crystal Mines count once published. */
export function courseCount(counts: Readonly<Record<string, number>>) {
  const cups = CUPS.filter((c) => (counts[c] || 0) > 0);
  return { cups: cups.length, holes: cups.reduce((n, c) => n + counts[c], 0) };
}
/** The cup after this one that has holes, "" after the last. */
export const nextCup = (cup: string, counts: Readonly<Record<string, number>>) =>
  CUPS.slice(CUPS.indexOf(cup as Cup) + 1).find((c) => (counts[c] || 0) > 0) || "";
/** The hole to play next: the first after this one not yet played, else the first not played at all. only: the holes that may come next, played ones too when none is left unplayed, never this one. */
export const nextHole = <H extends Pick<HoleRow, "id" | "slot">>(s: { holes: readonly H[]; id: string | null }, card: Card, only?: (h: H) => boolean) => {
  const at = s.holes.findIndex((h) => h.id === s.id), open = (h: H) => (!only || only(h)) && !scoreOf(card, h);
  return s.holes.find((h, i) => i > at && open(h)) || s.holes.find(open) || (only && (s.holes.find((h, i) => i > at && only(h)) || s.holes.find((h) => h.id !== s.id && only(h))));
};

/** A cup's totals. clean: finished at par or under. open: begun. */
export type CupTotal = ReturnType<typeof totals> & { clean: boolean; open: boolean };
/** Totals per cup, from every hole on the chain. */
export function cupTotals(card: Card, allHoles: readonly CardHole[]) {
  const cup = (c: Cup): CupTotal => {
    const t = totals(card, allHoles.filter((h) => cupOf(h) === c));
    return { ...t, clean: t.all && t.strokes <= t.par, open: t.done > 0 || t.all };
  };
  const out = Object.fromEntries(CUPS.map((c) => [c, cup(c)])) as Record<Cup, CupTotal>;
  // The grand slam: each of the four classic cups at par or under, as the realm mints the King. Not the mines: the King would move behind the expert cup.
  return { ...out, slam: CLASSIC.every((c) => out[c].clean), aces: CUPS.reduce((n, c) => n + out[c].aces, 0) };
}

/** A gnome to earn: the cup whose card earns it, what it takes, and whether cupTotals() has it. */
interface Unlock {
  cup?: Cup;
  /** earned by the cup at par or under, not by finishing it */
  par?: true;
  need: string;
  ok: (t: ReturnType<typeof cupTotals>) => boolean;
}
/** The gnomes a card earns, cup by cup. */
export const UNLOCKS = {
  wizard: { cup: "garden", need: "Finish the Garden Cup", ok: (t) => t.garden.all },
  viking: { cup: "garden", par: true, need: "Garden Cup at par or under", ok: (t) => t.garden.clean },
  golden: { need: "Five holes-in-one", ok: (t) => t.aces >= 5 },
  pirate: { cup: "island", need: "Finish the Island Cup", ok: (t) => t.island.all },
  diver: { cup: "island", par: true, need: "Island Cup at par or under", ok: (t) => t.island.clean },
  baker: { cup: "town", need: "Finish Mushroom Town", ok: (t) => t.town.all },
  mayor: { cup: "town", par: true, need: "Mushroom Town at par or under", ok: (t) => t.town.clean },
  king: { need: "The four cups at par or under", ok: (t) => t.slam },
  miner: { cup: "mines", need: "Finish the Crystal Mines", ok: (t) => t.mines.all },
} satisfies Record<string, Unlock>;
export type UnlockId = keyof typeof UNLOCKS;
/** "the" before a name in a sentence, never twice: "the Wizard gnome" from "The Wizard". */
export const theName = (name: string) => `the ${name.replace(/^the\s+/i, "")}`;
/** A text with its first letter up: "garden" → "Garden". */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** What a restore from the chain brought back, in one sentence. */
export function backFromChain({ holes, badges, gnomes }: { holes: number; badges: number; gnomes: readonly string[] }) {
  const what = [holes && holesWord(holes), badges && counted("badge")(badges), ...gnomes.map((g) => `${theName(g)} gnome`)].filter(Boolean);
  return `Back from the chain: ${what.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}

/** What a cup just finished says it earned: at par or under, its par gnome or its par badge; over par, a gnome when finishing is its only one. "" for nothing. */
export function cupFinishLine(cup: string, atPar: boolean) {
  const gnomes = Object.values<Unlock>(UNLOCKS).filter((u) => u.cup === cup), badge = BADGES.find((b) => b.cup === cup);
  if (atPar) return gnomes.some((u) => u.par) ? "Cup finished at par or under: a gnome is waiting in the picker." : badge ? `Cup finished at par or under: ${theName(badge.name)} badge is yours.` : "";
  return gnomes.length && !gnomes.some((u) => u.par) ? "Cup finished: a gnome is waiting in the picker." : "";
}

/** A course hole finished, as the badges read it. kind: the forecast's, "" calm. timed: moving pieces. cups: after it. weathers: every one a hole was finished in. */
export interface Finish {
  strokes: number;
  par: number;
  pro: boolean;
  kind: string;
  timed: boolean;
  cups: ReturnType<typeof cupTotals>;
  weathers: readonly string[];
  /** a duel's finish. theirs: the best raced. self: one's own. mixed: of the other aim mode. */
  duel?: { result: "win" | "loss" | "tie"; theirs: number; self: boolean; mixed: boolean } | null;
}
/** A badge. family: its medal's colour. ok: earned by a finish; none: given by a save. */
export interface Badge {
  id: string;
  name: string;
  need: string;
  family: "skill" | "weather" | "chain" | "fun";
  /** earned by that cup at par or under */
  cup?: Cup;
  ok?: (f: Finish) => boolean;
}
/** The six weathers as the chain names the forecast's kinds, "" the calm one. */
export const SKIES = ["", "wind", "fog", "rain", "storm", "snow"] as const;
export type SkyKind = (typeof SKIES)[number];
/** The badges, in the order they are said when several come at once: the rarest first. */
export const BADGES: readonly Badge[] = [
  { id: "first", name: "Number one", need: "Take first place on a hole's board", family: "chain" },
  { id: "perfect", name: "Perfect cup", need: "A whole cup, every hole under par", family: "skill", ok: (f) => CUPS.some((c) => f.cups[c].all && f.cups[c].under === f.cups[c].done) },
  // the expert cup's gnome goes with finishing it, this with par
  { id: "lode", name: "Mother Lode", need: "The Crystal Mines at par or under", family: "skill", cup: "mines", ok: (f) => f.cups.mines.clean },
  { id: "ace", name: "Hole in one", need: "Hole a ball in one stroke", family: "skill", ok: (f) => f.strokes === 1 },
  // another player's ghost at par or under, in the same aim mode: the cheap wins don't count
  { id: "ghost", name: "Ghost buster", need: "Beat another player's ghost at par or under", family: "skill", ok: (f) => !!f.duel && f.duel.result === "win" && !f.duel.self && !f.duel.mixed && f.duel.theirs <= f.par },
  { id: "weathers", name: "All weathers", need: "Finish a hole in all six weathers", family: "weather", ok: (f) => SKIES.every((k) => f.weathers.includes(k)) },
  { id: "eagle", name: "Eagle eye", need: "Two under par on a hole", family: "skill", ok: (f) => f.strokes <= f.par - 2 },
  { id: "pro", name: "Pro shot", need: "Under par with no aim line (Pro)", family: "skill", ok: (f) => f.pro && f.strokes < f.par },
  { id: "clock", name: "Clockwork", need: "Par or better on a hole with moving pieces", family: "skill", ok: (f) => f.timed && f.strokes <= f.par },
  { id: "storm", name: "Storm chaser", need: "Finish a hole in a storm", family: "weather", ok: (f) => f.kind === "storm" },
  { id: "snow", name: "Snow day", need: "Finish a hole in the snow", family: "weather", ok: (f) => f.kind === "snow" },
  { id: "fog", name: "Fog walker", need: "Par or better in the fog", family: "weather", ok: (f) => f.kind === "fog" && f.strokes <= f.par },
  { id: "chain", name: "On the chain", need: "Save a round on-chain", family: "chain" },
  { id: "snail", name: "Never give up", need: "Finish a hole in 15 strokes or more", family: "fun", ok: (f) => f.strokes >= 15 },
  // another player's ghost, in the same aim mode
  { id: "sport", name: "Good sport", need: "Finish a duel you lost to another player", family: "fun", ok: (f) => !!f.duel && f.duel.result === "loss" && !f.duel.self && !f.duel.mixed },
];
/** The badges a finish earns that are not earned yet, rarest first. */
export const badgesFor = (f: Finish, had: readonly string[]) => BADGES.filter((b) => b.ok && !had.includes(b.id) && b.ok(f)).map((b) => b.id);
/** Badge ids, rarest first. */
export const byRarity = (ids: readonly string[]) => BADGES.filter((b) => ids.includes(b.id)).map((b) => b.id);
