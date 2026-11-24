"use client";

import { useEffect, useState, type ReactNode } from "react";
import { gnokeyPlan, gnokeyPaste, gnokeyLate, chainSplit, GNOKEY_ADDR_KEY, PRICE } from "@/lib/adena";
import { Button } from "@/components/ui";
import { messageOf } from "@/lib/words";
import { useCopied } from "@/components/hooks";
import { errorKind, isAddress, type Chain } from "@/lib/chain";

// The calls Adena would sign, as one paste for a terminal with gnokey (bash or zsh).
const KEY = "gnogolf.gnokey"; // the player's key name, kept in this browser
// any name gnokey takes, quoted for the shell: no quote, backslash or control character
const keyOk = (k: string) => /^[^'\\\u0000-\u001f]{1,64}$/.test(k);
const saved = (k: string) => () => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const keep = (k: string, v: string) => {
  try { localStorage.setItem(k, v.trim()); } catch {}
};

/** A gnokey paste: the key's name, the commands and Copy. note replaces the line beside Copy; hold: Copy waits under this label; hide: nothing to copy. */
function Panel({ summary, open, onOpen, txs, when = "", paste, note, done, hold, hide = false, onCopy, children }: {
  summary: string | null; open?: boolean; onOpen?: () => void; txs: number; when?: string; paste: (who: string) => string;
  note?: ReactNode; done: (copied: boolean) => ReactNode; hold?: string; hide?: boolean; onCopy?: () => void; children?: ReactNode;
}) {
  const [copied, copyText] = useCopied(1600);
  const [out, setOut] = useState(false); // copied once: the line may say what next
  const [key, setKey] = useState(saved(KEY));
  const name = key.trim(), ready = keyOk(name);
  // what is shown is what is copied
  const all = paste(`'${ready ? name : "YOUR_KEY_NAME"}'`);
  const onKey = (v: string) => (setKey(v), keep(KEY, v));
  const copy = () => (setOut(true), onCopy && onCopy(), void copyText(all));
  const box = (
      <div className="details__box gnokey__box">
        <ol className="gnokey__steps">
          <li>Your gnokey key&apos;s name (<code>gnokey list</code> shows them). It pays the fee, shown before you send.
            <input className="gnokey__key" value={key} onChange={(e) => onKey(e.target.value)} placeholder="my-key" aria-label="Your gnokey key name" aria-invalid={!!name && !ready} spellCheck={false} autoCapitalize="off" autoComplete="off" />
            {name && !ready && <small className="gnokey__bad">A key name here can&apos;t hold a quote ( &apos; ) or a backslash.</small>}
          </li>
          <li>Copy it, paste it in a terminal (macOS, Linux or WSL) and type your key&apos;s password ({txs === 1 ? "once" : `${txs} times: one per transaction`}).{when}</li>
        </ol>
        {!hide && <pre className="mono gnokey__code">{all}</pre>}
        <div className="gnokey__row">
          <Button variant="primary" className="gnokey__copy" disabled={!ready || !!hold || hide} onClick={copy}><span aria-live="polite">{copied ? "Copied" : hold || "Copy"}</span></Button>
          <span className="real__fine">{note || (ready ? done(out) : "Type your key name first.")}</span>
        </div>
        {children}
      </div>
  );
  // no summary: the caller has its own fold
  if (summary === null) return <div className="details gnokey">{box}</div>;
  return (
    <details className="details gnokey" open={open} onToggle={(e) => e.currentTarget.open && onOpen && onOpen()}>
      <summary>{summary}</summary>
      {box}
    </details>
  );
}

/** A round's save with gnokey. onSent: "It did", with the address to ask the chain for: me, else the key's typed here. */
export default function Gnokey({ s, chain, price, chainId, me, onSent }: {
  s: Parameters<typeof gnokeyPlan>[0] | null; chain: Chain | null; price: number; chainId: string | null; me?: string | null; onSent: (player: string) => void;
}) {
  const [out, setOut] = useState(""); // the round last copied
  const [addr, setAddr] = useState(saved(GNOKEY_ADDR_KEY)); // the key's address, with no account connected
  const typed = addr.trim(), who = me || (isAddress(typed) ? typed : "");
  // the commits as the chain cuts them, asked when the panel opens: the split an Adena save sends
  const round = s ? `${s.id}#${(s.shots || []).join(";")}#${s.period}` : "";
  // refused: the chain refused the round, no paste is offered. A node that did not answer leaves the model's split.
  const [split, setSplit] = useState<{ round: string; parts: readonly (readonly [number, number])[] | null; bad?: string; refused?: boolean } | null>(null);
  const ask = () => {
    if (!s || !chain || !s.id || s.period == null || (split && split.round === round)) return;
    setSplit({ round, parts: null });
    chainSplit(chain, { ...s, id: s.id }, s.period)
      .then((parts) => setSplit((v) => (v && v.round === round ? { round, parts } : v)))
      .catch((e: unknown) => setSplit((v) => (v && v.round === round ? { round, parts: null, bad: messageOf(e), refused: errorKind(e) !== "down" } : v)));
  };
  if (!s || !chain) return null;
  const mine = split && split.round === round ? split : null;
  const plan = gnokeyPlan(s, { realm: chain.realm, price, chainId, rpc: chain.rpc, parts: mine && mine.parts });
  if (!plan.length) return null;
  const checking = !!mine && !mine.parts && !mine.bad;
  return (
    <Panel summary="Save with gnokey instead" onOpen={ask} txs={plan.length} when=" It works while this round's weather lasts: see its countdown."
      paste={(key) => gnokeyPaste(plan, key, gnokeyLate(s.period, chain))} hide={!!(mine && mine.refused)} hold={checking ? "Checking…" : undefined} onCopy={() => setOut(round)}
      note={mine && mine.bad ? <span className="gnokey__bad">{mine.bad}</span> : checking ? "Asking the chain how it cuts this round…" : undefined}
      done={() => <>Saved when it prints <b>OK!</b> and a <b>TX HASH</b> for each.{out === round && (who ? <> <button className="linkish" onClick={() => onSent(who)} aria-label="It did: check the chain for this round">It did</button></> : " Give your key's address below to check it here.")}</>}>
      {/* no account connected: the key's address says whom to ask the chain for */}
      {!me && (
        <label className="gnokey__addr">
          Your key&apos;s address (g1…, <code>gnokey list</code> shows it), to check the save here. Optional.
          <input className="gnokey__key" value={addr} onChange={(e) => (setAddr(e.target.value), keep(GNOKEY_ADDR_KEY, e.target.value))} placeholder="g1…" aria-invalid={!!typed && !who} spellCheck={false} autoCapitalize="off" autoComplete="off" />
          {typed && !who && <small className="gnokey__bad">That is not a gno.land address: g1 and 38 more letters and digits.</small>}
        </label>
      )}
    </Panel>
  );
}

/** Another transaction as a gnokey paste. plan: its commands at this chain's id and gas price; when empty, why says what is missing. web: the same on gnoweb. */
export function GnokeyTx({ chain, plan, why, summary, open, web, onSent }: {
  chain: Chain; plan: (at: { chainId: string | null; price: number }) => readonly string[]; why: string;
  summary: string | null; open?: boolean; web: ReactNode; onSent?: () => void;
}) {
  const [at, setAt] = useState<{ chainId: string | null; price: number }>({ chainId: null, price: PRICE });
  useEffect(() => {
    let live = true;
    void chain.chainId().then((chainId) => live && setAt((a) => ({ ...a, chainId })), () => {});
    void chain.gasPrice().then((price) => live && setAt((a) => ({ ...a, price })), () => {});
    return () => void (live = false);
  }, [chain]);
  const list = plan(at);
  return (
    <Panel summary={summary} open={open} txs={Math.max(1, list.length)} paste={(who) => gnokeyPaste(list, who)} hide={!list.length}
      note={list.length ? undefined : why}
      done={(copied) => <>Done when it prints <b>OK!</b> and a <b>TX HASH</b>{list.length > 1 && " for each"}.{copied && onSent && <> <button className="linkish" onClick={onSent}>It did</button></>}</>}>
      <p className="real__fine gnokey__web">{web}</p>
    </Panel>
  );
}
