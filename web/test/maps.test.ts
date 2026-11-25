// A hole's map without a wait (lib/maps.ts): a course slot's current version
// from the site's file, anyone else's from the chain once, then from this
// browser's copy; and the idle moments the files are fetched in (lib/idle.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { knowCourse, loadCourse, mapNow, mapOf, warmMaps, type MapChain } from "../lib/maps.ts";
import { whenIdle } from "../lib/idle.ts";
import type { HoleRow, HoleState } from "../lib/types.ts";

const state = (world: string) => ({ world, start: [1, 1], cup: [9, 1], cupR: 1.2, walls: [], posts: [], zones: [], name: "x", par: 3 }) as unknown as HoleState;
const row = (id: string, more: Partial<HoleRow> = {}): HoleRow => ({ id, name: "The Shelf", official: true, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 1, next: "", slot: id.replace(/\/v\d+$/, ""), ...more });
const tick = () => new Promise((r) => setTimeout(r, 0));

// the Cache API, kept in a map
const kept = new Map<string, string>();
Object.defineProperty(globalThis, "caches", { value: { open: () => Promise.resolve({
  match: (k: string) => Promise.resolve(kept.has(k) ? new Response(kept.get(k)) : undefined),
  put: async (k: string, r: Response) => void kept.set(k, await r.text()),
}) }, configurable: true });

let reads: string[] = [];
const chain: MapChain = { realm: "gno.land/r/x/golf", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve("abc"), state: (id) => (reads.push(id), id.includes("gone") ? Promise.reject(new Error("down")) : Promise.resolve(state("town"))) };
const file = () => Promise.resolve(new Response(JSON.stringify({ "garden/1": { ...state("garden"), name: "The Shelf" } })));

void test("a site without its file: asked for again the next time", async () => {
  let asked = 0;
  const none = () => (asked++, Promise.resolve(new Response("", { status: 404 })));
  await loadCourse(none);
  await loadCourse(none);
  assert.equal(asked, 2);
});

void test("a course slot's current version is the site's own map, with no read of the chain; nothing of it before the list is known", async () => {
  await loadCourse(file);
  assert.equal(mapNow("garden/1/v1"), undefined, "not known as current yet");
  knowCourse([row("garden/1/v1"), row("garden/2/v1"), row("garden/3/v2", { next: "garden/3/v3" })]);
  assert.equal(mapNow("garden/1/v1")?.world, "garden");
  assert.equal((await mapOf(chain, "garden/1/v1")).world, "garden");
  assert.deepEqual(reads, []);
});

void test("a version the site has no map of (no file entry, renamed, or archived) is the chain's", async () => {
  knowCourse([row("garden/1/v2", { name: "The Ledge" }), row("garden/2/v1")]);
  assert.equal(mapNow("garden/1/v2"), undefined, "its name is not the file's: another version");
  reads = [];
  assert.equal((await mapOf(chain, "garden/1/v2")).world, "town");
  assert.equal((await mapOf(chain, "garden/2/v1")).world, "town");
  assert.deepEqual(reads, ["garden/1/v2", "garden/2/v1"]);
});

void test("a map read from the chain is kept under its id: asked once a visit, and never again in this browser", async () => {
  reads = [];
  const id = "g1author/loop/v1";
  await mapOf(chain, id);
  await mapOf(chain, id);
  assert.deepEqual(reads, [id]);
  await tick();
  const [[key, text]] = [...kept].filter(([k]) => k.endsWith(id));
  assert.equal(key, `/maps/kept/${encodeURIComponent("dev|abc|gno.land/r/x/golf")}/${id}`);
  assert.deepEqual(Object.keys(JSON.parse(text) as object), ["world", "start", "cup", "cupR", "walls", "posts", "zones"], "its map's fields alone");
  // another visit: this browser's copy, the chain not asked
  kept.set(key.replace("loop", "seen"), JSON.stringify(state("island")));
  assert.equal((await mapOf(chain, "g1author/seen/v1")).world, "island");
  assert.deepEqual(reads, [id]);
});

void test("a read that failed is asked again; maps read ahead never throw", async () => {
  reads = [];
  await assert.rejects(mapOf(chain, "g1author/gone/v1"));
  await assert.rejects(mapOf(chain, "g1author/gone/v1"));
  assert.equal(reads.length, 2);
  warmMaps(chain, ["g1author/gone/v1", "g1author/ahead/v1"]);
  await tick();
  await tick();
  assert.equal(mapNow("g1author/ahead/v1")?.world, "town");
});

void test("whenIdle: each job in its turn, one that throws left behind", async () => {
  const ran: number[] = [];
  whenIdle([() => ran.push(1), () => { throw new Error("no"); }, () => ran.push(3)]);
  await new Promise((r) => setTimeout(r, 900));
  assert.deepEqual(ran, [1, 3]);
});
