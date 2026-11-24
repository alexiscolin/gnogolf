// The frame loop: which display refreshes are drawn, at what size, and in
// which graphics tier (its arithmetic is engine/pace.ts).
import * as THREE from "three";
import { isTouch } from "../device";
import { quality, motion } from "../scene/materials";
import { weakGpu, maxDpr } from "../scene/studio";
import { courseBox, laneBox, overviewRig, farRig } from "../scene/rigs";
import { register, track } from "../analytics";
import { pace, probed, slowFrames, capped30, frameMs, frameStats, SLOW_KEY } from "./pace";
import type { makeWeather } from "../scene/weather";
import type { GfxMode, Live, Tier } from "./types";

const gfxOf = (m: string): GfxMode => (m === "high" || m === "low" ? m : "auto");

interface Needs {
  renderer: THREE.WebGLRenderer;
  weather: ReturnType<typeof makeWeather>;
  /** the graphics setting the game starts in */
  gfx: string;
  alive: () => boolean;
  /** the hole of the latest load still being built and compiled: nothing is drawn (engine/loader.ts) */
  warming: () => boolean;
  /** the timed pieces' common period, 0 for none (engine/forecast.ts) */
  everyOf: () => number;
  /** whether something on the course wants every frame: a shot, an aim, an effect playing */
  isBusy: (now: number) => boolean;
  /** one frame: the seconds since the last one drawn (0.5 at most), and the animations' step (0.1 at most) */
  draw: (now: number, elapsed: number, dt: number) => void;
}

export function makeLoop(E: Live, { renderer, weather, gfx, alive, warming, everyOf, isBusy, draw }: Needs) {
  const { g, publish, screen, ground } = E;

  // Graphics: "high" is the game as designed; "low" draws fewer pixels (a
  // pixel ratio of 1, 0.8 on a phone), leaves the ink off distant decor and
  // thins the weather. "auto" picks low for a weak or software GPU, and for a
  // device whose frames were slow (the probe below: remembered for next time).
  let gfxMode: GfxMode = gfxOf(gfx), tier: Tier = "high";
  const coarse = isTouch();
  const weak = weakGpu(renderer);
  const OLD_SLOW_KEY = "gnogolf.gfx.auto";
  // (a Low found by the probe before it knew the display's own rate: 75, 90
  // and 144 Hz screens were marked slow by the frame cap alone, and are probed again)
  try { if (localStorage.getItem(OLD_SLOW_KEY) === "low") localStorage.removeItem(OLD_SLOW_KEY); } catch {}
  const wasSlow = () => { try { return localStorage.getItem(SLOW_KEY) === "low"; } catch { return false; } };
  // A slow GPU (seen on some Safari and Firefox setups) gets a lighter canvas:
  // the first 2 s of busy drawing are timed, and frames drawn over 20 ms apart
  // on average (the cap aims at one every 16.7 ms, whatever the display) turn
  // Auto to Low, once (and for the next visits; frames held at 30 fps by a
  // battery saver only for this one).
  let dprCap = Infinity;
  function setTier() {
    const was = tier;
    tier = gfxMode === "auto" ? (weak || probe.slow || wasSlow() ? "low" : "high") : gfxMode;
    quality.low = tier === "low"; // outlines: from the next hole built
    weather.thin(quality.low);
    dprCap = quality.low ? (coarse ? 0.8 : 1) : Infinity;
    resize();
    register({ gfx: gfxMode, tier, weak_gpu: weak, slow: probe.slow });
    return was !== tier;
  }
  // only busy frames count (an idle scene may be drawn at 10 or 30 fps on purpose)
  const probe = { prev: 0, gaps: [] as number[], done: false, slow: false };
  function probeFrame(now: number, busy: boolean) {
    if (tier === "low" || probe.done || !probed(probe, now, busy)) return;
    probe.done = true;
    track("perf", { tier: gfxMode, slow: slowFrames(probe.gaps) });
    if (slowFrames(probe.gaps) && gfxMode === "auto") {
      probe.slow = true;
      // and for the next visits; frames held steady at 30 fps (a battery saver, or vsync on a GPU just
      // too slow for 60) only for this one: probed again next visit
      if (!capped30(probe.gaps)) try { localStorage.setItem(SLOW_KEY, "low"); } catch {}
      console.info("gnogolf: slow frames, graphics set to low");
      setTier();
      void publish();
    }
  }

  // a round's frame rate, said as it ends (analytics): the gaps between busy frames drawn
  let fpsGaps: number[] = [], fpsPrev = 0;
  function fpsFrame(now: number, busy: boolean) {
    if (busy && fpsPrev && fpsGaps.length < 3600) fpsGaps.push(now - fpsPrev);
    fpsPrev = busy ? now : 0;
  }
  function sayFps() {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory; // (Chrome's only)
    if (fpsGaps.length >= 30 && g.id) track("fps", { hole: g.id, tier, ...frameStats(fpsGaps), memory_mb: mem ? Math.round(mem.usedJSHeapSize / 1e7) * 10 : null });
    fpsGaps = [];
    fpsPrev = 0;
  }

  const sizeNow = new THREE.Vector2();
  let dprChanged = false;
  function resize() {
    // the canvas is a full-screen backdrop by design; sizing it from the window
    // rather than from layout keeps it right whatever the CSS pipeline does
    const w = window.innerWidth;
    const h = window.innerHeight;
    // the window may have moved to another screen, or been zoomed: the same
    // cap as when the renderer was made, on the ratio of now
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr(), dprCap);
    if (renderer.getPixelRatio() !== dpr) (renderer.setPixelRatio(dpr), (dprChanged = true));
    if (!(w > 0 && h > 0)) return; // a hidden or collapsed window: nothing to size
    // resizing the drawing buffer clears it: only when the size really changed,
    // never on a hole load or a weather change that leaves it as it is
    const sz = renderer.getSize(sizeNow);
    if (sz.x !== w || sz.y !== h || dprChanged) renderer.setSize(w, h);
    dprChanged = false;
    if (!g.s) return;
    g.over = overviewRig(courseBox(g.s.board), screen());
    // the Far camera: the whole hole with a margin, room left for the mouse orbit
    g.far = farRig(laneBox(g.s, ground), screen());
    if (!g.rig) g.rig = { ...g.over, target: g.over.target.clone() };
  }
  window.addEventListener("resize", resize);
  setTier();

  let last = 0;
  // What the GPU is spared: nothing is drawn behind an opaque screen (the
  // title, the cups, the picker) or in a hidden tab, and a window in the
  // background (another app in front) is not drawn unless a shot is on its way.
  // In view (engine/pace.ts frameMs): 60 fps busy (a shot, an aim) or with
  // fast movers (timed pieces: a tram, a lift; a mill), 30 while anything else
  // moves, 10 after a minute with no input; with reduced motion and nothing
  // moving, nothing is drawn until something changes. At most 60 whatever
  // the display's rate.
  // the frames skipped add up (a budget): on a 75, 90 or 144 Hz display the
  // drawn ones land every one or two refreshes, 60 a second on average, not
  // on every second or third refresh (37 to 48 a second)
  let budget = 0, prevRaf = 0;
  let wake = 0; // the last input or change: a still scene under reduced motion draws for a second after it
  let blurred = false, input = performance.now(); // the last input: a minute past it, the scene dozes (AWAY_MS)
  const INPUTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
  const onBlur = () => (blurred = true);
  const onFocus = () => ((blurred = false), (wake = input = performance.now()));
  const onWake = () => (wake = input = performance.now());
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  for (const e of INPUTS) window.addEventListener(e, onWake, { passive: true, capture: true });
  function frame(now: number) {
    if (!alive()) return;
    requestAnimationFrame(frame);
    const gap = prevRaf ? now - prevRaf : 0;
    prevRaf = now;
    if (!g.started || g.covered || document.hidden || warming()) return (last = now), (budget = 0);
    const busy = isBusy(now);
    if (blurred && !busy) return (last = now), (budget = 0);
    // moving: the sway, water, weather and decor (all still under reduced
    // motion), or timed pieces (their clock runs under reduced motion too)
    const timed = everyOf() > 0, fast = motion && (timed || !!(g.course && g.course.userData.mill));
    const ms = frameMs(busy, motion || timed, fast, now - input, now - wake);
    if (!ms) return (last = now), (budget = 0); // (a still garden under reduced motion)
    const p = pace(budget, gap, ms);
    budget = p.budget;
    if (!p.draw) return;
    probeFrame(now, busy);
    fpsFrame(now, busy);
    // the clock of the timed pieces runs on real time, however far apart the
    // frames are (never stepped by a capped dt): at any frame rate a piece is
    // where the time says, never behind it
    const elapsed = Math.min((now - last) / 1000, 0.5), dt = Math.min(elapsed, 0.1);
    last = now;
    draw(now, elapsed, dt);
  }

  return {
    frame,
    resize,
    /** A round's frame rate, said as it ends. */
    sayFps,
    /** The graphics picked ("auto" | "high" | "low"), the device looked at afresh: whether the tier changed. */
    setGfx(m: string) {
      gfxMode = gfxOf(m);
      if (m === "auto") try { localStorage.removeItem(SLOW_KEY); } catch {} // a fresh look at the device
      Object.assign(probe, { prev: 0, gaps: [], done: false, slow: false });
      return setTier();
    },
    /** What the graphics setting gives on this device. */
    get tier() {
      return tier;
    },
    /** Something changed (a snapshot told): a still scene draws for a second after it. */
    woke: (now: number) => (wake = now),
    stop() {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      for (const e of INPUTS) window.removeEventListener(e, onWake, { capture: true });
      window.removeEventListener("resize", resize);
    },
  };
}
