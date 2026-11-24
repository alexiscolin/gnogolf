// The weather over a hole (lib/scene/weather.ts): snow falls slow, and a
// flake back at the top falls as slow as it first did; the fog's banks and
// the storm's clouds are painted once for every hole, so they are shared
// things (materials.ts share()), and a disposed renderer is let go of them.
import "./canvas.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeWeather } from "../lib/scene/weather.ts";
import { releaseShared } from "../lib/scene/materials.ts";

void test("snow stays snow: ten seconds on, every flake still drifts down slow", () => {
  const scene = new THREE.Scene(), w = makeWeather(scene);
  w.board(20, 10, "mountain");
  w.set([{ skin: "snow", vec: [0, 0] }]);
  const flakes = scene.getObjectByProperty("type", "LineSegments") as THREE.LineSegments; // (the rain's streaks, the snow's too)
  const pos = flakes.geometry.attributes.position, dt = 1 / 30;
  let t = 0;
  while (t < 10) w.tick((t += dt));
  const was = Array.from({ length: pos.count / 2 }, (_, i) => pos.getY(2 * i));
  w.tick((t += dt));
  const speeds = was.map((y, i) => (y - pos.getY(2 * i)) / dt).filter((v) => v > 0); // (one back at the top went up)
  assert.ok(speeds.length > 1000, "the flakes fall");
  assert.ok(Math.max(...speeds) < 2.3, `a flake falls at ${Math.max(...speeds).toFixed(1)} a second: rain's speed`);
});

void test("the fog's banks and the storm's clouds are shared: a disposed renderer's listeners on them go (releaseShared)", () => {
  const scene = new THREE.Scene();
  makeWeather(scene);
  const maps: THREE.Texture[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    if (m?.map) maps.push(m.map);
  });
  assert.equal(maps.length, 2, "the banks' and the clouds'");
  const renderer = () => {}; // (three's listener on what a renderer drew holds that renderer)
  for (const m of maps) m.addEventListener("dispose", renderer);
  releaseShared();
  for (const m of maps) assert.ok(!m.hasEventListener("dispose", renderer), "the renderer is kept alive");
});
