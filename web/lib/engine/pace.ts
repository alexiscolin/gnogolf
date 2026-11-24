// Frame pacing and the graphics tier, in plain numbers. No three.js: the title reads it before the game loads.
import type { GfxMode } from "./types";

/** Where Auto remembers a device found too slow for High ("low"). */
export const SLOW_KEY = "gnogolf.gfx.slow";
const GFX_KEY = "gnogolf.gfx";
/** The graphics picked in this browser: auto (by the device), high or low. */
export function savedGfx(): GfxMode {
  try {
    const v = localStorage.getItem(GFX_KEY);
    return v === "high" || v === "low" ? v : "auto";
  } catch {
    return "auto";
  }
}
export function saveGfx(m: GfxMode) {
  try { localStorage.setItem(GFX_KEY, m); } catch {}
}
/** Whether this browser plays in Low: picked, or Auto on a device found slow. blocked: the answer when storage cannot be read. */
export function lowGfx(blocked = false) {
  const gfx = savedGfx();
  try {
    return gfx === "low" || (gfx !== "high" && localStorage.getItem(SLOW_KEY) === "low");
  } catch {
    return blocked;
  }
}


const out = { draw: false, budget: 0 };
/** One display refresh: drawn once a whole interval is owed (less 1 ms of jitter); the rest is carried, one interval at most. The same object every call. */
export function pace(budget: number, gap: number, interval: number) {
  const b = budget + gap;
  out.draw = b >= interval - 1;
  out.budget = out.draw ? Math.min(b - interval, interval) : b;
  return out;
}

/** Whether these gaps between busy frames (ms) say a slow GPU: over 20 on average, the slowest tenth left out. */
export function slowFrames(gaps: readonly number[]) {
  const d = [...gaps].sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(gaps.length * 0.9)));
  return d.reduce((s, x) => s + x, 0) / d.length > 20;
}

/** The slow-GPU probe, once a frame: gathers the gaps between busy frames. Returns whether there is enough to judge (2 s in over 10 gaps, or 90 gaps). */
export function probed(p: { prev: number; gaps: number[] }, now: number, busy: boolean) {
  if (busy && p.prev) p.gaps.push(now - p.prev);
  p.prev = busy ? now : 0;
  return p.gaps.length >= 90 || (p.gaps.length > 10 && p.gaps.reduce((s, x) => s + x, 0) >= 2000);
}

/** Whether busy frames sit steadily on 33 ms: a browser holding 30 fps (a battery saver), which says nothing of the GPU. */
export function capped30(gaps: readonly number[]) {
  const d = [...gaps].sort((a, b) => a - b), mid = d[d.length >> 1];
  return d[Math.floor(d.length * 0.1)] > 30 && mid >= 31 && mid <= 36;
}

/** Busy frames' gaps (ms) for analytics: the median frame rate, the slowest tenth's, and the frames over 50 ms. */
export function frameStats(gaps: readonly number[]) {
  const d = [...gaps].sort((a, b) => a - b), at = (q: number) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
  return { fps: Math.round(1000 / at(0.5)), fps_p10: Math.round(1000 / at(0.9)), long: d.filter((x) => x > 50).length, frames: d.length };
}

/** With no input for this long and no shot on its way, the scene dozes. */
export const AWAY_MS = 60_000;
/** The frame interval (ms) a scene in view is drawn at, or 0 for none: 60 fps busy or with fast movers, 30 while anything else moves, 10 once away or for a second after the last change. */
export function frameMs(busy: boolean, moving: boolean, fast: boolean, sinceInput: number, sinceWake: number) {
  if (busy) return 1000 / 60;
  if (!moving) return sinceWake > 1000 ? 0 : 1000 / 10;
  if (sinceInput > AWAY_MS) return 1000 / 10;
  return fast ? 1000 / 60 : 1000 / 30;
}
