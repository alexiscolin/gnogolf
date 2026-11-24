// Every module of the logic layer, loaded: one no test reaches counts in the
// coverage as untested instead of being left out of it. (The 3D scene, the
// engine's three.js orchestration and the promo renderer, which npm test
// leaves out of the coverage, are covered by npm run smoke and the media/
// captures; the two workers, which listen on self as they load, run in the
// browser only.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const elsewhere = /^scene[/.]|^(engine|promo)\.ts$|worker\.ts$/;

test("the logic layer loads", async () => {
  for (const m of readdirSync(new URL("../lib/", import.meta.url), { recursive: true, encoding: "utf8" }))
    if (m.endsWith(".ts") && !elsewhere.test(m)) assert.ok(await import(`../lib/${m}`), m);
});
