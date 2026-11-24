#!/usr/bin/env -S node --experimental-strip-types
// The Builder video's holes (media/builder/promo.mjs): three fun holes built
// of the Builder's own pieces, each checked by the whole pipeline as
// scripts/starters.ts checks a starter (validate, the canonical bytes) and a
// holing round of each in every weather its world asks for (proved: a
// replay). Writes media/builder/holes.json: each draft with its proofs and
// its bytes, for promo.mjs to publish and film (the one-strokers it films are
// found by render.mjs, in the chain's weather then).
//
//   (from web/) node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../media/builder/holes.ts [name]

import fs from "node:fs";
import type { Draft, Piece, V } from "../../web/lib/builder/draft.ts";
import type { PaletteEntry } from "../../web/lib/builder/palette.ts";

const { host } = await import("../../web/test/builder-fixture.ts");
await import("../../web/test/scene-harness.ts");
const { loadPalette } = await import("../../web/lib/builder/palette.ts");
const { placePiece } = await import("../../web/lib/builder/edit.ts");
const { frame } = await import("../../web/lib/builder/gg1.ts");
const { emptyDraft } = await import("../../web/lib/builder/draft.ts");
const { validate } = await import("../../web/lib/builder/pipeline.ts");
const { census } = await import("../../web/lib/builder/drawn.ts");
const { canonicalHex, proofKey, replay } = await import("../../web/lib/builder/proof.ts");
const { plan, holeRow } = await import("../../web/lib/builder/testmode.ts");
const { makeLocalChain } = await import("../../web/lib/builder/localchain.ts");
const { holing, estimate } = await import("../../web/lib/builder/difficulty.ts");

/** The author the holes are published and proved under (AUTHOR: the key promo.mjs publishes with; gnodev's test1 by default), and the clock their weathers are found from. */
const AUTHOR = process.env.AUTHOR || "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", NOW = Number(process.env.NOW) || 5967997;
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });
const ring = (pts: V[]) => pts.map((p, i) => rail(`r${i + 1}`, p, pts[(i + 1) % pts.length]));

type Make = (pick: (id: string) => PaletteEntry) => Omit<Draft, "v" | "world" | "slug" | "pulses" | "note" | "proofs" | "par"> & { note: string };
const HOLES: Record<string, { world: string; make: Make }> = {
  // the run: a downhill throws the ball onto the ice, a crevasse in the middle of it to skirt, snowmen to bank off by the cup
  "avalanche": { world: "mountain", make: (e) => ({
    title: "Avalanche", note: "Ride the downhill. Dodge the crevasse.", tee: [3, 7], pin: [41, 7],
    pieces: [...ring([[0, 0], [44, 0], [44, 14], [0, 14]]),
      { ...placePiece(e("mountain/slope/downhill"), "p1", [7, 2], { grade: 0.3 }), geometry: { t: "rect", min: [7, 2], max: [19, 12] } },
      { ...placePiece(e("mountain/surface/ice"), "p2", [19, 0]), geometry: { t: "rect", min: [19, 0], max: [34, 14] } },
      { ...placePiece(e("mountain/hazard/crevasse"), "p3", [23, 4.5]), geometry: { t: "round", min: [23, 4.5], max: [29, 9.5] } },
      placePiece(e("mountain/post/snowman"), "p4", [37, 3.5]), placePiece(e("mountain/post/snowman"), "p5", [37, 10.5]), placePiece(e("mountain/post/pine"), "p6", [12, 1.5])],
  }) },
  // the plaza: a funbox to hop, the clock's hand sweeping in front of the cup, a roundabout to bank round, a quarter pipe behind it
  "skate-plaza": { world: "town", make: (e) => ({
    title: "Skate Plaza", note: "Hop the funbox, beat the clock hand.", tee: [3, 8], pin: [36, 8],
    pieces: [...ring([[0, 0], [42, 0], [42, 16], [0, 16]]),
      placePiece(e("town/slope/funbox"), "p1", [9, 4], { size: 8 }),
      placePiece(e("town/post/roundabout"), "p2", [19, 8]),
      placePiece(e("town/bar/clock hand"), "p3", [27, 8], { size: 4 }),
      placePiece(e("town/post/lamp"), "p4", [19, 2.5]), placePiece(e("town/post/cat"), "p5", [19, 13.5]),
      // the quarter pipe behind the cup: a ball hit past it rides up and comes back down into it
      { ...placePiece(e("town/slope/quarter pipe"), "p6", [37.5, 0], { grade: 0.35 }), geometry: { t: "rect", min: [37.5, 0], max: [42, 16] }, params: { grade: 0.35, dir: [-1, 0] } }],
  }) },
  // a blowhole on the tee's pad shoots the ball over the lagoon to the cup's beach
  "blowhole": { world: "island", make: (e) => ({
    title: "Blowhole", note: "Feed the blowhole. Fly the lagoon.", tee: [3, 8], pin: [39, 8],
    pieces: [...ring([[0, 0], [42, 0], [42, 16], [0, 16]]),
      { ...placePiece(e("island/tunnel/blowhole"), "p1", [8, 6.5], { size: 3, to: [31, 8] }) },
      { ...placePiece(e("island/hazard/lagoon"), "p2", [15, 0]), geometry: { t: "rect", min: [15, 0], max: [28, 16] } },
      placePiece(e("island/post/palm"), "p3", [36, 3]), placePiece(e("island/post/crab"), "p4", [35, 12])],
  }) },
};

const only = process.argv[2];
const out = (fs.existsSync(new URL("holes.json", import.meta.url)) ? JSON.parse(fs.readFileSync(new URL("holes.json", import.meta.url), "utf8")) : {}) as Record<string, unknown>;
let failed = 0;
for (const [slug, { world, make }] of Object.entries(HOLES)) {
  if (only && slug !== only) continue;
  const palette = await loadPalette(world);
  const pick = (id: string) => palette.find((e) => e.id === id) ?? (() => { throw new Error(`${slug}: no ${id} in ${world}`); })();
  const m = make(pick);
  const d0 = frame({ ...emptyDraft(world), ...m, par: 3 });
  const d: Draft = { ...d0, slug };
  const errors = validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error");
  if (errors.length) { failed++; console.error(`refused: ${slug}: ${errors.map((i) => `${i.rule} ${i.text}`).join("; ")}`); continue; }
  const id = `${AUTHOR}/${slug}/v1`, hex = canonicalHex(d, host), key = await proofKey(d, host);
  if (!hex || !key) { failed++; console.error(`no bytes: ${slug}`); continue; }
  host.load(id, hex);
  const proofs = [];
  for (const { kind, period } of plan(host, id, world, NOW)) {
    const shots = await holing(host, id, d.tee, d.pin, period, { fan: { spread: 60, step: 2, powers: Array.from({ length: 39 }, (_, k) => 0.5 + k * 0.25) } });
    const p = shots && (await replay(makeLocalChain(host, holeRow(id, d), hex, period), { key, id, kind, period, shots }));
    if (p && typeof p !== "string") { proofs.push(p); console.log(`  ${slug} ${kind || "clear"}: holed in ${p.shots.length}`); }
    else { failed++; console.error(`not holed: ${slug} in ${kind || "clear"}${p ? `: ${p}` : ""}`); }
  }
  const est = await estimate(host, d);
  const par = Math.max(2, Math.min(5, est?.par ?? Math.max(...proofs.map((p) => p.strokes)) + 1));
  out[slug] = { draft: { ...d, slug: "", par, proofs }, hex, level: est?.level ?? null };
  console.log(`${slug}: par ${par}, ${proofs.length} weathers proved, level ${est?.level ?? "?"}`);
}
fs.writeFileSync(new URL("holes.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
process.exit(failed ? 1 : 0);
