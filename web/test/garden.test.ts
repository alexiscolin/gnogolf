// The garden's scenery (lib/scene/garden.ts), what can be checked without a
// GPU: a community hole drawn whatever its author named it, and a course
// hole's signpost reading the number the game calls it by.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "./scene-harness.ts";
import { host, lane, stateOf } from "./builder-fixture.ts";
import { legacyOf } from "../lib/card.ts";
import type { Hole } from "../lib/scene/data.ts";

void test("a community hole draws whatever its slug, even one every object answers to (constructor)", () => {
  const s = stateOf(lane("garden", [])), author = s.slot!.split("/")[0];
  for (const slug of ["constructor", "fixture"]) assert.doesNotThrow(() => build({ ...s, hole: `${author}/${slug}`, slot: `${author}/${slug}` }), slug);
});

/** The text the scene writes on its canvases while f runs (a signpost's "N° 7"). */
function writes(f: () => void) {
  type Canvas = { getContext: (kind: string) => object };
  const doc = globalThis.document as unknown as { createElement: (tag: string) => Canvas }, make = doc.createElement, out: string[] = [];
  doc.createElement = (tag) => {
    const c = make(tag), ctx = c.getContext("2d");
    return { ...c, getContext: () => new Proxy(ctx, { get: (t, k) => (k === "fillText" ? (text: string) => void out.push(text) : Reflect.get(t, k) as unknown) }) };
  };
  try { f(); } finally { doc.createElement = make; }
  return out;
}

void test("a course hole's signpost reads its number in the cup, not its old realm's (garden/10, once hole11: N° 10)", () => {
  let signs = 0;
  for (const [slot, , , hex] of fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "))) {
    if (!slot.startsWith("garden/")) continue;
    host.load(slot, hex);
    host.setperiod(5967997);
    // (dressed as the game dresses it: its look keyed by its old realm, engine/loader.ts decorOf)
    const s: Hole = { ...(JSON.parse(host.state(slot)) as Hole), official: true, hole: legacyOf(slot) || slot };
    for (const text of writes(() => build(s)).filter((t) => t.startsWith("N° "))) (signs++, assert.equal(text, `N° ${slot.split("/")[1]}`, slot));
  }
  assert.ok(signs > 9, `${signs} signposts (none on a clouds hole)`);
});
