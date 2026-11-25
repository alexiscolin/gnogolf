"use client";

// The first choice, before the cups: play alone, race a player's ghost, or
// build a hole (the Builder: onBuild). A duel asks whom to race on a
// screen of its own (Rival), then on which of the holes they have a best on
// (Ghosts), in place of the cups. Panels of their own, a kart game's modes.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Emblem, WORLDS } from "@/components/Worlds";
import { MapSlot, NoMap, useHoleMaps } from "@/components/HoleMap";
import { Portrait } from "@/components/Stage";
import { NONE } from "@/components/hooks";
import { gnomeById, rivalSkin, type Skin } from "@/lib/scene/gnome";
import type { Snapshot } from "@/lib/engine";
import { FrontScreen } from "@/components/About";
import { Button, Dice, InfoTip } from "@/components/ui";
import { FullBoard, Sticker, rivalPicks, useRivalPicks, useWho, type Placed } from "@/components/Leaderboard";
import { countWord, ghostsWord, holesWord, plural } from "@/lib/words";
import { isAddress, type Chain } from "@/lib/chain";
import { CLASSIC, cupOf, parOf, scoreOf, vsPar, courseCount, golfTerm, holeNumber, standingVs, type Card } from "@/lib/card";
import { bestOf, inTurn, showcases, shotsOf, vsBest } from "@/lib/duel";
import { track, type RivalKind } from "@/lib/analytics";
import { motion } from "@/lib/scene/materials";
import { mapNow } from "@/lib/maps";
import { sound } from "@/lib/feel";
import type { HoleRow, Mode, Stroke, Vec2 } from "@/lib/types";
import { Collector } from "@/components/gnomes/Door";
import { MENU_HEAD } from "@/lib/menu";
import { Sketch } from "@/components/Sketch";

// onBuild: the Builder's page (none: it is to come); shop: a fourth panel, the gnome shop's: its gnome (one of the
// sale's, once read: null until then), its line and where it leads (the gallery)
export default function Modes({ gnome, counts = {}, onSolo, onDuel, onBuild, shop, onBack, onAbout }: { gnome: string; counts?: Readonly<Record<string, number>>; onSolo: () => void; onDuel: () => void; onBuild?: () => void; shop?: { skin: Skin | null; line: string; onOpen: () => void }; onBack: () => void; onAbout: () => void }) {
  const skin = gnomeById(gnome);
  const cups = courseCount(counts).cups || CLASSIC.length; // (the chain's, once it has answered)
  return (
    <FrontScreen className="modes" back={MENU_HEAD.back} onBack={onBack} onAbout={onAbout} eyebrow={MENU_HEAD.eyebrow} title={MENU_HEAD.title}>
      <ul className={`modes__list${shop ? " modes__list--four" : ""}`}>
        <li><Panel kind="solo" name="Solo" line={`${countWord(cups)} cups, your best on the boards`} skin={skin} onClick={onSolo} /></li>
        <li><Panel kind="duel" name="Duel" line="Race a player's ghost, stroke for stroke" skin={skin} onClick={onDuel} /></li>
        {/* the Builder: the game's Miner in his hard hat before a hole's sketch, once out; to come, the sketch alone */}
        <li><Panel kind="build" name="Builder" line={onBuild ? "Draw a hole, publish it under your name" : "Draw your own hole, dare the others"} skin={onBuild ? gnomeById("miner") : null} back={<Sketch />} soon={!onBuild} onClick={onBuild} /></li>
        {/* the gnome shop ("Shop": one line, as the games' names): one of the sale's gnomes before a stall's awning */}
        {shop && <li><Panel kind="shop" name="Shop" line={shop.line} skin={shop.skin} back={<Awning />} onClick={shop.onOpen} /></li>}
      </ul>
    </FrontScreen>
  );
}

/** A game's panel, as a kart game's modes are: its colour edge to edge, the
 *  gnome's picture (a duel's ghost beside him), its name inked big. One to
 *  come is drawn, dimmed, with its sticker. */
// skin: the gnome on the stage (null: none yet, the stage's back alone); back: what stands behind him in the disc
function Panel({ kind, name, line, skin, soon = false, back, onClick }: { kind: "solo" | "duel" | "build" | "shop"; name: string; line: string; skin: Skin | null; soon?: boolean; back?: ReactNode; onClick?: () => void }) {
  return (
    <button className={`mode mode--${kind}`} disabled={soon} aria-label={`${name}: ${line}${soon ? ". Coming soon" : ""}`}
      onClick={() => (sound("select"), onClick && onClick())}>
      <span className="mode__stage">{back}{skin && kind === "duel" && <Portrait skin="ghost" className="portrait--ghost" />}{skin && <Portrait skin={skin} />}</span>
      <span className="mode__name">{name}</span>
      <span className="mode__line">{line}</span>
      {soon && <span className="dare mode__soon">Coming soon</span>}
    </button>
  );
}
/** A pick under the pointer or the focus (its holes take turns then only): whether, and the handlers that say so. */
function useHot() {
  const [hot, setHot] = useState(false);
  return [hot, { onPointerEnter: () => setHot(true), onPointerLeave: () => setHot(false), onFocus: () => setHot(true), onBlur: () => setHot(false) }] as const;
}

const STRIPES = 8;
/** A market stall, inked, in the shop panel's colours (behind its gnome: what says "a shop"): its striped awning,
 *  every stripe and scallop painted, on two posts. */
const Awning = () => {
  const top = (k: number) => 14 + k * (92 / STRIPES), low = (k: number) => 4 + k * (112 / STRIPES); // (the awning widens downward)
  const w = 112 / STRIPES, scallop = (k: number) => `M${low(k)} 30a${w / 2} ${w / 2.2} 0 0 0 ${w} 0z`;
  return (
    <svg className="mode__awning" viewBox="0 0 120 70" aria-hidden="true">
      <path d="M14 30v38M106 30v38" className="mode__awning-post" />
      {Array.from({ length: STRIPES }, (_, k) => (
        <g key={k} className={k % 2 ? "mode__awning-paper" : "mode__awning-band"}>
          <path d={`M${top(k)} 8H${top(k + 1)}L${low(k + 1)} 30H${low(k)}z`} />
          <path d={scallop(k)} />
        </g>
      ))}
      <path d={`M14 8H106L116 30H4z${Array.from({ length: STRIPES }, (_, k) => scallop(k).replace(/z$/, "")).join("")}`} className="mode__awning-ink" />
    </svg>
  );
};

/**
 * A duel's rival, on a screen of their own: a friend's name or address typed
 * (the (i) says where to find one), three picked for the player (today's
 * rival, one at their level, yourself: their gnome, and their best
 * hole played back on its map), or anyone on the course's board, a sticker a
 * tap away (the whole board, the leaderboard's sheet: onBoard). Then their
 * ghosts' holes (Ghosts).
 */
// onConnect: Adena's own prompt (no transaction), for yourself's pick; none once connected
export function Rival({ s, chain, me, mode, gnome, onPick, onBoard, onConnect, onBack, onAbout }: { s: Snapshot; chain: Chain | null; me: string | null; mode: Mode; gnome: string; onPick: (addr: string, bests?: Bests, from?: RivalKind) => void; onBoard: () => void; onConnect?: () => void; onBack: () => void; onAbout: () => void }) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const holes = useMemo(() => ghostHoles(s.allHoles || []), [s.allHoles]);
  const picks = useRivalPicks(chain, me, mode);
  const asking = useRef(false); // (a Race pressed again while the chain answers the first: one at a time)
  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (asking.current) return;
    asking.current = true;
    try {
      const v = typed.trim();
      // (a chain that did not answer is not a name it does not know)
      const addr = isAddress(v) ? v : chain ? await chain.resolveName(v).catch(() => null) : "";
      if (addr === null) return setNote("The chain did not answer. Try again in a moment.");
      track("ui", { action: "rival_typed", found: !!addr });
      if (!addr) return setNote(`No gno.land name “${v}” here. Check the spelling, or pick someone below.`);
      // a duel is played where their ghost is: someone with no saved round has none (a failed read lets them through)
      // (their bests go with them: not read twice)
      const bests = chain && holes.length ? await chain.bestsOf(holes.map((h) => h.id), addr).catch(() => undefined) : undefined;
      if (bests && !bests.size) return setNote(`${v} has no saved round yet: no ghost to race. Pick someone below.`);
      onPick(addr, bests, "friend");
    } finally {
      asking.current = false;
    }
  };
  return (
    <FrontScreen className="front--fit modes" inner="rival" back="Back to the games" onBack={onBack} onAbout={onAbout} eyebrow="Choose your rival" title="Who do we race?">
      {/* someone you know, typed, first; then three picked for you; then the board's first players, on the picks' three columns */}
      <section className="rival__friend">
        <h3 className="h-section rival__h">Race a friend</h3>
        <InfoTip label="How do I get it?" note="Their gno.land name or address. Ask them for it, or for their dare link: it opens the duel straight away, nothing to type." />
        <form className="friends__add" onSubmit={(e) => void go(e)}>
          <input value={typed} onChange={(e) => (setTyped(e.target.value), setNote(""))} placeholder="A friend: nym-… or g1…" aria-label="Your friend's gno.land name or address" />
          <Button variant="gold" className="rival__go" type="submit" disabled={!typed.trim()}>Race</Button>
        </form>
        {note && <p className="note note--warn" role="alert">{note}</p>}
      </section>
      {picks && picks.retry && <p className="note note--bad" role="alert">The chain did not answer. <button className="linkish" onClick={picks.retry}>Try again</button></p>}
      <ul className="rival__picks">
        {PICKS.map((p, i) => (
          <li key={p.kind}><Pick {...p} first={i} row={picks && picks.rows[i]} reading={!picks} failed={!!(picks && picks.retry)} chain={chain} me={me} gnome={gnome} holes={holes} mode={mode} onPick={onPick} onConnect={p.kind === "self" ? onConnect : undefined} /></li>
        ))}
      </ul>
      {/* the board's first six as the cups' records are, stickers (no box that scrolls); the whole of it, the leaderboard's sheet (its rows, a Race each) */}
      {/* (a board with nobody keeps its blank stickers and says so: nothing moves once it is read) */}
      <section className="rival__board">
        <div className="rival__boardhead">
          <h3 className="h-section rival__h">Or anyone who played</h3>
          <span className="rival__links">
            {/* (there, not pressable, while the board is read or has nobody: the links beside it do not move) */}
            {(!picks || !picks.rows[0] || picks.surprise) && <button className="linkish rival__all rival__surprise" disabled={!picks?.surprise} onClick={() => picks?.surprise && (sound("select"), onPick(picks.surprise.player, undefined, "surprise"))}><Dice /> Surprise me</button>}
            <button className="linkish rival__all" onClick={() => (sound("blip"), onBoard())}>All players →</button>
          </span>
        </div>
        <FullBoard kind="course" s={s} chain={chain} me={me} mode={mode} max={6} onConnect={onConnect}
          row={(r) => <Sticker player={r.player} sub={`${holesWord(r.holes || 0)} · ${vsPar(standingVs(r))}`} chain={chain} me={me} gnome={gnome} onClick={() => onPick(r.player)} />} />
      </section>
    </FrontScreen>
  );
}

type Bests = ReadonlyMap<string, Readonly<Record<Mode, number>>>;
type Hole = { id: string; name: string; par: number };
/** The course's holes, where a ghost can be. */
const ghostHoles = (all: readonly HoleRow[]): Hole[] => all.filter((h) => h.official).map((h) => ({ id: h.id, name: h.name, par: parOf(h) }));
/** The rival's screen read ahead (from the menu): its picks, then their bests, so it opens with its gnomes and its holes' lanes. */
export const warmRival = (chain: Chain, me: string | null, mode: Mode, all: readonly HoleRow[]) =>
  void rivalPicks(chain, me, mode).then((p) => p.rows.forEach((r) => r && void showOf(chain, r.player, ghostHoles(all), mode).catch(() => {})), () => {});
const MAP_MS = 3200; // a map's drawing of the path, as its CSS animation (title.css map-ink): the next hole then
// each in a colour of the game's own: today's rival the sun's, your level the fairway's, yourself the mountain's
const PICKS = [
  { kind: "today", label: "Today's rival", tint: "mode--build" },
  { kind: "level", label: "Your level", tint: "mode--solo" },
  { kind: "self", label: "Yourself", tint: "tint--mountain" },
] as const;

/** A rival's best on a hole as their ghost's path (the strokes the duel replays, read the same way). */
type Path = { path: Vec2[]; strokes: number };
// read once a session a rival's hole (and mode), a few at a time (a screen of
// cards is dozens of calls); a read that failed is asked again next time
const paths = new Map<string, Promise<Path | null>>(), pathTurn = inTurn(3);
function pathOf(chain: Chain, player: string, id: string, mode: Mode, strokes: number) {
  const key = `${player}|${id}|${mode}|${strokes}`; // (a new best: its own path)
  let p = paths.get(key);
  if (p) return p;
  p = pathTurn(() => chain.ghost(id, mode, player).then(async (g) => {
    if (!g) return null;
    const shots = shotsOf(g);
    let at: Stroke = await chain.replayRound(g.hole, [shots[0]], g.period);
    const path = [...at.path];
    for (let n = 1; n < shots.length && !at.holed; n++) path.push(...(at = await chain.simulateFrom(g.hole, at.rest, shots[n], n, g.period)).path);
    return { path, strokes: g.strokes };
  }));
  paths.set(key, p);
  p.catch(() => paths.delete(key));
  return p;
}
/** Their path on a hole once read, null until then or without one (chain null: not asked yet). */
function usePath(chain: Chain | null, player: string, top: Pick<Top, "id" | "mode" | "strokes"> | null) {
  const [got, setGot] = useState<{ key: string; path: Path } | null>(null);
  const key = top ? `${player}|${top.id}|${top.mode}|${top.strokes}` : "";
  useEffect(() => {
    if (!chain || !top || !player) return;
    let live = true;
    pathOf(chain, player, top.id, top.mode, top.strokes).then((path) => live && path && setGot({ key, path }), () => {});
    return () => void (live = false);
  }, [chain, key]); // eslint-disable-line react-hooks/exhaustive-deps -- (top, player: by the key)
  return got && got.key === key ? got.path : null;
}

/** A rival's bests, and their finest holes to show off (three at most). */
type Top = Hole & { mode: Mode; strokes: number };
interface Show {
  bests: Bests;
  tops: Top[];
}
// read once a session a player (and mode); a read that failed is asked again next time
const shows = new Map<string, Promise<Show>>();
function showOf(chain: Chain, player: string, holes: readonly Hole[], mode: Mode) {
  const key = `${player}|${mode}`;
  let p = shows.get(key);
  if (p) return p;
  p = chain.bestsOf(holes.map((h) => h.id), player).then((bests) => ({ bests, tops: showcases(bests, holes, mode).map((t) => ({ ...t, name: holes.find((h) => h.id === t.id)!.name })) }));
  shows.set(key, p);
  p.catch(() => shows.delete(key));
  return p;
}
function useShow(chain: Chain | null, player: string, holes: readonly Hole[], mode: Mode) {
  const [show, setShow] = useState<Show | null>(null);
  useEffect(() => {
    setShow(null);
    if (!chain || !player || !holes.length) return;
    let live = true;
    showOf(chain, player, holes, mode).then((x) => live && setShow(x), () => {});
    return () => void (live = false);
  }, [chain, player, holes, mode]);
  return show;
}

/** A quick pick, a game's panel as the game's choice's: the rival's gnome (in
 *  the skin their ghost wears), their best hole played back on its map under
 *  the pointer or the focus; their name, and Race. Yourself: your gnome, big,
 *  and no map (a card of its own: nothing empty beside him). */
// failed: the board could not be read (not a board with nobody on it)
function Pick({ kind, label, tint, first, row, reading, failed, chain, me, gnome, holes, mode, onPick, onConnect }: (typeof PICKS)[number] & { first: number; row: Placed | null; reading: boolean; failed: boolean; chain: Chain | null; me: string | null; gnome: string; holes: readonly Hole[]; mode: Mode; onPick: (addr: string, bests?: Bests, from?: RivalKind) => void; onConnect?: () => void }) {
  const [hot, on] = useHot();
  const self = kind === "self", player = row ? row.player : "";
  const who = useWho(chain, player, me), show = useShow(chain, player, holes, mode);
  // their holes in turn under the pointer, one a drawing of the path (each tile from its own: two rarely open on one hole)
  const [turn, setTurn] = useState(first);
  useEffect(() => {
    if (!hot || !motion) return;
    const t = setInterval(() => setTurn((n) => n + 1), MAP_MS);
    return () => clearInterval(t);
  }, [hot]);
  const top = show && show.tops.length ? show.tops[turn % show.tops.length] : null, mapped = self ? null : top;
  // the hole's lanes at once (the site's own map of it), their path over them once the chain has replayed it
  const lane = useHoleMaps(chain, mapped ? [mapped.id] : NONE).get(mapped ? mapped.id : ""), path = usePath(chain, player, mapped);
  const best = top && `${top.strokes === 1 ? "Ace" : golfTerm(top.strokes, top.par).replace(/!$/, "")} on ${top.name}`;
  // yourself: not connected, or no ghost of yours yet (a round to save first)
  const none = self && (!me || (!!show && show.bests.size === 0)), open = !!row && !none;
  const connect = self && !me && onConnect; // (a tap connects: then it is yours)
  // (each part whole: the narrow line breaks only at a " · ", never inside "18 ghosts")
  const line = self && !me ? (onConnect ? "Beat your own best" : "Connect Adena to race it") : none ? "Save a round first" : row ? [holesWord(row.holes || 0), !!row.holes && vsPar(standingVs(row)), show && ghostsWord(show.bests.size)].filter(Boolean).map((p) => String(p).replace(/ /g, "\u00a0")).join(" · ") : "";
  // what the chain still owes this card: the board's row, then their bests, then the hole's lanes
  const coming = reading || (open && (!show || (!!mapped && !lane)));
  return (
    <button className={`mode rival__pick${self ? " rival__pick--self" : ""} ${tint}`} data-kind={connect ? "self_connect" : kind} disabled={!open && !connect} aria-label={connect ? `${label}: connect Adena to race your own ghost` : open ? `${label}: ${who.label}, ${line}${best ? `, ${best}` : ""}. ${self ? "Race your best" : "Race their ghost"}` : `${label}: ${reading ? "reading the board" : failed ? "the board could not be read" : line || "nobody yet"}`} {...on}
      onClick={() => (connect ? (sound("select"), connect()) : open && row && onPick(row.player, show ? show.bests : undefined, kind))}>
      <span className="tag rival__tag">
        {self
          ? <span className="podium__medal rival__you"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20v-8a6 6 0 0 1 12 0v8l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 11v1M14 11v1" /></svg></span>
          : null /* (no place said: a rival to race, not a rank) */}
        {label}
      </span>
      {/* (yourself: your own gnome, connected or not) */}
      <span className={`rival__stage${reading && !self ? " wait" : ""}`}>{(row || self) && <Portrait skin={self ? gnomeById(gnome) : rivalSkin(row!.player, gnome)} />}</span>
      {self ? best && <span className="rival__best">{best}</span> : (
        <span className="rival__show">
          <MapSlot key={mapped ? mapped.id : ""} hole={lane} path={path ? path.path : undefined} wait={coming} />
          {/* (its room kept when there is none: the circles the same size in every pick) */}
          <span className="rival__best" hidden={!best} aria-hidden={!best}>{best || "\u00a0"}</span>
        </span>
      )}
      <span className="rival__name">{row ? <>{who.label}<Collector chain={chain} player={row.player} /></> : self ? "Your ghost" : reading ? "…" : failed ? "Not read" : "Nobody yet"}</span>
      <span className="rival__line">{line}</span>
      <span className="rival__go" hidden={!(open || connect)}>{connect ? "Connect" : "Race"}</span>
    </button>
  );
}

/**
 * A duel's holes, in place of the cups: each one the rival has a best on, a
 * card in its cup's band, their best (the one raced: the aim mode's, else the
 * other) big over the card's own, their path on the hole's map, and a Race
 * into it. A read that failed leaves the cups.
 */
export function Ghosts({ holes, name, player, chain, bests, card, mode, onRace, onCups, onBack, onAbout }: {
  holes: readonly HoleRow[];
  name: string;
  /** the rival's address, and the chain their maps are read on */
  player: string;
  chain: Chain | null;
  /** their bests by hole: undefined while read, null if the read failed */
  bests: Bests | null | undefined;
  card: Card;
  mode: Mode;
  onRace: (hole: string) => void;
  onCups: () => void;
  onBack: () => void;
  onAbout: () => void;
}) {
  return (
    <FrontScreen className="front--fit modes" inner="rival" back="Back to the rivals" onBack={onBack} onAbout={onAbout} eyebrow="Choose your hole" title="Their ghosts" dare={<><p className="dare">Racing {name}<Collector chain={chain} player={player} /></p>{chain && isAddress(player) && <a className="real__fine" href={chain.userURL(player)} target="_blank" rel="noopener noreferrer">Player page on gno.land ↗</a>}</>}>
      {/* while read: a band of blank cards, in the frame's place */}
      {bests === undefined && (
        <div className="ghosts__list">
          <section className="ghosts__cup">
            <h3 className="ghosts__name">Reading their ghosts…</h3>
            <ul className="ghosts__holes" aria-hidden="true">{[0, 1, 2, 3].map((i) => <li key={i}><span className="ghost podium__ghost wait"><NoMap /><i /><i /></span></li>)}</ul>
          </section>
        </div>
      )}
      {(bests === null || (bests && !bests.size)) && (
        <section className="ghosts__none">
          <p className="note note--warn">{bests ? `${name} has no saved round on the course yet.` : "Their ghosts could not be read. Their best waits on each hole they saved a round on."}</p>
          <Button variant="primary" onClick={() => (sound("select"), onCups())}>To the cups</Button>
        </section>
      )}
      {/* in a frame of its own, as a board: it scrolls under its fades, each cup's name held at its top, the screen stays put */}
      {bests && bests.size > 0 && <div className="ghosts__list">{WORLDS.map((w) => {
        const cup = holes.filter((h) => cupOf(h) === w.id), theirs = cup.filter((h) => bests.has(h.id));
        return theirs.length > 0 && (
          <section key={w.id} className={`ghosts__cup tint--${w.id}`}>
            <h3 className="ghosts__name"><Emblem id={w.id} />{w.name}</h3>
            <ul className="ghosts__holes">
              {theirs.map((h) => (
                <li key={h.id}><HoleCard id={h.id} name={h.name} num={holeNumber(cup, h.id)} par={parOf(h)} best={bestOf(bests.get(h.id), mode)!} mine={scoreOf(card, h)} chain={chain} player={player} onRace={onRace} /></li>
              ))}
            </ul>
          </section>
        );
      })}</div>}
    </FrontScreen>
  );
}

/** A hole of theirs as a card: its number (the menu's, the HUD's) and name,
 *  its map with its par on a ribbon, their path drawn on it under the pointer
 *  (read once the card scrolls into view: it works without); their best big,
 *  yours against it on one line (marked when you beat them); a tap races. */
function HoleCard({ id, name, num, par, best, mine, chain, player, onRace }: { id: string; name: string; num: string; par: number; best: { mode: Mode; strokes: number }; mine: number | undefined; chain: Chain | null; player: string; onRace: (hole: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // (a card or so ahead of the frame's edge, so its path is there as it comes in)
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (o.disconnect(), setNear(true)), { root: el.closest(".ghosts__list"), rootMargin: "240px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  // (a hole the site has no map of: read with its path, not a screen of cards at once)
  const lane = useHoleMaps(chain, near || mapNow(id) ? [id] : NONE).get(id), path = usePath(near ? chain : null, player, { id, ...best });
  const n = best.strokes, you = vsBest(mine, n);
  const said = { none: "not played by you yet", over: `you ${mine}, ${you.gap} over their best`, tie: `you ${mine}, level with them`, won: `you ${mine}: you beat them` }[you.kind];
  return (
    <button ref={ref} className="ghost" aria-label={`Hole ${num}, ${name}, par ${par}: their best ${n}${best.mode === "pro" ? " in pro" : ""}, ${said}. Race it`}
      onClick={() => (sound("select"), onRace(id))}>
      <span className="ghost__head"><span className="tile__num">{num}</span><span className="ghost__name">{name}</span></span>
      <span className="rival__show">
        <MapSlot hole={lane} path={path ? path.path : undefined} wait />
        <span className="rival__best">Par {par}</span>
      </span>
      <span className="ghost__label">Their best</span>
      <span className="ghost__best"><strong>{n}</strong> {plural("stroke", n)}{best.mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}</span>
      <span className={`ghost__you ghost__you--${you.kind}`}>
        {you.kind === "none" ? "Not played yet" : you.kind === "won" ? `✓ You beat them: ${mine}` : <>You <b>{mine}</b> · {you.kind === "over" ? <b className="bad">+{you.gap}</b> : "tied"}</>}
      </span>
      <span className="rival__go">Race</span>
    </button>
  );
}

/** The game chosen, said big in the top-left corner beside Back (the rival's
 *  screen, their ghosts, the cups, the picker), in its panel's colour. */
export const ModeTag = ({ kind }: { kind: "solo" | "duel" }) => <span className={`modetag mode--${kind}`}>{kind === "duel" ? "Duel" : "Solo"}</span>;
