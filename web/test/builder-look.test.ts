// How the board draws a piece from above (components/builder/look.ts): a
// skin's material by a word in it, else its kind's colour, else grey; a kind
// named like Object.prototype's keys (a saved draft's entry is any string)
// is no kind, never drawn with what a plain object answers for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillOf } from "../components/builder/look.ts";
import { HOSTILE_NAMES } from "./hostile.ts";

void test("fillOf: a skin's material first, then its kind's colour, else grey (a kind named like Object.prototype's keys too)", () => {
  assert.equal(fillOf("*/hazard/lava"), "#e0572e");
  assert.equal(fillOf("*/rail/"), "#2a2a2a");
  assert.equal(fillOf("*/nope/x"), "#999");
  for (const k of HOSTILE_NAMES) assert.equal(fillOf(`garden/${k}/x`), "#999", k);
});
