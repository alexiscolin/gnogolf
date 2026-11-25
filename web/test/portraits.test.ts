// The gnomes' pictures (lib/scene/gnome.ts portraitOf, components/Stage.tsx
// Portrait): every gnome of the game and the duel's ghost has one, drawn by
// media/gnomes/portraits.mjs as the stage's first frame stands him.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "./scene-harness.ts";
import { GNOMES, makeBall, onStage, portraitOf } from "../lib/scene/gnome.ts";

const PUBLIC = new URL("../public", import.meta.url).pathname;

void test("every gnome of the game, and the ghost, has his picture: a WebP of 30 KB at most", () => {
  for (const src of [...GNOMES.map(portraitOf), "/portraits/ghost.webp"]) {
    const img = fs.readFileSync(PUBLIC + src);
    assert.equal(img.toString("latin1", 8, 12), "WEBP", src);
    assert.ok(img.length <= 30_000, `${src}: ${img.length} B`);
  }
});

void test("portraitOf: a game's gnome his own picture, a collection gnome his thumbnail, anyone else the Classic's", () => {
  assert.equal(portraitOf(GNOMES[1]), "/portraits/sage.webp");
  assert.equal(portraitOf({ ...GNOMES[0], id: "t73" }), "/gnomes/73.webp");
  assert.equal(portraitOf({ ...GNOMES[0], id: "traits" }), "/portraits/classic.webp");
});

void test("the stage's first frame is his picture's pose: on the ground, his shadow whole; then he hops", () => {
  const g = onStage(makeBall(GNOMES[0]));
  assert.equal(g.userData.body.position.y, 0);
  assert.equal(g.userData.shade.scale.x, 1);
  onStage(g, 600);
  assert.ok(g.userData.body.position.y > 0.2 && g.userData.shade.scale.x < 1, "up, his shadow smaller");
});
