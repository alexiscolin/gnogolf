// Mushroom Town's scenery (lib/scene/town.ts), what can be checked without a
// GPU: the flower boxes on the curb round the plot, the drain grates off it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { host } from "./builder-fixture.ts";
import { loadWorld } from "./scene-harness.ts";
import { C, T } from "../lib/scene/materials.ts";
import type { Hole } from "../lib/scene/data.ts";

await loadWorld("town");
const { buildHole } = await import("../lib/scene/course.ts");

void test("the flower boxes stand on the curb round the plot, the drain grates a step off it (town/5)", () => {
  const [, , , hex] = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).find(([s]) => s === "town/5")!;
  host.load("town/5", hex);
  host.setperiod(5967997);
  const g = buildHole({ ...(JSON.parse(host.state("town/5")) as Hole), official: true }, { defer: true });
  g.updateMatrixWorld(true);
  const colour = (o: THREE.Object3D) => ((o as THREE.Mesh).material as THREE.MeshToonMaterial).color?.getHex();
  const boxes: THREE.Mesh[] = [], grates: THREE.Box3[] = [], solids: THREE.Mesh[] = [], curbs: THREE.Box3[] = [];
  g.traverse((o) => {
    const m = o as THREE.Mesh, size = m.isMesh && m.geometry.type === "BoxGeometry" ? (m.geometry as THREE.BoxGeometry).parameters : null;
    if (!m.isMesh) return;
    // (a box's or a grate's ink outline is its own geometry again)
    if (size?.width === 1.2 && size.height === 0.3 && size.depth === 0.4) colour(m) === C.wood && boxes.push(m);
    else if (size?.width === 0.9 && size.depth === 0.5) colour(m) === T.iron && grates.push(new THREE.Box3().setFromObject(m));
    else {
      solids.push(m);
      if (colour(m) === T.curb) curbs.push(new THREE.Box3().setFromObject(m));
    }
  });
  assert.ok(boxes.length > 0 && grates.length > 0, "boxes and grates drawn");
  const ray = new THREE.Raycaster();
  for (const b of boxes) {
    const box = new THREE.Box3().setFromObject(b), mid = box.getCenter(new THREE.Vector3());
    ray.set(mid.clone().setY(box.min.y + 1e-3), new THREE.Vector3(0, -1, 0));
    const under = ray.intersectObjects(solids, false)[0];
    assert.ok(under && under.distance < 0.01 && colour(under.object) === T.curb, `the box at ${mid.x.toFixed(1)}, ${mid.z.toFixed(1)}: ${under ? `#${colour(under.object)?.toString(16)} ${(under.distance - 1e-3).toFixed(2)}` : "nothing"} under it`);
  }
  for (const gr of grates) assert.ok(!curbs.some((c) => c.intersectsBox(gr)), `the grate at z ${gr.min.z.toFixed(2)}..${gr.max.z.toFixed(2)} under the curb`);
});
