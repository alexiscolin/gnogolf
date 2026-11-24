// Loading: the hole list at the start, then a hole: its gate, its state, its build, its shaders.
import type * as THREE from "three";
import { gateOf, type Gate } from "../community";
import { wait } from "../chain";
import { cupOf, legacyOf, oldToSlot } from "../card";
import { plainSkins } from "../terrain";
import { loadWorld, worldOf } from "../scene/worlds";
import { disposeCourse, isDrawn } from "../scene/materials";
import { setLighting } from "../scene/studio";
import { buildHole, finishHole } from "../scene/course";
import { headlamp } from "../scene/gnome";
import { md, type Course, type Hole } from "../scene/data";
import { track } from "../analytics";
import { simHole } from "../sim/client";
import { NO_TAKEN, takedownOf, takenDown } from "../takedown";
import { authorOf } from "../builder/holes";
import { inWorld, linked, setList } from "./list";
import type { makeWeather } from "../scene/weather";
import type { Zone } from "../types";
import type { makeCamera } from "./camera";
import type { makeRival } from "./rival";
import type { makeAimer } from "./aim";
import type { makeExtras } from "./extras";
import type { ErrorKind, GameState, Link, Live } from "./types";

/** The hole as the scene dresses it: decor is seeded by name, so a hole keeps its old realm's or its slot's across versions. */
const decorOf = (s: Hole): Hole => ({ ...s, hole: legacyOf(s.slot) || s.slot || s.hole });

interface Needs {
  renderer: THREE.WebGLRenderer;
  weather: ReturnType<typeof makeWeather>;
  /** never drawn, compiled with the hole: the confetti, the player's holing */
  aside: THREE.Object3D;
  /** ?world=: any hole dressed in this world's look */
  forceWorld: string;
  /** the player's address, if known */
  self: () => string | null;
  alive: () => boolean;
  fail: (err: unknown, kind: ErrorKind) => void;
  cam: ReturnType<typeof makeCamera>;
  rival: ReturnType<typeof makeRival>;
  aimer: ReturnType<typeof makeAimer>;
  extras: ReturnType<typeof makeExtras>;
  applyWeather: () => void;
  newRound: (ask?: boolean) => void;
  aimable: () => void;
  resize: () => void;
  frame: (now: number) => void;
  setView: (v: GameState["view"]) => void;
  /** the hole shown whole, then the camera closes on the ball */
  introSoon: () => void;
}

export function makeLoader(E: Live, { renderer, weather, aside, forceWorld, self, alive, fail, cam, rival, aimer, extras, applyWeather, newRound, aimable, resize, frame, setView, introSoon }: Needs) {
  const { g, chain, scene, camera, publish } = E;
  // Loads are ticketed: only the latest one may land, and the round changes
  // before the wait, so any shot still in the air is already somebody else's.
  let loads = 0, warming = 0; // warming: the load whose hole is being built and compiled
  // the next hole's HoleState, read while the win card shows: "Next hole" then
  // asks nothing. Kept PREFETCH_MS at most (its weather and wear move on).
  const PREFETCH_MS = 60e3;
  let ahead: { id: string; at: number; p: Promise<Hole> } | null = null;
  function prefetch(id: string) {
    if (!id || (ahead && ahead.id === id)) return;
    const p = chain.state(id);
    ahead = { id, at: performance.now(), p };
    p.then((st) => loadWorld(st.world).catch(() => {}), () => ahead && ahead.p === p && (ahead = null)).catch(() => {});
  }
  function stateOf(id: string): Promise<Hole> {
    const a = ahead;
    ahead = null;
    return a && a.id === id && performance.now() - a.at < PREFETCH_MS ? a.p.catch(() => chain.state(id)) : chain.state(id);
  }
  /** Loads hole id. passed: a link's gate already said it plays. */
  async function load(id: string, passed = false) {
    const ticket = ++loads;
    // a shot in the air belongs to the old hole: its round ends, and the chain is asked nothing for it
    newRound(false);
    // Every way into a hole comes here, and a community hole plays only once the Builder's rules pass it.
    // Data or rules that cannot be read are no verdict: the hole did not load, with Try again.
    let gate: Gate = "";
    try {
      if (!passed) gate = await gateOf(chain, id, undefined, self());
    } catch (err) {
      if (ticket === loads && alive()) (g.failed = id), fail(err, "load");
      return;
    }
    if (gate) {
      if (ticket === loads && alive()) fail(new Error(gate), gate);
      return;
    }
    if (ticket !== loads || !alive()) return;
    let s: Hole;
    const t0 = performance.now();
    try {
      s = plainSkins(await stateOf(id));
    } catch (err) {
      // for the banner's Try again: g.id is still the last hole's
      if (ticket === loads && alive()) (g.failed = id), fail(err, "load");
      return;
    }
    if (ticket !== loads || !alive()) return;
    // the kept list calls this hole current, but its state names a newer version:
    // the list is read anew, and that version played
    if (s.next && g.list.some((h) => h.id === id)) {
      try {
        setList(g, await chain.holes(true));
      } catch {}
      if (ticket !== loads || !alive()) return;
      if (!g.list.some((h) => h.id === id)) return load(s.next);
    }

    // played by its version id: the chain saves no round by an alias
    id = s.hole || id;
    if (id !== g.id) rival.race(null); // a duel is on one hole
    g.id = id;
    g.failed = null;
    // the cup follows the hole played; a community hole keeps the cup it was opened from
    const row = g.list.find((h) => h.id === id);
    if (row) g.world = cupOf(row);
    else if (s.official !== false) g.world = cupOf(s);
    // ?world= dresses any hole in another world's look — for building one
    if (forceWorld) s = { ...s, world: forceWorld };
    // a cup's own look is fetched the first time one of its holes is played
    const t1 = performance.now();
    try {
      await loadWorld(s.world);
    } catch {} // offline: the hole draws as the garden, still playable
    if (ticket !== loads || !alive()) return;
    // a world that cuts the lane under a stroke's hazards needs them before the build:
    // the first four strokes' extras are read
    if (s.timed && worldOf(s).ahead && worldOf(s).open) {
      const seen = new Map<string, Zone>();
      for (const ex of await Promise.all([0, 1, 2, 3].map((k) => chain.extras(id, k).then(plainSkins, () => null))))
        for (const q of (ex && ex.zones) || []) if (q.kind === "hazard") seen.set(JSON.stringify(q), q);
      if (ticket !== loads || !alive()) return;
      if (seen.size) s = { ...s, pulseZones: [...seen.values()] };
    }
    g.s = s;
    if (g.course) {
      scene.remove(g.course);
      disposeCourse(g.course); // the old island's GPU memory goes with it
    }
    g.course = null;
    extras.forget();
    aimer.forget(); // the hole is read anew: so are its previews
    // nothing is drawn from here until the shaders are ready: the build takes two tasks,
    // then the shaders compile off the main thread
    warming = ticket;
    const built0 = performance.now();
    let course: Course | null = null;
    try {
      course = buildHole(decorOf(g.s), { defer: true });
      await wait(0); // the pieces, then (next task) their merge
      if (ticket !== loads || !alive()) return void disposeCourse(course);
      cam.collect(worldOf(g.s).camSolids ? course : null); // the pieces' boxes, before the merge
      finishHole(course);
    } catch (err) {
      // our bug, not the chain's: say so, and leave the game usable
      console.error(err);
      if (ticket !== loads) return;
      warming = 0;
      fail(err, "draw");
      return;
    }
    g.course = course;
    scene.add(course);
    setLighting(scene, course.userData.time);
    headlamp(E.ball, s.world === "mines"); // any gnome clips a lamp on in the mines (the Miner's is always lit)
    // a hole's own weather, until a stroke's forecast says otherwise
    weather.board(s.board.w, s.board.h, cupOf(s), course.userData.terrain.dry || course.userData.terrain.onGreen, course.userData.height);
    // the round's weather: the chain's forecast for its five minutes
    g.period = s.period;
    g.forecast = s.weather || null;
    applyWeather();
    newRound();
    // the fixed gas of a commit is only in Weather(), not in HoleState's forecast:
    // read once a hole and a period (one period, one forecast)
    if (s.period != null)
      void chain.weather(id, s.period).then((fc) => {
        if (ticket === loads && fc.period === g.period) g.forecast = fc;
      }, () => {});
    const built1 = performance.now();
    await warm(); // shaders now, not on the player's first click
    if (ticket !== loads || !alive()) return;
    warming = 0;
    aimable();
    g.buildMs = [Math.round(built1 - built0), Math.round(performance.now() - built1)]; // ?camlog's buildMs(): [build, compile]
    track("hole_loaded", { hole: id, world: s.world, state_ms: Math.round(t1 - t0), world_ms: Math.round(built0 - t1), build_ms: g.buildMs[0], compile_ms: g.buildMs[1] });
    void simHole(chain, id); // for the previews, and a shot set off at once
    g.rig = null; // a new hole starts from its overview, not from the last one
    cam.prepare();
    resize();
    setView("overview");
    if (g.started) introSoon();
  }

  /** What is set aside (the confetti, the player's holing) compiled, lit as the hole is. */
  const warmAside = () => renderer.compile(aside, camera, scene);
  // Every shader the hole can need: the scene, what is set aside, and the see-through variant of
  // what a canopy fade turns transparent (only started). Resolves once what is drawn now is linked.
  function warm() {
    const fades: THREE.Material[] = [];
    scene.traverse((o) => {
      const m = isDrawn(o) ? o.material : null;
      if (m && !Array.isArray(m) && md(m).fade === 1 && !m.transparent) fades.push(m);
    });
    if (fades.length) {
      for (const m of fades) m.transparent = true;
      renderer.compile(scene, camera);
      for (const m of fades) (m.transparent = false), (m.needsUpdate = true);
    }
    warmAside();
    // without parallel compiling this resolves at once; a driver that never says ready is waited 2 s
    let t: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      renderer.compileAsync(scene, camera).catch((e: unknown) => console.warn("gnogolf: compileAsync", e)),
      new Promise<void>((r) => (t = setTimeout(() => (console.warn("gnogolf: shaders not ready after 2 s"), r()), 2000))),
    ]).finally(() => clearTimeout(t));
  }

  /** The takedown list, read once a visit; empty if it cannot be read (the next start tries again). */
  const takedown = () => takedownOf(chain).catch(() => NO_TAKEN);

  // a link to a refused community hole lands on the cups, and says why
  const refusedLink = (gate: Gate) => start(null).then((to) => (to === null ? gate || null : to));
  // a link's gate; null when it cannot be read now: load asks again
  const linkGate = (id: string): Promise<Gate | null> => gateOf(chain, id, undefined, self()).catch(() => null);

  /** Starts on the hole a link names, or a cup's first. Returns where it landed; null for a link to nothing. */
  async function start(link: string | Link | null): Promise<"hole" | "cup" | "taken" | "unchecked" | "unheld" | null> {
    // the takedown list is read beside the hole list, never before it: only a link to a community hole waits for it
    const taking = takedown().then((t) => {
      if (alive() && g.taken !== t) {
        g.taken = t;
        if (g.all) setList(g, g.all);
        void publish();
      }
      return t;
    });
    // a link to a hole taken down opens the cups, and says so
    if (typeof link === "string" && authorOf(link) && takenDown(await taking, link)) return start(null).then((to) => (to === null ? "taken" : to));
    let list = await chain.holes();
    // the tab's kept list does not have the linked hole yet: ask the chain
    if (typeof link === "string" && link && !list.some((h) => h.id === link || h.slot === (oldToSlot(link) || link))) list = await chain.holes(true);
    if (!alive()) return null; // destroyed while the chain answered (a remount in dev)
    setList(g, list);
    if (!g.list.length) throw new Error("no hole is registered on this chain");
    // a string is a hole's id or alias (or an old realm id)
    const asked = linked(g, typeof link === "string" ? { id: link } : link);
    // an archived version Holes() no longer lists: the chain may still have it; if not, the cups
    if (!asked && typeof link === "string" && link) {
      const gate = await linkGate(link);
      if (gate) return refusedLink(gate); // gate not read, or a link to nothing: the load is tried, and fails
      await load(link, gate === "");
      if (!alive()) return null;
      if (g.s) {
        g.linked = true;
        requestAnimationFrame(frame);
        return "hole";
      }
      g.error = null;
      g.failed = null;
    }
    const gate = asked ? await linkGate(asked.id) : null;
    if (gate) return refusedLink(gate);
    g.linked = !!asked;
    // ?cup=island alone: that cup, on its first hole
    const cupWant = typeof link === "object" && link && "cup" in link ? link.cup : undefined;
    const cupLink = cupWant && g.list.some((h) => cupOf(h) === cupWant) ? cupWant : "";
    g.world = asked ? cupOf(asked) : cupLink || g.world || "garden";
    const first = asked || inWorld(g)[0] || g.list[0];
    await load(first.id, !!asked && gate === "");
    if (!g.s) throw new Error(g.error || "the first hole could not be loaded");
    requestAnimationFrame(frame);
    // a place that is not in the cup: a link to nothing
    return asked ? "hole" : cupLink && typeof link === "object" && link && "n" in link && !link.n ? "cup" : null;
  }

  return {
    start,
    load,
    prefetch,
    warm,
    warmAside,
    /** Whether the hole of the latest load is still being built and compiled. */
    warming: () => warming === loads,
  };
}
