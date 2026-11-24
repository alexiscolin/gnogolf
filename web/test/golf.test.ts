// components/Golf.tsx, read as source (no DOM here): the hole-finished card is said (finished_shown) once the
// player's best on the round on offer was asked, answered or not, and each round asks afresh.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const golf = fs.readFileSync(new URL("../components/Golf.tsx", import.meta.url), "utf8");

void test("finished_shown waits for this round's best: the hole played again in the same mode is not answered yet", () => {
  assert.ok(/setBest\(null\);\s*setBestAsked\(""\);/.test(golf), "the last ask forgotten as a new one starts");
  assert.ok(golf.includes("bestAsked !== `${saveId}#${saveMode}`"), "and the card's event waits for its own");
});
