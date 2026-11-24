// The page's own aim previews turned off (lib/sim.ts), each case in a fresh
// copy of the module: sources that are not the realm's (checked once a
// chain: one reseeded under the same realm is read again), a worker that
// fails, and (through the aim, engine/aim.ts) a shot the page refuses that
// the chain answers. Off, simReady is false and the aim asks the chain again. And on,
// the chain is still asked once for a still aim previewed every frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { aimRig } from "./aim-rig.ts";
import { answer, makeHost, type Ask } from "../lib/sim/host.ts";
import type * as Sim from "../lib/sim.ts";
import type { Stroke } from "../lib/types.ts";

const repo = new URL("../../", import.meta.url);
const wasm = new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/golf.wasm", repo)));
let failing = "", refusing = false; // the op the worker fails; every simulation refused
class FakeWorker {
  host = makeHost(wasm);
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(m: Ask & { n: number }) {
    const data = m.op === failing ? { n: m.n, err: "RuntimeError: unreachable" }
      : refusing && m.op !== "load" && m.op !== "sources" ? { n: m.n, out: "panic: golf: refused" }
      : { n: m.n, out: answer(this.host, m) };
    setImmediate(() => this.onmessage?.({ data }));
  }
  terminate() {}
}
(globalThis as { Worker?: unknown }).Worker = FakeWorker;

const hex = fs.readFileSync(new URL("data/holes.txt", repo), "utf8").split("\n")[0].split(" ")[3];
const chain = (file = (p: string) => fs.readFileSync(new URL(p, repo), "utf8")) => ({
  realm: "gno.land/r/gnogolf/golf/v2", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve("A"),
  file: (p: string) => Promise.resolve(file(p)), holeData: () => Promise.resolve(hex),
});
const ID = "garden/1/v1", PERIOD = 5967997;
let copies = 0;
const fresh = () => import(`../lib/sim.ts?${++copies}`) as Promise<typeof Sim>;

void test("a deployed file that is not the one golf.wasm was built from: never started", async () => {
  const sim = await fresh();
  const c = chain((p) => fs.readFileSync(new URL(p, repo), "utf8") + (p.endsWith("physics/step.gno") ? " " : ""));
  assert.equal(await sim.startSim(c), false);
  assert.equal(await sim.simHole(c, ID), false);
  assert.equal(sim.simReady(ID), false);
});

void test("sources checked once a chain: not read again there, read again on a chain reseeded under the same realm", async () => {
  let read = 0;
  const counted = (p: string) => (read++, fs.readFileSync(new URL(p, repo), "utf8"));
  assert.equal(await (await fresh()).startSim(chain()), true);
  assert.equal(await (await fresh()).startSim(chain(counted)), true);
  assert.equal(read, 0);
  const reseeded = { ...chain((p) => counted(p) + (p.endsWith("physics/step.gno") ? " " : "")), genesis: () => Promise.resolve("B") };
  assert.equal(await (await fresh()).startSim(reseeded), false);
  assert.ok(read > 0);
});

void test("a worker that fails a simulation turns the page's previews off, not blank", async () => {
  const sim = await fresh();
  assert.equal(await sim.simHole(chain(), ID), true);
  failing = "round";
  assert.equal(await sim.simStroke(ID, [], "21.0000,8.0000", null, PERIOD), null);
  failing = "";
  assert.equal(sim.simReady(ID), false);
});

void test("the page's own previews every frame (third person) on a still aim: the chain is still asked once, 120 ms on", async (t) => {
  const sim = await import("../lib/sim.ts");
  assert.equal(await sim.simHole(chain(), ID), true);
  let asked = 0;
  const ask = () => (asked++, new Promise<Stroke>(() => {}));
  const { aimer } = aimRig({ ...chain(), simulateFrom: ask, simulateRound: ask }, { id: ID, period: PERIOD, ball: { x: 2, y: 3 }, dragging: true, shot: { angle: 0.3, power: 7, deg: 21 } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (let i = 0; i < 20; i++) aimer.preview(), t.mock.timers.tick(16);
  assert.equal(asked, 1);
  aimer.dropAim();
  t.mock.timers.reset();
  await new Promise((r) => setTimeout(r, 20)); // (the page's own answer lands, not drawn)
});

void test("a shot the page refuses that the chain answers is a difference", async (t) => {
  const sim = await import("../lib/sim.ts"); // the aim's own copy
  assert.equal(await sim.simHole(chain(), ID), true);
  refusing = true;
  const asked: ((s: Stroke) => void)[] = [];
  const ask = () => new Promise<Stroke>((ok) => asked.push(ok));
  const { E, aimer } = aimRig({ ...chain(), simulateFrom: ask, simulateRound: ask }, { id: ID, period: PERIOD, ball: { x: 2, y: 3 }, dragging: true, shot: { angle: 0.3, power: 7, deg: 21 } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  aimer.preview();
  t.mock.timers.tick(120);
  t.mock.timers.reset();
  assert.equal(asked.length, 1);
  asked[0]({ holed: false, bounces: 0, path: [[2, 3], [4, 5]], air: "", cause: "", work: 1, rest: [4, 5] } as unknown as Stroke);
  await new Promise((r) => setTimeout(r, 20));
  E.dragging = false;
  assert.equal(sim.simReady(ID), false);
});
