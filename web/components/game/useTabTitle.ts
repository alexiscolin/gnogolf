"use client";

import { useEffect } from "react";
import type { Snapshot } from "@/lib/engine";
import { holeNumber } from "@/lib/card";

// The rolling ball's place in the tab title, outside React: an update in mid-roll does not send it back to the start.
const rolling = { k: 0 };

/** The tab's title says how the shot goes, and a tab left behind calls the player back. */
export function useTabTitle(s: Snapshot | null, playing: boolean) {
  // the effect follows only what the title shows: a power-bar step does not restart it
  const tHas = !!s, tN = s ? holeNumber(s.holes, s.id) : "", tName = s ? s.name : "";
  const tHoled = !!(s && s.holed), tFlying = !!(s && s.flying), tAiming = !!(s && s.aiming), tStrokes = s ? s.strokes : 0;
  useEffect(() => {
    const name = "Gnogolf";
    const set = () => {
      if (document.hidden && tHas && playing) return (document.title = `The gnome is waiting… · ${name}`);
      if (!tHas || !playing) return (document.title = `${name} · mini-golf on-chain`);
      const n = tN;
      if (tHoled) return (document.title = tStrokes === 1 ? `Hole in one! · ${name}` : `In the cup in ${tStrokes} · ${name}`);
      if (tFlying) return (document.title = `Rolling… · Hole ${n} · ${name}`);
      if (tAiming) return (document.title = `Lining it up… · Hole ${n} · ${name}`);
      document.title = `Hole ${n} · ${tName} · ${name}`;
    };
    set();
    document.addEventListener("visibilitychange", set);
    // while the shot rolls, a ball rolls along the tab title
    let roll: ReturnType<typeof setInterval> | undefined;
    if (tHas && playing && tFlying && !tHoled) {
      const n = tN, W = 12;
      roll = setInterval(() => {
        const at = rolling.k++ % W;
        document.title = `${"·".repeat(at)}●${"·".repeat(W - 1 - at)} Hole ${n} · ${name}`;
      }, 140);
    }
    return () => {
      clearInterval(roll);
      document.removeEventListener("visibilitychange", set);
    };
  }, [tHas, tN, tName, tHoled, tFlying, tAiming, tStrokes, playing]);
}
