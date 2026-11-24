"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Snapshot } from "@/lib/engine";
import { isTouch } from "@/lib/device";
import { MODES } from "@/lib/community";
import { shortAddr, within, type Chain } from "@/lib/chain";
import { hasAdena, type Account } from "@/lib/adena";
import { mmss, strokesWord } from "@/lib/words";
import { busy, saveLabel, fundCmd, type Rec, type SaveOf } from "@/lib/save";
import { ADENA_URL, FAUCET, GNOT_URL, networkOf } from "@/lib/network";
import { track, WALLET_STEPS, type WalletFrom } from "@/lib/analytics";
import { Button, Sheet, SheetClose } from "@/components/ui";
import { buttonClass } from "@/components/button";
import { useCopied } from "@/components/hooks";
import { NameForm, type NameCheck } from "@/components/Leaderboard";

/** The clock's time, read again every second. */
function useNow(clock: () => number) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [clock]);
  return now;
}

/** How long the round can still be saved on-chain, then that it no longer can. by and clock are on the chain's clock. */
// ranked: a course hole. moot: no better than the player's best there. dare: the rival a won duel dares back. dares: the save would make the player's link a dare.
export function SaveClock({ by, clock = Date.now, stale, ranked, moot, dare, dares, again = "Play again" }: { by: number; clock?: () => number; stale?: boolean; ranked: boolean; moot?: boolean; dare?: string; dares?: boolean; again?: string }) {
  const now = useNow(clock);
  const left = by - now;
  if (left > 0 && !stale)
    return (
      <p className={"saveclock" + (left < 60000 ? " saveclock--soon" : "")}>
        {dare && !moot ? "" : "Only in this browser. "}Save within <b>{mmss(left)}</b> {moot ? "to play it on-chain (your best here stays)" : dare ? `to ${ranked ? "rank it and " : ""}dare ${dare} back` : `${ranked ? "to be ranked" : "to keep it on your address"}${dares ? " and dare friends with your ghost" : ""}`}.
      </p>
    );
  return (
    <p className="note note--warn">
      This round's weather is over: it can no longer be saved on-chain. {again} in the new one.
    </p>
  );
}

// named: a name just taken with it, said in the same line
export function RecordState({ record, account, s, chain, named = "" }: { record: Rec; account: Account | null; s: Snapshot; chain: Chain | null; named?: string }) {
  if (!record) return null;
  // the player's page on the hole shows their best: a holed round is not kept
  const best = chain && account && (
    <a href={chain.roundURL(s.id || "", account.address)} target="_blank" rel="noopener noreferrer">
      See your best on gno.land ↗
    </a>
  );
  // one <p> whatever the state, so React keeps it and a screen reader hears each change
  switch (record.at) {
    case "signing":
      return record.of === undefined ? null : <p className="note" role="status">This round is saved in {record.of} transactions: one shot list is more than one transaction can replay here. Adena asks {record.of} times.</p>;
    case "checking":
      return <p className="note" role="status">Sent. Reading it back from the chain…</p>;
    case "refused":
      return record.stale ? null : <p className="note note--bad" role="alert">{record.error}</p>;
    case "unsure":
      return <p className="note note--bad" role="alert">{record.error} {best}</p>;
  }
  if (record.stays)
    return <p className="note" role="status">Played on-chain, but your best here ({strokesWord(record.stays)}) stays: the chain keeps a best until a round beats it. {best}</p>;
  return (
    <p className="note note--good" role="status">
      Saved on-chain{named ? <> as <b>{named}</b>: you&apos;re on the boards</> : ""}. Your link now dares friends to race it. {best}
    </p>
  );
}

/** A won round kept through a reload, waiting for its save: a small card on any screen, until saved, forgotten or too late. */
export function PendingSave({ r, rec, by, clock = Date.now, onSave, onForget }: { r: SaveOf; rec: Rec; by: number | null; clock?: () => number; onSave: () => void; onForget: () => void }) {
  const now = useNow(clock);
  const done = rec?.at === "saved";
  // said for a moment once saved, then gone
  const forget = useRef(onForget);
  forget.current = onForget;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => forget.current(), 4000);
    return () => clearTimeout(t);
  }, [done]);
  const left = by == null ? null : by - now;
  // too late to save: the round goes
  const over = !done && left != null && left <= 0;
  useEffect(() => void (over && (track("save_expired", { where: "pending", hole: r.id, strokes: r.strokes }), forget.current())), [over]); // eslint-disable-line react-hooks/exhaustive-deps -- as it runs out
  if (over) return null;
  return (
    <div className="pending">
      {done ? (
        <span className="pending__say" role="status">
          {rec.stays ? <><b>Played on-chain</b><span>Your best on <b>{r.name}</b> ({strokesWord(rec.stays)}) stays.</span></> : <><b>Saved on-chain ✓</b><span>Your round on <b>{r.name}</b> is public.</span></>}
        </span>
      ) : (
        <>
          <span className="pending__say">
            <span>Your <b>{strokesWord(r.strokes)}</b> on <b>{r.name}</b> {r.strokes > 1 ? "are" : "is"} waiting{left != null && <> · <b>{mmss(left)}</b> left</>}</span>
            {(rec?.at === "refused" || rec?.at === "unsure") && <small className="pending__err" role="alert">{rec.error}</small>}
          </span>
          {!(rec?.at === "refused" && rec.final) && (
            <Button variant="chain" disabled={busy(rec)} onClick={onSave}>
              {saveLabel(rec)}
            </Button>
          )}
        </>
      )}
      <SheetClose inline onClose={onForget} />
    </div>
  );
}

/** Where to get GNOT (href: its page, "" for none), and the address to paste there. */
export function GetGnot({ address, href, label = "" }: { address: string; href: string; label?: string }) {
  const [copied, copy] = useCopied();
  return (
    <span className="getgnot">
      {href && <><a href={href} target="_blank" rel="noopener noreferrer">{label}</a>{" · "}</>}
      <button className="linkish" onClick={() => void copy(address)}>
        <span aria-live="polite">{copied ? "Copied ✓" : "Copy my address"}</span>
      </button>
    </span>
  );
}

/** The sheet that leads onto the boards, each step ticked as it is done. From a won hole it saves at once. */
// lack: the GNOT the account lacks for the round on offer, null when unknown. waiting: that round, named while Adena is installed.
// elsewhere: Adena is on another node. gnokey: the round on offer saved with gnokey instead.
export function RealPlay({ from, account, wallet, onConnect, onClose, onSave, rpc, chainName, cost, funds, lack, named, waiting, chain, price, onNamed, typed, nameOk, elsewhere = false, onDisconnect, gnokey }: {
  from: WalletFrom;
  elsewhere?: boolean;
  gnokey?: ReactNode;
  onDisconnect?: () => void;
  account: Account | null; wallet: { busy: boolean; error: string | null; note?: string }; onConnect: () => void; onClose: () => void; onSave: (() => void) | null;
  rpc: string | null; chainName: string; cost: string | null; funds: number | null; lack: number | null; named: boolean | null; waiting: string | null;
  chain: Chain | null; price: number; onNamed: (name: string) => void;
  /** the name typed by a player without one goes in the save's signature; nameOk: the save may go */
  typed: { check: NameCheck; set: (stem: string) => void } | null; nameOk: boolean;
}) {
  // a round of this account's on the chain already, in either mode: the last step done
  const [savedAny, setSavedAny] = useState(false), [savedRead, setSavedRead] = useState(false);
  const me = account && account.address;
  useEffect(() => {
    setSavedRead(!chain || !me);
    if (!chain || !me) return setSavedAny(false);
    let live = true;
    void Promise.allSettled(MODES.map((m) => within(chain.rank(m, me)).then((r) => live && r.holes > 0 && setSavedAny(true)))).then(() => live && setSavedRead(true));
    return () => void (live = false);
  }, [chain, me]);
  const installed = hasAdena();
  const phone = !installed && isTouch();
  const net = networkOf(rpc || ""), local = net === "local", main = net === "mainnet";
  // a balance not read is not a step missing: the chain or Adena says a shortfall
  const funded = !!account && (funds == null || (lack != null ? lack === 0 : funds > 0));
  // one step at a time: only the first not done shows what to do
  const done = [installed, !!account, funded, !!named, savedAny && !onSave]; // a round waiting: its save is the step at hand
  const now = done.indexOf(false);
  const step = (i: number) => (done[i] ? "done" : i === now ? "now" : "later");
  // the step to do is scrolled into view: a phone's sheet is taller than the screen
  const steps = useRef<HTMLOListElement>(null);
  useEffect(() => void steps.current?.querySelector(".now")?.scrollIntoView({ block: "nearest" }), [now]); // void: it may return a promise, not a clean-up
  // tracked once its reads are in: a step shown only while they load is no step
  const settled = savedRead && !(account && named == null);
  useEffect(() => void (settled && track("wallet_step", { step: WALLET_STEPS[now] || "done", from })), [now, from, settled]);
  const [sent, setSent] = useState(false);
  // a phone has no Adena: the hole goes to the player's computer
  const sendOn = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Gnogolf", url: location.href });
      else await navigator.clipboard.writeText(location.href), setSent(true);
    } catch {}
  };
  return (
    <Sheet className="real" label="Get on the boards" onClose={onClose}>
        <span className="eyebrow">Adena wallet · a few minutes, once</span>
        <h2>Get on the boards</h2>
        <p className="real__lead">Same game, still free to play. Saving puts your round on gno.land: public, ranked, yours on any device.</p>

        {!account && <div className="real__cols">
          <div className="real__col">
            <h3>Free play</h3>
            <ul>
              <li>Every shot played by the smart contract</li>
              <li>No wallet, no cost</li>
              <li>Your card stays in this browser</li>
            </ul>
          </div>
          <div className="real__col real__col--on">
            <h3>Saved on-chain</h3>
            <ul>
              <li>Public, on your address, on any device</li>
              <li>Your ball marks stay for the players after you</li>
              <li>With a gno.land name, your best rounds are ranked</li>
            </ul>
          </div>
        </div>}

        <ol className="real__steps" ref={steps}>
          <li className={step(0)}>
            <b>Get Adena</b>
            <span>{phone ? "A computer's browser extension: save from there." : "The gno.land wallet, a browser extension."}</span>
          </li>
          <li className={step(1)}>
            <b>Connect it</b>
            <span>Nothing moves without your signature.</span>
          </li>
          <li className={step(2)}>
            <b>{main ? "Have some GNOT" : "Get test GNOT"}</b>
            <span>
              {local ? "They pay each save's small fee: from the node's test1, with gnokey." : <>They pay each save&apos;s small fee: {main ? "a little from the faucet hub, or bought" : "free from the faucet hub"}{chainName && <>, choose <b>{chainName}</b> in its list</>}.</>}
              {account && now === 2 && (
                <>
                  {" "}
                  {local ? null : <GetGnot address={account.address} href="" />}
                </>
              )}
              {account && (elsewhere
                ? <> · Adena is on another network: in Adena, pick the one whose RPC is <b>{(rpc || "").replace(/^https?:\/\//, "")}</b>.</>
                : funds != null && <> · You have {(funds / 1e6).toFixed(2)} GNOT here.</>)}
            </span>
          </li>
          <li className={step(3)}>
            <b>Pick your gno.land name</b>
            {account && now === 3 && chain ? <NameForm chain={chain} account={account.address} chainId={chainName || null} price={price} lead="Your name" onNamed={onNamed} typed={(onSave && typed) || undefined} /> : <span>{named ? "Your saved rounds are ranked." : "Only named players are ranked."}</span>}
          </li>
          <li className={step(4)}>
            <b>Hole out, then save</b>
            <span>The chain replays your shots: no faked scores.</span>
            {cost && <span className="real__cost">This round: {cost}</span>}
          </li>
        </ol>

        {wallet.error && <p className="note note--bad" role="alert">{wallet.error}</p>}
        {wallet.note && !account && <p className="note">{wallet.note}</p>}

        {!installed ? (
          phone ? (
            <>
              <Button variant="primary" className="btn--wide" onClick={() => void sendOn()}><span aria-live="polite">{sent ? "Link copied: open it on your computer" : "Play it on my computer"}</span></Button>
              <p className="real__fine">This round stays on this phone: play the hole there to save it.</p>
            </>
          ) : (
            <>
              <a className={buttonClass({ variant: "primary" }, "btn--wide")} href={ADENA_URL} target="_blank" rel="noopener noreferrer">
                Install Adena ↗
              </a>
              <p className="real__fine">
                Installed it? <button className="linkish" onClick={() => window.location.reload()}>Reload this page</button>
                {waiting ? <>: {waiting} waits for you in this tab.</> : " so the game can see it."}
              </p>
            </>
          )
        ) : account ? (
          // the button does the step at hand: GNOT first, then the round waiting, else back to the game
          now === 2 && local ? (
            <Button variant="primary" className="btn--wide" disabled={!fundCmd(account.address, chainName, rpc || "")} onClick={() => void navigator.clipboard.writeText(fundCmd(account.address, chainName, rpc || "")).then(() => setSent(true), () => {})}>
              <span aria-live="polite">{sent ? "Copied: run it in a terminal ✓" : "Copy the gnokey command"}</span>
            </Button>
          ) : now === 2 ? (
            <a className={buttonClass({ variant: "primary" }, "btn--wide")} href={main ? GNOT_URL : FAUCET} target="_blank" rel="noopener noreferrer">{main ? "Get GNOT ↗" : "Get free test GNOT ↗"}</a>
          ) : onSave && funded ? (
            <Button variant="chain" className="btn--wide" disabled={!nameOk} onClick={() => (track("save_clicked", { from: "sheet", blocked: null }), onSave())}>Save on-chain</Button>
          ) : (
            <Button variant={now === -1 || now === 4 ? "primary" : "secondary"} className="btn--wide" onClick={onClose}>
              {now === -1 ? "All set: play" : now === 4 ? "Play a hole, then save it" : "Later: keep playing"}
            </Button>
          )
        ) : (
          <Button variant="primary" className="btn--wide" disabled={wallet.busy} onClick={onConnect}>
            {wallet.busy ? "Waiting for Adena…" : "Connect Adena"}
          </Button>
        )}
        {!phone && gnokey}
        <p className="real__fine">
          {account && <>Connected as <span className="mono">{shortAddr(account.address, 4, 3)}</span> · </>}Network: <span className="mono">{chainName}</span>
          {account && onDisconnect && <> · <button className="linkish" onClick={onDisconnect}>Disconnect</button></>}
        </p>
    </Sheet>
  );
}
