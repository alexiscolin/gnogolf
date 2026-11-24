// What a stroke is played in: the weather drawn (the round's forecast, with
// what the hole and the stroke bring) and the clock the timed pieces move on.
import { ambience } from "../feel";
import { RULES } from "../chain";
import { motion } from "../scene/materials";
import { ud } from "../scene/data";
import type { makeWeather, WeatherZone } from "../scene/weather";
import type { Extras, Wall, Zone } from "../types";
import { TICKS_PER_S, type Live } from "./types";

/** weather: the scene's (scene/weather.ts); fake: the forecast ?weather= asks for ("": the chain's). */
export function makeForecast(E: Live, { weather, fake }: { weather: ReturnType<typeof makeWeather>; fake: string }) {
  const { g, chain, publish } = E;
  // ?weather= fakes a forecast, for screenshots
  let fakeWeather = fake;
  const faked = (): WeatherZone[] | "" => fakeWeather && (["wind", "rain", "fog", "storm", "snow"] as const)
    .filter((skin) => fakeWeather.includes(skin))
    .map((skin): WeatherZone => ({ skin, vec: skin === "wind" ? ([0.05, -0.03] as const) : ([0, 0] as const) }))
    // a storm as the chain has it: its wind in two gusts 40° either side, taking turns
    .concat(fakeWeather.includes("storm") && g.s ? [0.7, -0.7].map((a, k): WeatherZone => ({ skin: "wind", vec: [0.11 * Math.cos(a), 0.11 * Math.sin(a)], min: [0, 0], max: [g.s!.board.w, g.s!.board.h], every: 6, on: 3, phase: 3 * k })) : []);

  // The weather drawn is the round's (a forecast fixed for its five minutes),
  // with whatever the hole or the stroke carries itself.
  let strokeZones: readonly Zone[] = [], strokeWalls: readonly Wall[] = [], strokeEx: Extras | null = null;
  // the zones that act on the ball now: the hole's, the forecast's, the stroke's
  const zonesNow = (): Zone[] => [...(g.s ? g.s.zones : []), ...((g.forecast && g.forecast.zones) || []), ...strokeZones];
  function applyWeather(zones?: readonly Zone[]) {
    if (zones) strokeZones = zones;
    if (!g.s || !g.course) return;
    const fk = faked();
    g.weather = weather.set(fk || zonesNow(), fk ? null : g.forecast);
    everyL = everyNow();
    // the mill's sails count from a quarter turn, sail down: tick 0 of the clock
    const mill = g.course.userData.mill;
    if (mill && mill.shoot && !mill.started) (mill.shoot(), (mill.started = true));
    ambience(g.weather || {});
    if (g.course.userData.wind) g.course.userData.wind((g.weather && g.weather.wind) || null);
    if (g.course.userData.weather) g.course.userData.weather(g.weather); // the decor dressed for it (sunbathers in, parasols shut...)
    void publish();
  }
  // Between rounds the period may have turned: a round not started yet takes
  // the new weather. Asked only once the loaded period is over on the chain's
  // clock (HoleState has just given the current one: no Period() behind it).
  const stale = () => g.period != null && chain.now() >= (g.period + 1) * RULES.periodMs;
  let freshening: Promise<void> | null = null;
  function freshWeather() {
    return (freshening = freshening || refresh().finally(() => (freshening = null)));
  }
  async function refresh() {
    const id = g.id, round = g.round;
    try {
      const p = await chain.period();
      if (p === g.period || !id || id !== g.id || round !== g.round) return;
      const fc = await chain.weather(id, p);
      if (id !== g.id || round !== g.round || g.shots.length) return; // a shot already went: keep its weather
      g.period = p;
      g.forecast = fc;
      applyWeather();
    } catch {}
  }
  // a hole looked at past its period, no stroke played: the HUD's weather follows
  const staleTimer = setInterval(() => g.s && !g.flying && !g.shots.length && stale() && void freshWeather(), 5000);

  // The timed pieces' clock: TICKS_PER_S substeps a second at rest and while
  // aiming. A shot is let go at a tick of it and the chain plays the stroke from
  // there, so what is on screen when you shoot is what the ball meets. A
  // replay drives it by the path's own steps.
  let clock = 0;
  let everyL = 0; // the timed pieces' common period, kept per round
  const everyOf = () => everyL;
  const everyNow = () => {
    // every timed piece there is: the hole's, the forecast's, and this stroke's (a tram, a gate)
    const ev = [...((g.s && g.s.walls) || []), ...((g.s && g.s.zones) || []), ...((g.forecast && g.forecast.zones) || []), ...strokeZones, ...strokeWalls]
      .map((q) => (q.every ?? 0) | 0).filter((e) => e > 0);
    if (!ev.length) return 0;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    return Math.min(1024, ev.reduce((a, b) => (a * b) / gcd(a, b)));
  };
  const tickNow = () => {
    const L = everyOf();
    return L ? Math.floor(clock) % L : null; // no timed piece: nothing to send
  };
  const showClock = (t: number) => {
    const mill = g.course && g.course.userData.mill;
    if (mill && mill.at) mill.at(t);
    // the hole's timed pieces, and the stroke's (its extras)
    for (const o of [g.course, E.extras]) for (const p of (o && ud(o).timed) || []) p.at(t);
    weather.clock(t); // a hole's gusts blow on the same clock
  };
  // timed pieces as they stand now (the clock runs on from where it is)
  const restTimed = () => showClock(clock);

  return {
    zonesNow,
    applyWeather,
    stale,
    freshWeather,
    everyOf,
    tickNow,
    showClock,
    restTimed,
    /** The stroke's own pieces taken in: their walls and their weather. */
    stroke: (ex: Extras) => ((strokeWalls = ex.walls), (strokeEx = ex), applyWeather(ex.zones)),
    /** No stroke's pieces: a new round. */
    noStroke: () => {
      strokeZones = [];
      strokeWalls = [];
      strokeEx = null;
    },
    /** ?weather=, set from the test hooks. */
    fake: (w: string) => ((fakeWeather = w), applyWeather()),
    /** A frame at rest or while aiming: the clock runs on, the pieces with it. */
    run(elapsed: number) {
      // at rest and while aiming the pieces move slowly enough to read and to
      // time (3.5 substeps a second, 1.5 with reduced motion); the replay
      // follows the path's own steps. The chain only sees the tick at release.
      // (kept within the pieces' period, as the tick sent is: past the 1,024
      // ticks the chain counts, what is shown is what the ball meets)
      const L = everyOf();
      clock = (clock + elapsed * (motion ? TICKS_PER_S : 1.5)) % (L || Infinity);
      showClock(clock);
    },
    // (the tick sent is the clock's floor: the replay starts up to a substep
    // behind what was shown at release, which holds until it catches up)
    showAt: (t: number) => showClock((clock = t < clock && t > clock - 1 ? clock : t)),
    setClock: (t: number) => (clock = t),
    get clock() {
      return clock;
    },
    /** The stroke's pieces as the chain gave them, or null. */
    get strokeEx() {
      return strokeEx;
    },
    stop: () => clearInterval(staleTimer),
  };
}
