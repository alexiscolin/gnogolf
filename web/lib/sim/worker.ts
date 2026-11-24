// The local preview's worker (lib/sim): golf.wasm in its host, off the main
// thread, so a simulation never holds a frame. One message, one answer, in
// the order they came.
import { answer, makeHost, type Ask, type Host } from "./host";

/** Its answer: the call's (a JSON string, "panic: …" for a refusal), or what went wrong, and the time taken. */
export type Reply = { n: number; out?: string; err?: string; ms?: number };

let host: Promise<Host> | null = null;
self.onmessage = async ({ data: m }: MessageEvent<Ask & { n: number }>) => {
  const t0 = performance.now();
  let r: Reply;
  try {
    host ??= fetch(new URL("./golf.wasm", import.meta.url))
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`golf.wasm: ${res.status}`))))
      .then((b) => WebAssembly.compile(b))
      .then(makeHost);
    r = { n: m.n, out: answer(await host, m), ms: performance.now() - t0 };
  } catch (e) {
    host = null; // a failed load is tried again by the next message
    r = { n: m.n, err: String(e) };
  }
  postMessage(r);
};
