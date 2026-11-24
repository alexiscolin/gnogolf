// The mines' kit, what can be checked without a GPU: the cart's mouth, the
// decks' boards, the machines standing over the kerb.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cartMouth, planks, drawnGround, lantern, lanternsLit, GLASS, DEAD_GLASS, MINES, chamferField, type DeckSpan } from "../lib/scene/mines-kit.ts";
import { seeded, GRASS } from "../lib/scene/common.ts";
import { relief } from "../lib/scene/materials.ts";
import { md, type Hole, type Height } from "../lib/scene/data.ts";
import { CELL, inPoly, nearestOnPoly, type Terrain } from "../lib/terrain.ts";
import holes from "../lib/scene/title-holes.json" with { type: "json" };
import type { Vec2 } from "../lib/types.ts";

test("cartMouth: a cart's timber set, 0.5 clear either side of the cart and 0.4 over its load", () => {
  assert.deepEqual(cartMouth(1.2), { width: 2.2, height: 2.9 });
  assert.deepEqual(cartMouth(2), { width: 3, height: 2.9 }, "one height for every cart");
});

const span = (x0: number, z0: number, x1: number, z1: number, angle = 0, top: DeckSpan["top"] = () => 0): DeckSpan => ({
  inside: (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1, top, box: [x0, z0, x1, z1], angle,
});
/** The gaps across the rows: the z-ranges the triangles cover, merged; how many holes between them. */
const gaps = (pos: ArrayLike<number>) => {
  const spans: [number, number][] = [];
  for (let i = 0; i < pos.length; i += 9) { const z = [pos[i + 2], pos[i + 5], pos[i + 8]]; spans.push([Math.min(...z), Math.max(...z)]); }
  spans.sort((p, q) => p[0] - q[0]);
  let n = 0, end = spans[0][1];
  for (const [lo, hi] of spans) { if (lo > end + 1e-4) n++; end = Math.max(end, hi); }
  return n;
};
/** A flat deck's boards along each of its rows (rows along x): their tops' [from, to], in order. */
const boardsOf = (mesh: THREE.Mesh) => {
  const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, rows = new Map<number, Map<string, [number, number]>>();
  for (let i = 0; i < p.count; i += 3) {
    const x0 = Math.min(p.getX(i), p.getX(i + 1), p.getX(i + 2)), x1 = Math.max(p.getX(i), p.getX(i + 1), p.getX(i + 2));
    if (n.getY(i) < 0.99 || x1 - x0 < 0.2) continue; // (its sides, its bevels, its nails)
    const row = Math.floor(p.getZ(i) / 0.5);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row)!.set(x0.toFixed(3), [x0, x1]); // (a top's four triangles: one board)
  }
  return [...rows.values()].map((r) => [...r.values()].sort((a, b) => a[0] - b[0]));
};

test("planks: boards over the deck and nothing past it, a gap between rows, flat on its top", () => {
  const mesh = planks([span(0, 0, 4, 2)], seeded("deck"));
  const pos = mesh.geometry.attributes.position.array;
  assert.ok(pos.length > 0 && pos.length % 9 === 0, "whole triangles");
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    assert.ok(pos[i] >= -0.12 && pos[i] <= 4.12, `x ${pos[i]} ragged at most 0.1 past the edge`);
    assert.ok(pos[i + 2] >= -0.01 && pos[i + 2] <= 2.01, `z ${pos[i + 2]} inside the deck`);
    (lo = Math.min(lo, pos[i + 1])), (hi = Math.max(hi, pos[i + 1]));
  }
  assert.ok(hi <= 0.03 && hi > 0, `the tops at the deck's top, a hair of warp, the nails proud (${hi})`);
  assert.ok(lo < -0.08 && lo > -0.14, "a board's thickness under it");
  // four rows 0.5 apart over the 2 across (0.46 wide, 0.04 between): three gaps, no board over the next
  assert.equal(gaps(pos), 3);
  assert.equal(mesh.geometry.attributes.color.count, mesh.geometry.attributes.position.count);
});

test("planks: nothing where the span has no deck; the same seed, the same boards; along a slope, shorter boards", () => {
  assert.equal(planks([{ ...span(0, 0, 4, 2), inside: () => false }], seeded("none")).geometry.attributes.position.count, 0);
  const a = planks([span(0, 0, 4, 2)], seeded("x")).geometry.attributes.position.array, b = planks([span(0, 0, 4, 2)], seeded("x")).geometry.attributes.position.array;
  assert.deepEqual([...a], [...b]);
  // a deck bent along its length (a ramp's foot): more, shorter boards, each true to it within a hair
  const flat = planks([span(0, 0, 6, 1)], seeded("r")).geometry.attributes.position.count;
  const bent = planks([span(0, 0, 6, 1, 0, (x) => (x > 3 ? (x - 3) * 0.4 : 0))], seeded("r")).geometry.attributes.position.count;
  assert.ok(bent > flat, `${bent} > ${flat}`);
});

test("planks: a board stretched to its run's end has none laid over it", () => {
  // (forty decks: on a few a row's last board leaves 0.32 to 0.35, too little for another)
  for (let k = 0; k < 40; k++)
    for (const row of boardsOf(planks([span(0, 0, 12, 4)], seeded("ov" + k))))
      for (let b = 1; b < row.length; b++) assert.ok(row[b][0] > row[b - 1][1], `ov${k}: a board from ${row[b][0].toFixed(2)} over the one to ${row[b - 1][1].toFixed(2)}`);
});

test("drawnGround: the lane as its mesh draws it, each cell split between its two corners nearer in height", () => {
  // a terrace's step at a corner: three corners on the floor, the fourth a step up
  const step = { height: (x: number, z: number) => (x >= CELL && z >= CELL ? 1.4 : 0) };
  assert.equal(drawnGround(step, CELL / 2, CELL / 2), 0, "the cell's middle on the crease between its low corners");
  assert.ok(Math.abs(drawnGround(step, CELL * 0.75, CELL * 0.75) - 0.7) < 1e-9, "half way up to the high corner");
  // an even slope: either split draws it
  assert.ok(Math.abs(drawnGround({ height: (x) => 0.3 * x }, 0.37, 0.12) - 0.111) < 1e-9);
});

test("the mines' machines standing over the kerb (wallHeight): the wheel's paddles, the cage and the doors", async () => {
  const { wallHeight } = await import("../lib/scene/mines.ts");
  assert.equal(wallHeight("paddle"), 4);
  assert.equal(wallHeight("cage door"), 4.2, "to its lintel: drawn up, the lattice hangs over the lane");
  assert.equal(wallHeight("swing door"), 2);
  assert.equal(wallHeight("safe door"), 2);
  assert.equal(wallHeight("vault door"), 5.5, "a stroke's vault door, its disc");
  assert.equal(wallHeight("stamp"), undefined, "the rest: the kerb's own height");
});

test("ring: a crystal bumper sings when the replay's own hole object (not the course's copy) hits it", async () => {
  const { piece, ring } = await import("../lib/scene/mines-pieces.ts");
  const t = { height: () => 0, onGreen: () => true } as unknown as Parameters<typeof piece>[2];
  const s = { hole: "gno.land/r/x/hole2", slot: "mines/2", board: { w: 20, h: 10 }, zones: [], walls: [], posts: [], cup: [18, 5], start: [2, 5] } as unknown as Parameters<typeof piece>[3];
  // the course is built from a copy of the hole (engine/loader.ts decorOf), the replay rings with the engine's own object
  piece("post", { c: [10, 5], r: 0.8, skin: "crystal bumper" }, t, { ...s, hole: "mines/2" });
  assert.equal(ring(s, 10.9, 5, 0), true, "the nearest crystal answers");
  assert.equal(ring(s, 2, 2, 0), false, "none near: no crystal answers");
});

test("ring: a hole's choir goes with its course (disposeCourse), not with an older build's", async () => {
  const { piece, ring } = await import("../lib/scene/mines-pieces.ts");
  const { disposeCourse } = await import("../lib/scene/materials.ts");
  const t = () => ({ height: () => 0, onGreen: () => true }) as unknown as Parameters<typeof piece>[2];
  const s = { hole: "gno.land/r/x/hole5", slot: "mines/5", board: { w: 20, h: 10 }, zones: [], walls: [], posts: [], cup: [18, 5], start: [2, 5] } as unknown as Parameters<typeof piece>[3];
  const bumper = { c: [10, 5], r: 0.8, skin: "crystal bumper" } as unknown as Parameters<typeof piece>[1];
  const old = piece("post", bumper, t(), s)!, now = piece("post", bumper, t(), s)!; // the hole built again
  disposeCourse(old);
  assert.equal(ring(s, 10.9, 5, 0), true, "the old build gone, the new one still sings");
  disposeCourse(now);
  assert.equal(ring(s, 10.9, 5, 0), false, "its course gone: no choir kept");
});

test("rockfall: its dust fades on its own material, never the halos' shared one", async () => {
  const { extras } = await import("../lib/scene/mines-pulses.ts");
  const { haloMat } = await import("../lib/scene/mines-toon.ts");
  const { state } = await import("../lib/scene/state.ts");
  const t = { height: () => 0, onGreen: () => true } as unknown as Parameters<typeof extras>[2];
  const s = { hole: "mines/9", slot: "mines/9", board: { w: 30, h: 20 }, zones: [], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
  const bar = [[[10, 9], [14, 9]], [[14, 9], [14, 10]], [[14, 10], [10, 10]], [[10, 10], [10, 9]]].map(([a, b]) => ({ a, b, skin: "rockfall" }));
  const before = haloMat().opacity;
  extras({ version: 1, walls: [], posts: [], zones: [], stroke: 0 }, s, t);
  state.live.length = 0;
  extras({ version: 1, walls: bar, posts: [], zones: [], stroke: 1 } as unknown as Parameters<typeof extras>[0], s, t); // the roof comes down this stroke
  const t0 = performance.now() / 1000;
  for (let k = 0; k <= 30; k++) for (const f of state.live) f(t0 + k * 0.1);
  assert.equal(haloMat().opacity, before, "the shared halo material untouched");
});

/** A stroke's bar: its four walls round [x0, z0]-[x1, z1]. */
const barOf = (x0: number, z0: number, x1: number, z1: number, skin: string) => [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]].map(([a, b]) => ({ a, b, skin }));

test("the stroke's bake leaves the blast's flash and smoke and the rockfall's dust to move: each shows in its moment only", async () => {
  const { extras } = await import("../lib/scene/mines.ts");
  const { state } = await import("../lib/scene/state.ts");
  const t = { height: () => 0, onGreen: () => true } as unknown as Parameters<typeof extras>[2];
  const s = { hole: "mines/9", slot: "mines/9", board: { w: 30, h: 20 }, zones: [], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
  const ex = (stroke: number, walls: unknown[]) => ({ version: 1, walls, posts: [], zones: [], stroke }) as unknown as Parameters<typeof extras>[0];
  extras(ex(1, barOf(4, 9, 8, 10, "dynamite")), s, t);
  state.live.length = 0;
  const g = extras(ex(2, barOf(14, 9, 18, 10, "rockfall")), s, t)!.group; // blown, and the roof down
  const t0 = performance.now() / 1000;
  const shown = (k: number) => {
    for (const f of state.live) f(t0 + k);
    let n = 0;
    g.traverseVisible((o) => void ((o as THREE.Mesh).isMesh && n++));
    return n;
  };
  const still = shown(0.05);
  assert.equal(shown(0.3), still + 2, "the blast: its flash and its smoke");
  assert.equal(shown(1), still + 2, "its smoke, and the dust where the rock lands");
  assert.equal(shown(4), still, "all of it gone");
});

test("glow: a shell of light of its own material, with the halos' soft rim (their shader)", async () => {
  const { glow, haloMat } = await import("../lib/scene/mines-toon.ts");
  const m = glow(new THREE.IcosahedronGeometry(1, 1), 0xffd27a, 0.5).material;
  assert.notEqual(m, haloMat(), "its own, to fade alone");
  assert.equal(m.opacity, 0.5);
  /* eslint-disable @typescript-eslint/unbound-method */
  assert.equal(m.onBeforeCompile, haloMat().onBeforeCompile);
  assert.equal(m.customProgramCacheKey, haloMat().customProgramCacheKey);
  /* eslint-enable @typescript-eslint/unbound-method */
});

test("a stroke's pieces move on from the stroke before, never from a restarted round's last", async () => {
  const { extras } = await import("../lib/scene/mines-pulses.ts");
  const t = { height: () => 0, onGreen: () => true } as unknown as Parameters<typeof extras>[2];
  const s = { hole: "mines/9", slot: "mines/9", board: { w: 30, h: 20 }, zones: [], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
  const charge = barOf(4, 9, 8, 10, "dynamite");
  const parts = (stroke: number, walls: unknown[], hole = s) => {
    let n = 0;
    extras({ version: 1, walls, posts: [], zones: [], stroke } as unknown as Parameters<typeof extras>[0], hole, t)!.group.traverse(() => void n++);
    return n;
  };
  const none = parts(0, [], { ...s });
  parts(3, charge);
  assert.ok(parts(4, []) > none, "the stroke after the charge: blown");
  parts(5, charge);
  assert.equal(parts(0, []), none, "a restart's first stroke: nothing blown at the tee");
});

test("the tide gauge reads mid while a tide is up, one alone too (hole 18's: an oval at a time)", async () => {
  const { extras } = await import("../lib/scene/mines-pulses.ts");
  const t = { height: () => 0, onGreen: (_x: number, z: number) => Math.abs(z - 10) < 3 } as unknown as Parameters<typeof extras>[2];
  const causeway = { kind: "surface", skin: "causeway", min: [12, 8], max: [16, 12], vec: [0, 0], scale: 1, round: true };
  const s = { hole: "mines/18", slot: "mines/18", board: { w: 30, h: 20 }, zones: [causeway], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
  const tide = { kind: "hazard", skin: "lava tide", min: [11, 7], max: [17, 13], vec: [2, 10], round: true };
  const g = extras({ version: 1, walls: [], posts: [], zones: [tide], stroke: 0 } as unknown as Parameters<typeof extras>[0], s, t)!.group;
  g.updateMatrixWorld(true);
  // its float: the gauge's one ball, 0.5 up its post on the low mark, 0.8 a mark
  const ys: number[] = [];
  g.traverse((o) => { const geo = (o as THREE.Mesh).geometry as THREE.SphereGeometry | undefined; if (geo?.type === "SphereGeometry" && geo.parameters.radius === 0.2) ys.push(o.getWorldPosition(new THREE.Vector3()).y); });
  assert.ok(ys.length > 0 && ys.every((y) => Math.abs(y - 1.3) < 1e-6), `on the mid mark: ${ys.join()}`);
});

test("the vault door's dial: its two lamps, the next stroke's and the one after, either side of its top", async () => {
  const { extras } = await import("../lib/scene/mines-pulses.ts");
  const { crystalMat } = await import("../lib/scene/mines-kit.ts");
  const t = { height: () => 0, onGreen: (_x: number, z: number) => z > 6 && z < 14 } as unknown as Parameters<typeof extras>[2];
  const s = { hole: "mines/16", slot: "mines/16", board: { w: 30, h: 20 }, zones: [], walls: [], posts: [], cup: [28, 10], start: [2, 10] } as unknown as Parameters<typeof extras>[1];
  const g = extras({ version: 1, walls: barOf(10, 7, 10.6, 13, "vault door"), posts: [], zones: [], stroke: 0 } as unknown as Parameters<typeof extras>[0], s, t)!.group;
  const across: number[] = [];
  g.traverse((o) => void ((o as THREE.Mesh).material === crystalMat() && across.push(o.parent!.position.z)));
  assert.equal(across.length, 2);
  assert.ok(across[0] !== 0 && Math.abs(across[0] + across[1]) < 1e-9, `either side of the top: ${across.join()}`);
});

test("the ball's cues in the mines' words: a draught, not a gust; the strongroom's gold as slippery as ice", async () => {
  const THREE = await import("three");
  const { causeAt, makeCauses } = await import("../lib/scene/cause.ts");
  const gold = { kind: "surface", skin: "gold", vec: [0, 0], min: [0, 0], max: [4, 4], round: false } as const;
  assert.deepEqual(causeAt([gold], 2, 2, 1, 0), { kind: "ice" });
  assert.equal(causeAt([{ ...gold, skin: "carpet" }], 2, 2, 1, 0), null);
  const at = new THREE.Vector3(), wind = { kind: "wind" as const, vec: [0.05, 0] as [number, number] };
  const mines = makeCauses(new THREE.Scene()), garden = makeCauses(new THREE.Scene());
  assert.equal(mines.at(at, 1, 0, wind, "mines"), "Draught");
  assert.equal(garden.at(at, 1, 0, wind, "garden"), "Gust");
  assert.equal(mines.at(at, 1, 0, { kind: "ice" }, "mines"), "Slippery");
});

test("lantern: one for the mines, its glass the one GLASS, dimmed at once by lanternsLit", () => {
  const glass: THREE.Material[] = [];
  lantern(0.55).traverse((o) => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && !md(o.material).hull) glass.push(o.material); });
  assert.deepEqual(glass, [GLASS], "its only unlit part (its ink aside) is the shared glass");
  lanternsLit(0);
  assert.equal(GLASS.color.getHex(), DEAD_GLASS.getHex(), "Lights out: dead");
  lanternsLit(1);
  assert.equal(GLASS.color.getHex(), MINES.lantern, "lit again");
});

test("gnomeIn keeps the gnome it found while he is in the scene, and finds the new one after a swap", async () => {
  const THREE = await import("three");
  const { gnomeIn } = await import("../lib/scene/gnome.ts");
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group();
  a.name = b.name = "gnome";
  scene.add(a);
  assert.equal(gnomeIn(scene), a);
  assert.equal(gnomeIn(scene), a);
  scene.remove(a), scene.add(new THREE.Group().add(b));
  assert.equal(gnomeIn(scene), b);
  b.name = "ghost";
  assert.equal(gnomeIn(scene), undefined);
});

// the one chamfer the world and the signs share measures off its zeros along rows, columns and diagonals
test("chamferField: distance to the nearest zero cell", () => {
  const nx = 5, nz = 5, D = new Float32Array(nx * nz).fill(1e4);
  D[2 * nx + 2] = 0;
  chamferField(D, nx, nz, 0.5);
  assert.equal(D[2 * nx + 2], 0);
  assert.equal(D[2 * nx + 4], 1); // two cells along a row
  assert.ok(Math.abs(D[0] - 2 * 0.5 * Math.SQRT2) < 1e-6); // two diagonal steps to a corner
  assert.ok(Math.abs(D[3] - (0.5 * Math.SQRT2 + 0.5)) < 1e-6); // a diagonal step and a straight one
});

test("a hole built twice from one object draws its lights once (the Builder's Publish: its preview, then its card)", async () => {
  const { build, loadWorld } = await import("./scene-harness.ts");
  await loadWorld("mines");
  const s = holes.mines as unknown as Hole, glows = (g: THREE.Object3D) => (g.getObjectByName("mines:glowBatch") as THREE.Points).geometry.attributes.position.count;
  assert.equal(glows(build(s)), glows(build(s)));
});

test("the headlamp's sheet is laid on the ground again only once the gnome, or the way he faces, has moved", async () => {
  const { build, loadWorld } = await import("./scene-harness.ts");
  await loadWorld("mines");
  const s = holes.mines as unknown as Hole, course = build(s), sheet = course.getObjectByName("mines:headlamp") as THREE.Mesh;
  const scene = new THREE.Scene(), gnome = new THREE.Group(), body = new THREE.Group(), lamp = new THREE.Object3D();
  gnome.name = "gnome";
  Object.assign(gnome.userData, { body, lamp });
  scene.add(course, gnome.add(body, lamp));
  const [x, z] = s.start, pos = sheet.geometry.attributes.position as THREE.BufferAttribute;
  gnome.position.set(x, (course.userData.height as Height)(x, z) + 0.5, z);
  const draw = (n = 1) => {
    for (let i = 0; i < n; i++) (scene.updateMatrixWorld(), sheet.onBeforeRender({} as never, scene, {} as never, sheet.geometry, {} as never, {} as never));
    return pos.version;
  };
  const laid = draw();
  assert.equal(draw(30), laid, "at rest: the sheet as it lies");
  body.rotation.y = 1;
  const turned = draw();
  assert.ok(turned > laid, "turned to aim: laid again");
  assert.ok(draw(200) > turned, "laid as the light swings round");
  const swung = draw(), first = pos.getX(0);
  assert.equal(draw(30), swung, "facing his way: at rest again");
  gnome.position.x += 0.5;
  assert.ok(draw() > swung && pos.getX(0) !== first, "rolled on: laid where he is");
});

test("the lane's edge wear runs the whole length of a long wall", async () => {
  const { build, loadWorld } = await import("./scene-harness.ts");
  await loadWorld("mines");
  const rail = (a: Vec2, b: Vec2) => ({ a, b, skin: "" });
  const s = { ...holes.mines, board: { w: 64, h: 64 }, zones: [], posts: [], start: [8, 56], cup: [56, 8],
    walls: [rail([0, 0], [64, 0]), rail([64, 0], [64, 64]), rail([64, 64], [0, 64]), rail([0, 64], [0, 0]), rail([2.125, 2.125], [57.125, 57.125])] } as unknown as Hole;
  const wear = (build(s).userData.owned as THREE.DataTexture[]).find((t) => t.image.width === 64 * 4)!;
  // the texel on the wall at (52.125, 52.125), 100 from its first end along x and z (four texels a unit: row 208, column 208)
  assert.equal(wear.image.data[208 * 256 + 208], 0, "worn: the lane's edge");
});

test("baked: a moving piece merged in its own frame is lit where it stands, out in the dark off the board", async () => {
  const { baked } = await import("../lib/scene/mines.ts");
  const s = holes.mines as unknown as Hole, course = new THREE.Group(), cart = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1), piece = new THREE.Mesh(geo, relief());
  geo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count * 3).fill(1), 3));
  piece.matrixAutoUpdate = false; // (as the bake leaves what it merged, bakeLocal in the piece's frame)
  cart.userData.live = true;
  cart.position.set(s.board.w + 40, GRASS, -40);
  course.userData.state = { ...s }; // (a hole of its own: no build's pools of light on it)
  course.add(cart.add(piece));
  course.updateMatrixWorld(true);
  baked(course);
  assert.ok(Math.abs(geo.attributes.color.getX(0) - 0.5) < 1e-6, `the cave's dark 40 off the board, not the light at its corner (${geo.attributes.color.getX(0)})`);
});

test("cartLoop: every part painted in its vertices keeps its colours (one without takes them off its whole bake bucket)", async () => {
  const { cartLoop } = await import("../lib/scene/mines-decor.ts");
  const loop = new THREE.CatmullRomCurve3([[0, 0], [12, 0], [12, 4], [0, 4]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
  cartLoop(seeded("loop"), loop, 2).g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).vertexColors) assert.ok(m.geometry.attributes.color, `a part of ${m.geometry.attributes.position.count} vertices without its colours`);
  });
});

// a zone of the mines alone on a lane all green and flat
const flatLane = { height: () => 0, onGreen: () => true } as unknown as Terrain;
const zoneHole = (zones: object[]) => ({ hole: "mines/x", slot: "mines/x", board: { w: 30, h: 20 }, zones, walls: [], posts: [], cup: [27, 3], start: [2, 10] }) as unknown as Hole;
/** How far (x, z) lies past an outline, less than 0 inside it. */
const past = (x: number, z: number, o: readonly Vec2[]) => {
  const e = nearestOnPoly(x, z, o), d = Math.hypot(x - e[0], z - e[1]);
  return inPoly(x, z, o) ? -d : d;
};

test("ice: none drawn under a surface listed after it (the physics' last listed is the floor there)", async () => {
  const { zone, outline } = await import("../lib/scene/mines-zones.ts");
  const s = zoneHole([{ kind: "surface", skin: "ice", round: true, min: [2, 2], max: [22, 16], vec: [0, 0] }, { kind: "surface", skin: "rubble", min: [10, 13], max: [16, 19], vec: [0, 0] }]);
  const rubble = outline(s.zones[1], s), sheet = zone(s.zones[0], flatLane, s)!.children[0] as THREE.Mesh, p = sheet.geometry.attributes.position, idx = sheet.geometry.index!.array;
  for (let k = 0; k < idx.length; k += 3) {
    const x = (p.getX(idx[k]) + p.getX(idx[k + 1]) + p.getX(idx[k + 2])) / 3, z = (p.getZ(idx[k]) + p.getZ(idx[k + 1]) + p.getZ(idx[k + 2])) / 3;
    // (but a sliver along its edge, the ice's corners pulled onto it)
    assert.ok(past(x, z, rubble) > -0.1, `ice over the rubble at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
});

test("ballast: a track's rails and sleepers lie on its rounded bed, laid 0.15 past its outline", async () => {
  const { zone, outline } = await import("../lib/scene/mines-zones.ts");
  const s = zoneHole([{ kind: "surface", skin: "ballast", round: true, min: [4, 6], max: [17, 9.6], vec: [0, 0] }]);
  const bed = outline(s.zones[0], s), g = zone(s.zones[0], flatLane, s)!, v = new THREE.Vector3();
  g.updateMatrixWorld(true);
  let worst = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh, pos = m.isMesh ? m.geometry.attributes.position : null;
    for (let i = 0; pos && i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      worst = Math.max(worst, past(v.x, v.z, bed));
    }
  });
  assert.ok(worst < 0.2, `a part ${worst.toFixed(2)} past the outline (a sleeper's corner a hair past the bed at most)`);
});
