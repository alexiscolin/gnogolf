// The mountain's scenery (lib/scene/mountain.ts) on the course's own holes,
// what can be checked without a GPU: a chimney smokes only on a chalet that
// stands, an avalanche heap lies on its bar, every glow is a soft one, and the
// cliff stops at a crack that splits the mountain.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type * as THREE from "three";
import { loadWorld } from "./scene-harness.ts";
import { host } from "./builder-fixture.ts";
import { islandBox } from "../lib/scene/camera.ts";
import type { Hole } from "../lib/scene/data.ts";
import type { Extras, Wall } from "../lib/types.ts";

await loadWorld("mountain");
const { buildHole } = await import("../lib/scene/course.ts");
const { base, extras } = await import("../lib/scene/mountain.ts");

/** A mountain course hole, loaded in the host, as the chain lists it. */
const holeOf = (slot: string, hex: string): Hole => {
  host.load(slot, hex);
  host.setperiod(5967997);
  return { ...(JSON.parse(host.state(slot)) as Hole), official: true };
};
/** The mountain's course holes, each built as the game builds it (before the merge). */
const courses = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "))
  .filter(([slot]) => slot.startsWith("mountain/")).map(([slot, , , hex]) => ({ slot, hex, g: buildHole(holeOf(slot, hex), { defer: true }) }));

const rootOf = (o: THREE.Object3D): THREE.Object3D => (o.parent ? rootOf(o.parent) : o);

void test("a chimney smokes only on a chalet that stands: one that found no room leaves no smoke in the air", () => {
  for (const { slot, g } of courses) assert.equal(g.userData.smokes!.filter((m) => rootOf(m) !== g).length, 0, `${slot}: smoke with no chalet under it`);
});

/** How far (x, z) lies outside a bar's outline (its four walls round it), 0 inside. */
function outside(bar: readonly Wall[], x: number, z: number) {
  const cx = bar.reduce((m, w) => m + w.a[0], 0) / bar.length, cz = bar.reduce((m, w) => m + w.a[1], 0) / bar.length;
  return Math.max(0, ...bar.map((w) => {
    const l = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), nx = (w.b[1] - w.a[1]) / l, nz = -(w.b[0] - w.a[0]) / l;
    return ((x - w.a[0]) * nx + (z - w.a[1]) * nz) * Math.sign((w.a[0] - cx) * nx + (w.a[1] - cz) * nz);
  }));
}

void test("an avalanche heap lies on its bar: as thick as it, along it, past its downhill side by its spill (0.5) only", () => {
  let heaps = 0;
  for (const { slot, hex, g } of courses)
    for (let stroke = 1; stroke <= 4; stroke++) {
      const s = holeOf(slot, hex), ex = JSON.parse(host.extras(slot, stroke)) as Extras, av = ex.walls.filter((w) => w.skin === "avalanche");
      if (!av.length) continue;
      const { group } = extras(ex, s, g.userData.terrain);
      for (let k = 0; k < av.length / 4; k++, heaps++) {
        // (each bar's heap, in order: its mound first, inked)
        const p = (group.children[k].children[0].children[0] as THREE.Mesh).geometry.attributes.position, bar = av.slice(4 * k, 4 * k + 4);
        let far = 0;
        for (let i = 0; i < p.count; i++) far = Math.max(far, outside(bar, p.getX(i), p.getZ(i)));
        assert.ok(far <= 0.5 + 1e-3, `${slot} #${stroke}: the heap ${far.toFixed(2)} outside its bar`);
      }
    }
  assert.ok(heaps > 0, "the course's avalanches (mountain/9, mountain/16)");
});

void test("every glow on the mountain is a soft one, the ice arches' glints too: no sprite drawn as a bare square", () => {
  let sprites = 0;
  for (const { slot, g } of courses)
    g.traverse((o) => {
      const sp = o as THREE.Sprite;
      if (sp.isSprite) (sprites++, assert.ok(sp.material.map, `${slot}: a sprite with no texture`));
    });
  assert.ok(sprites > 0);
});

void test("the cliff stops at a crack that splits the mountain: no rock across its mouth (mountain/5)", () => {
  const { hex } = courses.find((c) => c.slot === "mountain/5")!, s = holeOf("mountain/5", hex);
  const crack = s.zones.find((z) => z.skin === "crevasse" && z.min[1] <= 0.01 && z.max[1] >= s.board.h - 0.01)!, [a, b] = [crack.min[0], crack.max[0]];
  let face: THREE.Mesh | undefined;
  // (the rock face down from the shelf's front edge: the one mesh lit 0x8fa3b8)
  base(s, islandBox(s.board)).traverse((o) => {
    if (((o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.emissive?.getHex() === 0x8fa3b8) face = o as THREE.Mesh;
  });
  const p = face!.geometry.attributes.position, idx = face!.geometry.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const xs = [0, 1, 2].map((k) => p.getX(idx.getX(i + k)));
    assert.ok(Math.min(...xs) > a || Math.max(...xs) < b, `a face from ${Math.min(...xs).toFixed(2)} to ${Math.max(...xs).toFixed(2)} across the crack's ${a}..${b}`);
  }
});
