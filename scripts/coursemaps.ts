#!/usr/bin/env -S node --experimental-strip-types
// The course's maps as the site serves them (web/public/maps/course.json),
// made from the repo before `npm run dev` and `npm run build`: every hole of
// data/holes.txt as builder.wasm's HoleState answers it (the realm's own
// code), its map's fields alone, by slot, with its data's sha256 (the realm's
// own hash of a version: Versions), which tells it from any other version. The
// game draws a course hole's map from it once the chain's hash is the same
// (web/lib/maps.ts). Not committed; written only if changed.
//
//   (from web/) node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../scripts/coursemaps.ts

import { createHash } from "node:crypto";
import fs from "node:fs";
import type { HoleState } from "../web/lib/types.ts";

const { makeBuilderHost } = await import("../web/lib/builder/wasm.ts");

const ROOT = new URL("../", import.meta.url), OUT = new URL("web/public/maps/course.json", ROOT);
const host = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/builder.wasm", ROOT))));
const maps: Record<string, unknown> = {};
for (const line of fs.readFileSync(new URL("data/holes.txt", ROOT), "utf8").trim().split("\n")) {
  const [slot, , sha8, hex] = line.split(" ");
  const sha = createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
  if (!sha.startsWith(sha8)) throw new Error(`${slot}: its data is not ${sha8}'s`);
  host.load(slot, hex);
  const out = host.state(slot);
  if (out.startsWith("panic: ")) throw new Error(`${slot}: ${out}`);
  const { world, start, cup, cupR, walls, posts, zones } = JSON.parse(out) as HoleState;
  maps[slot] = { sha, world, start, cup, cupR, walls, posts, zones };
}
const json = JSON.stringify(maps), fresh = !fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== json;
if (fresh) {
  fs.mkdirSync(new URL("./", OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
}
console.log(`coursemaps: ${Object.keys(maps).length} maps, ${Math.round(json.length / 1024)} KB, ${fresh ? "written" : "unchanged"}`);
