// With less motion asked for (the system's setting, materials.ts motion,
// read as the scene loads), a stroke's pieces in the mines do not move: each
// stands at once where the stroke leaves it.
import { test } from "node:test";
import assert from "node:assert/strict";
import type * as THREE from "three";

(globalThis as { matchMedia?: unknown }).matchMedia = (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" });
const { extras } = await import("../lib/scene/mines-pulses.ts");
const { ud } = await import("../lib/scene/data.ts");

const t = { height: () => 0, onGreen: (_x: number, z: number) => z > 6 && z < 14 } as unknown as Parameters<typeof extras>[2];
const s = { hole: "mines/16", slot: "mines/16", board: { w: 30, h: 20 }, zones: [], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
const bar = (x0: number, z0: number, x1: number, z1: number, skin: string) => [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]].map(([a, b]) => ({ a, b, skin }));
const ex = (stroke: number, walls: unknown[], ahead: unknown[] = []) => ({ version: 1, walls, posts: [], zones: [], stroke, ahead }) as unknown as Parameters<typeof extras>[0];
// what of each would move: the door on its carriage, the rocks, the fuse and its spark
const moving = (o: THREE.Object3D) => {
  const out: THREE.Object3D[] = [];
  o.traverse((q) => void (ud(q).live && out.push(q)));
  return out;
};

test("less motion: a vault door that shuts this stroke stands shut, the roof that falls lies on the floor", () => {
  extras(ex(3, []), s, t);
  const [door, heap] = extras(ex(4, [...bar(10, 7, 10.6, 13, "vault door"), ...bar(18, 9, 22, 10, "rockfall")]), s, t)!.group.children;
  const carriage = moving(door)[0];
  assert.ok(Math.hypot(carriage.position.x - 10.3, carriage.position.z - 10) < 1e-6, `the door in its frame: ${carriage.position.toArray().join()}`);
  assert.ok(moving(heap).every((r) => r.position.y < 1.5), "every rock down on the floor");
});

test("less motion: a fuse lit this stroke stands burnt down to its charge", () => {
  const [charge] = extras(ex(1, bar(10, 7, 10.6, 13, "dynamite"), [ex(2, [])]), s, t)!.group.children;
  const { drawRange, index } = (moving(charge)[0] as THREE.Mesh).geometry;
  assert.ok(drawRange.count < index!.count / 4, `the fuse left: ${drawRange.count} of ${index!.count}`);
});
