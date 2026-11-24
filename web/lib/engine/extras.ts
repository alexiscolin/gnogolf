// A timed hole's moving pieces, for the stroke about to be played. They grow
// up out of the ground when they appear, and the old ones sink away.
import type * as THREE from "three";
import { plainSkins } from "../terrain";
import { disposeCourse } from "../scene/materials";
import { buildExtras } from "../scene/course";
import { worldOf } from "../scene/worlds";
import { ud } from "../scene/data";
import type { Extras, Post, Wall, Zone } from "../types";
import type { Live } from "./types";

/** onStroke: a stroke's pieces are drawn; their walls and weather are to be taken in. */
export function makeExtras(E: Live, { alive, onStroke }: { alive: () => boolean; onStroke: (ex: Extras) => void }) {
  const { g, chain, publish } = E;
  let extras: THREE.Object3D | null = null, extrasFor = "";
  // the next stroke's pieces, asked as the stroke lands and shown later: keyed by the stroke they are for
  const extrasKey = () => `${g.id}#${g.round}#${g.shots.length}`;
  let extrasAhead: { key: string; read: Promise<Extras> } | null = null;
  const askExtras = () => {
    const read = chain.extras(g.id!, g.shots.length);
    read.catch(() => {}); // said where it is awaited
    extrasAhead = { key: extrasKey(), read };
    // and the strokes a world shows ahead, read now to be ready when the pieces are drawn
    for (let k = 1; k <= ((g.s && worldOf(g.s).ahead) || 0); k++) chain.extras(g.id!, g.shots.length + k).catch(() => {});
  };
  // the pulses' pieces seen so far on this hole, each once: what the work model counts
  // for them when the realm does not say it
  let pulse = { seen: new Set<string>(), walls: 0, posts: 0, pieces: 0 };
  function sawPulse(ex: Extras) {
    const add = (list: readonly (Wall | Post | Zone)[], kind?: "walls" | "posts") => {
      for (const x of list) {
        const k = JSON.stringify(x);
        if (pulse.seen.has(k)) continue;
        pulse.seen.add(k);
        pulse.pieces += 1 + (("poly" in x && x.poly && x.poly.length) || 0);
        if (kind) pulse[kind]++;
      }
    };
    add(ex.walls, "walls"), add(ex.posts, "posts"), add(ex.zones);
  }
  async function showExtras() {
    if (!g.s || !g.s.timed || !g.course) return;
    const key = extrasKey();
    if (key === extrasFor) return;
    extrasFor = key;
    const read = extrasAhead && extrasAhead.key === key ? extrasAhead.read : chain.extras(g.id!, g.shots.length);
    extrasAhead = null;
    // a world that shows what comes: the next strokes' pieces too, never waited on.
    // Those already read come with this stroke's; a later one draws the pieces again.
    const n = worldOf(g.s).ahead || 0, stroke = g.shots.length;
    const next = Promise.all(Array.from({ length: n }, (_, k) => chain.extras(g.id!, stroke + 1 + k).then(plainSkins, () => null)));
    let ex: Extras;
    try {
      ex = { ...plainSkins(await read), stroke };
      if (n) {
        const ahead = await Promise.race([next, new Promise<null>((r) => setTimeout(() => r(null), 0))]);
        if (ahead) ex = { ...ex, ahead };
        else void next.then((ahead) => ahead.some(Boolean) && drawExtras(key, { ...ex, ahead }), () => {}); // drawn again with it
      }
    } catch {
      // asked again in a moment: the stroke being aimed is played with its pieces
      if (extrasFor === key) (extrasFor = ""), setTimeout(() => alive() && !g.flying && void showExtras(), 2000);
      return;
    }
    drawExtras(key, ex);
  }
  // the stroke's pieces drawn, unless another stroke's were asked for since
  function drawExtras(key: string, ex: Extras) {
    if (extrasFor !== key || !alive() || !g.course) return;
    sawPulse(ex);
    onStroke(ex);
    void publish();
    const old = extras;
    extras = buildExtras(g.course, ex);
    // an aim begun while the pieces loaded: theirs show their outlines too
    if (g.aiming) ud(extras).ghosts?.(true);
    // a world's own pieces move on from the last stroke's by themselves: swapped at once
    if (ud(extras).steady) {
      g.course.add(extras);
      growing = growing.filter((a) => a.o !== old);
      if (old) (g.course.remove(old), disposeCourse(old));
      return;
    }
    extras.scale.y = 0.01;
    g.course.add(extras);
    growing.push({ o: extras, from: 0.01, to: 1, t: 0 });
    if (old) growing.push({ o: old, from: 1, to: 0.01, t: 0, gone: true });
  }
  let growing: { o: THREE.Object3D; from: number; to: number; t: number; gone?: boolean }[] = [];

  return {
    askExtras,
    showExtras,
    /** Another hole: no piece kept, none seen. */
    forget() {
      extras = null;
      extrasFor = "";
      pulse = { seen: new Set(), walls: 0, posts: 0, pieces: 0 };
      growing = [];
    },
    /** A frame of the pieces growing in and sinking away. */
    grow(dt: number) {
      if (growing.length) growing = growing.filter((a) => {
        a.t = Math.min(a.t + dt / 0.35, 1);
        const k = 1 - Math.pow(1 - a.t, 3);
        a.o.scale.y = a.from + (a.to - a.from) * k;
        if (a.t < 1) return true;
        if (a.gone && a.o.parent) {
          a.o.parent.remove(a.o);
          disposeCourse(a.o);
        }
        return false;
      });
    },
    growing: () => growing.length > 0,
    /** The stroke's pieces as built, or null. */
    built: () => extras,
    pulse: () => pulse,
  };
}
