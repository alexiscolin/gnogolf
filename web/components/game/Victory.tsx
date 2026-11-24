"use client";

// The cup's card and its end: the scorecard and the standings (the win card's, the cup's sheet's), the gnomes just
// unlocked, and the victory screen of a cup complete.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "@/lib/scene/materials";
import type { Skin } from "@/lib/scene/gnome";
import { cheer } from "@/lib/scene/fx";
import type { HoleRow } from "@/lib/types";
import { SHARE_TAGS } from "@/lib/site";
import { totals, parOf, UNLOCKS, cupFinishLine, cardKey, scoreOf, vsParWords, nextHole, type Card, type Cup } from "@/lib/card";
import { sound } from "@/lib/feel";
import { plural } from "@/lib/words";
import { chainQuery } from "@/lib/links";
import { badgesAt } from "@/lib/prefs";
import { WORLDS, Emblem, worldOf } from "@/components/Worlds";
import Share from "@/components/Share";
import { CardStamps, ChainSeal, EarnedBadges } from "@/components/Badges";
import { useGnomeStage } from "@/components/Stage";
import { Button, Dialog, Nil, VsPar } from "@/components/ui";
import { NONE } from "@/components/hooks";
import type { BoardProps } from "@/components/Leaderboard";

/** A cup's own page (/h/<world>/), what its share links to. A share names no
 *  bare gno.land: X would take that for the link and show gno.land's card. */
function cupLink(cup: string) {
  const q = chainQuery();
  q.set("src", "cup");
  return `h/${cup}/?${q}`; // (its own page: its link card is the cup's, app/h)
}

/** The confetti over the victory screen: none with reduced motion. */
function Cheer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!motion || !box) return;
    // a canvas of its own each time: a context once lost is not given back
    const el = box.appendChild(document.createElement("canvas"));
    let stop = () => {};
    try { stop = cheer(el); } catch {} // no WebGL to spare: no confetti, the screen stands
    return () => (stop(), el.remove());
  }, []);
  return motion ? <div ref={ref} className="victory__cheer" aria-hidden="true" /> : null;
}

/**
 * A cup won: its emblem and colours, the total against par, its card, the
 * gnomes it earned and the ways to tell people, then back to the cups.
 */
interface VictoryProps {
  cup: Cup;
  best: boolean;
  holes: readonly HoleRow[];
  card: Card;
  /** the card's scores that are on the chain too */
  saved: Card;
  fresh: readonly Skin[];
  snapshot: () => Promise<Blob | null>;
  onBack: () => void;
  onReplay: () => void;
  /** the cup after this one ("" after the last) */
  next: string;
  /** on to it, as this gnome when one is given (just unlocked) */
  onNext: (gnome?: string) => void;
  onRules: () => void;
}
export function Victory({ cup, best, holes, card, saved, fresh, snapshot, onBack, onReplay, next, onNext, onRules }: VictoryProps) {
  const w = worldOf(cup);
  const t = totals(card, holes), vs = t.strokes - t.par;
  const to = WORLDS.find((x) => x.id === next);
  const text = `🏆 ${best ? `Beat my last ${w.name}` : `${w.name} complete`} on Gnogolf: ${t.strokes} strokes over ${holes.length} holes, ${vsParWords(vs)}. Every putt computed on-chain.${SHARE_TAGS}`;
  return (
    <div className={`victory victory--${cup}`}>
      <Cheer />
      <Dialog className="victory__in" role="dialog" aria-modal="true" aria-labelledby="victory-title" aria-describedby="victory-sum" onClose={onBack}>
        <div className="victory__badge"><Emblem id={cup} /></div>
        <span className="victory__ribbon">{w.name}</span>
        <h2 id="victory-title">{best ? "Better than last time!" : "Cup complete!"}</h2>
        <p id="victory-sum" className="victory__sum">
          <strong>{t.strokes}</strong> strokes · par {t.par} · <VsPar vs={vs} words />
          {t.all && vs <= 0 && <span className="victory__stamp" title="At par or under">★ At par or under</span>}
          {t.aces > 0 && <span className="victory__stamp">{t.aces} {plural("hole", t.aces)}-in-one</span>}
        </p>
        <Scorecard holes={holes} card={card} saved={saved} current={null} compact onRules={onRules} />
        {fresh.length > 0 && <NewGnome skin={fresh[0]} also={fresh.slice(1)} where={to ? to.name : ""} onPlay={() => (sound("select"), onNext(fresh[0].id))} />}
        <Share text={text} link={cupLink(cup)} snapshot={snapshot} what="cup" />
        {/* one solid action: the new gnome's (in its card), else the next cup, else back to the cups */}
        <div className="banner__row">
          <button className="linkish" onClick={() => (sound("blip"), onReplay())}>Replay the cup</button>
          {fresh.length > 0 || !to ? (
            <Button variant={fresh.length ? "secondary" : "primary"} onClick={() => (sound("select"), onBack())}>Back to cups</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => (sound("select"), onBack())}>Back to cups</Button>
              <Button variant="primary" onClick={() => (sound("select"), onNext())}>Next: {to.name} →</Button>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}

/**
 * A gnome just unlocked, on the cup's card: turning on its stage as in the
 * picker, what earned it, and the one action: play as it (in the next cup,
 * where: its name). also: the others unlocked with it.
 */
function NewGnome({ skin, also, where, onPlay }: { skin: Skin; also: readonly Skin[]; where: string; onPlay: () => void }) {
  const stage = useGnomeStage(skin);
  const earned = skin.unlock ? UNLOCKS[skin.unlock].need : "";
  return (
    <div className="newgnome">
      <div ref={stage} className="pick__canvas newgnome__stage" />
      <div className="newgnome__say">
        <span className="eyebrow">New gnome!</span>
        <b className="newgnome__name">{skin.name}</b>
        {earned && <small>{earned}{also.length > 0 && ` · ${also.map((g) => g.name).join(", ")} too`}</small>}
        <Button variant="primary" onClick={onPlay}>Play as {skin.name} →</Button>
        {where && <small>Next up: {where}</small>}
      </div>
    </div>
  );
}

/** Gnomes just unlocked: said, and each one a tap from the picker, shown there on its stage. */
export function Unlocked({ fresh, onMeet }: { fresh: readonly Skin[]; onMeet: (id: string) => void }) {
  if (!fresh.length) return null;
  return (
    <p className="note note--good">
      New gnome unlocked: <b>{fresh.map((gn) => gn.name).join(", ")}</b>
      {fresh.map((gn) => (
        <span key={gn.id}>
          {" · "}
          <button className="linkish" onClick={() => (sound("select"), onMeet(gn.id))}>Meet {gn.name} →</button>
        </span>
      ))}
    </p>
  );
}

/** The card: hole, par and your score, ten holes to a row, with the totals. */
// fresh: the badges the current hole just earned, stamped on its score
function Scorecard({ holes, card, saved, current, compact = false, fresh = NONE, onRules }: { holes: readonly HoleRow[]; card: Card; saved: Card; current: string | null; compact?: boolean; fresh?: readonly string[]; onRules: () => void }) {
  // compact, with a hole being played (the win card): that hole and four either
  // side, one row, the whole card a tap away
  const at = holes.findIndex((h) => h.id === current), windowed = compact && at >= 0 && holes.length > 9;
  const [all, setAll] = useState(false);
  const from = windowed && !all ? Math.max(0, Math.min(at - 4, holes.length - 9)) : 0;
  const shown = windowed && !all ? holes.slice(from, from + 9) : holes;
  // two halves of the same width (front nine, back nine), so every column of
  // the second row sits under one of the first; a short last row is padded
  const per = (windowed && !all ? shown.length : Math.ceil(shown.length / 2)) || 1, rows: (readonly HoleRow[])[] = [];
  for (let i = 0; i < shown.length; i += per) rows.push(shown.slice(i, i + per));
  const pad = (row: readonly HoleRow[]) => Array.from({ length: per - row.length }, (_, k) => <td key={"pad" + k} className="pad" />);
  const t = totals(card, holes);
  // the badges earned on each hole, read once for the card (a badge comes with a score, a save or a fresh one)
  const earnedOn = useMemo(() => {
    const on: Record<string, string[]> = {};
    for (const [b, h] of Object.entries(badgesAt())) (on[h] ||= []).push(b);
    return on;
  }, [card, saved, fresh]); // eslint-disable-line react-hooks/exhaustive-deps -- badgesAt() reads storage: read again as they change
  return (
    <div className={"card" + (compact ? " card--compact" : "") + " scorecard"}>
      {rows.map((row, r) => (
        <table key={r}>
          <tbody>
            <tr><th>Hole</th>{row.map((h, i) => <td key={h.id} className={h.id === current ? "cur" : ""}><span>{from + r * per + i + 1}</span></td>)}{pad(row)}</tr>
            <tr><th>Par</th>{row.map((h) => <td key={h.id} className={h.id === current ? "now" : ""}>{parOf(h)}</td>)}{pad(row)}</tr>
            <tr>
              <th>Score</th>
              {row.map((h) => {
                const sc = scoreOf(card, h);
                const par = parOf(h);
                const kind = !sc ? "" : sc === 1 ? "ace" : sc < par ? "under" : sc === par ? "par" : sc >= par + 3 ? "oops" : "over";
                return (
                  <td key={h.id} className={kind + (h.id === current ? " now" : "")}>
                    {sc || ""}
                    {sc && <CardStamps at={earnedOn[h.id] || NONE} strokes={sc} par={par} seed={r * per + row.indexOf(h)} fresh={h.id === current ? fresh : []} />}
                    {sc && saved[cardKey(h)] === sc && <ChainSeal />}
                  </td>
                );
              })}
              {pad(row)}
            </tr>
          </tbody>
        </table>
      ))}
      <div className="scorecard__total">
        <span>Total</span>
        <strong>{t.strokes || <Nil />}</strong>
        <span>par {t.par || "–"}</span>
        <span>{t.done}/{holes.length} holes</span>
        <span className="scorecard__links">
          <button className="linkish" onClick={onRules}>Rules</button>
          {windowed && <button className="linkish" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? "Fewer holes" : "The whole card"}</button>}
        </span>
      </div>
    </div>
  );
}

// badges: the cup's card (not compact) shows the badges earned, those fresh pressed on
export function Standings({ s, card, saved, chain, me, mode = "pro", compact = false, onRules, fresh = NONE, badges }: BoardProps & { card: Card; saved: Card; compact?: boolean; onRules: () => void; fresh?: readonly string[]; badges?: { onOpen: () => void } }) {
  const [rank, setRank] = useState<{ at?: number; unnamed?: boolean } | null>(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true; // no state set once the card is gone
    // the chain's own rank, among the named players it ranks
    // (read again after a save: the one it lands may rank the player)
    chain.rank(mode, me).then((r) => live && setRank(r.rank > 0 ? { at: r.rank } : r.holes > 0 ? { unnamed: true } : null)).catch(() => {});
    return () => void (live = false);
  }, [chain, me, mode, saved]);
  const cup = worldOf(s.world);
  const t = totals(card, s.holes);
  const vs = t.strokes - t.par;
  const next = nextHole(s, card);
  const finished = t.all ? cupFinishLine(s.world || "", t.strokes <= t.par) : "";
  return (
    <section className="cup" aria-label={`${cup.name} standings`}>
      <header className="cup__head">
        <Emblem id={cup.id} />
        <div>
          <span className="eyebrow">Your cup</span>
          <h3>{cup.name}</h3>
        </div>
        <dl className="cup__sum">
          <div><dt>Holes</dt><dd>{t.done}/{s.holes.length}</dd></div>
          <div><dt>Vs par</dt><dd>{t.done ? <VsPar vs={vs} /> : <Nil />}</dd></div>
          <div><dt>Rank</dt><dd title={rank && rank.unnamed ? "Only players with a gno.land name are ranked" : undefined}>{rank && rank.at ? `#${rank.at}` : rank && rank.unnamed ? <small>needs a name</small> : <Nil />}</dd></div>
        </dl>
      </header>
      <Scorecard holes={s.holes} card={card} saved={saved} current={s.id} compact={compact} fresh={fresh} onRules={onRules} />
      {badges && <EarnedBadges fresh={fresh} onOpen={badges.onOpen} />}
      {(t.all ? finished : !compact && next) && <p className="cup__next">{t.all ? finished : next && <>Next up: <b>{next.name}</b></>}</p>}
    </section>
  );
}
