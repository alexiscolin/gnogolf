// The mines' rides as the replay plays them (replay.ts rideStep: the ball at
// the curve's point ease(k), then the ride's at(k) and cam(k)), and the lift a
// stroke's pieces bring, on the course's own holes as the chain gives them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { loadWorld } from "./scene-harness.ts";
import { host, PERIOD } from "./builder-fixture.ts";
import { buildHole, buildExtras } from "../lib/scene/course.ts";
import type { Course, Hole, TubePath } from "../lib/scene/data.ts";
import type { Extras } from "../lib/types.ts";

await loadWorld("mines");
const hexes = new Map(fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => [slot, hex]));
/** A course hole as a player's client gets it, at the test clock's period. */
function hole(slot: string): Hole {
  host.load(slot, hexes.get(slot)!);
  host.setperiod(PERIOD);
  return { ...(JSON.parse(host.state(slot)) as Hole), official: true };
}
/** A built course's ridden tubes of a skin. */
const ridden = (course: Course, skin: string) => [...course.userData.tubes].filter(([z, c]) => z.skin === skin && c.userData?.ride);
/** Each frame of a ride as the replay plays it: the ball, whether it is seen, where the camera looks. */
function play(tube: TubePath, n = 200) {
  const ride = tube.userData!.ride!, ball = new THREE.Object3D(), pos = new THREE.Vector3(), look = new THREE.Vector3(), frames = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    tube.getPoint(ride.ease ? ride.ease(k) : k, ball.position);
    ride.at?.(k, ball);
    ride.cam?.(k, pos, look);
    frames.push({ k, ball: ball.position.clone(), seen: ball.visible, look: look.clone() });
  }
  ride.at?.(-1, ball);
  return frames;
}

test("rides: the adits' ball seen until it is in the mouth's dark; the corkscrew's camera on the ball", () => {
  for (const slot of ["mines/13", "mines/14"])
    for (const [z, tube] of ridden(buildHole(hole(slot)), "adit")) {
      const frames = play(tube), gone = frames.find((f) => !f.seen)!;
      // (the mouth's dark begins 1.8 in: aditPair)
      assert.ok(gone.ball.distanceTo(frames[0].ball) > 1.6, `${slot} ${z.min.join()}: hidden ${gone.ball.distanceTo(frames[0].ball).toFixed(2)} in, on the lane`);
    }
  for (const [z, loop] of ridden(buildHole(hole("mines/11")), "corkscrew"))
    for (const f of play(loop)) {
      // beside the loop it looks at the ball going round it (the ride's first 0.55); down the chute, 3 ahead of it
      const off = f.look.distanceTo(f.ball);
      assert.ok(f.k < 0.55 ? off < 1e-6 : Math.abs(off - 3) < 1e-6, `${z.min.join()} k ${f.k}: the camera looks ${off.toFixed(2)} from the ball`);
    }
});

test("rides: hole 14's siding cart runs on its rails down the incline, never into it", () => {
  const course = buildHole(hole("mines/14")), t = course.userData.terrain;
  const near = ridden(course, "cart ride").filter(([z]) => Math.hypot(z.vec[0] - (z.min[0] + z.max[0]) / 2, z.vec[1] - (z.min[1] + z.max[1]) / 2) < 25);
  assert.equal(near.length, 1, "one cart to the siding");
  for (const f of play(near[0][1]).filter((f) => f.k < 0.9)) {
    // (the ball rides 1.55 over the cart's floor)
    const sunk = t.height(f.ball.x, f.ball.z) - (f.ball.y - 1.55);
    assert.ok(sunk < 0.05, `k ${f.k}: the cart ${sunk.toFixed(2)} under the lane`);
  }
});

test("rides: the cable car waits after a ride where the clock's own car waits, and goes on from there", () => {
  const course = buildHole(hole("mines/17")), [[, tube]] = ridden(course, "cable car");
  let car: THREE.Object3D | undefined;
  course.traverse((o) => void (car ??= Math.abs(o.scale.x - 1.45) < 1e-6 ? o : undefined)); // (the car is drawn 1.45 big)
  const show = (st: number, tt: number) => {
    for (const p of course.userData.timed) p.at(st);
    for (const f of course.userData.ticks) f(tt);
    return car!.getWorldPosition(new THREE.Vector3());
  };
  show(1, 0.1); // (docked: its window)
  play(tube);
  const after = show(5, 0.4), waits = show(11.6, 0.5); // (on the clock: across and waiting at the far side by then)
  assert.ok(after.distanceTo(waits) < 1e-6, `it moves ${after.distanceTo(waits).toFixed(2)} at once when the clock takes it back`);
});

/** Hole 8 and its first four strokes' pieces, each stroke's lift zone with them. */
function strokes() {
  const s = hole("mines/8"), course = buildHole(s);
  return { course, at: [1, 2, 3, 4].map((k) => JSON.parse(host.extras("mines/8", k)) as Extras).map((ex) => ({ ex, lift: ex.zones.find((q) => q.skin === "lift")! })) };
}
/** How many vertices of g's visible meshes stand within 1.6 of (x, z). */
function near(g: THREE.Object3D, [x, z]: readonly number[]) {
  let n = 0;
  const v = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = (o.geometry as THREE.BufferGeometry).attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (Math.hypot(v.x - x, v.z - z) < 1.6) n++;
    }
  });
  return n;
}

test("lift: every landing's way out seen so far drawn at every stroke, not only this stroke's", () => {
  const { course, at } = strokes();
  const exits = at.map(({ lift }) => lift.vec);
  assert.ok(Math.hypot(exits[0][0] - exits[1][0], exits[0][1] - exits[1][1]) > 5, "two landings, two ways out");
  at.forEach(({ ex }, k) => {
    const g = buildExtras(course, ex);
    for (const e of exits.slice(0, k + 1)) assert.ok(near(g, e) > 0, `stroke ${k + 1}: nothing drawn at the way out at ${e.map((v) => v.toFixed(1)).join()}`);
  });
});

test("lift: a stroke's ride goes in the course's tubes, the last stroke's out, whatever was built between", () => {
  const { course, at } = strokes(), own = course.userData.tubes.size;
  for (const { ex, lift } of at) {
    buildExtras(course, ex);
    assert.equal(course.userData.tubes.size, own + 1, "the hole's own and this stroke's");
    assert.ok(course.userData.tubes.get(lift)?.userData?.ride, "where the replay looks for it");
  }
  buildHole(hole("mines/13")); // (a census or the title builds a hole of its own meanwhile)
  buildExtras(course, at[0].ex);
  assert.ok(course.userData.tubes.get(at[0].lift)?.userData?.ride);
});
