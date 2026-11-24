// The editor's worker: builder.wasm off the main thread. The carry has a host
// of its own, so its clock and loaded hole are never the meter's.
import { estimate, estimateHole, shown, type Level, type Shown } from "./difficulty";
import { carry, type Carried } from "./carry";
import { loadBuilder, loadModule } from "./load";
import { makeBuilderHost, type BuilderHost } from "./wasm";
import type { Draft } from "./draft";

/** A meter run of a draft, a carry of its proofs onto its bytes, or a published hole's level. */
export type Ask = { run: number; draft: Draft } | { job: "carry"; n: number; draft: Draft; hex: string; key: string; author: string } | { job: "rate"; n: number; hex: string };
/** The answer to an Ask. null: the draft does not fit, or the job failed. */
export type Reply = { run: number; shown: Shown | null } |{ job: "carry"; n: number; carried: Carried | null } | { job: "rate"; n: number; level: Level | null };

let latest = 0, replays: Promise<BuilderHost> | null = null;
// Lets the waiting messages in, then says whether this run is still the latest.
const still = (run: number) => () => new Promise<boolean>((ok) => setTimeout(() => ok(run === latest), 0));

self.onmessage = async ({ data: m }: MessageEvent<Ask>) => {
  if ("job" in m && m.job === "rate") {
    let level: Level | null = null;
    try {
      level = (await estimateHole(await loadBuilder(), m.hex))?.level ?? null;
    } catch {
      // not measured: the list puts it last
    }
    return postMessage({ job: "rate", n: m.n, level } satisfies Reply);
  }
  if ("job" in m) {
    let carried: Carried | null = null;
    try {
      replays ??= loadModule().then(makeBuilderHost);
      carried = await carry(await replays, m.draft, m.hex, m.key, m.author);
    } catch {
      replays = null; // a fresh host for the next carry
    }
    return postMessage({ job: "carry", n: m.n, carried } satisfies Reply);
  }
  latest = m.run;
  let r: Reply;
  try {
    const host = await loadBuilder();
    if (m.run !== latest) return;
    const est = await estimate(host, m.draft, { pause: still(m.run) });
    if (m.run !== latest) return;
    r = { run: m.run, shown: est && shown(est) };
  } catch {
    r = { run: m.run, shown: null };
  }
  postMessage(r);
};
