"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Snapshot } from "@/lib/engine";
import { HOT } from "@/lib/engine/types";
import type { Mode } from "@/lib/types";
import { sound } from "@/lib/feel";
import { AIMS, HONEST } from "@/lib/words";
import { networkOf, OTHER_URL } from "@/lib/network";
import Weather from "@/components/Weather";
import { Button, Segmented, InfoTip, useDialogOpen } from "@/components/ui";
import { buttonClass } from "@/components/button";

// The fast-moving fields (power, cause, flash) have a store of their own: only the parts that show them re-render.
const HOT_KEYS = new Set<string>(HOT);
type HotFields = Pick<Snapshot, (typeof HOT)[number]>;
export function makeHot() {
  let v: Partial<HotFields> = {};
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set(n: Snapshot) {
      if (HOT.every((k) => n[k] === v[k])) return;
      v = { power: n.power, cause: n.cause, flash: n.flash };
      subs.forEach((f) => f());
    },
    sub: (f: () => void) => (subs.add(f), () => void subs.delete(f)),
  };
}
export type Hot = ReturnType<typeof makeHot>;
const useHot = <K extends keyof HotFields>(hot: Hot, k: K) => useSyncExternalStore(hot.sub, () => hot.get()[k], () => hot.get()[k]);
/** Whether two game snapshots differ only in their fast-moving fields. */
export const sameCold = <T extends object>(a: T, b: T) => {
  for (const k in b) if (!HOT_KEYS.has(k) && a[k] !== b[k]) return false;
  return true;
};
// The power is drawn straight onto the bar: a React render per pointer move would be the whole cost of aiming.
const barWidth = (hot: Hot) => `${Math.round((hot.get().power || 0) * 100)}%`;
export function AimBar({ hot }: { hot: Hot }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = () => void (bar.current && (bar.current.style.width = barWidth(hot)));
    draw();
    return hot.sub(draw);
  }, [hot]);
  return <span ref={bar} style={{ width: barWidth(hot) }} />;
}
export function CauseNote({ hot }: { hot: Hot }) {
  const cause = useHot(hot, "cause");
  return cause ? <div key={cause.at} className="cause" aria-live="polite">{cause.label}</div> : null;
}
export function LiveWeather({ hot, ...props }: { hot: Hot; w: Snapshot["weather"]; until: number | null; night: boolean; world?: string; dark?: boolean }) {
  return <Weather {...props} flash={useHot(hot, "flash") || 0} />;
}

/** A word over the course for a moment. A timer takes it away, not its animation: reduced motion has none. center: news, which waits while a dialog is open. */
export function Toast({ text, onDone, ms = 3200, center }: { text: string; onDone: () => void; ms?: number; center?: boolean }) {
  const done = useRef(onDone);
  done.current = onDone;
  const dialog = useDialogOpen(), held = !!center && dialog;
  useEffect(() => {
    if (held) return;
    const t = setTimeout(() => done.current(), ms);
    return () => clearTimeout(t);
  }, [ms, held]);
  if (held) return null;
  return <div className={center ? "toast toast--center" : "toast"} role="status" style={ms !== 3200 ? { animationDuration: `${ms}ms` } : undefined}>{text}</div>;
}

/** Which chain the page plays on; nothing on mainnet. onSupport: the tip, a button of its own beside the banner. */
export function NetBanner({ rpc, onSupport, onFeedback }: { rpc: string; onSupport: () => void; onFeedback: () => void }) {
  const net = networkOf(rpc);
  if (net === "mainnet") return null;
  return (
    <div className="netbanner">
      <p className={`netbanner__band netbanner--${net}`}>
        <b data-short={net === "local" ? "Local" : "Test"}>{net === "local" ? "Local chain" : "Testnet"}</b>
        <span>{net === "local" ? "a node on this machine" : "practice scores"}</span>
        {net === "testnet" && OTHER_URL && <a className={buttonClass({ size: "s" }, "netbanner__go")} href={OTHER_URL}>Play on mainnet →</a>}
        <Button size="s" className="netbanner__feedback" aria-label="Send feedback" onClick={onFeedback}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" /></svg>
          <i>Feedback</i>
        </Button>
      </p>
      {/* the Players chip's twin, on the left */}
      <Button variant="chip" className="netbanner__support" aria-label="Support the game" onClick={onSupport}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
        <span>Support</span>
      </Button>
    </div>
  );
}

/** Assisted or Pro aim, with what each means. */
export function AimSetting({ aim, onChange, compact = false }: { aim: Mode; onChange: (m: Mode) => void; compact?: boolean }) {
  return (
    <div className={"aimset" + (compact ? " aimset--compact" : "")}>
      <span className="aimset__label">Aim</span>
      <Segmented className={compact ? "seg--s" : ""} label="Aim" value={aim} full={!compact} options={AIMS} onChange={(m) => (sound("blip"), onChange(m))} />
      {/* both lines share one cell, one hidden: the box keeps the longer one's size and nothing moves on a switch */}
      <small className="aimset__help real__fine">
        <span className={aim === "pro" ? "" : "off"} aria-hidden={aim !== "pro"}>
          {compact ? "No aim line: you read the course yourself. Ranked on its own board." : "No aim line · ranked apart"}
          <InfoTip label="Why ranked apart?" note={HONEST} tabIndex={aim === "pro" ? 0 : -1} />
        </span>
        <span className={aim === "pro" ? "off" : ""} aria-hidden={aim === "pro"}>{compact ? "The chain previews your shot: see the whole aim line before you swing." : "Full aim line"}</span>
      </small>
    </div>
  );
}
