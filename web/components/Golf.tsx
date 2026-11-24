"use client";

// The game's screen: the canvas and the game made on it, which screen shows, and what each one is given. Its parts
// are in components/game: its hooks, one a job, and the cards and sheets of the save, the cup and the picker.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { menuLink, menuReached, onMenuLink } from "@/lib/menu";
import { CAMS, CamButton } from "@/components/CamButton";
import { createGame, type Game, type GameOptions, type Snapshot } from "@/lib/engine";
import { camlog } from "@/lib/testhooks";
import { GNOMES, gnomeById, knowGnome, setRivalGnome, loadWardrobe, type Skin } from "@/lib/scene/gnome";
import { NOT_BUILDER, NOT_HOLED } from "@/lib/community";
import { isAddress, errorKind, REALM_PATH, RULES, suggestName, shortAddr, within, type Chain } from "@/lib/chain";
import type { ErrorKind, GfxMode } from "@/lib/engine/types";
import { savedGfx, saveGfx } from "@/lib/engine/pace";
import type { HoleRow, Mode } from "@/lib/types";
import { duelResult, duelShare, raceLeft, type Duel } from "@/lib/duel";
import { saveLine } from "@/lib/featured";
import { reportHole, SHARE_TAGS } from "@/lib/site";
import { DuelFine, DuelNote } from "@/components/Duel";
import type { Card, Cup } from "@/lib/card";
import type { Feel } from "@/lib/feel";
import { hasAdena, connect, current, onWalletChange, type Account } from "@/lib/adena";
import Title, { Hat, choresOf } from "@/components/Title";
import Worlds, { WORLDS, Emblem, worldOf } from "@/components/Worlds";
import Community from "@/components/Community";
import Share, { ShareClip, type Clip } from "@/components/Share";
import Gnokey from "@/components/Gnokey";
import About, { InfoIcon, Rules } from "@/components/About";
import Feedback from "@/components/Feedback";
import { Badges, NewBadges } from "@/components/Badges";
import Tip, { readOwner } from "@/components/Tip";
import Modes, { Ghosts, ModeTag, Rival } from "@/components/Modes";
import { Button, Segmented, Toggle, Sheet, SheetClose, Dialog, Nil } from "@/components/ui";
import { CUPS, loadCard, recordScore, clearCard, clearCup, totals, cupTotals, parOf, UNLOCKS, cupOf, cardKey, scoreOf, vsPar, badgesFor, byRarity, BADGES, loadOnChain, guessCup, HARD, parHere, vsParWords, holeNumber, nextCup, golfTerm, nextHole, strokeFor } from "@/lib/card";
import { feel, setFeel, sound, hush } from "@/lib/feel";
import { addFriend } from "@/lib/friends";
import { messageOf, plural, strokesWord, AIM_NAMES } from "@/lib/words";
import { holeLink, chainQuery } from "@/lib/links";
import { pendingOf, saveBy, roundOf, sentKey, loadSent, busy, saveLabel, PENDING, SENT, type Rec, type SaveOf } from "@/lib/save";
import { minesHint, readMs } from "@/lib/hints";
import { NONE } from "@/components/hooks";
import { clipName } from "@/lib/clip";
import { Boards, FullBoard, Podium, NameForm, useRankNudge, useSavedPlace } from "@/components/Leaderboard";
import { FAUCET, GNOT_URL, networkOf } from "@/lib/network";
import { register, track, trackLeaving, trackError, once, failure, cardHoles, gnomeWord, type Events, type Play, type ShareKind, type WalletFrom } from "@/lib/analytics";
import { savedCam, hadGnome, savedGnome, saveGnome, earned, remember, badgesEarned, forgetBadges, rememberBadges, seeWeather, weathersSeen, minesHinted, minesHintSaid, linkedGnome, lockedNote } from "@/lib/prefs";
import { darkGallery, minesOrder } from "@/lib/scene/data";
import { BACK, type Screen } from "@/lib/screens";
import { SHOP, SHOP_LINE, pick } from "@/lib/gnomes/door";
import { authorOf, buildLink, endpoints } from "@/lib/builder/holes";
import { CollectionSection, Collector, Owned, PromoLine, ShopScreen as Shop, shopPart } from "@/components/gnomes/Door";
import { builderOn } from "@/lib/builder/route";
import type { skinOfTraits } from "@/lib/gnomes/skin";
import { makeHot, sameCold, AimBar, CauseNote, LiveWeather, Toast, NetBanner, AimSetting, type Hot } from "@/components/game/Hud";
import { SaveClock, RecordState, PendingSave, GetGnot, RealPlay } from "@/components/game/Save";
import { Victory, Unlocked, Standings } from "@/components/game/Victory";
import { Picker } from "@/components/game/Picker";
import { DEV, useConfig } from "@/components/game/useConfig";
import { useTabTitle } from "@/components/game/useTabTitle";
import { useRestore } from "@/components/game/useRestore";
import { useDuel } from "@/components/game/useDuel";
import { useShop } from "@/components/game/useShop";
import { useSave } from "@/components/game/useSave";
import { useAddress } from "@/components/game/useAddress";

// The gnome shop (NEXT_PUBLIC_GNOMES, lib/gnomes/door.ts SHOP): its pieces on these screens (the menu's panel, the
// picker's section and the player's row, the finish card's line, the collector badges, what a player holds and
// wears) and its screen are the shop's own chunk, fetched through its door (components/gnomes/Door.tsx) once a
// screen wants them; off, none of it is ever built.

declare global {
  interface Window {
    // ?camlog: the game within reach of the camera probe (a test hook)
    __g?: Game;
  }
}

/** What stopped the start: the chain not answering, a chain with no hole, ours, or no WebGL here. */
type FatalKind = "down" | "empty" | "bug" | "webgl";
function fatalKind(err: unknown): FatalKind {
  const m = messageOf(err);
  if (/no hole is registered/.test(m)) return "empty";
  if (errorKind(err) === "down" || /fetch|network|timed? ?out|timeout|abort|rpc|abci|http|connect|load failed|did not answer/i.test(m)) return "down";
  return "bug";
}
// what the error banner says, per kind: its title and its sentence
const BANNER = {
  down: ["The course is not reachable right now", "The chain the game plays on did not answer. It may be restarting."],
  webgl: ["Your browser can't draw 3D here", "Turn on hardware acceleration in the browser's settings, then reload. The course is also playable as text on gno.land."],
  empty: ["No hole on this chain yet", "The chain answered, but no hole is registered on it. Try again once the course is deployed."],
  bug: ["Something went wrong", "The game hit an error in this browser. Reloading the page usually fixes it."],
  load: ["That hole did not load", "The chain did not send this hole. Try again, or pick another one from the menu."],
  draw: ["That hole could not be drawn", "Something broke on our side while building it. Pick another hole from the menu — your scores are safe."],
  limit: ["That is the most strokes a round holds", "Restart the hole to play it again."],
  unchecked: ["That hole can't be played here", `${NOT_BUILDER} Pick another one from the menu.`],
  unheld: ["That hole isn't open yet", `${NOT_HOLED} Pick another one from the menu.`],
  shot: ["That shot did not go through", "The chain could not play that shot. Nothing was lost; you can shoot again."],
} as const satisfies Record<FatalKind | ErrorKind, readonly [string, string]>;

// how far this device's clock is behind the chain's (ms): a deadline on the
// chain's clock, less this, is one on the device's
const skewOf = (chain: Chain | null | undefined) => (chain ? chain.now() - Date.now() : 0);

/** "Trying again in 8 s…": the start is retried on its own every 10 s. */
function Retry({ onRetry }: { onRetry: () => void }) {
  const [left, setLeft] = useState(10);
  const again = useRef(onRetry);
  again.current = onRetry;
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) again.current();
  }, [left]);
  return <p className="banner__retry">Trying again in {Math.max(0, left)} s…</p>;
}

export default function Golf() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const cfg = useConfig();
  const router = useRouter(); // (the Builder without a reload: the app's own navigation)

  const [s, setS] = useState<Snapshot | null>(null);
  const hot = useRef<Hot | null>(null);
  if (!hot.current) hot.current = makeHot();
  const cold = useRef<Snapshot | null>(null); // the snapshot last given to setS
  const [fatal, setFatal] = useState<{ msg: string; kind: FatalKind } | null>(null); // the game could not start
  const [boot, setBoot] = useState(0); // a retry of the start: a new game
  const [gl, setGl] = useState<null | "lost" | "gone">(null); // the WebGL context was taken away
  // title -> game choice -> cups, or rival -> their ghosts -> gnome -> play; the title shows at once, the hole loads behind it
  // the menu's address (the Builder's and the shop's Back) opens on it from the first frame: it needs no course read
  const [screen, setScreen] = useState<Screen>(() => (onMenuLink() ? "modes" : "title"));
  const opened = useRef(screen); // (the address's screen, once the game started: only if the player is still where the page opened)
  useEffect(menuReached, []);
  const playing = screen === "play";
  // what the effects below follow of the game's state, as plain values
  const holeId = s && s.id;
  const fresh0 = !!(s && s.shots.length === 0);
  const holedNow = !!(s && s.holed);
  const holeReady = !!(s && s.ready); // the hole on screen, built and its shaders ready
  // the rain and the wind stay on the course: silent on every other screen,
  // and while the window is behind another one (the course is not drawn then)
  const [away, setAway] = useState(false);
  useEffect(() => {
    const off = () => setAway(true), on = () => setAway(false);
    window.addEventListener("blur", off);
    window.addEventListener("focus", on);
    return () => (window.removeEventListener("blur", off), window.removeEventListener("focus", on));
  }, []);
  useEffect(() => hush(!playing || away), [playing, away]);
  // the title, the cups and the picker hide the course entirely: nothing to draw
  useEffect(() => {
    game.current && game.current.cover(!playing);
  }, [playing, holeId]);
  // the gnome: a shared link's if this player has it, else their own; a link
  // never unlocks one, and is never saved as the player's choice
  const [linkNote, setLinkNote] = useState(lockedNote);
  // a player's first hole: once, where to see all of it
  const [farHint, setFarHint] = useState(() => {
    try {
      return !localStorage.getItem("gnogolf.hint.far");
    } catch {
      return false;
    }
  });
  // a mines hole's first visit: its signature, said once (the slots already told)
  const [hinted, setHinted] = useState(minesHinted);
  const [camNote, setCamNote] = useState<string | null>(null); // the view just picked, said for a moment
  const [gnome, setGnome] = useState(() => {
    const gn = linkedGnome();
    return gn && gn.open ? gn.id : savedGnome(); // a locked one: lockedNote says so
  });
  const [menu, setMenu] = useState(false);
  const [board, setBoard] = useState(false); // the leaderboard sheet
  const [about, setAbout] = useState(false); // the about sheet
  const [support, setSupport] = useState(false); // the tip's sheet (the Support chip by the network banner)
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rules, setRules] = useState(false); // the rules' sheet
  // the aim mode, kept in this browser: assisted (the whole path) or pro
  const [aim, setAimState] = useState<Mode>(() => {
    try {
      return localStorage.getItem("gnogolf.aim") === "assisted" ? "assisted" : "pro"; // Pro unless the player chose Assisted
    } catch {
      return "pro";
    }
  });
  // graphics, kept in this browser: auto (by the device), high or low
  const [gfx, setGfxState] = useState(savedGfx);
  const setGfx = (m: GfxMode) => {
    saveGfx(m);
    setGfxState(m);
    game.current && game.current.setGfx(m);
  };
  const [askAim, setAskAim] = useState<Mode | null>(null); // a mode waiting for the player's yes (a round under way)
  const setAim = (m: Mode, sure = false) => {
    if (m === aim) return;
    // a round under way restarts in the new mode: asked once, in the game's own dialog
    if (!sure && s && s.shots && s.shots.length && !s.holed) return setMenu(false), setAskAim(m);
    setAskAim(null);
    try { localStorage.setItem("gnogolf.aim", m); } catch {}
    setAimState(m);
    game.current && game.current.setMode(m);
  };
  const [chainId, setChainId] = useState<string | null>(null);
  // the curtain between holes: shut on the way out, open once the next is built
  const [curtain, setCurtain] = useState<{ n: string; name: string; id: string; open?: boolean } | null>(null);
  // the page's own timers (the curtain's wait, the demo's, the ?won and ?shot
  // ones): cleared when it goes
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (f: () => void, ms: number) => {
    const t = setTimeout(() => (timers.current.delete(t), f()), ms);
    timers.current.add(t);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const goTo = (id: string) => {
    if (!s) return;
    // the hole on screen: a new round on it, no curtain (its course stays built)
    if (id === s.id) return void (game.current && game.current.reset());
    const i = s.holes.findIndex((h) => h.id === id);
    setCurtain({ n: holeNumber(s.holes, id), name: s.holes[i] ? s.holes[i].name : "", id });
    later(() => void (game.current && game.current.load(id)), 380);
  };
  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; });
  const [card, setCard] = useState(() => loadCard());
  const [onChainCard, setOnChainCard] = useState(() => loadOnChain()); // the card's scores that a save put on the chain
  const [cardOpen, setCardOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => feel());
  const toggle = (k: keyof Feel) => { setFeel(k, !prefs[k]); setPrefs(feel()); };
  const [wipe, setWipe] = useState(false); // "clear my scores" asks twice
  // a new game: the card and its badges gone (the gnomes earned stay)
  const newGame = () => (setCard(clearCard()), forgetBadges(), setFreshBadges([]));

  useTabTitle(s, playing);
  const holedRef = useRef<(id: string, strokes: number) => void>(() => {});
  const [fresh, setFresh] = useState<Skin[]>([]); // gnomes just unlocked, for the banner
  // badges just earned by this round (its finish, then its save), rarest first, and the badges' sheet
  const [freshBadges, setFreshBadges] = useState<string[]>([]);
  const [badgesOpen, setBadgesOpen] = useState(false);
  // (hole: where they were earned, stamped there on the cup card)
  const award = (ids: readonly string[], hole: string | null | undefined) => {
    const got = rememberBadges(ids, hole || ""); // (the new ones only)
    for (const id of got) track("badge_earned", { id });
    if (got.length) setFreshBadges((b) => byRarity([...b, ...got]));
  };
  // the hole that finished its cup (or beat the cup's best): the win card
  // leads on to the cup's victory screen (open)
  const [cupWon, setCupWon] = useState<{ cup: Cup; id: string; best: boolean; open?: boolean } | null>(null);
  const holesList = (s && s.holes) || NONE;
  const tot = useMemo(() => totals(card, holesList), [card, holesList]);
  const allList = (s && s.allHoles) || NONE;
  const cups = useMemo(() => cupTotals(card, allList), [card, allList]);
  // each cup's holes not played yet, in order: the next one is said on its card; the cup played
  // last's first few carry the records to beat on the cups screen (three of them, on those with one)
  const toPlay = useMemo(() => Object.fromEntries(CUPS.map((c) => [c, allList.filter((h) => cupOf(h) === c && !scoreOf(card, h))])) as Record<Cup, HoleRow[]>, [card, allList]);
  // this hole's score on the card (the round before), said by the strokes while playing it
  const hereRow = s && allList.find((h) => h.id === s.id);
  const last = s && !s.holed && hereRow ? scoreOf(card, hereRow) : undefined;
  // a mines hole: its slot, and its signature for a first visit
  const minesN = minesOrder({ hole: (s && s.id) || "" }), hintSlot = minesN ? `mines/${minesN}` : "", hint = minesHint(hintSlot);
  // an assisted round, said on the strokes card's corner (solo or duel)
  const assisted = s && (s.roundMode || s.mode) === "assisted" && <span className="pro-chip" title="Assisted: the full aim line, ranked apart">ASSISTED</span>;
  // once earned, a gnome stays earned: a hole registered later must not take
  // it back, and the hole list not being loaded yet must not either
  const had = earned(); // read once a render, not once a gnome
  const unlocked = (id: string) => {
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || !gn.unlock) return true;
    if (had.includes(id)) return true;
    return !!(allList.length && UNLOCKS[gn.unlock].ok(cups));
  };
  const unlockedRef = useRef(unlocked); // (for an answer landing after this render: readWorn's)
  unlockedRef.current = unlocked;
  // once earned, remembered — outside render, so a render never writes storage
  useEffect(() => {
    if (!allList.length) return;
    for (const gn of GNOMES) if (gn.unlock && UNLOCKS[gn.unlock].ok(cups)) remember(gn.id);
  }, [allList, cups]);

  // playing for real: who is connected, and where the current round's record is
  const [real, setReal] = useState<WalletFrom | false>(false); // the explainer is open, and from where
  const [account, setAccount] = useState<Account | null>(null);
  const me = account && account.address;
  const selfRef = useRef<string | null>(null);
  selfRef.current = account?.address ?? null;
  // a link to a hole its author has not holed yet, refused before the wallet came back: theirs once their account is
  // known (the wallet's restore comes later than the link's judging), so judged again then, and opened if it is
  const unheldLink = useRef("");
  // (forgotten once the player leaves the cups it landed on: never opened over what they went to since)
  useEffect(() => {
    if (screen !== "worlds") unheldLink.current = "";
  }, [screen]);
  useEffect(() => {
    const link = unheldLink.current, me = account?.address;
    if (!link || !me || authorOf(link) !== me || !game.current) return;
    unheldLink.current = "";
    setRestoreNote(null);
    void game.current.load(link);
    setScreen("pick");
  }, [account?.address]);
  // news said wherever the player is, never over another note: the wallet's records brought back, a link's hole that cannot open
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  // the connected wallet's records, brought back onto the card at each visit and when asked (the menu's button, the cups')
  const { restoreBusy, restoreAsked } = useRestore({ game, account, allList, setCard, setOnChainCard, setLinkNote, setFreshBadges, setRestoreNote });

  const [wallet, setWallet] = useState<{ busy: boolean; error: string | null; note?: string }>({ busy: false, error: null });
  const [record, setRecord] = useState<Rec>(null);
  const played = record?.at === "saved" || (record?.at === "refused" && !!record.final); // this round went through: nothing more of it to send
  const onChain = record?.at === "saved" && !record.stays; // and it is the player's best on the chain: public, their ghost
  const stale = record?.at === "refused" && record.stale; // its weather is over: no save any more
  // the save window runs out on the clock, not at the next click: the button goes with it
  const [over, setOver] = useState(false);
  const period = s ? s.period : null;
  useEffect(() => {
    setOver(false);
    const g = game.current;
    if (period == null || !g) return;
    let live = true, t: ReturnType<typeof setTimeout> | undefined;
    // the chain's clock decides, not this browser's: when the time looks up, the
    // last block's time is read again first. A chain running late (or a clock
    // set wrong here) keeps the save open for as long as the chain would take it.
    // a chain that cannot be read is asked again every 10 s, not every second
    const arm = (floor = 1000) =>
      (t = setTimeout(
        () =>
          void g.chain.sync().then(
            () => live && (g.chain.now() >= saveBy(period) ? setOver(true) : arm()),
            () => live && arm(10000),
          ),
        Math.max(floor, saveBy(period) - g.chain.now()),
      ));
    arm();
    return () => ((live = false), clearTimeout(t));
  }, [period]);
  const closed = stale || over; // no save possible any more
  // (a round won and still unsaved as its window runs out; a kept one's is the pending card's to say)
  useEffect(() => void (over && s && s.holed && s.id && !played && track("save_expired", { where: "card", hole: s.id, strokes: s.strokes })), [over]); // eslint-disable-line react-hooks/exhaustive-deps -- as it runs out
  const canSave = !played && !closed; // the card's one action while it lasts
  // the place a finished hole would take on its board, shown on the save button
  const nudge = useRankNudge(s, game.current && game.current.chain, me, (s && s.roundMode) || aim, played, closed);
  // a name just taken in the game, said until the next hole
  const [namedAs, setNamedAs] = useState("");
  const holeNow = s && s.id;
  useEffect(() => setNamedAs(""), [holeNow]);
  // the name typed for the save (the win card's or the sheet's: the same one),
  // started from the gnome's, for its own hole's round
  const [nameStem, setNameStem] = useState(() => suggestName(gnome));
  useEffect(() => setNameStem(suggestName(gnome)), [holeNow, gnome]);
  // a save under way, from either card (the same round can be on both): a second click starts no second one
  const saving = useRef(false);
  // the rounds whose last commit went through, and how that went (SENT)
  const [sentRounds] = useState(() => new Map<string, Rec>(loadSent()));
  const markSent = (key: string, rec: Rec) => {
    sentRounds.set(key, rec);
    try { sessionStorage.setItem(SENT, JSON.stringify([...sentRounds])); } catch {}
  };
  // the last won round not on the chain yet (PENDING): offered again on a card of its own once the
  // win card is gone, on any screen and after a reload, until saved, forgotten or too late;
  // pendingRec: how its save goes, for that round only (round: its key)
  const [pending, setPending] = useState<SaveOf | null>(null);
  const [pendingRec, setPendingRec] = useState<{ round: string; rec: Rec } | null>(null);
  const pendingNow = useRef<SaveOf | null>(null);
  pendingNow.current = pending;
  const keepPending = (r: SaveOf | null) => {
    setPending(r);
    try { if (r) sessionStorage.setItem(PENDING, JSON.stringify(r)); else sessionStorage.removeItem(PENDING); } catch {}
  };
  const chainUp = !!(s || game.current);
  useEffect(() => {
    // read once the chain is here: only a round in the shape a save sends, and not over
    const c = game.current && game.current.chain;
    if (!c) return;
    let raw: unknown = null;
    try { raw = JSON.parse(sessionStorage.getItem(PENDING) || "null"); } catch {}
    const kept = pendingOf(raw);
    if (!kept) return void (raw && keepPending(null));
    void c.sync().catch(() => {}).then(() => {
      if (kept.period != null && c.now() >= saveBy(kept.period)) return keepPending(null);
      setPending(kept);
      track("pending_restored", { hole: kept.id, strokes: kept.strokes, left_s: kept.period == null ? null : Math.round((saveBy(kept.period) - c.now()) / 1000) });
    });
  }, [chainUp]);
  // the shot's clip once made (ShareClip), for the share buttons to send
  const [clip, setClip] = useState<Clip | null>(null);
  // and the place the round took, once saved
  const savedPlace = useSavedPlace(s, game.current && game.current.chain, me, (s && s.roundMode) || aim, onChain);

  const play = (direct = false) => {
    setScreen("play");
    if (!game.current) return;
    game.current.play(direct);
    // after the overview has had its moment and the camera is on the gnome
    if (cfg && cfg.demo) later(() => void (game.current && game.current.demo(cfg.demo.split(";"))), 2600);
  };
  const choose = (id: string) => {
    setGnome(id);
    // a locked one is only being looked at: it is not saved and not played
    if (!unlocked(id)) return;
    // a gnome of the collection is this account's pick, kept in this browser (free, nothing on chain);
    // one of the game's is the browser's too
    if (!GNOMES.some((g) => g.id === id)) {
      if (account) pick(account.address, id);
    } else (saveGnome(id), SHOP && account && pick(account.address, id));
    game.current && game.current.setGnome(id);
  };
  // the picker left on a locked gnome (its Back, Escape, the browser's Back): back to the one really chosen
  useEffect(() => {
    if (screen !== "pick" && !unlocked(gnome)) setGnome(savedGnome());
  }, [screen, gnome]); // eslint-disable-line react-hooks/exhaustive-deps -- as either turns

  useEffect(() => {
    if (!cfg || !canvas.current) return;
    const el = canvas.current;
    // a dev remount destroys this game while it is still starting: it must
    // not then drive the live one
    let cancelled = false, g: Game | null = null;
    const make = (promo?: GameOptions["promo"], probes?: GameOptions["probes"], dress?: { skinOfTraits: typeof skinOfTraits } | null) => {
      try {
        if (cfg.rivalTraits && dress) setRivalGnome(dress.skinOfTraits(cfg.rivalTraits, { id: "rival-traits", name: "", line: "" }));
        const traits = cfg.traits && dress ? dress.skinOfTraits(cfg.traits, { id: "traits", name: "", line: "" }) : null;
        if (traits) knowGnome(traits);
        g = createGame(el, {
        rpc: cfg.rpc, web: cfg.web, gnome: traits ? traits.id : gnome, world: cfg.world, weather: cfg.weather, aimMode: aim, camMode: savedCam(), gfx, promo, probes, log: logs,
        // the hot fields to their store; the rest re-renders only when it changed
        // (compared here, not in a setS updater: an updater that returns the
        // same state still re-renders the whole page, 60 times a second in a pull)
        onChange: (snap: Snapshot) => {
          hot.current!.set(snap);
          if (!cold.current || !sameCold(cold.current, snap)) setS((cold.current = snap));
        },
        onHoled: ({ id, strokes }: { id: string; strokes: number }) => holedRef.current(id, strokes),
        // (the account connected: a community hole of theirs plays before they hold a best on it)
        self: () => selfRef.current,
        });
      } catch (err) {
        // no WebGL here (hardware acceleration off, a blocklisted GPU, Lockdown Mode)
        console.error(err);
        setFatal({ msg: messageOf(err), kind: "webgl" });
        return;
      }
      const game_ = (game.current = g);
      readOwner(game_.chain).catch(() => {});
      // ?camlog: the game within reach of the camera probe (a test hook)
      if (logs) window.__g = game_;

      game_.start(cfg.hole || (cfg.cup ? { cup: cfg.cup, n: cfg.place } : null))
        .then((to) => {
          if (cancelled) return;
          if (cfg.play) play();
          else if (cfg.screen === "shop") {
            // landed on the shop (its link, a reload): the menu under it in the history, the browser's Back goes there as the shop's does
            const here = window.location.pathname + window.location.search;
            window.history.replaceState({ screen: "modes" }, "", menuLink(String(chainQuery())));
            window.history.pushState({ screen: "shop" }, "", here);
            setShopView(cfg.shop);
            setScreen("shop");
          }
          else if (cfg.screen && cfg.screen !== "pick" && !dare) {
            const go = cfg.screen;
            setScreen((now) => (now === opened.current ? go : now));
          }
          else if (cfg.hole || cfg.cup) {
            // a shared link: straight to that hole (a first-time player picks a
            // gnome first), a cup's from its first, on the picker; a link to
            // nothing lands on the cups, quietly
            if (!to || to === "taken" || to === "unchecked" || to === "unheld") {
              setScreen("worlds");
              if (to === "taken") setRestoreNote("This hole was taken down."); // (nothing of it shown: no name, no note, no author)
              if (to === "unchecked") setRestoreNote(NOT_BUILDER); // (a community hole the Builder's rules do not pass: nothing of it shown either)
              if (to === "unheld") (setRestoreNote(NOT_HOLED), (unheldLink.current = typeof cfg.hole === "string" ? cfg.hole : "")); // (one its author has not holed yet: it opens once they have; to them, once their account is known)
            }
            // straight onto the ball: the link said where (a dare stops at the picker: who, what to beat, Play solo;
            // so does the picker's own address)
            else if (to === "hole" && (cfg.gnome || hadGnome()) && !dare && cfg.screen !== "pick") play(true);
            else setScreen("pick");
          }
          // ?won=N shows the win card for N strokes — dev screenshots only
          if (DEV && cfg.won) later(() => game_.fakeWin?.(cfg.won), 400);
          // ?shot=angle,power fires one on load — for screenshots and smoke tests
          if (cfg.shot) {
            const [a, p] = cfg.shot.split(",").map(Number);
            later(() => void game_.shoot(a, p), 300);
          }
        })
        .catch((err: unknown) => !cancelled && setFatal({ msg: messageOf(err), kind: fatalKind(err) }));
    };
    // The trailer's rig (?promo, which patches the page's clock: loaded before
    // the game's first frame) and the test hooks (?camlog, a dev ?won) are
    // modules of their own, fetched only for a page that asks for them.
    const logs = camlog();
    const wantPromo = /[?&]promo/.test(window.location.search) && (DEV || logs), wantProbes = logs || (DEV && cfg.won > 0);
    const wantWardrobe = SHOP && !!(cfg.traits || cfg.rivalTraits); // (a collection gnome to draw: its wardrobe and the shop's part first)
    // on the title, the hole behind it is built in the first idle moment (1.2 s
    // at most): built at once with the title's own scene, a phone's first
    // frames stall on both
    let unidle = () => {};
    if (!wantPromo && !wantProbes && !wantWardrobe) {
      if (screen !== "title" || typeof requestIdleCallback === "undefined") make();
      else {
        const id = requestIdleCallback(() => !cancelled && make(), { timeout: 1200 });
        unidle = () => cancelIdleCallback(id);
      }
    } else
      void Promise.all([wantPromo ? import("@/lib/promo").then((m) => m.promo) : undefined, wantProbes ? import("@/lib/engine/probes").then((m) => m.probes) : undefined, wantWardrobe ? loadWardrobe().catch(() => undefined) /* (not fetched: drawn plain) */ : undefined, wantWardrobe ? shopPart()?.catch(() => null) /* (not fetched: drawn as the game's own) */ : undefined])
        .then(([promo, probes, , dress]) => !cancelled && make(promo, probes, dress))
        .catch((err: unknown) => !cancelled && setFatal({ msg: messageOf(err), kind: fatalKind(err) }));

    return () => {
      cancelled = true;
      unidle();
      if (!g) return;
      g.destroy();
      if (window.__g === g) delete window.__g;
    };
    // the game is made once per config (and per retry); gnome and play are read at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, boot]);

  // The WebGL context can be taken away (a phone backgrounding the tab, the
  // GPU reset): say so, and offer a reload if it does not come back within
  // 3 s. When it does, three uploads the scene again by itself: the round
  // in progress stays where it was.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const lost = (e: Event) => {
      e.preventDefault(); // tells the browser a restore is wanted
      setGl("lost");
      t = setTimeout(() => setGl((v) => (v === "lost" ? "gone" : v)), 3000);
    };
    const back = () => (clearTimeout(t), setGl(null));
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", back);
    return () => (clearTimeout(t), el.removeEventListener("webglcontextlost", lost), el.removeEventListener("webglcontextrestored", back));
  }, [cfg]);

  // a new hole, or a restart, is a new round: nothing of it is recorded yet,
  // and an answer for the previous round must not land on it
  const roundKey = useRef("");
  useEffect(() => {
    roundKey.current = s && s.id ? roundOf({ ...s, id: s.id }) : "";
  });
  useEffect(() => setRecord(null), [holeId, fresh0]);
  // a round begun (a new hole, Play again): what the round before earned goes,
  // its cup complete and its badges (not on its first stroke: the hole may be
  // won, and earn them, before that stroke's snapshot lands)
  useEffect(() => {
    if (fresh0) (setCupWon(null), setFreshBadges([]));
  }, [holeId, fresh0]);

  useEffect(() => {
    let live = true;
    if (holeId && game.current && !chainId) void within(game.current.chain.chainId()).then((n) => live && setChainId(n)).catch(() => {});
    return () => void (live = false);
  }, [holeId, chainId]);

  // a save's state is its account's: another account starts afresh, and the won round and the
  // kept one show how their save went for this one (sent before a reload: only read again,
  // "Check again"; an account gone a moment, Adena locked, finds its saved round saved)
  useEffect(() => {
    const c = game.current && game.current.chain;
    setRecord((me && c && s && s.holed && s.id && sentRounds.get(sentKey(c, me, { ...s, id: s.id }))) || null);
    // (on the account only: the round's own changes reset it where it starts, holeId and fresh0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);
  const pendingRound = pending ? roundOf(pending) : "";
  useEffect(() => {
    const c = game.current && game.current.chain;
    const was = me && c && pending ? sentRounds.get(sentKey(c, me, pending)) : undefined;
    setPendingRec(was ? { round: pendingRound, rec: was } : null);
    // (pending by its key: the same round kept again changes nothing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, pendingRound]);
  // the duel: a dare link's rival, or one picked on a board, their ghost raced hole by hole
  const { dare, solo, linkDare, dareNote, dareHole, rivalBests, duelHole, cupsScreen, rivalName, duel, racing, sky, theyWon, raceWith, toGhosts, dropDuel, rivalKind, movedGhosts, setSaves } =
    useDuel({ game, s, holeId, holeReady, fresh0, me, aim, allList, setLinkNote, setBoard, setScreen });
  // whose ghost is raced, under the cups' title and the community's
  const racingNote = dare && !solo && <p className="dare">Racing {rivalName}</p>;

  // an "add me as a friend" link: the address joins this browser's friends
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("friend");
    if (f && isAddress(f)) {
      addFriend(f);
      const p = new URLSearchParams(window.location.search);
      p.delete("friend");
      window.history.replaceState(window.history.state, "", window.location.pathname + (String(p) ? `?${p}` : ""));
    }
  }, []);

  // a player Adena already knows is shown as such from the start, and follows
  // the account picked in Adena
  useEffect(() => {
    // unless the player disconnected this page: that holds until they connect again
    const off = () => { try { return localStorage.getItem("gnogolf.adenaOff") === "1"; } catch { return false; } };
    // (the same account, on the same chain, kept as it is: a new object would read it all again)
    const keep = (a: Account | null) => setAccount((p) => (p && a && p.address === a.address && p.chainId === a.chainId ? p : a));
    const look = () => void (!off() && current().then((a) => a && keep(a)));
    look();
    // once a session: whether this browser has Adena, and whether it knows the player
    if (once("wallet")) void (off() ? Promise.resolve(null) : current()).then((a) => track("wallet", { adena: hasAdena(), connected: !!a }));
    // (and again back on the page: Adena connected from its own window says nothing)
    addEventListener("focus", look);
    const stop = onWalletChange(() => void (!off() && current().then(keep)));
    return () => (removeEventListener("focus", look), stop());
  }, []);

  // the gnome shop as these screens hold it: its sale, what the player holds and wears, its screen's view and way back
  const { region, shopOn, held, worn, shopView, setShopView, shopFrom, promo, promoNow, shopSkin, shopBits, readWorn, openShop } =
    useShop({ game, screen, setScreen, playing, holedNow, account, gnome, setGnome, unlockedRef, dare, chainUp });

  // Adena has no revoke from a page: disconnecting forgets the account here,
  // and the page stops picking it up again on its own
  function disconnectWallet() {
    try { localStorage.setItem("gnogolf.adenaOff", "1"); } catch {}
    setAccount(null);
    setRecord(null);
    setFunds(null);
    setWallet({ busy: false, error: null, note: "Disconnected from this page." });
  }

  async function connectWallet() {
    try { localStorage.removeItem("gnogolf.adenaOff"); } catch {}
    setWallet({ busy: true, error: null });
    track("wallet_connect", { stage: "asked" });
    try {
      const chain = game.current!.chain;
      setAccount(await connect({ chainId: await within(chain.chainId()), rpc: chain.rpc }));
      setWallet({ busy: false, error: null });
      track("wallet_connect", { stage: "ok" });
    } catch (err) {
      setWallet({ busy: false, error: messageOf(err) });
      track("wallet_connect", { stage: "refused", reason: failure(err) });
    }
  }

  // the save of the round on offer (the won one, else the kept one): what it costs, what stands in its way, and the save itself
  const { gasPrice, funds, setFunds, ourNode, slowSign, bestAsked, ghostHere, toSave, saveId, saveMode, askName, typed, saveName, nameReady, mainnet, moot, costNow, phoneOnly, pushSave, rankAt, lackNow, block, savePending, keptSave, recordIt, gnokeySaved } =
    useSave({
      game, cfg, s, holedNow, allList, chainId, chainUp, account, me, record, setRecord, roundKey, canSave, pending, pendingNow, keepPending, setPendingRec, saving, sentRounds, markSent,
      nudge, nameStem, setNameStem, setNamedAs, award, setOnChainCard, setReal, movedGhosts, setSaves,
    });

  // a gnome just unlocked, met on the picker's stage (the cup's card, if open, goes)
  const meet = (id: string) => (setCupWon(null), choose(id), setScreen("pick"));
  // a hole picked (a community one, a ghost's): on to the gnome
  const openHole = (id: string) => {
    if (game.current) void game.current.load(id);
    setScreen("pick");
  };
  // into a cup: from its next hole to play (its card says which), a cup not begun or won from its
  // first (engine setWorld); then the gnome, the last one played already picked
  const enterCup = (w: string) => {
    // a duel: the cup's first hole with their ghost
    const first = duelHole ? allList.find((h) => cupOf(h) === w && duelHole(h)) : cups[guessCup(w)].done > 0 ? toPlay[guessCup(w)][0] : undefined;
    if (game.current) void (first ? game.current.load(first.id) : game.current.setWorld(w));
    setScreen("pick");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // an open dialog hears Escape first and keeps it (useDialog); with none
      // open, a screen goes back to the one before it (the shop: the screen it was opened from)
      if (e.key !== "Escape") return;
      setScreen((sc) => (sc === "pick" ? cupsScreen : sc === "shop" ? shopFrom.current : (BACK as Partial<Record<Screen, Screen>>)[sc] || sc));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cupsScreen, shopFrom]);
  // a screen in another's place (the button pressed went with the old one): the focus on its title, so a reader says
  // where it is and Tab goes on from there (a link's screen too, in its loader's place); not the page's first screen,
  // nor when something kept the focus
  const screenWas = useRef(screen);
  useEffect(() => {
    if (screenWas.current === screen) return;
    screenWas.current = screen;
    if (document.activeElement && document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>(".screen :is(.worlds__title, .pick__name)")?.focus({ preventScroll: true });
  }, [screen]);

  // the new hole is on screen, built and its shaders ready: open the curtain
  // a hole that would not load or draw: the curtain goes, so its banner (Try again, Pick a hole) is seen
  const errorNow = !!(s && s.error);
  useEffect(() => {
    if (errorNow) setCurtain(null);
  }, [errorNow]);
  useEffect(() => {
    if (!curtain || curtain.open || holeId !== curtain.id || !holeReady) return;
    const t = setTimeout(() => setCurtain((c) => c && { ...c, open: true }), 250);
    return () => clearTimeout(t);
  }, [holeId, holeReady, curtain]);
  // open, it goes once its opening has played (a new one shut meanwhile stays)
  const curtainOpen = !!(curtain && curtain.open);
  useEffect(() => {
    if (!curtainOpen) return;
    const t = setTimeout(() => setCurtain((c) => (c && c.open ? null : c)), 750);
    return () => clearTimeout(t);
  }, [curtainOpen]);

  const holed = s && s.holed;
  // behind the gnome the pull is a joystick (engine.ts steer): the hints say how
  const third = !!s && s.cam === "third";
  // a duel's result, once the hole is won
  const won = racing && s && s.holed ? { ...duelResult(s.strokes, racing, golfTerm(s.strokes, parHere(s))), duel: racing } : null;
  // a duel lost, or tied where it could have been won (not an ace), pushes to the rematch
  const rematch = !!won && (won.result === "loss" || (won.result === "tie" && won.duel.ghost.strokes > 1));
  // a best of the player's on the chain here: their share is a dare (a friend races their ghost)
  const daring = !!account && (onChain || ghostHere);
  // the hole-finished card, said once a finish (not again back from the cups): the action it pushes as it shows
  const finishSaid = useRef(false);
  useEffect(() => {
    if (!holed) return void (finishSaid.current = false);
    if (!playing || finishSaid.current || (account && saveId && bestAsked !== `${saveId}#${saveMode}`)) return; // (the player's best asked first: it decides what the card pushes)
    finishSaid.current = true;
    track("finished_shown", { primary: pushSave ? "save" : rematch ? "rematch" : cupWon && s && cupWon.id === s.id ? "cup" : "next", can_save: canSave, phone_only: phoneOnly, duel: !!won });
  }, [holed, playing, bestAsked]); // eslint-disable-line react-hooks/exhaustive-deps -- as it shows
  const nextAfter = cupWon && s ? nextCup(cupWon.cup, s.worlds) : ""; // the cup after the one just complete
  // the hole a link opened, named over the gnomes (from the cups, the player knows where they go)
  const linked = s && s.linked && s.id && s.name ? `${s.place ? `Hole ${holeNumber(s.holes, s.id)} · ` : ""}${s.name}` : "";
  // the hole on screen, as the address bar and the events name it; the bar follows the screen, Back and Forward bring one back
  const place = s && s.place, world = s && s.world, idHere = s && s.id;
  useAddress({ game, cfg, screen, setScreen, place, world, idHere, gnome, dare, solo, shopView, setShopView, setMenu, goToRef });
  // the stroke's weather (the engine's: ?weather= fakes it there, for screenshots)
  const wx = s && s.weather;

  // a finished hole goes on the card the moment the chain holes it — even if
  // the player restarts before the banner — and a gnome may unlock with it
  holedRef.current = (id: string, strokes: number) => {
    const list = (s && s.allHoles) || [];
    const key = cardKey(list.find((h) => h.id === id) || { id }), had = loadCard();
    const before = cupTotals(had, list);
    const next = recordScore(key, strokes);
    register({ card_holes: cardHoles(Object.keys(next).length) }); // (before the finish's own events)
    const after = cupTotals(next, list);
    setCard(next);
    setFresh(GNOMES.filter((gn) => gn.unlock && !UNLOCKS[gn.unlock].ok(before) && UNLOCKS[gn.unlock].ok(after)));
    // the cup complete now and not before, or again in fewer strokes than the card had
    const h = list.find((x) => x.id === id), cup = h && WORLDS.find((w) => w.id === cupOf(h))?.id;
    const b = cup && before[cup], a = cup && after[cup];
    // (not in a duel: a race on one hole, never a cup's end)
    if (!(dare && !solo) && cup && b && a && a.all && (!b.all || a.strokes < b.strokes)) setCupWon({ cup, id, best: b.all }), track("cup_complete", { cup, strokes: a.strokes, vs_par: a.strokes - a.par, best: b.all });
    track("hole_finished", { ...playOf(id), strokes, par: parOf(h), place: (s && s.id === id && s.place) || 0, first: had[key] == null });
    if (racing) track("duel_result", { rival: rivalKind(), result: duelResult(strokes, racing, "").result, strokes, ghost: racing.ghost.strokes });
    // a course hole's badges (a community hole's would be too easy to farm)
    setFreshBadges([]);
    if (s && s.official && h) {
      seeWeather(s.kind);
      const duel = racing && { result: duelResult(strokes, racing, "").result, theirs: racing.ghost.strokes, self: racing.self, mixed: racing.ghost.mode !== (s.roundMode || aim) };
      award(badgesFor({ strokes, par: parOf(h), pro: (s.roundMode || aim) === "pro", kind: s.kind, timed: s.timed, cups: after, weathers: weathersSeen(), duel }, badgesEarned()), id);
    }
  };
  // analytics (nothing goes without its key)
  // a round as analytics says it: the hole, its cup, solo or a duel, the aim
  const playOf = (id: string): Play => ({ hole: id, cup: cupOf(allList.find((h) => h.id === id) || {}), mode: racing ? "duel" : "solo", aim: (s && s.roundMode) || aim });
  // what is said with every event: the player's choices, the wallet, the chain, the hole played
  const camNow = s && s.cam;
  // this browser's own play, coarsely: how much of the card, and whether a save of it is on the chain
  const holesNow = cardHoles(Object.keys(card).length), savedAny = Object.keys(onChainCard).length > 0;
  useEffect(() => register({ card_holes: holesNow, saved_any: savedAny }), [holesNow, savedAny]);
  useEffect(() => {
    register({ aim, cam: camNow, gnome: gnomeWord(gnome), adena: hasAdena(), connected: !!account, wallet_on_node: ourNode, chain: chainId, network: cfg ? networkOf(cfg.rpc) : null, hole: playing ? holeId : null, cup: playing ? world : null });
  }, [aim, camNow, gnome, account, ourNode, chainId, cfg, playing, holeId, world]);
  // the screen in view, the ones the address bar does not follow (the sheets, the cards) included
  const view = feedbackOpen ? "feedback" : support ? "support" : rules ? "rules" : about ? "about" : board ? "boards" : badgesOpen ? "badges" : cardOpen ? "card" : real ? "wallet" : cupWon && cupWon.open ? "victory" : playing && holed ? "finished" : screen;
  useEffect(() => (register({ screen: view }), track("screen", { name: view })), [view]);
  // how long the page took: to the title's Start (the game made), to the first hole drawn
  const shown = useRef({ title: 0, hole: 0 });
  useEffect(() => {
    const t = shown.current;
    if (s && !t.title) t.title = performance.now();
    if (holeReady && !t.hole) (t.hole = performance.now()), track("boot", { title_ms: Math.round(t.title), hole_ms: Math.round(t.hole) });
  }, [!!s, holeReady]); // eslint-disable-line react-hooks/exhaustive-deps -- once each
  // a round begun: the hole on screen, ready, no stroke yet (once, until a stroke is played)
  const begun = useRef("");
  useEffect(() => {
    if (!s || !holeId) return;
    if (!fresh0) return void (begun.current = "");
    if (!playing || !holeReady || begun.current === holeId) return;
    begun.current = holeId;
    track("hole_started", { ...playOf(holeId), weather: s.kind || "clear", period: s.period });
  }, [holeId, fresh0, playing, holeReady]); // eslint-disable-line react-hooks/exhaustive-deps -- as it turns
  // a round under way (strokes, not holed) left for a new one or another hole: abandoned
  const underway = useRef<Events["hole_abandoned"] | null>(null);
  useEffect(() => {
    const was = underway.current;
    underway.current = s && s.id && s.strokes && !s.done ? { ...playOf(s.id), strokes: s.strokes } : null;
    if (was && !(s && s.done) && (!underway.current || underway.current.hole !== was.hole)) track("hole_abandoned", was);
  });
  useEffect(() => {
    // (once a round: a page kept in the back-forward cache and left again is the same round)
    const left = () => underway.current && (trackLeaving("hole_abandoned", { ...underway.current, why: "left" }), (underway.current = null));
    addEventListener("pagehide", left);
    return () => removeEventListener("pagehide", left);
  }, []);
  // a duel armed: who, and the best to beat
  const racingGhost = racing && racing.ghost;
  useEffect(() => {
    if (racing && holeId) track("duel_started", { hole: holeId, cup: playOf(holeId).cup, rival: rivalKind(), ghost: racing.ghost.strokes, mixed: racing.ghost.mode !== ((s && s.roundMode) || aim) });
  }, [racingGhost]); // eslint-disable-line react-hooks/exhaustive-deps -- once a ghost
  // the game could not start, or a hole would not load
  useEffect(() => void (fatal && trackError("fatal", fatal.msg, { kind: fatal.kind })), [fatal]);

  // the chain's own badges: a round on it, and first place on a hole's board
  useEffect(() => {
    if (savedPlace && savedPlace.rank === 1) award(["first"], savedPlace.id);
  }, [savedPlace]);

  return (
    <>
      <div className={`sky sky--${(playing && s && s.time) || "day"} sky--w-${(playing && s && s.look) || "garden"}`} aria-hidden="true">
        <div className="stars" />
        <div className="sun" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`cloud cloud--${i}`} />
        ))}
      </div>

      <canvas ref={canvas} id="stage" />
      {/* rain and storm darken and wet the whole scene a little */}
      {playing && wx && (wx.rain || wx.storm) && <div className={"wet" + (wx.storm ? " wet--storm" : "")} aria-hidden="true" />}

      {screen === "title" && <Title loading={!s} world={s ? s.world : undefined} gnome={SHOP ? gnomeById(gnome) : undefined} onStart={() => (setScreen(dare && !solo && dare === linkDare.current ? "ghosts" : "modes"), (linkDare.current = ""))} onAbout={() => setAbout(true)} />}
      {screen === "modes" && (
        <Modes gnome={gnome} counts={s ? s.worlds : undefined} onBack={() => setScreen(BACK.modes)} onAbout={() => setAbout(true)}
          onSolo={() => (dropDuel(null), setScreen("worlds"))} onDuel={() => setScreen("rival")}
          onBuild={builderOn() ? () => router.push(buildLink(endpoints(window.location.search).keep)) : undefined}
          shop={shopOn ? { skin: shopSkin, line: shopBits ? shopBits.shopLine(promo) : SHOP_LINE, onOpen: () => openShop() } : undefined} />
      )}
      {screen === "rival" && s && (
        <Rival s={s} chain={game.current && game.current.chain} me={me} mode={aim} gnome={gnome} onBack={() => setScreen(BACK.rival)} onAbout={() => setAbout(true)}
          onPick={toGhosts} onBoard={() => setBoard(true)} onConnect={account ? undefined : () => (hasAdena() ? void connectWallet() : setReal("rival"))} />
      )}
      {screen === "ghosts" && (
        <Ghosts holes={allList} name={rivalName} player={dare} chain={game.current && game.current.chain} bests={rivalBests} card={card} mode={aim} onRace={openHole}
          onCups={() => setScreen("worlds")} onBack={() => setScreen(BACK.ghosts)} onAbout={() => setAbout(true)} />
      )}

      {screen === "worlds" && s && (
        <Worlds
          counts={s.worlds}
          stats={cups}
          onResetAll={newGame}
          onReset={(w) => setCard(clearCup(allList.filter((h) => cupOf(h) === w).map(cardKey)))}
          onRestore={restoreAsked} restoring={restoreBusy}
          current={s.world}
          onBack={() => setScreen(BACK.worlds)}
          onAbout={() => setAbout(true)}
          community={s.community}
          racing={racingNote}
          next={(c) => toPlay[c][0]?.name}
          podium={<Podium chain={game.current && game.current.chain} me={me} mode={aim} gnome={gnome} onOpen={() => setBoard(true)}
            holes={toPlay[guessCup(s.world || "")].slice(0, 6)} onRace={(p, id) => (raceWith(p), openHole(id))}
            extra={<>
              <button className="linkish" onClick={() => (sound("blip"), setBadgesOpen(true))}>Badges {badgesEarned().length}/{BADGES.length} →</button>
              {shopOn && <button className="linkish" onClick={() => (sound("blip"), openShop())}>Gnomes →</button>}
            </>} />}
          onCommunity={() => setScreen("community")}
          onPick={enterCup}
        />
      )}
      {screen === "community" && s && (
        <Community community={s.community} chain={game.current && game.current.chain} me={me} onPlay={openHole}
          onBack={() => setScreen(BACK.community)} onAbout={() => setAbout(true)} racing={racingNote} />
      )}
      {screen === "pick" && <Picker world={(s && s.world) || "garden"} backLabel={cupsScreen === "ghosts" ? "Back to their ghosts" : undefined} hole={linked} dare={duel ? <DuelNote duel={duel} mode={aim} sky={sky} onDrop={() => dropDuel("Solo now. Your strokes still count.")} mark={<Collector chain={game.current?.chain} player={dare} />} /> : !dareHole || dareHole === holeId ? dareNote : ""} aim={aim} onAim={setAim} gnome={gnome} onChange={choose} onPick={play} unlocked={unlocked} chosen={savedGnome()}
        onPlayAs={(id) => (setGnome(id), play())}
        owned={(() => {
          // the collection under the picker's tile (in a region the shop is offered in): the player's own gnomes first, else the sale
          const row = SHOP && account && held.length > 0 && game.current ? (
            <Owned chain={game.current.chain} me={account.address} held={held} worn={worn} playing={gnome} onPick={choose} region={region === true} onWorn={readWorn}
              name={(id) => held.find((g) => `t${g.id}` === id)?.name || gnomeById(id).name} />
          ) : null;
          return shopOn ? <CollectionSection promo={promo} owned={row} onOpen={() => openShop()} /> : row;
        })()}
        onAbout={() => setAbout(true)}
        onBack={() => (sound("blip"), setScreen(cupsScreen))} />}

      {SHOP && screen === "shop" && game.current && (
        <Shop chain={game.current.chain} account={account} wallet={wallet} onConnect={() => void connectWallet()} view={shopView} onView={setShopView}
          onBack={() => (sound("blip"), setScreen(shopFrom.current))} onAbout={() => setAbout(true)} playing={gnome}
          onPlay={(id) => (choose(id), readWorn())} onRace={(p) => toGhosts(p, undefined, "board")}
          onRound={(cup) => { sound("blip"); const w = cup || (s && s.world); if (w) enterCup(w); else setScreen("worlds"); }} />
      )}

      {s && playing && (
        <>
          <header className="hud hud--top">
            <div className="card card--hole">
              <ModeTag kind={dare && !solo ? "duel" : "solo"} />
              <span className="card__num">
                {holeNumber(s.holes, s.id)}
              </span>
              <div className="card__text">
                <span className="eyebrow">
                  {!s.official ? "Community hole · not ranked" : s.archived || !s.place ? "Archived hole · not in the cup" : <>Hole {s.place} of {s.holes.length}</>}
                </span>
                <h2 className="card__name">{s.name}</h2>
                <a className="src" href={s.source} target="_blank" rel="noopener noreferrer">
                  read its code ↗
                </a>
                {!s.official && s.id && (
                  <a className="src" href={reportHole(s.id)} target="_blank" rel="noopener noreferrer">
                    report it ↗
                  </a>
                )}
              </div>
            </div>
            {/* in a duel: a row each (the player's first; theirs played so far, of the total to beat), what is left, and a tap to look at their ball (again: back to yours) */}
            {racing ? (
              <button className={"card card--score card--duel" + (s.rivalPeek ? " card--peek" : "")} aria-pressed={s.rivalPeek} onClick={() => game.current?.peekRival(!s.rivalPeek)}
                title={s.rivalPeek ? "Back to your ball" : "See where their ball is"}>
                <span className="duel__row" aria-live="polite" aria-atomic="true">
                  <span className="eyebrow">You</span><strong>{s.strokes}</strong>
                </span>
                <span className="duel__row">
                  <span className="eyebrow">{racing.self ? "Your best" : <><Collector chain={game.current?.chain} player={dare} />{racing.name}</>}</span><strong>{s.rival ?? 0}<small> / {racing.ghost.strokes}</small></strong>
                </span>
                <span className="card__par">
                  {s.done && !s.flying ? { win: racing.self ? "You beat your best" : "You won", tie: "Tie", loss: racing.self ? "Your best won" : "They won" }[duelResult(s.strokes, racing, "").result] : theyWon ? (racing.self ? "Your best won" : "They won") : raceLeft(s.strokes + 1, racing.ghost.strokes)}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6" /></svg>
                </span>
                {assisted}
              </button>
            ) : (
              <div className="card card--score" aria-live="polite" aria-atomic="true">
                <span className="eyebrow">Strokes</span>
                <strong>{s.strokes}</strong>
                <span className="card__par">par {parHere(s)}{last ? ` · last ${last}` : ""}</span>
                {assisted}
              </div>
            )}
            <LiveWeather hot={hot.current} w={wx ?? null} night={s.time === "night"} world={s.look} dark={darkGallery({ hole: s.id || "" })} until={s.period != null ? (s.period + 1) * RULES.periodMs - skewOf(game.current && game.current.chain) : null} />
            <div className="hud__right">
              <span className="adena__wrap">
              <button
                className={"adena" + (account ? " adena--on" : "")}
                onClick={() => setReal("hud")}
                aria-label={account ? `Saving on-chain as ${account.address}` : "Save on-chain with Adena"}
                // why a wallet, for the one who never opens the sheet: playing is free, keeping is on-chain
                title={account ? undefined : "Playing is free. Adena keeps your score on gno.land: public, replayed by the chain, on the boards."}
              >
                <img className="adena__logo" src="adena.svg" alt="" width="34" height="34" />
                <span className="adena__text">
                  <small>{account ? "Adena · connected" : "Adena"}</small>
                  <b>{account ? shortAddr(account.address, 4, 3) : "Save on-chain"}</b>
                </span>
              </button>
              {account && (
                <button className="adena__off" aria-label="Disconnect Adena" title="Disconnect" onClick={disconnectWallet}>
                  <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                </button>
              )}
              </span>
              <button className="burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(true)}>
                <span /><span /><span />
              </button>
            </div>
          </header>

          {s.timed && (
            <div className="timed" role="note">
              ↻ This hole changes with every stroke — watch it before you shoot
            </div>
          )}

          {menu && (
            <div className="drawer" onClick={() => setMenu(false)}>
              <Dialog as="aside" onClose={() => setMenu(false)} className="drawer__panel" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
                <div className="drawer__head">
                  {(() => {
                    // the cup being played; tapping it goes to the cups (their ghosts in a duel)
                    const cup = worldOf(s.world);
                    const [first, ...rest] = cup.name.split(" ");
                    return (
                      <button className="drawer__cup" aria-label={`${cup.name} — change cup`} onClick={() => { sound("blip"); setMenu(false); setScreen(cupsScreen); }}>
                        <Emblem id={cup.id} />
                        <h2>{first}<br />{rest.join(" ")}</h2>
                      </button>
                    );
                  })()}
                  <div className="drawer__tools">
                    <button className="round round--icon round--small" aria-label="About Gnogolf" title="About" onClick={() => { setMenu(false); setAbout(true); }}>
                      <InfoIcon />
                    </button>
                    <SheetClose onClose={() => setMenu(false)} inline />
                  </div>
                </div>
                <section className="drawer__me">
                  <div className="me__stats">
                    <div><strong>{tot.done}/{s.holes.length}</strong><span>holes</span></div>
                    <div><strong>{tot.strokes || <Nil />}</strong><span>strokes</span></div>
                    <div>
                      <strong>{tot.done ? vsPar(tot.strokes - tot.par) : <Nil />}</strong>
                      <span>vs par</span>
                    </div>
                  </div>
                  {/* the cup's card wide on top, the rest under it */}
                  <div className="me__row">
                    <Button variant="primary" onClick={() => { setMenu(false); setCardOpen(true); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.card}</svg>Cup overview</Button>
                    <Button variant="secondary" aria-label="Change mode: solo or duel" onClick={() => { setMenu(false); setScreen("modes"); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.mode}</svg>Mode</Button>
                    <Button variant="secondary" onClick={() => { setMenu(false); setScreen(cupsScreen); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.cups}</svg>All cups</Button>
                    <Button variant="secondary" aria-label="Change gnome" onClick={() => { setMenu(false); setScreen("pick"); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.gnome}</svg>Gnome</Button>
                  </div>
                  {/* a community hole: reported as an issue on the repository (the site can take it down: takedown.ts) */}
                  {!s.official && s.id && <a className="src drawer__report" href={reportHole(s.id)} target="_blank" rel="noopener noreferrer">Report this hole ↗</a>}
                </section>
                <section className="drawer__settings" aria-label="Settings">
                  <span className="eyebrow">Settings</span>
                  <AimSetting aim={aim} onChange={setAim} />
                  <div className="aimset">
                    <span className="aimset__label">Graphics</span>
                    <Segmented label="Graphics" value={gfx} full options={[["auto", "Auto"], ["high", "High"], ["low", "Low"]]} onChange={(m) => (sound("blip"), setGfx(m))} />
                  </div>
                  {([["sound", "Sound"], ["vibe", "Vibration"]] as const).map(([k, label]) => (
                    <Toggle key={k} label={label} checked={prefs[k]} onChange={() => toggle(k)} />
                  ))}
                </section>
                <nav className="drawer__list">
                  {s.holes.map((h) => (
                    <button
                      key={h.id}
                      className="tile"
                      aria-current={h.id === s.id}
                      disabled={!!duelHole && !duelHole(h)} // (a duel: no ghost there)
                      onClick={() => {
                        setMenu(false);
                        goTo(h.id);
                      }}
                    >
                      <span className="tile__num">{holeNumber(s.holes, h.id)}</span>
                      <span className="tile__name">{h.name}</span>
                      <span className="tile__best">
                        {scoreOf(card, h) ? <b>{scoreOf(card, h)}</b> : "–"} / par {parOf(h)}
                      </span>
                    </button>
                  ))}
                </nav>
                {/* last, out of the way: clearing the card, and filling it back from the chain */}
                <div className="drawer__settings">
                  {restoreAsked && (
                    <Button className="btn--wide" disabled={restoreBusy} aria-busy={restoreBusy} onClick={restoreAsked}>
                      {restoreBusy ? "Reading the chain…" : "Get my saved holes back"}
                    </Button>
                  )}
                  <Button
                    className={"btn--wipe" + (wipe ? " btn--danger" : "")}
                    onClick={() => {
                      if (!wipe) return setWipe(true);
                      newGame();
                      setWipe(false);
                    }}
                    onBlur={() => setWipe(false)}
                  >
                    {wipe ? "Sure? Scores and badges go" : "New game · clear my scores"}
                  </Button>
                  <small className="real__fine">Clears this browser&apos;s scorecard and its badges. Gnomes you earned stay yours, and rounds saved on-chain stay on the chain{restoreAsked ? ", and can come back on your card" : ""}.</small>
                </div>
              </Dialog>
            </div>
          )}

          {!s.aiming && !s.flying && !holed && s.strokes === 0 && (
            <div className="hint">
              <span className="hint--mouse">{third ? "Press anywhere: drag down for power, push far left or right to turn, or use the arrow keys and Space · scroll to look around" : "Click anywhere and pull back, like a slingshot, or use the arrow keys and Space"}</span>
              <span className="hint--touch">{third ? "Touch anywhere: drag down for power, push far left or right to turn" : "Touch anywhere and pull back, like a slingshot"}</span>
            </div>
          )}
          {s.aiming && (
            <div className="aimbar" aria-live="polite">
              <div className="bar">
                <AimBar hot={hot.current} />
              </div>
              <small>{third ? "Drag down for power · push far left or right to turn · back to the start to cancel" : "Let go to shoot · slide back to cancel"}</small>
            </div>
          )}
          {/* behind the gnome, the aim turning on past its zone: a curved arrow on the side held */}
          {s.aiming && !!s.spin && (
            <div className={"spin spin--" + (s.spin > 0 ? "right" : "left")} aria-hidden="true">
              <svg viewBox="0 0 64 64">
                <path className="spin__rim" d="M12 34A20 20 0 1 1 44 50" />
                <path className="spin__band" d="M12 34A20 20 0 1 1 44 50" />
                <path className="spin__head" d="M37 56 50 54 42 43Z" />
              </svg>
            </div>
          )}

          <Button variant="chip" className="lbchip" onClick={() => (sound("blip"), setBoard(true))} aria-label="Players: records to beat">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>
            <span>Players</span>
          </Button>
          <footer className="hud hud--bottom">
            <Button variant={theyWon ? "primary" : "secondary"} disabled={!s.strokes} onClick={() => game.current?.reset()}>{theyWon ? "Rematch" : "Restart"}</Button>
            <CamButton cam={s.cam} onCam={(next) => (game.current?.setCam(next), setCamNote(`${CAMS[next]} view`))} />
          </footer>
        </>
      )}

      {holed && playing && (
        <div className="banner banner--win">
          <Dialog className="banner__in" role="dialog" aria-modal="true" aria-label="Hole finished">
            {/* (a cup just completed: its victory first) */}
            <Button variant="chip" className="banner__out" onClick={() => (sound("blip"), cupWon && cupWon.id === s.id ? setCupWon({ ...cupWon, open: true }) : setScreen(cupsScreen))}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.cups}</svg>All cups
            </Button>
            <span className="eyebrow">In the hole! · {s.name}</span>
            <h2 data-long={won && won.title.length > 16 ? "" : undefined}>{won ? won.title.replaceAll("-", "\u2011") /* a name's hyphens never break a line */ : golfTerm(s.strokes, parHere(s))}</h2>
            {/* the rival's name inked in the line, the one word to find */}
            {won && <p className="banner__duel">{won.line.split(won.duel.name).flatMap((part, i) => (i ? [<b key={i}>{won.duel.name}</b>, part] : [part]))}</p>}
            {/* not a duel: the record this round takes the place of on the hole's board, else the next one up to race */}
            {!won && !onChain && rankAt > 0 && (nudge.beat ? (
              <p className="banner__duel">You beat <b>{nudge.beat.name}</b>&apos;s {nudge.beat.strokes}.</p>
            ) : nudge.next && (
              <p className="banner__duel"><b>{nudge.next.name}</b> did it in {nudge.next.strokes} · <button className="linkish" aria-label={`Race ${nudge.next.name}'s ghost`} onClick={() => (sound("select"), raceWith(nudge.next!.player))}>Race ▸</button></p>
            ))}
            {/* the score, and beside it the ways to tell people about it */}
            <div className="win__head">
              <div className="win__score">
                <strong>{s.strokes}</strong>
                <span>{plural("stroke", s.strokes)}</span>
                {savedPlace && (
                  <b className="win__place" title="Your place on this hole's board, on-chain">
                    #{savedPlace.rank}
                    <small>of {savedPlace.of}</small>
                  </b>
                )}
              </div>
            <Share
              // with a round of the sharer's on the chain here, the link dares the friend to beat it;
              // a duel dares them back once saved, and before, passes the rival's own dare on
              link={holeLink(s, gnome, won && !onChain ? won.duel.ghost.player : daring ? account.address : "", won ? "duel" : "hole")}
              {...(won ? (!onChain ? { label: "Dare a friend", kind: "dare" } : won.duel.self ? { label: "Share your ghost", kind: "share_ghost" } : { label: "Dare them back", kind: "dare_back" }) : daring ? { label: "Dare a friend", kind: "dare" } : savedPlace ? { label: `Share your #${savedPlace.rank}`, kind: "share_rank" } : { label: "Share", kind: "share" }) satisfies { label: string; kind: ShareKind }}
              saved={onChain}
                snapshot={() => (game.current ? game.current.snapshot(caption(s, won)) : Promise.resolve(null))}
                text={won ? duelShare(won.result, won.duel, s.name, s.strokes, onChain, won.duel.ghost.mode !== (s.roundMode || aim)) : shareText({ s, card, cups, fresh, place: savedPlace, ghost: daring })}
                clip={clip}
              />
            </div>
            {cfg && cfg.clips && <ShareClip make={(run) => (game.current ? game.current.clip(run, caption(s, won)) : Promise.resolve(null))} name={clipName(s.id || "")} onClip={setClip} />}
            {/* where the round is: said by the save clock below while it can still go on-chain */}
            {(onChain || s.period == null) && (
              <p>
                {onChain
                  ? "Saved on-chain: public, on your address, on any device."
                  : s.official
                    ? `Saved in this browser only. Save it on-chain to make it public and ranked${!won && !daring ? ", and dare friends with your ghost" : ""}.`
                    : "Saved in this browser only. A community hole is not ranked, but its rounds can be saved on-chain."}
              </p>
            )}
            {won && <DuelFine duel={won.duel} mode={s.roundMode || aim} sky={sky} round={game.current ? game.current.chain.roundURL(won.duel.ghost.hole, won.duel.ghost.player) : undefined} />}
            <Standings s={s} card={card} saved={onChainCard} chain={game.current && game.current.chain} me={me} mode={s.roundMode || aim} compact fresh={freshBadges} onRules={() => setRules(true)} />
            <Unlocked fresh={fresh} onMeet={meet} />
            <NewBadges ids={freshBadges} onOpen={() => setBadgesOpen(true)} />
            <RecordState record={record} account={account} s={s} chain={game.current && game.current.chain} named={namedAs} />
            {(() => {
              // one note at a time, the one in the way first: the node, the funds, then the name
              const chain = game.current && game.current.chain;
              const host = ((chain && chain.rpc) || "").replace(/^https?:\/\//, "");
              const need = (canSave && lackNow) || 0;
              // (Adena on this node already, a slow fee is only slow: no network to pick)
              const warn =
                account && ourNode === true && slowSign ? (
                  "Adena is still working out the fee: confirm or reject it in its window."
                ) : account && (ourNode === false || slowSign) ? (
                  <>
                    {ourNode === false ? "Adena is on another network." : "Adena is still working out the fee."} In Adena, pick the one whose RPC is <b>{host}</b>
                    {chainId ? <> (chain id <b>{chainId}</b>)</> : null}.
                  </>
                ) : need && funds != null ? (
                  <>
                    {funds === 0 ? "Your Adena account has no GNOT here yet." : `You need about ${need.toFixed(2)} more GNOT.`}{" "}
                    {chain && networkOf(chain.rpc) === "local" ? "Fund it from the node's test account." : account && <GetGnot address={account.address} href={mainnet ? GNOT_URL : FAUCET} label={`Get ${mainnet ? "" : "free test "}GNOT (${chainId}) ↗`} />}
                  </>
                ) : null;
              // (once saved, the saved line says the name too)
              if (!warn && namedAs) return played ? null : <p className="note note--good">You are <b>{namedAs}</b> now: save your round to take your place.</p>;
              if (!warn && nudge.noName && account && chain)
                return (
                  // while it can be saved, the name goes in the save's own signature
                  <NameForm chain={chain} account={account.address} chainId={chainId} price={gasPrice} onNamed={(n) => (setNamedAs(n), nudge.named())} typed={canSave ? typed : undefined}
                    lead={canSave ? (rankAt ? `Your name at #${rankAt} on the board` : "Your name on the board") : onChain ? "Saved! Now put it on the board" : "Get on the board"} />
                );
              return warn && <p className="note note--warn">{warn}</p>;
            })()}
            {!played && !phoneOnly && s.period != null && (
              <SaveClock by={saveBy(s.period)} clock={game.current ? game.current.chain.now : undefined} stale={closed} ranked={!!s.official} moot={moot} dare={won && won.result !== "loss" && !won.duel.self ? won.duel.name : undefined} dares={!won && !daring} again={won ? "Rematch" : undefined} />
            )}
            {/* one solid action at a time: saving while it gets somewhere, else going on (a duel lost or tied: the rematch) */}
            <div className="banner__row">
              {pushSave && !rematch ? (
                <button className="linkish" onClick={() => game.current?.reset()}>{won ? "Rematch" : "Play again"}</button>
              ) : (
                <Button variant={rematch && !pushSave ? "primary" : "secondary"} onClick={() => game.current?.reset()}>
                  {won ? "Rematch" : "Play again"}
                </Button>
              )}
              {canSave && !phoneOnly && (
                <Button variant={pushSave ? "chain" : "secondary"} className={rankAt ? "btn--save-rank" : ""} disabled={busy(record) || !nameReady} onClick={() => (track("save_clicked", { from: "card", blocked: block }), void recordIt())}>
                  <svg className="btn__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="2.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 8 12)" /><rect x="10.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 16 12)" /></g></svg>
                  {record?.at === "signing" && record.of !== undefined ? `Adena: part ${record.part} of ${record.of}…` : saveLabel(record)}
                  {rankAt > 0 && !busy(record) && (
                    <span className="btn__rank">{!account ? `Could be #${rankAt}` : askName && !saveName ? `#${rankAt} with a name` : !won && nudge.beat ? `#${rankAt}` /* (who: said on the card) */ : saveLine(nudge, rankAt)}</span>
                  )}
                </Button>
              )}
              {cupWon && cupWon.id === s.id ? (
                <Button variant={pushSave || rematch ? "secondary" : "primary"} onClick={() => (sound("select"), setCupWon({ ...cupWon, open: true }))}>
                  Cup complete! →
                </Button>
              ) : (
                <Button variant={pushSave || rematch ? "secondary" : "primary"} onClick={() => {
                  // (a duel with no other ghost in this cup: back to their ghosts)
                  const n = nextHole(s, card, duelHole);
                  n ? goTo(n.id) : duelHole ? setScreen(cupsScreen) : goTo(s.holes[0].id);
                }}>
                  Next hole →
                </Button>
              )}
            </div>
            {canSave && phoneOnly && (
              <p className="real__fine">
                This round stays on this phone: saving takes a computer (Adena, or gnokey in a terminal). <button className="linkish" onClick={() => setReal("phone")}>Play it on your computer</button>
              </p>
            )}
            {canSave && !phoneOnly && account && costNow && <p className="real__fine">{costNow}. You confirm in Adena.</p>}
            {/* a gnokey save said done: the chain asked for it, for the account connected or the key's address (a phone: none, the handoff above) */}
            {!played && !closed && !phoneOnly && <Gnokey s={s} chain={game.current && game.current.chain} price={gasPrice} chainId={chainId} me={me} onSent={gnokeySaved} />}
            {/* no account to know the player by: their name with gnokey too (its Claim ranks the rounds saved before it) */}
            {!account && !phoneOnly && s.official && game.current && (
              <details className="details gnokey">
                <summary>Rank it: take your gno.land name with gnokey</summary>
                <NameForm chain={game.current.chain} account={null} chainId={chainId} price={gasPrice} lead="Your name on the board" onNamed={() => {}} folded />
              </details>
            )}
            {/* the gnomes' sale, one quiet line at the card's foot (never among its actions) */}
            {shopOn && <PromoLine promo={promo} now={promoNow} onOpen={() => openShop()} />}
          </Dialog>
        </div>
      )}

      {cupWon && cupWon.open && s && (
        <Victory
          cup={cupWon.cup}
          best={cupWon.best}
          holes={(s.allHoles || NONE).filter((h) => cupOf(h) === cupWon.cup)}
          card={card}
          saved={onChainCard}
          fresh={fresh}
          snapshot={() => (game.current ? game.current.snapshot({ eyebrow: "Cup", title: worldOf(cupWon.cup).name, score: "complete" }) : Promise.resolve(null))}
          onBack={() => (setCupWon(null), setScreen(cupsScreen))}
          onReplay={() => {
            setCupWon(null);
            const first = s.holes[0];
            if (first) goTo(first.id);
          }}
          next={nextAfter}
          onRules={() => setRules(true)}
          // on to the next cup (after the last, its first hole again), the new gnome picked when there is one
          onNext={(id) => {
            setCupWon(null);
            if (id) choose(id);
            if (nextAfter) return enterCup(nextAfter);
            if (s.holes[0]) goTo(s.holes[0].id);
            setScreen("pick");
          }}
        />
      )}

      {askAim && (
        <Sheet className="confirm" role="alertdialog" label="Switch aim mode" onClose={() => setAskAim(null)}>
          <h2>Switch to {AIM_NAMES[askAim]}?</h2>
          <p>This restarts the hole.</p>
          <div className="banner__row">
            <Button onClick={() => setAskAim(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setAim(askAim, true)}>Restart in {AIM_NAMES[askAim]}</Button>
          </div>
        </Sheet>
      )}

      {board && s && (
        <Boards mode={aim} s={s} gnome={gnome} inHole={screen === "play"} onRace={screen === "play" ? raceWith : undefined} onGhosts={screen === "play" || screen === "rival" ? toGhosts : undefined} chain={game.current && game.current.chain} me={me} onClose={() => setBoard(false)} goTo={(id) => (setBoard(false), goTo(id))} onConnect={account ? undefined : () => (setBoard(false), setReal("board"))} />
      )}

      {cardOpen && s && (
        <Sheet className="cardsheet" label="Scorecard" onClose={() => setCardOpen(false)}>
            <span className="eyebrow">Gnogolf · the cup and its card</span>
            <h2>The cup</h2>
            <Standings s={s} card={card} saved={onChainCard} chain={game.current && game.current.chain} me={me} mode={aim} onRules={() => setRules(true)}
              fresh={freshBadges} badges={{ onOpen: () => (setCardOpen(false), setBadgesOpen(true)) }} />
            <FullBoard key={aim} kind="course" s={s} chain={game.current && game.current.chain} me={me} mode={aim} onRace={screen === "play" ? (p) => (setCardOpen(false), raceWith(p)) : undefined} onGhosts={(p) => (setCardOpen(false), toGhosts(p))} />
        </Sheet>
      )}

      {curtain && (
        <div className={`curtain curtain--${(s && s.world) || "garden"}` + (curtain.open ? " curtain--open" : "")} aria-live="polite">
          <div className="curtain__in">
            <svg viewBox="-12 -14 24 18" className="curtain__hat" aria-hidden="true">
              <Hat world={(s && s.world) || "garden"} />
            </svg>
            <span className="eyebrow">Hole {curtain.n}</span>
            <h2>{curtain.name}</h2>
            <p className="curtain__chore">{((c) => c[Number(curtain.n) % c.length])(choresOf((s && s.world) || "garden"))}</p>
            {s && s.world === "mines" && <p className="curtain__chore">The expert cup: {HARD}</p>}
          </div>
        </div>
      )}

      {about && (
        <About web={cfg ? cfg.web : ""} counts={s ? s.worlds : undefined} onClose={() => setAbout(false)} onRules={() => (setAbout(false), setRules(true))}
          support={game.current && <Tip chain={game.current.chain} me={me} chainId={chainId} price={gasPrice} onConnect={() => (setAbout(false), setReal("about"))} />} />
      )}
      {support && game.current && (
        <Sheet className="about" label="Support the game" onClose={() => setSupport(false)}>
          <span className="eyebrow">Support</span>
          <h2>Keep the gnomes rolling</h2>
          <Tip chain={game.current.chain} me={me} chainId={chainId} price={gasPrice} onConnect={() => (setSupport(false), setReal("support"))} bare />
        </Sheet>
      )}
      {rules && <Rules onClose={() => setRules(false)} onBadges={() => (setRules(false), setBadgesOpen(true))} />}
      {badgesOpen && <Badges fresh={freshBadges} onClose={() => setBadgesOpen(false)} />}
      {(screen === "rival" || screen === "ghosts" || screen === "worlds" || screen === "community" || screen === "pick") && <ModeTag kind={screen === "rival" || (dare && !solo) ? "duel" : "solo"} />}
      {/* every screen but the title's (its film is the page) */}
      {cfg && screen !== "title" && <NetBanner rpc={cfg.rpc} onSupport={() => setSupport(true)} onFeedback={() => (sound("blip"), setFeedbackOpen(true))} />}
      {feedbackOpen && <Feedback where={{ screen, aim, network: cfg ? networkOf(cfg.rpc) : null, adena: hasAdena(), connected: !!account, card_holes: holesNow, saved_any: savedAny, ...(screen === "play" && s ? { hole: s.id, cup: s.world, cam: s.cam } : {}) }} onClose={() => setFeedbackOpen(false)} />}

      {pending && !(holed && s && s.id === pending.id) && (
        <PendingSave r={pending} rec={pendingRec && pendingRec.round === roundOf(pending) ? pendingRec.rec : null} by={pending.period != null ? saveBy(pending.period) : null} clock={game.current ? game.current.chain.now : undefined}
          onSave={savePending} onForget={() => (keepPending(null), setPendingRec(null))} />
      )}
      {real && (
        <RealPlay
          from={real}
          elsewhere={ourNode === false}
          account={account}
          wallet={wallet}
          onConnect={() => void connectWallet()}
          onDisconnect={() => (setReal(false), disconnectWallet())}
          onClose={() => setReal(false)}
          // from a won hole (or one kept through a reload), connecting leads straight to its save
          onSave={s && s.holed && canSave ? () => (setReal(false), void recordIt()) : pending ? () => (setReal(false), keptSave()) : null}
          rpc={cfg && cfg.rpc}
          chainName={chainId || ""}
          cost={costNow}
          funds={funds}
          lack={lackNow}
          // with a round to save, the name goes in its signature: typed there as on the win card
          typed={askName ? typed : null}
          nameOk={nameReady}
          named={account ? nudge.isNamed : null}
          chain={game.current && game.current.chain}
          price={gasPrice}
          onNamed={(n) => (setNamedAs(n), nudge.named())}
          waiting={pending ? `your ${strokesWord(pending.strokes)} on ${pending.name || "this hole"}` : s && s.holed && canSave ? "this round" : null}
          // the round on offer, with gnokey too: said done, the sheet goes for its card to say how it went
          gnokey={toSave && !played && <Gnokey s={toSave} chain={game.current && game.current.chain} price={gasPrice} chainId={chainId} me={me} onSent={(who) => (setReal(false), gnokeySaved(who))} />}
        />
      )}

      {playing && linkNote && <Toast text={linkNote} onDone={() => setLinkNote(null)} />}
      {restoreNote && !(playing && linkNote) && <Toast key={restoreNote} text={restoreNote} ms={3000} center onDone={() => setRestoreNote(null)} />}
      {/* the turns, called out big before each stroke: a duel's (yours, then theirs), what the next is
          worth; solo, what it is for (the score card says them to a screen reader) */}
      {playing && s && !s.done && !theyWon && (s.view !== "overview" || s.cam === "far") && (racing ? s.rivalTurn || (s.strokes === s.rival && !s.flying) : !s.flying && parHere(s) > 0) && (
        <p key={(s.rivalTurn ? "them" : "you") + s.strokes} className={"turncall" + (s.rivalTurn ? " turncall--them" : "")} aria-hidden="true" data-long={s.rivalTurn && racing && racing.name.length > 10 ? "" : undefined}>
          {/* a name's hyphens never break a line: it goes whole to the next, broken only when longer than one */}
          {s.rivalTurn && racing ? `${racing.self ? "Your best" : racing.name.replaceAll("-", "\u2011")}'s turn` : racing ? <>Your turn!<small>{raceLeft(s.strokes + 1, racing.ghost.strokes)}</small></> : strokeFor(s.strokes + 1, parHere(s))}
        </p>
      )}
      {playing && !linkNote && camNote && <Toast key={camNote} text={camNote} ms={1600} onDone={() => setCamNote(null)} />}
      {playing && !linkNote && !camNote && !duel && farHint && s && s.ready && !s.flying && s.strokes > 0 && !s.done && s.cam !== "far" && <Toast text="Tip: the camera button's Far view shows the whole hole." onDone={() => { try { localStorage.setItem("gnogolf.hint.far", "1"); } catch {} setFarHint(false); }} />}
      {playing && !linkNote && !camNote && !curtain && hint && !hinted.includes(hintSlot) && s && s.ready && !s.flying && s.strokes === 0 && !s.done && (
        <Toast key={hintSlot} text={hint} ms={readMs(hint)} onDone={() => (minesHintSaid(hintSlot), setHinted((h) => [...h, hintSlot]))} />
      )}
      {playing && s && s.flying && <CauseNote hot={hot.current} />}

      {gl && !fatal && (
        <div className="banner" role="alertdialog" aria-labelledby="gl-title">
          <Dialog className="banner__in">
            <h2 id="gl-title">Graphics were reset</h2>
            <p>{gl === "lost" ? "The browser took the 3D view away for a moment. Bringing it back…" : "The 3D view did not come back. Reloading brings it back; your scores are safe."}</p>
            {gl === "gone" && (
              <div className="banner__row">
                <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
              </div>
            )}
          </Dialog>
        </div>
      )}

      {(fatal || (s && s.error)) && (() => {
        // say what actually went wrong: the chain not answering, a shot it
        // refused, or a bug of ours while drawing — and offer the fix that fits
        const kind: FatalKind | ErrorKind = fatal ? fatal.kind : (s && s.errorKind) || "shot";
        // (Try again: the hole the load failed on, not the one still on screen)
        const holeNow = (s && (s.failed || s.id)) || null;
        const TEXT = BANNER[kind];
        const g = game.current;
        return (
          <div className="banner" role="alertdialog" aria-labelledby="banner-title">
            <Dialog className="banner__in">
              <h2 id="banner-title">{TEXT[0]}</h2>
              <p>{TEXT[1]}</p>
              {fatal && (kind === "down" || kind === "empty") && <Retry onRetry={() => (setFatal(null), setBoot((b) => b + 1))} />}
              {kind === "webgl" && cfg && (
                <p><a href={`${cfg.web}${REALM_PATH}`} target="_blank" rel="noopener noreferrer">Play it as text on gno.land ↗</a></p>
              )}
              {kind !== "limit" && (
                <details className="details">
                  <summary>Technical details</summary>
                  <div className="details__box">
                    <p className="mono">{fatal ? fatal.msg : s && s.error}</p>
                    {(kind === "down" || kind === "load" || kind === "shot") && cfg && <p className="mono">{cfg.rpc}</p>}
                  </div>
                </details>
              )}
              <div className="banner__row">
                {fatal ? (
                  kind === "down" || kind === "empty"
                    ? <Button variant="primary" onClick={() => (setFatal(null), setBoot((b) => b + 1))}>Try again now</Button>
                    : <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
                ) : kind === "load" ? (
                  <Button variant="primary" onClick={() => { g!.clearError(); if (holeNow) void g!.load(holeNow); }}>Try again</Button>
                ) : kind === "draw" ? (
                  <Button variant="primary" onClick={() => { g!.clearError(); setMenu(true); }}>Pick a hole</Button>
                ) : kind === "limit" ? (
                  <Button variant="primary" onClick={() => { g!.clearError(); g!.reset(); }}>Restart the hole</Button>
                ) : (
                  <Button variant="primary" onClick={() => g!.clearError()}>Keep playing</Button>
                )}
              </div>
            </Dialog>
          </div>
        );
      })()}

      {playing && !s && !fatal && (
        <div className="boot">
          {/* the world is not known yet: guess it from the hole asked for */}
          <svg viewBox="-12 -16 24 26" className="boot__gnome" aria-hidden="true">
            <circle cx="0" cy="2" r="7" className="load__white" />
            <Hat world={(cfg && (cfg.world || guessCup(cfg.hole || ""))) || "garden"} y={-3} />
          </svg>
          <p>Reaching the chain…</p>
        </div>
      )}
    </>
  );
}

/** The hole on the shared picture's card and the clip's, as its link card has it (media/og): the hole and the score;
 *  a duel's, who was raced, both counts, and its result shouted. */
const caption = (s: Snapshot, won: { title: string; duel: Duel } | null) => {
  const cup = s.place ? worldOf(s.world).name : "Community hole", par = parHere(s);
  if (won) return { eyebrow: `vs ${won.duel.name}${par ? ` · par ${par}` : ""}`, title: s.name, score: `${s.strokes} – ${won.duel.ghost.strokes}`, term: won.title, challenge: `Race the ghost · ${s.name}` };
  return { eyebrow: [cup, s.place && `hole ${s.place}`, par && `par ${par}`].filter(Boolean).join(" · "), title: s.name, score: strokesWord(s.strokes), term: golfTerm(s.strokes, par).replace(/!?$/, "!") }; // the clip shouts it
};

/**
 * What a player says when they share: short, a little cheeky, gnome and
 * gno.land flavoured (the realm replays every shot; the score is on the
 * chain). One line is picked per moment, from the hole so it varies.
 */
// ghost: the link dares (a round of the sharer's on the chain): the text says so
function shareText({ s, card, cups, fresh, place, ghost = false }: { s: Snapshot; card: Card; cups: ReturnType<typeof cupTotals>; fresh: readonly Skin[]; place?: { rank: number; of: number } | null; ghost?: boolean }) {
  const t = totals(card, s.holes), cup = worldOf(s.world).name;
  const vs = vsParWords(t.strokes - t.par);
  const pick = (list: readonly string[]) => list[[...String(s.id || "")].reduce((a, c) => a + c.charCodeAt(0), s.strokes) % list.length];
  const tag = SHARE_TAGS;
  if (cups.slam) return "👑 Grand slam on Gnogolf: the four cups at par or under. The Gnome King bows." + tag;
  if (t.all) return pick([
    `🏆 ${cup} done on Gnogolf, ${vs}. Every putt computed on-chain.`,
    `⛳ ${t.strokes} strokes round the whole ${cup} (${vs}). My gnome is tired, the chain is not.`,
  ]) + tag;
  // the link dares: one ask, and no score (the friend races the best, maybe not this round)
  if (ghost) return `⚔ Race my ghost on ${s.name} and beat it. Free to play, no wallet needed.` + tag;
  if (place) return `⛳ ${strokesWord(s.strokes)} on ${s.name} in Gnogolf, saved on-chain. Race my ghost and beat it.` + tag;
  if (fresh.length) return `🍄 New gnome unlocked on Gnogolf: ${fresh.map((g) => g.name).join(" and ")}. Earned the hard way, one putt at a time.` + tag;
  if (s.strokes === 1) return pick([
    `🕳️ Hole in one on ${s.name}! Every bounce computed by the chain.`,
    `⛳ Ace on ${s.name}. Somewhere on the chain a realm just nodded.`,
  ]) + tag;
  return pick([
    `⛳ ${s.name} in ${s.strokes}. Mini-golf where the ball is rolled by a smart contract. Your turn?`,
    `🧙 My gnome sank ${s.name} in ${s.strokes}. Physics by a realm on-chain, excuses by me.`,
    `⛳ ${s.strokes} strokes on ${s.name}. Every bounce computed on-chain. Beat that, gnome.`,
  ]) + tag;
}

/** The menu's buttons' marks, drawn in the camera button's strokes. */
const MENU_ICON = {
  card: <path d="M4 5h16v14H4zM4 10h16M10 10v9" />,
  gnome: <path d="M12 3 5.5 16h13ZM4 16h16M9 20h6" />,
  mode: <path d="M5 8h14l-3.5-3.5M19 16H5l3.5 3.5" />, // (one game to the other)
  cups: <path d="M8 21V4l10 4-10 4M5 21h8" />,
};
