// A hole's map without a wait (lib/maps.ts): a course slot's current version
// from the site's file once the chain's hash of it is the file's, anyone
// else's from the chain once, then from this browser's copy (checked as it is
// read, in a store that has its version); and the idle moments the files are
// fetched in (lib/idle.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { knowCourse, loadCourse, mapNow, mapOf, warmMaps, type MapChain } from "../lib/maps.ts";
import { whenIdle } from "../lib/idle.ts";
import type { HoleRow, HoleState } from "../lib/types.ts";

const state = (world: string) => ({ world, start: [1, 1], cup: [9, 1], cupR: 1.2, walls: [], posts: [], zones: [], name: "x", par: 3 }) as unknown as HoleState;
const row = (id: string, more: Partial<HoleRow> = {}): HoleRow => ({ id, name: "The Shelf", official: true, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 1, next: "", slot: id.replace(/\/v\d+$/, ""), ...more });
const tick = () => new Promise((r) => setTimeout(r, 0));

// the Cache API, each store a map
const stores = new Map<string, Map<string, string>>();
const store = (name: string) => stores.get(name) ?? (stores.set(name, new Map()), stores.get(name)!);
Object.defineProperty(globalThis, "caches", { value: {
  open: (name: string) => Promise.resolve({
    match: (k: string) => Promise.resolve(store(name).has(k) ? new Response(store(name).get(k)) : undefined),
    put: async (k: string, r: Response) => void store(name).set(k, await r.text()),
    delete: (k: string) => Promise.resolve(store(name).delete(k)),
    keys: () => Promise.resolve([...store(name).keys()]),
  }),
  delete: (name: string) => Promise.resolve(stores.delete(name)),
}, configurable: true });
const kept = store("gnogolf-maps-v1"), WHICH = encodeURIComponent("dev|abc|gno.land/r/x/golf");
const keyOf = (id: string) => `/maps/${WHICH}/kept/${encodeURIComponent(id)}`, SHAS = `/maps/${WHICH}/shas`;

// the file's hash of each slot, and the chain's of each version
const sha = (c: string) => c.repeat(64);
const onChain: Record<string, string> = { "garden/1/v1": sha("a"), "garden/2/v1": sha("c"), "garden/5/v1": sha("e") };
let reads: string[] = [];
const lists: string[] = [];
const chain = {
  realm: "gno.land/r/x/golf", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve("abc"),
  state: (id: string) => (reads.push(id), id.includes("gone") ? Promise.reject(new Error("down")) : Promise.resolve(id.includes("odd") ? { ...state("town"), cup: null } : state("town"))),
  versions: (slot: string) => (lists.push(slot), Promise.resolve({ slot, versions: Object.entries(onChain).filter(([id]) => id.startsWith(`${slot}/`)).map(([id, s]) => ({ id, sha: s })) })),
} as unknown as MapChain;
const file = () => Promise.resolve(new Response(JSON.stringify({ "garden/1": { ...state("garden"), sha: sha("a") }, "garden/2": { ...state("garden"), sha: sha("b") }, "garden/5": { ...state("garden"), sha: sha("e") }, "garden/6": { world: "garden", sha: sha("f") } })));

void test("a site without its file: asked for again the next time", async () => {
  let asked = 0;
  const none = () => (asked++, Promise.resolve(new Response("", { status: 404 })));
  await loadCourse(none);
  await loadCourse(none);
  assert.equal(asked, 2);
});

void test("a course slot's current version is the site's own map once the chain's hash of it is the file's: no read of its state, and the hash asked once a browser", async () => {
  // (what an earlier visit left: a hash this browser checked, and a store from before the stores had a version)
  kept.set(SHAS, JSON.stringify({ "garden/5/v1": sha("e") }));
  store("gnogolf-maps").set(`/maps/kept/${WHICH}/g1author/old/v1`, JSON.stringify(state("island")));
  await loadCourse(file);
  assert.equal(mapNow("garden/1/v1"), undefined, "not known as current yet");
  knowCourse(chain, [row("garden/1/v1"), row("garden/2/v1"), row("garden/5/v1"), row("garden/3/v2", { next: "garden/3/v3" })]);
  assert.equal(mapNow("garden/1/v1"), undefined, "its hash not checked yet");
  await tick();
  assert.equal(mapNow("garden/5/v1")?.world, "garden", "checked on an earlier visit: there at once");
  assert.equal((await mapOf(chain, "garden/1/v1")).world, "garden");
  assert.equal(mapNow("garden/1/v1")?.world, "garden");
  assert.deepEqual([reads, lists], [[], ["garden/1"]]);
  await tick();
  assert.deepEqual(JSON.parse(kept.get(SHAS)!), { "garden/5/v1": sha("e"), "garden/1/v1": sha("a") }, "kept for the next visit");
});

void test("a version the site has no map of (another hash: republished under the same name and par; a bad entry; archived) is the chain's, never the file's", async () => {
  reads = [];
  assert.equal((await mapOf(chain, "garden/2/v1")).world, "town");
  assert.equal(mapNow("garden/2/v1")?.world, "town");
  knowCourse(chain, [row("garden/6/v1"), row("garden/3/v3")]);
  assert.equal((await mapOf(chain, "garden/6/v1")).world, "town", "the file's entry is no map");
  assert.equal((await mapOf(chain, "garden/3/v2")).world, "town");
  assert.deepEqual(reads, ["garden/2/v1", "garden/6/v1", "garden/3/v2"]);
});

void test("a map read from the chain is kept under its id: asked once a visit, and never again in this browser", async () => {
  reads = [];
  const id = "g1author/loop/v1";
  await mapOf(chain, id);
  await mapOf(chain, id);
  assert.deepEqual(reads, [id]);
  await tick();
  assert.deepEqual(Object.keys(JSON.parse(kept.get(keyOf(id))!) as object), ["world", "start", "cup", "cupR", "walls", "posts", "zones"], "its map's fields alone, its id encoded in the key");
  // another visit: this browser's copy, the chain not asked
  kept.set(keyOf("g1author/seen/v1"), JSON.stringify(state("island")));
  assert.equal((await mapOf(chain, "g1author/seen/v1")).world, "island");
  assert.deepEqual(reads, [id]);
});

void test("a copy that is no map (cut short, another shape) is dropped and read again; an answer that is none is not kept; the store from before its version is gone", async () => {
  reads = [];
  kept.set(keyOf("g1author/cut/v1"), '{"world":"isl');
  kept.set(keyOf("g1author/shape/v1"), JSON.stringify({ ...state("island"), walls: [{ from: [0, 0] }] }));
  assert.equal((await mapOf(chain, "g1author/cut/v1")).world, "town");
  assert.equal((await mapOf(chain, "g1author/shape/v1")).world, "town");
  assert.equal((await mapOf(chain, "g1author/old/v1")).world, "town", "the old store's copy is not read");
  await assert.rejects(mapOf(chain, "g1author/odd/v1"), /not a map/);
  await tick();
  assert.deepEqual(reads, ["g1author/cut/v1", "g1author/shape/v1", "g1author/old/v1", "g1author/odd/v1"]);
  assert.equal((JSON.parse(kept.get(keyOf("g1author/shape/v1"))!) as { world: string }).world, "town", "the good answer in its place");
  assert.ok(!kept.has(keyOf("g1author/odd/v1")) && !stores.has("gnogolf-maps"));
});

void test("the store keeps 300 entries at most: the oldest go first", async () => {
  const first = [...kept.keys()][0];
  for (let i = kept.size; i < 300; i++) kept.set(`/x/${i}`, "{}");
  await mapOf(chain, "g1author/more/v1");
  await tick();
  assert.equal(kept.size, 300);
  assert.ok(!kept.has(first) && kept.has(keyOf("g1author/more/v1")));
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

void test("whenIdle: each job in its turn, one that throws left behind; stopped, the jobs not started are dropped", async () => {
  const ran: number[] = [];
  whenIdle([() => ran.push(1), () => { throw new Error("no"); }, () => ran.push(3)]);
  const stop = whenIdle([() => (ran.push(4), stop()), () => ran.push(5)]);
  await new Promise((r) => setTimeout(r, 900));
  assert.deepEqual(ran.sort(), [1, 3, 4]);
});
