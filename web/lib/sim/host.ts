// golf.wasm's host (scripts/wasm.sh builds it): the realm's SimulateFrom and
// SimulateRoundAt answered here, byte for byte, as JSON strings. A refusal is
// "panic: " and the realm's sentence (wasi.ts); a new instance has the holes
// loaded again when asked for. No DOM: the worker (worker.ts) and the parity
// test (scripts/wasmparity.ts) run it alike. builder.wasm has the same calls
// (lib/builder/wasm.ts: simCalls on its own caller).
import { makeCaller, type Base } from "./wasi";

export interface SimExports extends Base {
  load(n: number): void;
  from(n: number, x: number, y: number, m: number, stroke: number, period: bigint): void;
  round(n: number, period: bigint): void;
  sources(): void;
}
type Caller<E extends SimExports> = ReturnType<typeof makeCaller<E>>;

/** The game's calls on a caller, and onHole: a call on a loaded hole (loaded first if the instance is new). */
export function simCalls<E extends SimExports>({ put, call: run, onStart }: Caller<E>) {
  const loaded = new Set<string>(), data = new Map<string, string>();
  onStart(() => loaded.clear());
  function onHole(id: string | null, f: (e: E) => void) {
    if (id != null && !data.has(id)) return `panic: golf: unknown hole: ${id}`;
    return run((e) => {
      if (id != null && !loaded.has(id)) {
        e.load(put(e, id, data.get(id)!)[0]);
        loaded.add(id);
      }
      f(e);
    });
  }
  return {
    onHole,
    /** Keeps a hole's data (HoleData's hex) under its version's id. */
    load: (id: string, hex: string) => {
      data.set(id, hex);
      loaded.delete(id);
    },
    /** SimulateFrom's answer. */
    from: (id: string, x: number, y: number, shot: string, stroke: number, period: number) =>
      onHole(id, (e) => {
        const [n, m] = put(e, id, shot);
        e.from(n, x, y, m, stroke, BigInt(period));
      }),
    /** SimulateRoundAt's (without its clock). */
    round: (id: string, shots: string, period: number) => onHole(id, (e) => e.round(put(e, id, shots)[0], BigInt(period))),
    /** {path: sha256} of the .gno files it was built from. */
    sources: () => JSON.parse(onHole(null, (e) => e.sources())) as Record<string, string>,
  };
}

export function makeHost(mod: WebAssembly.Module) {
  const { onHole: _, ...calls } = simCalls(makeCaller<SimExports>(mod));
  return calls;
}
export type Host = ReturnType<typeof makeHost>;

/** What the page asks the worker (worker.ts): a hole's data kept, a SimulateFrom, a SimulateRoundAt, the wasm's sources. */
export type Ask =
  | { op: "load"; id: string; hex: string }
  | { op: "from"; id: string; x: number; y: number; shot: string; stroke: number; period: number }
  | { op: "round"; id: string; shots: string; period: number }
  | { op: "sources" };

/** The host's answer to an ask: the call's JSON string ("panic: …" for a refusal), "" for a load. */
export const answer = (h: Host, m: Ask) =>
  m.op === "load" ? (h.load(m.id, m.hex), "")
  : m.op === "from" ? h.from(m.id, m.x, m.y, m.shot, m.stroke, m.period)
  : m.op === "round" ? h.round(m.id, m.shots, m.period)
  : JSON.stringify(h.sources());
