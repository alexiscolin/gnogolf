// builder.wasm, fetched and compiled once a visit. A failed load is tried again by the next call.
import { makeBuilderHost, type BuilderHost } from "./wasm";

let mod: Promise<WebAssembly.Module> | null = null, once: Promise<BuilderHost> | null = null;

/** builder.wasm compiled, for a caller that wants a host of its own. */
export function loadModule(): Promise<WebAssembly.Module> {
  mod ??= fetch(new URL("../sim/builder.wasm", import.meta.url))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`builder.wasm: ${r.status}`))))
    .then((b) => WebAssembly.compile(b))
    .catch((e: unknown) => {
      mod = null;
      throw e instanceof Error ? e : new Error(String(e));
    });
  return mod;
}

/** The shared builder host. */
export function loadBuilder(): Promise<BuilderHost> {
  once ??= loadModule().then(makeBuilderHost).catch((e: unknown) => {
    once = null;
    throw e instanceof Error ? e : new Error(String(e));
  });
  return once;
}
