"use client";

// The shared controls: every button, switch and sheet is one of these, so they all behave alike.

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ChangeEventHandler, type HTMLAttributes, type ReactNode } from "react";
import { vsPar, vsParWords } from "@/lib/card";
import { buttonClass, type ButtonLook } from "@/components/button";

/** keycap: the button's key, in a cap after the words. */
interface ButtonProps extends ComponentProps<"button">, ButtonLook {
  keycap?: ReactNode;
}
export function Button({ variant, size, keycap, className = "", children, ...props }: ButtonProps) {
  return (
    <button className={buttonClass({ variant, size }, className)} {...props}>
      {children}
      {keycap != null && <kbd className="btn__key">{keycap}</kbd>}
    </button>
  );
}

/** A flat label with a button's height and edge, for a row of buttons. */
export function Chip({ size = "l", className = "", children, ...props }: HTMLAttributes<HTMLSpanElement> & { size?: ButtonLook["size"] }) {
  return (
    <span className={["chip", size === "l" ? "" : `chip--${size}`, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </span>
  );
}

/** Choices side by side, one on. Pressed buttons, each a Tab stop: radios or tabs would promise arrow keys. */
interface SegmentedProps<T extends string> {
  options: readonly (readonly [T, ReactNode])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  full?: boolean;
  className?: string;
}
export function Segmented<T extends string>({ options, value, onChange, label, full = false, className = "" }: SegmentedProps<T>) {
  return (
    <div className={`seg${full ? " seg--full" : ""} ${className}`.trim()} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          className={value === v ? "on" : ""}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its label. */
export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: ChangeEventHandler<HTMLInputElement> }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <i aria-hidden="true" />
    </label>
  );
}

/** A note opened by a tap, as a tooltip never shows on touch. Closes on a tap elsewhere, Escape or blur. */
export function InfoTip({ label, note, className = "aimset__info", tabIndex, children = "ⓘ" }: { label: string; note: ReactNode; className?: string; tabIndex?: number; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null), pop = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = pop.current;
    if (!el) return;
    // pushed back inside the window, 16px from its edge
    el.style.marginLeft = "";
    const r = el.getBoundingClientRect();
    el.style.marginLeft = `${Math.min(0, innerWidth - 16 - r.right) || Math.max(0, 16 - r.left)}px`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    // captured before a dialog's own Escape: the note closes, not the menu it is in
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => (document.removeEventListener("pointerdown", away), window.removeEventListener("keydown", esc, true));
  }, [open]);
  return (
    <span ref={box} className="tip">
      <button type="button" className={className} tabIndex={tabIndex} aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen((v) => !v)} onBlur={() => setOpen(false)}>
        {children}
      </button>
      {open && <span ref={pop} id={id} className="aimset__pop" role="note">{note}</span>}
    </span>
  );
}

/** A score against par ("−2", "E", "+1"), green under it, red over it. words: "level par" for E. */
export const VsPar = ({ vs, words = false }: { vs: number; words?: boolean }) => (
  <b className={vs < 0 ? "good" : vs > 0 ? "bad" : undefined}>{(words ? vsParWords : vsPar)(vs)}</b>
);
/** No figure yet: a light dash. */
export const Nil = () => <span className="nil">–</span>;

const CloseX = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 4 16 16M16 4 4 16" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
);
export const BackIcon = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
/** A sheet's X, in its top-right corner unless inline. */
export function SheetClose({ onClose, inline = false }: { onClose: () => void; inline?: boolean }) {
  return (
    <button className={"round round--icon round--small" + (inline ? "" : " sheet__close")} aria-label="Close" onClick={onClose}>
      <CloseX />
    </button>
  );
}

// Dialogs stack: only the top one hears Escape and traps Tab.
const open: { modal: boolean }[] = [];
const watchers = new Set<() => void>();
const told = () => watchers.forEach((f) => f());
const watch = (f: () => void) => (watchers.add(f), () => void watchers.delete(f));
const anyModal = () => open.some((d) => d.modal);
/** Whether a modal dialog is open over the page. */
export const useDialogOpen = () => useSyncExternalStore(watch, anyModal, () => false);
// The control last pressed: a click does not focus a button in Safari, and a dialog must know what opened it.
let pressed: HTMLElement | null = null;
if (typeof document !== "undefined")
  document.addEventListener("pointerdown", (e) => void (pressed = e.target instanceof Element ? e.target.closest<HTMLElement>("button, a, summary, [tabindex]") : null), true);
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Focus moves into the dialog, Tab stays inside, Escape closes it, and focus goes back to what opened it. Returns the dialog's ref. */
function useDialog<T extends HTMLElement = HTMLElement>(onClose: (() => void) | null | undefined, modal = true) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = { modal };
    open.push(me);
    told();
    const active = document.activeElement, el = ref.current;
    // what opened it; never one of its own controls, which a dev remount finds focused
    const back = [active instanceof HTMLElement && active !== document.body ? active : null, pressed].find((x) => x && !(el && el.contains(x))) || null;
    el?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (open[open.length - 1] !== me || !ref.current) return;
      if (e.key === "Escape" && close.current) return e.stopPropagation(), close.current();
      if (e.key !== "Tab") return;
      const all = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!all.length) return e.preventDefault();
      const a = all[0], z = all[all.length - 1];
      // from outside or from the dialog itself: to its first control, or its last going back
      if (!ref.current.contains(document.activeElement) || document.activeElement === ref.current) return e.preventDefault(), (e.shiftKey ? z : a).focus();
      if (e.shiftKey && document.activeElement === a) e.preventDefault(), z.focus();
      else if (!e.shiftKey && document.activeElement === z) e.preventDefault(), a.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      open.splice(open.indexOf(me), 1);
      told();
      // Next task: a trigger hidden while the dialog was open can take focus again, and a dialog opened meanwhile keeps its own.
      if (back instanceof HTMLElement)
        setTimeout(() => {
          const now = document.activeElement;
          if (back.isConnected && (!now || now === document.body)) back.focus({ preventScroll: true });
        }, 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- modal is read once, as it opened
  return ref;
}

/** A sheet over the game: its dim backdrop and its corner X close it. */
interface SheetProps {
  label: string;
  onClose: () => void;
  className?: string;
  role?: "dialog" | "alertdialog";
  children?: ReactNode;
}
export function Sheet({ label, onClose, className = "", role = "dialog", children }: SheetProps) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onClose);
  // A drag begun in the sheet and let go over the dim clicks the dim too: not a tap on it.
  const inside = useRef(false);
  return (
    <div className="sheet" onPointerDown={(e) => (inside.current = e.target !== e.currentTarget)} onClick={() => !inside.current && onClose()}>
      <div ref={ref} tabIndex={-1} className={`sheet__in ${className}`.trim()} role={role} aria-modal="true" aria-label={label} id={id} onClick={(e) => e.stopPropagation()}>
        <SheetClose onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

/** Any other dialog. onClose: what Escape does, or nothing. */
interface DialogProps extends HTMLAttributes<HTMLElement> {
  onClose?: (() => void) | null;
  as?: "div" | "aside";
}
export function Dialog({ onClose = null, as: Tag = "div", children, ...props }: DialogProps) {
  const ref = useDialog<HTMLDivElement>(onClose, props["aria-modal"] === true || props["aria-modal"] === "true");
  return (
    <Tag ref={ref} tabIndex={-1} {...props}>
      {children}
    </Tag>
  );
}

/** A die, for a pick at random. */
export const Dice = () => (
  <svg viewBox="0 0 24 24" className="rival__dice" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    {[[7.5, 7.5], [16.5, 7.5], [12, 12], [7.5, 16.5], [16.5, 16.5]].map(([x, y]) => <circle key={x * 99 + y} cx={x} cy={y} r="2" />)}
  </svg>
);

/** A round inked window with its scene clipped to it. The clip id is its own, so two on a screen never share one. */
export function Frame({ className, children }: { className?: string; children?: ReactNode }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>{children}</g>
      <circle cx="60" cy="60" r="56" className="w__ring" />
    </svg>
  );
}
