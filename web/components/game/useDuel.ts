"use client";

// A duel: the rival of a dare link, or one picked on a board, their bests read on the chain and raced as a ghost
// hole by hole, how the race on this hole stands, and the ways into a duel and out of it.
import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Game, Snapshot } from "@/lib/engine";
import { isAddress, shortAddr } from "@/lib/chain";
import type { Ghost, HoleRow, Mode } from "@/lib/types";
import { pickGhost, type Duel } from "@/lib/duel";
import { sound } from "@/lib/feel";
import { addFriend } from "@/lib/friends";
import { track, trackError, type RivalKind } from "@/lib/analytics";
import type { Screen } from "@/lib/screens";
import type { Sky } from "@/components/Duel";
import { nameOnce } from "@/components/Leaderboard";

// holeId, holeReady, fresh0: the hole on screen, built with its shaders ready, no stroke on it yet
export function useDuel({ game, s, holeId, holeReady, fresh0, me, aim, allList, setLinkNote, setBoard, setScreen }: {
  game: RefObject<Game | null>;
  s: Snapshot | null;
  holeId: string | null;
  holeReady: boolean;
  fresh0: boolean;
  me: string | null;
  aim: Mode;
  allList: readonly HoleRow[];
  setLinkNote: Dispatch<SetStateAction<string | null>>;
  setBoard: (open: boolean) => void;
  setScreen: (screen: Screen) => void;
}) {
  // a dare in the link (by: the sharer), or a player picked on a board: their
  // best on each hole played, read on the chain with its round, raced as a
  // ghost, said as the hole opens; they join the friends. Play solo drops it
  // for the page.
  const [dare, setDare] = useState(() => {
    const by = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("by") : null;
    return by && isAddress(by) ? by : "";
  });
  const [solo, setSolo] = useState(false);
  const rivalFrom = useRef<RivalKind>("link"); // how the rival was found (analytics): a dare link's until one is picked
  const linkDare = useRef(dare); // a dare link's rival: Start goes to their ghosts, once (a rival picked later goes through Mode again)
  const [dareNote, setDareNote] = useState(dare ? "Reading the dare…" : "");
  const [dareHole, setDareHole] = useState(""); // the link's own hole, where the dare is said
  // the rival: their name, and their bests in both modes on each hole read so far
  const [rival, setRival] = useState<{ name: string; holes: Readonly<Record<string, Record<Mode, Ghost | null>>> } | null>(null);
  const readFor = useRef(new Set<string>()); // the holes asked (once each, a failed read again)
  const [reread, setReread] = useState(0); // a failed read asked again, a beat later
  // the player's rounds saved (how many), and their holes since the ghosts on them were read: a self-race's bests move with them
  const [saves, setSaves] = useState(0);
  const movedGhosts = useRef(new Set<string>());
  const dareNow = useRef(""); // the rival raced now: a read for another one, or for a duel dropped, lands on nothing
  dareNow.current = dare && !solo ? dare : "";
  useEffect(() => {
    const c = game.current && game.current.chain;
    if (!dare || solo || !c || !holeId || !holeReady) return;
    // (a self-race's hole again from the tee of the round after one saved there: its best moved)
    const again = readFor.current.has(holeId), first = !readFor.current.size;
    if (again && !(dare === me && fresh0 && movedGhosts.current.has(holeId))) return;
    movedGhosts.current.delete(holeId);
    readFor.current.add(holeId);
    if (first) (setDareHole(holeId), dare !== me && addFriend(dare)); // (a player opening their own link is not their own friend)
    // (a read failed is no "no ghost here": the hole is asked again, until it answers)
    void Promise.all([c.ghost(holeId, "assisted", dare), c.ghost(holeId, "pro", dare), nameOnce(c, dare)])
      .then(([a, p, n]) => {
        if (dareNow.current !== dare) return;
        const name = n || shortAddr(dare), has = !!(a || p), whose = dare === me ? "your own" : `${name}'s`;
        setRival((r) => ({ name, holes: { ...(r ? r.holes : {}), [holeId]: { assisted: a, pro: p } } }));
        if (again) return; // (their new best: said already)
        // the link's hole: said on the picker (a link opens there) and as the hole opens; a later hole: only when there is a ghost
        if (first) setDareNote(has ? "" : `${name} dares you, with no ghost here yet: set the score to beat.`);
        if (has) setLinkNote(first ? `Race ${whose} ghost: your turn first.` : `${name} has a ghost here too: race it.`);
        else if (first) setLinkNote(`${name} dares you on this hole.`);
      })
      .catch((err: unknown) => {
        trackError("ghost", err, { hole: holeId });
        if (dareNow.current !== dare) return;
        if (again) movedGhosts.current.add(holeId);
        else readFor.current.delete(holeId);
        setTimeout(() => setReread((n) => n + 1), 3000);
      });
  }, [dare, solo, holeId, holeReady, me, fresh0, saves, reread, game, setLinkNote]);
  // the rival's bests on the course's holes, read once a rival is picked: their ghosts' screen lists them
  // (null: the read failed, and no earlier one of theirs is kept; at: the player's rounds saved then)
  const [rivalOn, setRivalOn] = useState<{ by: string; bests: ReadonlyMap<string, Readonly<Record<Mode, number>>> | null; at: number } | null>(null);
  useEffect(() => {
    const c = game.current && game.current.chain, ids = allList.filter((h) => h.official).map((h) => h.id);
    // (once a rival, the rival screen's read kept; again after a round saved in a self-race, and a failed one at the next hole)
    const known = rivalOn && rivalOn.by === dare && rivalOn.bests && (dare !== me || rivalOn.at === saves);
    if (!dare || solo || !c || !ids.length || !holeReady || known) return;
    let live = true;
    void c.bestsOf(ids, dare).then(
      (bests) => live && setRivalOn({ by: dare, bests, at: saves }),
      () => live && setRivalOn((r) => (r && r.by === dare ? r : { by: dare, bests: null, at: saves })),
    );
    return () => void (live = false);
  }, [dare, solo, allList, holeReady, me, saves, rivalOn, game]);
  const rivalBests = dare && !solo && rivalOn && rivalOn.by === dare ? rivalOn.bests : undefined;
  // a duel is played only where their ghost is: the holes without one are not offered
  const duelOn = rivalBests || null;
  const duelHole = duelOn ? (h: { id: string }) => duelOn.has(h.id) : undefined;
  // the cups' place in a duel: their ghosts' holes
  const cupsScreen: Screen = dare && !solo ? "ghosts" : "worlds";
  const rivalName = (rival && rival.name) || shortAddr(dare);
  // the duel on this hole: the rival's best in the round's aim mode, else their other one
  const duelMode = (s && s.roundMode) || aim;
  const duel: Duel | null = useMemo(() => {
    const ghosts = rival && holeId ? rival.holes[holeId] : null, g = ghosts ? pickGhost(duelMode, ghosts) : null;
    return g && rival ? { ghost: g, name: rival.name, self: dare === me } : null;
  }, [rival, holeId, duelMode, dare, me]);
  // (keyed on the ghost, not the duel: an account connecting mid-round must not start it again;
  // and on the hole built: a game made again, the start retried, gets the duel still on)
  const raced = duel ? duel.ghost : null;
  useEffect(() => game.current?.race(raced), [raced, holeReady, game]);
  // the duel this round races (one armed mid-round starts with the next: the engine says when)
  const racing = duel && s && s.rival != null ? duel : null;
  // the weather the ghost was played in (read once a duel is armed), said when it was not today's
  const [ghostSky, setGhostSky] = useState<{ ghost: Ghost; kind: string } | null>(null);
  useEffect(() => {
    const c = game.current && game.current.chain;
    let live = true;
    if (raced && c) void c.weather(raced.hole, raced.period).then((w) => live && setGhostSky({ ghost: raced, kind: w.kind || "" }), () => {});
    return () => void (live = false);
  }, [raced, game]);
  const sky: Sky = duel && s && ghostSky && ghostSky.ghost === duel.ghost ? { theirs: ghostSky.kind, mine: s.kind } : null;
  // out of reach: the rival's holing stroke shown, and the player past it (or at it, the ball at rest out of the cup),
  // then for the rest of the round; said, and the rematch pushed, while the round goes on
  const lostNow = !!(racing && s && s.rivalIn && (s.strokes > racing.ghost.strokes || (s.strokes === racing.ghost.strokes && !s.flying && !s.done)));
  const [lostKept, setLostKept] = useState(false);
  const roundStrokes = s ? s.strokes : 0;
  useEffect(() => {
    if (lostNow) setLostKept(true);
    else if (!roundStrokes) setLostKept(false); // a new round
  }, [lostNow, roundStrokes]);
  const theyWon = !!racing && (lostNow || lostKept);
  const duelLost = theyWon && !!s && !s.done;
  const lostNote = duel ? (duel.ghost.strokes === 1 ? "Missed the ace. Rematch?" : `${duel.self ? "Your best" : duel.name} holed it in ${duel.ghost.strokes}. Finish for your score, or rematch.`) : "";
  useEffect(() => {
    setLinkNote((n) => (duelLost ? lostNote : n === lostNote ? null : n)); // (gone with the rematch)
  }, [duelLost]); // eslint-disable-line react-hooks/exhaustive-deps -- as it turns
  // a rival picked (a board's Race, the game's choice): their ghost read afresh on each hole
  const pickRival = (player: string, from: RivalKind) => {
    if (player === dare && !solo) return; // (already the rival)
    rivalFrom.current = from;
    readFor.current.clear();
    movedGhosts.current.clear();
    setRival(null);
    setSolo(false);
    setDareHole("");
    setDare(player);
  };
  // a Race (a board's, the rival screen's): from the tee, a round under way starts again
  const raceWith = (player: string, from: RivalKind = "board") => (setBoard(false), game.current?.reset(), pickRival(player, from));
  // a rival picked on the rival screen (or its board's sheet): their ghosts next, their bests kept when read there
  const toGhosts = (player: string, bests?: ReadonlyMap<string, Readonly<Record<Mode, number>>>, from?: RivalKind) => (sound("select"), bests && setRivalOn({ by: player, bests, at: saves }), raceWith(player, from), setScreen("ghosts"));
  // the rival as analytics says it: the player's own best, else how they were found
  const rivalKind = (): RivalKind => (dare === me ? "self" : rivalFrom.current);
  // Play solo (the picker's, the game choice's): the duel dropped for the page; note: the toast said as it goes
  const dropDuel = (note: string | null) => {
    if (dare && !solo) track("duel_dropped", { rival: rivalKind() });
    setSolo(true);
    setRival(null);
    setDareNote("");
    setLinkNote(note);
    // (on the picker its link goes with it: the keyboard's focus to its button)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".screen--pick .btn--play")?.focus());
  };
  return { dare, solo, linkDare, dareNote, dareHole, rivalBests, duelHole, cupsScreen, rivalName, duel, racing, sky, theyWon, raceWith, toGhosts, dropDuel, rivalKind, movedGhosts, setSaves };
}
