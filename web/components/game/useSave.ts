"use client";

// Saving a round on the chain: what it costs and what the account has for it, the name that goes with it, what
// stands in its way, and the save itself, commit by commit, read back from the chain.
import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Game, Snapshot } from "@/lib/engine";
import { isTouch } from "@/lib/device";
import { BYTE_PRICE, roundShots, wait, within } from "@/lib/chain";
import type { HoleRow } from "@/lib/types";
import { hasAdena, onOurNode, recordRound, chainSplit, readBack, replayDiffers, gasOf, roundGas, shortOf, depositBytes, nameBytes, NAME_GAS, PRICE, type Account, type SendError } from "@/lib/adena";
import { cardKey, markOnChain, type Card } from "@/lib/card";
import { messageOf, strokesWord } from "@/lib/words";
import { saveOf, saveBy, costLine, roundOf, sentKey, type Rec, type SaveOf } from "@/lib/save";
import { networkOf } from "@/lib/network";
import { register, track, trackError, failure, saveBlock, type Events, type WalletFrom } from "@/lib/analytics";
import { useNameCheck, type useRankNudge } from "@/components/Leaderboard";
import type { Config } from "@/components/game/useConfig";

// The storage deposit of a save, in ugnot: a first save on a hole writes the
// round, the best (with its strokes' shots) and the board entry; a hole saved
// before is replaced.
// saved: null when not known yet (counted as a first save: the larger).
const depositOf = (saved: boolean | null, bytePrice: number, firstOnCourse: boolean, strokes: number) => depositBytes(saved !== true, firstOnCourse, strokes) * bytePrice;

// record, roundKey: how the won round's save goes, and that round's key; pending, pendingNow: the round kept through
// a reload; saving, sentRounds: a save under way, and the rounds whose last commit went; movedGhosts, setSaves: the
// duel's, told of a round saved
export function useSave({ game, cfg, s, holedNow, allList, chainId, chainUp, account, me, record, setRecord, roundKey, canSave, pending, pendingNow, keepPending, setPendingRec, saving, sentRounds, markSent, nudge, nameStem, setNameStem, setNamedAs, award, setOnChainCard, setReal, movedGhosts, setSaves }: {
  game: RefObject<Game | null>;
  cfg: Config | null;
  s: Snapshot | null;
  holedNow: boolean;
  allList: readonly HoleRow[];
  chainId: string | null;
  chainUp: boolean;
  account: Account | null;
  me: string | null;
  record: Rec;
  setRecord: (rec: Rec) => void;
  roundKey: RefObject<string>;
  canSave: boolean;
  pending: SaveOf | null;
  pendingNow: RefObject<SaveOf | null>;
  keepPending: (r: SaveOf | null) => void;
  setPendingRec: (rec: { round: string; rec: Rec } | null) => void;
  saving: RefObject<boolean>;
  sentRounds: Map<string, Rec>;
  markSent: (key: string, rec: Rec) => void;
  nudge: ReturnType<typeof useRankNudge>;
  nameStem: string;
  setNameStem: (stem: string) => void;
  setNamedAs: (name: string) => void;
  award: (ids: readonly string[], hole: string | null | undefined) => void;
  setOnChainCard: (card: Card) => void;
  setReal: (from: WalletFrom) => void;
  movedGhosts: RefObject<Set<string>>;
  setSaves: Dispatch<SetStateAction<number>>;
}) {
  // the chain's gas price, read once an account is here: the label and the
  // transaction price the round the same way
  // read before the click, so the click opens Adena at once (a browser may
  // block a wallet window opened after long waits); each read gives up at 4 s
  const [gasPrice, setGasPrice] = useState(PRICE);
  const [funds, setFunds] = useState<number | null>(null);
  const [ourNode, setOurNode] = useState<boolean | null>(null); // is Adena's active network this node?
  const [slowSign, setSlowSign] = useState(false); // Adena open for more than 10 s
  const [bytePrice, setBytePrice] = useState(BYTE_PRICE); // ugnot per stored byte (vm params)
  const [best, setBest] = useState<number | null>(null); // this player's best on this hole, in this round's mode (0: none; null: unknown)
  const saved = best == null ? null : best > 0; // whether they have one
  const [bestAsked, setBestAsked] = useState(""); // the hole and mode whose best was asked, answered or not
  const [ghostHere, setGhostHere] = useState(false); // a best of theirs here in either mode: their link dares (a friend races either)
  // the player's saved holes on the course, per mode (Rank() "holes"; null: not read)
  const [onCourse, setOnCourse] = useState<{ assisted: number; pro: number } | null>(null);
  // the round on offer: the won one while it can be saved, else the one kept through a reload
  const winning = !!(s && s.holed && s.id && canSave);
  const toSave: SaveOf | null = winning && s && s.id ? { ...s, id: s.id } : pending;
  const saveId = toSave ? toSave.id : "";
  const saveMode = toSave && toSave.roundMode === "pro" ? "pro" : "assisted";
  useEffect(() => {
    setBest(null);
    setBestAsked("");
    setGhostHere(false);
    setOnCourse(null);
    if (!account || !saveId || !game.current) return;
    let live = true;
    const c = game.current.chain;
    void Promise.all([within(c.bests(saveId, "assisted", [account.address])), within(c.bests(saveId, "pro", [account.address]))])
      .then(([a, p]) => live && (setBest((saveMode === "pro" ? p : a).rows[0]?.strokes ?? 0), setGhostHere(a.rows.length + p.rows.length > 0)))
      .catch(() => {})
      .finally(() => live && setBestAsked(`${saveId}#${saveMode}`));
    void Promise.all([within(c.rank("assisted", account.address)), within(c.rank("pro", account.address))])
      .then(([a, p]) => live && setOnCourse({ assisted: a.holes, pro: p.holes }))
      .catch(() => {});
    return () => void (live = false);
  }, [account, saveId, saveMode, holedNow, game]);
  const waiting = record?.at === "signing" && record.of === undefined; // Adena open, the round in one transaction
  // a name goes with the save of a player without one (on a hole that ranks):
  // typed, then asked of the chain; the save waits for a name it would take
  // (a kept round: its own hole's, not the one on screen; an archived or community one ranks nobody)
  const keptRanks = !!pending && pending.official !== false && !allList.find((h) => h.id === pending.id)?.next;
  const askName = !!(account && toSave && (winning ? nudge.noName : keptRanks && nudge.isNamed === false));
  const nameCheck = useNameCheck(askName && game.current ? game.current.chain : null, nameStem, "save");
  const typed = { check: nameCheck, set: setNameStem };
  const saveName = askName && nameStem && nameCheck.ready ? nameCheck.name : null;
  const nameReady = !askName || nameCheck.ready;
  // what saving it costs (every commit of it), the name included, and what the account lacks for it
  const saveGas = toSave ? roundGas(toSave, toSave.shots.length) + (saveName ? NAME_GAS : 0) : 0;
  // no finish yet anywhere on the course in this mode: a dearer first save;
  // a name's Claim seats every best of the player's, this one's included
  const firstOnCourse = !!onCourse && onCourse[saveMode] === 0;
  const bests = onCourse ? { ...onCourse, [saveMode]: onCourse[saveMode] + (saved === true ? 0 : 1) } : { assisted: 0, pro: 0, [saveMode]: 1 };
  const saveDeposit = depositOf(saved, bytePrice, firstOnCourse, toSave ? toSave.strokes : 0) + (saveName ? nameBytes([bests.assisted, bests.pro]) * bytePrice : 0);
  const mainnet = networkOf((cfg && cfg.rpc) || "") === "mainnet"; // its GNOT is the real one
  // a round no better than the player's best there, said before it is paid for: the chain keeps the best
  const moot = !!(best && toSave && toSave.strokes >= best);
  const costNow = toSave ? costLine(saveGas, gasPrice, saved, saveDeposit, !mainnet) + (moot ? `. Your best here is ${strokesWord(best || 0)}: this round would not change it` : "") : null;
  // a phone with no wallet can't save here (the sheet sends the hole to a computer): nothing promised there
  const phoneOnly = !account && isTouch() && !hasAdena();
  // saving is the win card's main action while it would get somewhere: else going on is
  const pushSave = canSave && !phoneOnly && !moot;
  // a round won and not on the chain yet is the one kept, where a save gets somewhere (as pushSave);
  // saved, too late, no better than the best there or on a phone with no wallet, it goes
  useEffect(() => {
    if (!s || !s.holed || !s.id) return;
    const r = saveOf({ ...s, id: s.id });
    if (!pushSave) return void (pendingNow.current && roundOf(pendingNow.current) === roundOf(r) && keepPending(null));
    keepPending(r);
    // (on these moments only: the round is s as the hole is won, not each of its frames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holedNow, pushSave]);
  // the place the round would take on its board: none for a round that would not change the player's best
  const rankAt = moot ? 0 : nudge.at;
  const lackNow = toSave && account && funds != null ? shortOf(saveGas, gasPrice, saveDeposit, funds) : null;
  useEffect(() => {
    if (!waiting) return setSlowSign(false);
    const t = setTimeout(() => setSlowSign(true), 10000);
    return () => clearTimeout(t);
  }, [waiting]);
  useEffect(() => {
    if (!account || !game.current) return;
    // what lands after the account changed (or the page went) is dropped
    let live = true;
    const land = <T,>(f: (v: T) => void) => (v: T) => live && f(v);
    const c = game.current.chain;
    void within(c.gasPrice()).then(land(setGasPrice)).catch(() => {});
    void within(c.balance(account.address)).then(land(setFunds)).catch(() => live && setFunds(null));
    void onOurNode(c.rpc).then(land(setOurNode));
    void within(c.storagePrice()).then(land(setBytePrice)).catch(() => {});
    // re-read when a hole is won: the card is about to offer the record
    // and on coming back to the tab (from the faucet, most likely)
    const back = () => document.visibilityState === "visible" && void within(c.balance(account.address)).then(land(setFunds)).catch(() => {});
    document.addEventListener("visibilitychange", back);
    return () => ((live = false), document.removeEventListener("visibilitychange", back));
  }, [account, holedNow, chainUp, game]);
  // a hole won: the chain's clock read again (at most once a minute), for the
  // save's countdown, and the gas price for the gnokey fallback (no Adena)
  useEffect(() => {
    if (!holedNow || !game.current) return;
    const c = game.current.chain;
    c.sync().catch(() => {});
    void within(c.gasPrice()).then(setGasPrice).catch(() => {});
  }, [holedNow, game]);

  // the checklist first while a step is missing (no wallet, too few GNOT), which
  // saves from there: a name is only ever sent from a form in view
  const block = saveBlock({ adena: hasAdena(), account: !!account, lack: lackNow, elsewhere: ourNode === false });
  // the waiting round's card has no name field: the checklist has it
  const savePending = () => {
    if (!pending) return;
    const blocked = block || (keptRanks && nudge.isNamed === false ? "no_name" : null);
    track("save_clicked", { from: "pending", blocked });
    if (blocked) return setReal("pending");
    keptSave();
  };
  // (send: false, who: a gnokey save, only asked of the chain for that address)
  const keptSave = (send = true, who = "") => {
    const r = pending;
    if (!r) return;
    const round = roundOf(r);
    // (its state is its own round's; forgotten or replaced, no later part goes)
    void saveRound(r, (rec) => setPendingRec({ round, rec }), () => !!pendingNow.current && roundOf(pendingNow.current) === round, saveName, send, who);
  };

  // the round the win card offers to save (send: false, only asked of the chain for who: a gnokey save)
  async function recordIt(send = true, who = "") {
    if (send && block) return setReal("card");
    if (!s || !game.current || !s.id) return;
    const r = { ...s, id: s.id }, round = roundOf(r);
    await saveRound(r, (rec) => roundKey.current === round && setRecord(rec), () => roundKey.current === round, saveName, send, who);
  }
  // a gnokey save said done, for the round on offer (the won one, else the kept one)
  const gnokeySaved = (who: string) => (winning ? void recordIt(false, who) : keptSave(false, who));

  /**
   * Puts a finished round on the chain: in as many commits as the chain cuts
   * it into, each signed in Adena, then read back. land says how it goes;
   * alive: the player is still on it (a later commit is not sent otherwise);
   * name: taken in the first signature;
   * send: false, nothing is sent: only whether the chain holds it already,
   * as the best of who (a gnokey key's address), the account's by default.
   */
  async function saveRound(r: SaveOf, land: (rec: Rec) => void, alive: () => boolean, name: string | null, send = true, who = "") {
    // the player the chain is asked about: the account connected, which alone sends
    const player = (!send && who) || me;
    if (!player || (send && !account) || !game.current) return;
    // busy before anything is awaited: a second click must not start a second save
    if (saving.current) return;
    // a round that went through is not sent again: the chain would play it again, and charge for it
    // (one the chain could not confirm yet is read again, not sent)
    const key = sentKey(game.current.chain, player, r), sentAs = sentRounds.get(key);
    if (sentAs && !(sentAs.at === "unsure" && sentAs.sent)) return land(sentAs);
    saving.current = true;
    land(sentAs || !send ? { at: "checking" } : { at: "signing" });
    // the save's funnel (analytics): the part being signed, of how many, and the gas asked
    const t0 = performance.now(), at = { part: 0, parts: 0, gas: 0 };
    const said = (stage: Events["save"]["stage"], reason?: string, best?: boolean) => track("save", { stage, via: send ? "adena" : "gnokey", ...at, ms: Math.round(performance.now() - t0), reason, best });
    const chain = game.current.chain, hole = r.id, mode = r.roundMode || "assisted";
    // read every ms until ok has it (at most n reads, while on() holds): the last one read, null for none
    const until = async <T,>(read: () => Promise<T>, ok: (got: T) => boolean, n: number, ms: number, on = () => true) => {
      let got: T | null = null;
      for (let k = 0; k < n && on(); k++) {
        got = await read().catch(() => null);
        if (got !== null && ok(got)) break;
        await wait(ms);
      }
      return got;
    };
    const roundHere = () => chain.round(hole, player), bestHere = () => chain.ghost(hole, mode, player);
    /**
     * The last commit settled: what it did, as the chain says it (readBack),
     * read again while the chain cannot say, and never saved without that.
     * sent: Adena said it went; seen: its best was seen landing; adena:
     * Adena's error, when it did not say.
     */
    const settle = async (hash: string | undefined, sent: boolean, seen = false, adena = "", was?: number) => {
      // sent, the round is the chain's, answered or not: a reload meanwhile reads it again
      const unsure: Rec = { at: "unsure", sent: true, hash, was, error: "Sent, but the chain could not confirm it yet. Check again in a moment: saving it again would pay twice." };
      if (sent) markSent(key, unsure);
      const read = () => readBack(chain, { hole, player, strokes: r.strokes, hash, sent });
      let got = seen ? { holed: r.strokes, left: null } : await read();
      for (let k = 0; got === undefined && (hash || sent) && k < 10; k++) land({ at: "checking" }), await wait(3000), (got = await read());
      if (account) void within(chain.balance(account.address)).then(setFunds).catch(() => {});
      if (got === undefined) {
        said("failed", "unconfirmed");
        return land(sent ? unsure : { at: "unsure", sent, hash, error: `Adena did not confirm it (${adena.replace(/\.$/, "")}), but it may have gone through all the same: see your best on gno.land before saving again, or it is paid twice.` });
      }
      // the round went through, whatever the chain made of it: saving it again would only play it again
      // (a round no better than the best there leaves it: the chain keeps a best until a round beats it)
      const stays = was && was <= r.strokes ? was : undefined;
      const rec: Rec = got.holed === r.strokes ? { at: "saved", stays } : { at: "refused", stale: false, final: true, error: replayDiffers(got.holed ?? got.left, got.holed != null) };
      markSent(key, rec);
      if (rec.at === "saved") {
        said("ok", undefined, !stays);
        land(rec);
        if (stays) return; // nothing of the player's on the chain moved: no seal, badge or ghost of this round
        award(["chain"], hole);
        const row = ((s && s.allHoles) || []).find((h) => h.id === hole);
        setOnChainCard(markOnChain(cardKey(row || { id: hole }), r.strokes));
        register({ saved_any: true });
        if (roundKey.current.startsWith(hole + "#")) (setBest(r.strokes), setGhostHere(true)); // (still on that hole: a kept round may be another's)
        movedGhosts.current.add(hole);
        setSaves((n) => n + 1);
      } else said("failed", "replay"), land(rec);
    };
    try {
      if (sentAs && sentAs.at === "unsure") return await settle(sentAs.hash, true, false, "", sentAs.was);
      // a round the chain holds already as the player's best here went another way (the gnokey
      // paste): it is saved, not sent again, even once its weather is over (one that did not beat
      // the best leaves no trace to see); its shots as the chain writes them (a tick of 0 added)
      const had = await within(bestHere()).catch(() => null);
      if (had && had.period === r.period && roundShots(had.shots) === roundShots(r.shots)) return await settle(undefined, true, true);
      // a round whose weather is over can no longer be saved: the chain would refuse it
      // (its clock read again first: the chain's time decides, not this browser's)
      await chain.sync().catch(() => {});
      if (r.period != null && chain.now() >= saveBy(r.period)) return said("failed", "late"), land({ at: "refused", error: "Too late to save: the weather changed. Play the hole again to save it.", stale: true });
      if (!send) return land({ at: "unsure", sent: false, error: `The chain does not show this round as your best here: a gnokey save shows once it printed OK! for each transaction, from ${account && player === account.address ? "the account connected here" : "the key whose address you gave"}, if it beats your best.` });
      const id = chainId || (await within(chain.chainId()));
      // asked before Adena opens: how many transactions the round needs, or
      // why the chain would refuse it
      // every commit asked of the chain: the first from the tee, the next
      // from where the one before leaves the ball
      const period = r.period != null ? r.period : await within(chain.period());
      const parts = await chainSplit(chain, r, period);
      // a round of the player's left under way here (a holed one is not kept):
      // the first commit abandons it, or it would go on from where it lies
      const under = !!(await within(roundHere()));
      // the name typed on the card goes in the first signature, before the round
      const named = name ? { registrar: await within(chain.nameReg()), name } : null;
      at.parts = parts.length;
      said("sent");
      for (let k = 0; k < parts.length; k++) {
        const [from, to] = parts[k], last = k + 1 === parts.length;
        // the player has left this round (Play again, another hole): no more of it goes to Adena
        if (!alive()) return;
        (at.part = k + 1), (at.gas = gasOf(r, from, to));
        if (parts.length > 1) land({ at: "signing", part: k + 1, of: parts.length });
        // what the chain shows as this commit lands: a part leaves the round under way, the
        // last holes it, which is not kept, and its best changes if it is one
        // (unread, the chain is not watched: an old one there would pass for it)
        const read = last ? bestHere : roundHere;
        const prior = await read().catch(() => undefined), before = prior === undefined ? undefined : JSON.stringify(prior);
        // the best the last commit may beat (undefined: not read)
        const was = last && prior !== undefined ? (prior ? prior.strokes : 0) : undefined;
        const landedHere = (got: { strokes: number } | null) => !!got && (last ? got.strokes === r.strokes : got.strokes >= to) && JSON.stringify(got) !== before;
        const sent = recordRound({
          address: player, realm: chain.realm, hole, shots: r.shots.slice(from, to), reset: k === 0 && under,
          gas: gasOf(r, from, to), period: r.period, mode, price: gasPrice, chainId: id, rpc: chain.rpc, named: k === 0 ? named : null,
        });
        // Adena answers only once its window is closed: the chain is watched
        // meanwhile, and a commit it holds counts as sent (Adena's answer, if
        // it comes later, changes nothing)
        let open = before !== undefined;
        const landed = until<{ strokes: number } | null>(read, landedHere, 120, 1500, () => open).then(landedHere);
        void sent.catch(() => {}); // raced below; a late refusal after the chain has it is moot
        let got: { hash?: string } | null | true;
        try {
          got = await Promise.race<{ hash?: string } | null | true>([sent, landed.then((ok): Promise<{ hash?: string } | null | true> | true => (ok ? true : sent))]).finally(() => (open = false));
        } catch (e) {
          const err = e as SendError;
          // the last commit, failed in Adena for no reason that says it never went (a replay
          // that is not a best cannot be seen landing): the chain is asked by its hash
          if (last && err.maybe) return await settle(err.hash, false, false, err.message, was);
          if (k > 0) (err.message = `Part ${k} of ${parts.length} is on-chain, part ${k + 1} was not sent (${err.message}). Save again to send the whole round.`), (err.cancelled = false);
          throw err;
        }
        // the name is the player's once the first part is in: a retry of the rest must not take it again
        if (k === 0 && named) setNamedAs(named.name), nudge.named(), track("name_registered", { ok: true, via: "save" });
        // signed is not recorded: what the last commit did, the chain says
        if (last) return await settle(got === true ? undefined : (got && got.hash) || undefined, true, got === true, "", was);
        // a commit seen on the chain before Adena answered: its window may
        // still be open, and Adena refuses a second one meanwhile
        await Promise.race([sent.catch(() => {}), wait(10_000)]);
        // the next part continues the round: it waits until the chain has this one, and
        // goes no further without it (the round holed sooner, or the chain slow to show it)
        const going = await until(roundHere, (got) => !!got && got.strokes >= to, 10, 1000);
        if (!going || going.strokes < to)
          throw new Error(`Part ${k + 1} of ${parts.length} was sent, but the chain does not show the round going on from it: part ${k + 2} was not sent. Save again to send the whole round.`);
      }
    } catch (err) {
      const cancelled = !!(err as SendError).cancelled, reason = cancelled ? undefined : failure(err);
      said(cancelled ? "cancelled" : "failed", reason);
      if (!cancelled) trackError("save", err, { ...at, reason });
      if (name && at.part <= 1) track("name_registered", { ok: false, via: "save", reason: cancelled ? "cancelled" : reason });
      land(cancelled ? null : { at: "refused", error: messageOf(err), stale: /weather .* is over|is not the current weather/.test(String((err as SendError).message)) });
    } finally {
      saving.current = false;
    }
  }
  return { gasPrice, funds, setFunds, ourNode, slowSign, bestAsked, ghostHere, toSave, saveId, saveMode, askName, typed, saveName, nameReady, mainnet, moot, costNow, phoneOnly, pushSave, rankAt, lackNow, block, savePending, keptSave, recordIt, gnokeySaved };
}
