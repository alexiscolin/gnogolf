// The island's scenery (lib/scene/island.ts), what can be checked without a
// GPU: a crab post's crab on its footprint, the sitting gulls on their
// perches, and one beach whatever the engine's sort.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { host } from "./builder-fixture.ts";
import { keysOf, loadWorld } from "./scene-harness.ts";
import { shown } from "../lib/scene/common.ts";
import type { Course, Hole } from "../lib/scene/data.ts";

await loadWorld("island");
const { buildHole } = await import("../lib/scene/course.ts");

/** A course hole as the chain gives it. */
function hole(slot: string): Hole {
  const [, , , hex] = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).find(([s]) => s === slot)!;
  host.load(slot, hex);
  host.setperiod(5967997);
  return { ...(JSON.parse(host.state(slot)) as Hole), official: true };
}

void test("a crab post's crab bobs on its footprint, never scuttles off the circle the ball hits (island/10)", () => {
  const s = hole("island/10"), [cx, cz] = s.posts.find((p) => p.skin === "crab")!.c, g: Course = buildHole(s);
  // its crab's red (the beach's crabs are off the board, far from it)
  const crab: THREE.Mesh[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh, at = o.getWorldPosition(new THREE.Vector3());
    if (m.isMesh && (m.material as THREE.MeshToonMaterial).color?.getHex() === 0xe2553e && Math.hypot(at.x - cx, at.z - cz) < 3) crab.push(m);
  });
  /** How far from the post's centre the crab is drawn. */
  const reach = () => {
    g.updateMatrixWorld(true);
    let far = 0;
    for (const m of crab)
      for (let i = 0, p = m.geometry.attributes.position; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        far = Math.max(far, Math.hypot(v.x - cx, v.z - cz));
      }
    return far;
  };
  assert.ok(crab.length > 0, "its crab drawn");
  const rest = reach();
  for (let t = 0; t <= 20; t += 0.25) {
    g.userData.tick(t);
    assert.ok(reach() <= rest + 1e-9, `at ${t} s drawn ${reach().toFixed(2)} from the post's centre, ${rest.toFixed(2)} where it stands`);
  }
});

void test("the sitting gulls stand on their perches: none speared by a hut's finial or sunk in the lighthouse's rock (island/7)", () => {
  const g: Course = buildHole(hole("island/7"), { defer: true }); // (its pieces' own colours, for the message)
  g.userData.tick(1);
  g.updateMatrixWorld(true);
  const instanced: THREE.InstancedMesh[] = [], solids: THREE.Mesh[] = [];
  g.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) instanced.push(o as THREE.InstancedMesh);
    else if ((o as THREE.Mesh).isMesh && shown(o)) solids.push(o as THREE.Mesh);
  });
  // the flock: four instanced meshes, a bird in each; its body's last three birds sit
  const body = instanced.find((m) => m.parent!.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh).length === 4);
  assert.ok(body, "the flock drawn");
  const ray = new THREE.Raycaster(), M = new THREE.Matrix4(), down = new THREE.Vector3(0, -1, 0);
  ray.far = 0.5;
  for (let k = body.count - 3; k < body.count; k++) {
    body.getMatrixAt(k, M);
    const at = new THREE.Vector3().setFromMatrixPosition(M.premultiply(body.matrixWorld));
    // straight down onto its back, round its middle: nothing in the way
    for (const [dx, dz] of [[0.02, 0.02], [0.02, -0.02], [-0.02, 0.02], [-0.02, -0.02]]) {
      ray.set(new THREE.Vector3(at.x + dx, at.y + 0.5, at.z + dz), down);
      const hit = ray.intersectObjects(solids, false)[0];
      assert.ok(!hit, `the gull at ${at.toArray().map((v) => v.toFixed(2)).join(", ")}: #${hit ? ((hit.object as THREE.Mesh).material as THREE.MeshToonMaterial).color.getHexString() : ""} over its middle`);
    }
  }
});

void test("one beach whatever the engine's sort: each browser draws the same island", () => {
  const s = hole("island/7"), native = keysOf(buildHole(s)), sort = Array.prototype.sort;
  // a stable merge sort, as another engine's may be, comparing in another order than this one's
  Array.prototype.sort = function <T>(this: T[], cmp: (a: T, b: T) => number = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)) {
    const merged = (xs: T[]): T[] => {
      if (xs.length < 2) return xs;
      const a = merged(xs.slice(0, xs.length >> 1)), b = merged(xs.slice(xs.length >> 1)), out: T[] = [];
      while (a.length && b.length) out.push(cmp(b[0], a[0]) < 0 ? b.shift()! : a.shift()!);
      return [...out, ...a, ...b];
    };
    merged([...this]).forEach((x, i) => (this[i] = x));
    return this;
  };
  try {
    assert.deepEqual(keysOf(buildHole(s)), native);
  } finally {
    Array.prototype.sort = sort;
  }
});
