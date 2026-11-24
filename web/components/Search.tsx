"use client";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";

/** A toolbar search's state, shared by its icon and its row. Shown while open or while a query is kept; Escape or ✕ clears and closes it. */
export function useSearch(value: string, onChange: (text: string) => void, says: { label: string; placeholder: string; id: string }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null), icon = useRef<HTMLButtonElement>(null), row = useRef<HTMLDivElement>(null), back = useRef(false);
  const shown = open || value !== "";
  useEffect(() => {
    if (open) field.current?.focus();
    if (!shown && back.current) (back.current = false), icon.current?.focus();
  }, [shown, open]);
  const close = () => ((back.current = true), onChange(""), setOpen(false));
  return {
    value, onChange, open, shown, field, icon, row, close, ...says,
    press: () => (open ? close() : setOpen(true)),
    // Escape stops here: the game's Escape would leave the screen
    key: (e: KeyboardEvent) => shown && e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), close()),
    // focus gone from both the row and the icon
    blur: (e: FocusEvent) => !row.current?.contains(e.relatedTarget) && e.relatedTarget !== icon.current && setOpen(false),
  };
}
type Search = ReturnType<typeof useSearch>;

/** The search's icon, pressed while the search shows. */
export function SearchButton({ search: s }: { search: Search }) {
  return (
    <Button ref={s.icon} variant="icon" size="s" type="button" className={`gbar__icon${s.shown ? " btn--on" : ""}`} aria-label={s.label}
      aria-expanded={s.shown} aria-controls={s.shown ? s.id : undefined} onClick={s.press} onKeyDown={s.key} onBlur={s.blur}
      onMouseDown={(e) => s.open && e.preventDefault()} /* the field keeps the focus, so the press closes it */>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
    </Button>
  );
}

/** The search's row under the toolbar, while it shows. */
export function SearchRow({ search: s }: { search: Search }) {
  if (!s.shown) return null;
  return (
    <div ref={s.row} className="gsearch" id={s.id} role="search" onKeyDown={s.key} onBlur={s.blur}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
      <input ref={s.field} type="search" placeholder={s.placeholder} aria-label={s.label} value={s.value} onChange={(e) => s.onChange(e.target.value)} />
      <Button variant="icon" size="s" type="button" className="gsearch__close" aria-label="Close the search" onClick={s.close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </Button>
    </div>
  );
}
