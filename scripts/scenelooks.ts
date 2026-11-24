#!/usr/bin/env -S node --experimental-strip-types
// The scene's golden (data/scene.golden.json): a short hash of what the
// scene builds (web/lib/scene/course.ts) for every course hole at two
// periods, with its first four strokes' pieces, and for every Builder palette
// piece alone in a lane of its world. A hash holds each mesh's kind, colour,
// place and vertices, every value to a thousandth (the same bytes from any
// Node), and a hole's census of what drew each piece and its water mask.
// Without --write, it names the builds that moved and exits non-zero.
//
//   node --experimental-strip-types scripts/scenelooks.ts [--write]
//   (from web/: npm run scene:looks [-- --write])

import fs from "node:fs";
import { createHash, type Hash } from "node:crypto";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import type * as THREE from "three";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

type Hole = import("../web/lib/scene/data.ts").Hole;
type Extras = import("../web/lib/types.ts").Extras;

const FILE = new URL("../data/scene.golden.json", import.meta.url);
const course = fs.readFileSync(new URL("../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "));

/** Values to a thousandth, -0 as 0, hashed: a last bit that differs from one Node to another moves nothing. */
function put(h: Hash, a: ArrayLike<number>) {
  const rounded = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) rounded[i] = Math.round(a[i] * 1e3) + 0;
  h.update(rounded);
}

/** A build's hash: each mesh's kind, colour, place and vertices (instances too), then what else is given. */
function hashOf(g: THREE.Object3D, ...more: (string | Uint8Array)[]) {
  const h = createHash("sha256");
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry;
    if (!geo) return;
    const mats = [(o as THREE.Mesh).material].flat() as (THREE.Material & { color?: THREE.Color })[];
    h.update(`${o.type}|${o.visible}|${mats.map((m) => `${m.type}:${m.color?.getHexString() ?? ""}`).join(",")}`);
    put(h, o.matrixWorld.elements);
    for (const k of Object.keys(geo.attributes).sort()) {
      h.update(k);
      put(h, geo.attributes[k].array);
    }
    if (geo.index) put(h, geo.index.array);
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      h.update(`n${im.count}`);
      put(h, im.instanceMatrix.array);
      if (im.instanceColor) put(h, im.instanceColor.array);
    }
  });
  for (const m of more) h.update(m);
  return h.digest("hex").slice(0, 16);
}

if (!isMainThread) {
  // one world's builds
  const world = workerData as string;
  const { loadWorld } = await import("../web/test/scene-harness.ts");
  const { host, lane, stateOf, PERIOD } = await import("../web/test/builder-fixture.ts");
  const { buildHole, buildExtras } = await import("../web/lib/scene/course.ts");
  const { waterMask } = await import("../web/lib/scene/zones.ts");
  const { loadPalette } = await import("../web/lib/builder/palette.ts");
  const { placePiece } = await import("../web/lib/builder/edit.ts");
  const { FIELD } = await import("../web/lib/builder/rules.ts");
  const { legacyOf } = await import("../web/lib/card.ts");
  await loadWorld(world);
  const now: Record<string, string> = {};
  /** A hole built and merged, recorded with its census and water mask. */
  const record = (key: string, s: Hole) => {
    const census: string[] = [];
    const g = buildHole(s, { census: (p, d) => census.push(JSON.stringify([p, d])) });
    now[key] = hashOf(g, census.join("\n"), waterMask(g.userData.terrain).data);
    return g;
  };
  for (const [slot, , , hex] of course.filter(([slot]) => slot.startsWith(`${world}/`))) {
    host.load(slot, hex);
    for (const period of [PERIOD, PERIOD + 1]) {
      host.setperiod(period);
      // (dressed as the game dresses it: its look keyed by its old realm, engine/loader.ts decorOf)
      const built = record(`${slot}@${period}`, { ...(JSON.parse(host.state(slot)) as Hole), official: true, hole: legacyOf(slot) || slot });
      for (let stroke = 0; stroke < 4; stroke++) {
        const ex = JSON.parse(host.extras(slot, stroke)) as Extras;
        if (ex.walls.length + ex.posts.length + ex.zones.length) now[`${slot}@${period}#${stroke}`] = hashOf(buildExtras(built, { ...ex, stroke }));
      }
    }
  }
  if (Object.hasOwn(FIELD, world))
    for (const e of await loadPalette(world)) record(`${world} ${e.id}`, stateOf(lane(world, [placePiece(e, "x", [14, 9], { to: [24, 4] })])));
  parentPort!.postMessage(now);
} else {
  // a thread a world, side by side, each building in order: a hole built again can keep what an earlier build left
  const worlds = [...new Set(course.map(([slot]) => slot.split("/")[0]))];
  const parts = await Promise.all(worlds.map((w) => new Promise<Record<string, string>>((ok, fail) => new Worker(new URL(import.meta.url), { workerData: w }).once("message", ok).once("error", fail))));
  const now = Object.assign({}, ...parts) as Record<string, string>;
  const golden = (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {}) as Record<string, string>;
  const moved = Object.keys(now).filter((k) => k in golden && golden[k] !== now[k]);
  const added = Object.keys(now).filter((k) => !(k in golden));
  const lost = Object.keys(golden).filter((k) => !(k in now));
  for (const k of moved) console.log(`moved ${k}`);
  for (const k of added) console.log(`new ${k}`);
  for (const k of lost) console.log(`lost ${k}`);
  if (!process.argv.includes("--write")) {
    const differ = moved.length + added.length + lost.length;
    console.log(`${moved.length} moved, ${added.length} new, ${lost.length} lost, of ${Object.keys(now).length}${differ ? "; if meant: --write" : ""}`);
    process.exit(differ ? 1 : 0);
  }
  // one build a line
  fs.writeFileSync(FILE, "{\n" + Object.entries(now).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n}\n");
  console.log(`wrote data/scene.golden.json: ${Object.keys(now).length} builds, ${moved.length} moved, ${added.length} new, ${lost.length} lost`);
}
