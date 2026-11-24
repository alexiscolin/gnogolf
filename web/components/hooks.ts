// Small hooks the screens share, and the empty list their memos keep.

import { useEffect, useRef, useState } from "react";

export const NONE: readonly never[] = []; // an empty list that stays the same one: memos keep

/** "Copied ✓" for a moment: copy(text) puts it on the clipboard, copied says
 *  so for ms (its timer goes with the component). */
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

/** A value said a moment: set, it is back to none ms after the last set (its timer goes with the component). */
export function useFlash<T>(ms: number, none: T) {
  const [v, setV] = useState<T>(none);
  useEffect(() => {
    if (v === none) return;
    const t = setTimeout(() => setV(none), ms);
    return () => clearTimeout(t);
  }, [v, none, ms]);
  return [v, setV] as const;
}
