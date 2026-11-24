"use client";

// The connected wallet's records brought back onto this browser's card.
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Game } from "@/lib/engine";
import { GNOMES } from "@/lib/scene/gnome";
import { errorKind } from "@/lib/chain";
import type { Account } from "@/lib/adena";
import type { HoleRow } from "@/lib/types";
import { backFromChain, fromChain, syncedTo, markSynced, loadCard, cupTotals, UNLOCKS, badgesFor, byRarity, type Card } from "@/lib/card";
import { track } from "@/lib/analytics";
import { earned, linkedGnome, lockedNote, rememberBadges, seeWeather, weathersSeen } from "@/lib/prefs";

// setRestoreNote: what it brought back, said to the player
export function useRestore({ game, account, allList, setCard, setOnChainCard, setLinkNote, setFreshBadges, setRestoreNote }: {
  game: RefObject<Game | null>;
  account: Account | null;
  allList: readonly HoleRow[];
  setCard: (card: Card) => void;
  setOnChainCard: (card: Card) => void;
  setLinkNote: Dispatch<SetStateAction<string | null>>;
  setFreshBadges: Dispatch<SetStateAction<string[]>>;
  setRestoreNote: (note: string | null) => void;
}) {
  // Read at each visit: a new device gets every hole from the chain, then only what was saved since.
  // A New game or a reset is not filled back. Adena's address only: a gnokey one is typed, so anyone's.
  const connected = useRef(""), tried = useRef(""); // connected: the account now, a read for another is dropped. tried: the one synced this visit.
  const [restoreBusy, setRestoreBusy] = useState(false); // the buttons wait for it
  // asked: every record again, after a New game or a reset, and said even when nothing comes
  const restore = async (who: string, asked = false) => {
    const c = game.current && game.current.chain;
    if (!c || !allList.length) return void (asked && setRestoreNote("The course is still loading. Try again in a moment."));
    const rows = await c.progressOf(who);
    if (connected.current !== who) return; // another account since, or none
    const was = syncedTo(who), before = cupTotals(loadCard(), allList), locked = lockedNote(), r = fromChain(rows, allList, asked ? 0 : was);
    markSynced(who, asked || was === Number.MAX_SAFE_INTEGER ? r.height : Math.max(r.height, was)); // a read of everything sets it afresh
    if (r.filled.length) (setCard(r.card), setOnChainCard(r.onChain));
    r.kinds.forEach(seeWeather);
    const all = [...r.badges, ...badgesFor({ strokes: 0, par: 0, pro: false, kind: "", timed: false, cups: cupTotals({}, []), weathers: weathersSeen() }, []).map((id) => ({ id, at: "" }))]; // the All weathers badge
    const back = all.flatMap((b) => rememberBadges([b.id], b.at)); // kept quietly: shown as new in the badges, not said one by one
    const after = cupTotals(r.card, allList), had = earned(), gnomes = GNOMES.filter((g) => g.unlock && !had.includes(g.id) && !UNLOCKS[g.unlock].ok(before) && UNLOCKS[g.unlock].ok(after));
    if (locked && gnomes.some((g) => g.id === linkedGnome()?.id)) setLinkNote((n) => (n === locked ? null : n)); // the shared link's gnome, unlocked now
    if (back.length) setFreshBadges((b) => byRarity([...b, ...back]));
    if (!r.filled.length && !back.length && !gnomes.length) return void (asked && setRestoreNote("Nothing to bring back: your card has every hole you saved."));
    track("progress_restored", { holes: r.filled.length, asked });
    setRestoreNote(backFromChain({ holes: r.filled.length, badges: back.length, gnomes: gnomes.map((g) => g.name) }));
  };
  const restoreAsked = account
    ? () => {
        setRestoreBusy(true);
        void restore(account.address, true).catch(() => setRestoreNote("The chain did not answer. Try again in a moment.")).finally(() => setRestoreBusy(false));
      }
    : undefined;
  useEffect(() => {
    const who = (connected.current = account ? account.address : "");
    if (!who || !allList.length || tried.current === who) return;
    tried.current = who;
    setRestoreBusy(true);
    void restore(who).catch((e) => errorKind(e) === "down" && tried.current === who && (tried.current = "")).finally(() => setRestoreBusy(false)); // tried again on a later list only if the node did not answer
  }, [account, allList]); // eslint-disable-line react-hooks/exhaustive-deps
  return { restoreBusy, restoreAsked };
}
