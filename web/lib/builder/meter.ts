// The page's side of the editor's worker. Of the meter's asks only the latest is answered.
// Without a worker, or with one that fails: no meter, no carry, no level.
import type { Draft } from "./draft";
import type { Level, Shown } from "./difficulty";
import type { Carried } from "./carry";
import type { Ask, Reply } from "./meter-worker";

export interface Meter {
  /** measures this draft; the one asked before no longer counts */
  ask(d: Draft): void;
  /** replays the draft's older rounds on hex, its canonical bytes; null: it could not */
  carry(d: Draft, hex: string, key: string, author: string): Promise<Carried | null>;
  /** a published hole's level, from its data in hex; null: not measured */
  rate(hex: string): Promise<Level | null>;
  stop(): void;
}

/** The worker, its estimates sent to onEstimate with the draft they are of. Where no worker can run, every ask answers null. */
export function makeMeter(onEstimate: (of: Draft, e: Shown | null) => void): Meter {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    return { ask: (d) => onEstimate(d, null), carry: () => Promise.resolve(null), rate: () => Promise.resolve(null), stop: () => {} };
  }
  let worker: Worker | null = new Worker(new URL("./meter-worker.ts", import.meta.url), { type: "module" });
  let run = 0, asked: Draft | null = null, n = 0;
  // The asks awaiting an answer, by number. Each gets null if the worker goes.
  const waiting = new Map<number, (r: Reply | null) => void>();
  const off = () => {
    worker?.terminate();
    worker = null;
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  const ask = <T>(make: (n: number) => Ask, read: (r: Reply) => T | null): Promise<T | null> => {
    if (!worker) return Promise.resolve(null);
    const w = worker, k = ++n;
    return new Promise((done) => {
      waiting.set(k, (r) => done(r && read(r)));
      w.postMessage(make(k));
    });
  };
  worker.onmessage = ({ data: r }: MessageEvent<Reply>) => {
    if ("job" in r) return (waiting.get(r.n)?.(r), void waiting.delete(r.n));
    if (r.run === run && asked) onEstimate(asked, r.shown);
  };
  // The worker failed: null now and for every later ask, so nothing shows "measuring" for ever.
  worker.onerror = () => (off(), asked && onEstimate(asked, null));
  return {
    ask(d) {
      if (!worker) return onEstimate(d, null);
      asked = d;
      worker.postMessage({ run: ++run, draft: d } satisfies Ask);
    },
    carry: (draft, hex, key, author) => ask((k) => ({ job: "carry", n: k, draft, hex, key, author }), (r) => ("carried" in r ? r.carried : null)),
    rate: (hex) => ask((k) => ({ job: "rate", n: k, hex }), (r) => ("level" in r ? r.level : null)),
    stop: off,
  };
}
