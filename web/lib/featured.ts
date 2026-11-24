// The records a board puts forward: a few worth beating today, each for a reason said on its card.
// One card a player, never you, never the first three. Drawn again each day: a board's champion is not its face.
import { standingVs, type SkyKind } from "./card";

/** What a card says of its player, and why it is there. */
export type Tag = "reach" | "next" | "start" | "ace" | "sky" | "fresh" | "rising" | "sharp" | "day" | "more";
export interface Pick<R> { row: R; tag: Tag; sky?: SkyKind }

/** The day as a number: the picks hold for it. */
export const today = (now = Date.now()) => Math.floor(now / 864e5);
/** A player's draw for a day: the same all day, another the next. The gnoweb hub's featured.gno draws the same. */
export const draw = (player: string, day: number) => {
  let h = 2166136261 ^ day;
  for (let i = 0; i < player.length; i++) h = Math.imul(h ^ player.charCodeAt(i), 16777619);
  return h >>> 0;
};
const drawn = <R extends { player: string }>(rows: readonly R[], day: number) => (rows.length ? rows.reduce((a, b) => (draw(b.player, day) < draw(a.player, day) ? b : a)) : undefined);

// the board's first places get no card of their own, but the place above yours
const PODIUM = 3;
/** Picks, in order, from candidates: a tag and the rows that could carry it. One card a player, n at most, never me. Today's pick fills the rest. */
function choose<R extends { player: string; at: number }>(cands: readonly [Tag, readonly R[], ((r: R) => SkyKind | undefined)?][], me: string | null | undefined, day: number, n: number) {
  const out: Pick<R>[] = [], used = new Set<string>(me ? [me] : []);
  for (const [tag, rows, sky] of cands)
    // today's pick fills the cards the others left: as many as it takes
    for (let again = true; again && out.length < n; again = tag === "day") {
      const r = drawn(rows.filter((x) => !used.has(x.player) && (tag === "reach" || tag === "next" || x.at > PODIUM)), day);
      if (!r) break;
      used.add(r.player);
      out.push(sky ? { row: r, tag, sky: sky(r) } : { row: r, tag: tag === "day" && out.some((p) => p.tag === "day") ? "more" : tag });
    }
  return out;
}

/** The skies a record is worth more in. Not fog: it only hides the view. */
export const HARD_SKIES: readonly SkyKind[] = ["storm", "snow", "rain", "wind"];

/** A hole's board's picks. rows: in the board's order with their places, the flagged out. info: a record's block and sky. mine: your best here, null if none. */
export function holePicks<R extends { player: string; strokes: number; at: number }>(rows: readonly R[], info: ReadonlyMap<string, { height: number; sky?: SkyKind }>, me: string | null | undefined, mine: number | null, day = today(), n = 3) {
  const others = rows.filter((r) => r.player !== me);
  // the next step up from your best: one stroke fewer, else the closest under it
  const under = mine ? others.filter((r) => r.strokes < mine) : [];
  const step = under.length ? Math.max(...under.map((r) => r.strokes)) : 0;
  // no best of yours here yet: a first target, the board's middle
  const mid = mine == null && others.length ? others[Math.floor(others.length / 2)] : undefined;
  // The best in each hard sky, the first of its sky in board order. One of the first places or yours gets no card.
  const bestInSky = HARD_SKIES.flatMap((k) => rows.find((r) => info.get(r.player)?.sky === k) ?? []).filter((r) => r.player !== me);
  const fresh = Math.max(0, ...others.map((r) => info.get(r.player)?.height ?? 0));
  return choose<R>([
    ["reach", under.filter((r) => r.strokes === step)],
    ["start", mid ? [mid] : []],
    ["ace", others.filter((r) => r.strokes === 1)],
    ["sky", bestInSky, (r) => info.get(r.player)?.sky],
    ["fresh", fresh ? others.filter((r) => info.get(r.player)?.height === fresh) : []],
    ["day", others],
  ], me, day, n);
}

/** The course board's picks. rows: in its order with their places, the flagged out. holes: the course's. mine: your row, null if not on it. above: the row just above yours, if read. */
export function coursePicks<R extends { player: string; holes?: number; strokes: number; par?: number; at: number }>(rows: readonly R[], holes: number, me: string | null | undefined, mine: { holes?: number } | null, above: R | null, day = today(), n = 3) {
  const others = rows.filter((r) => r.player !== me);
  const holesOf = (r: { holes?: number }) => r.holes || 0, perHole = (r: R) => standingVs(r) / holesOf(r);
  // rising: a third of the course or less, at par or better on it
  const rising = others.filter((r) => holesOf(r) > 0 && holesOf(r) <= Math.max(1, Math.floor(holes / 3)) && perHole(r) <= 0);
  // the sharpest: the best against par a hole over a third of the course, nine holes at least
  const many = others.filter((r) => holesOf(r) >= Math.max(9, Math.floor(holes / 3))), best = many.length ? Math.min(...many.map(perHole)) : 0;
  // the place above yours: within reach on as many holes as yours, else the next one up
  const reach = !!above && !!mine && holesOf(above) === holesOf(mine);
  return choose<R>([
    [reach ? "reach" : "next", above ? [above] : []],
    ["rising", rising],
    ["sharp", many.filter((r) => perHole(r) === best)],
    ["day", others],
  ], me, day, n);
}

/** A tag in words, a dozen letters at most: a phone's card is narrow. */
export function tagWord(p: { tag: Tag; sky?: SkyKind }) {
  switch (p.tag) {
    case "reach": return "Within reach";
    case "next": return "One place up";
    case "start": return "First target";
    case "ace": return "Hole in one";
    case "sky": return p.sky === "storm" ? "Storm master" : p.sky === "snow" ? "Snow master" : p.sky === "rain" ? "Rain master" : "Wind master";
    case "fresh": return "Latest";
    case "rising": return "Fast start";
    case "sharp": return "Best average";
    case "day": return "Today's pick";
    case "more": return "Also today";
  }
}

/** What a save does on its hole's board, said on the save button: the players it passes, the best in its weather, a new best, else a first record; then the place after. */
export const saveLine = (g: { pass: readonly string[]; best: boolean; sky: SkyKind }, at: number) =>
  `${g.pass.length ? `Pass ${g.pass[0]}${g.pass.length > 1 ? ` +${g.pass.length - 1}` : ""}` : g.sky ? `${tagWord({ tag: "sky", sky: g.sky })} here` : g.best ? "Your new best" : "Your first record"} · #${at}`;
