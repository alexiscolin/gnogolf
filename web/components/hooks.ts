import { useEffect, useRef, useState } from "react";

export const NONE: readonly never[] = []; // always the same empty list, so memos hold

/** [copied, copy]: copy(text) writes to the clipboard, copied is true for ms after. */
export function useCopied(ms = 1800) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setCopied(false), ms);
    }, () => {});
  return [copied, copy] as const;
}

/** A value that goes back to none ms after its last set. */
export function useFlash<T>(ms: number, none: T) {
  const [v, setV] = useState<T>(none);
  useEffect(() => {
    if (v === none) return;
    const t = setTimeout(() => setV(none), ms);
    return () => clearTimeout(t);
  }, [v, none, ms]);
  return [v, setV] as const;
}
