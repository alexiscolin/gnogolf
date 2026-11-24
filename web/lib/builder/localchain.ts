// Test mode's chain: builder.wasm answers as the realm would, for a hole not on the chain yet.
// Every answer is at one period, so the engine never moves the round to another weather.
import { checks, RULES, type Chain } from "../chain";
import type { HoleRow, Vec2 } from "../types";
import type { BuilderHost } from "./wasm";

/** The part of a chain the engine and the proof read. */
export type LocalChain = Pick<Chain, "holes" | "state" | "period" | "now" | "weather" | "simulateFrom" | "simulateRound" | "simulateCommit" | "extras">;

const answer = <T>(out: string, ok: (v: unknown) => v is T): Promise<T> => {
  if (out.startsWith("panic: ")) return Promise.reject(Object.assign(new Error(out.slice(7)), { kind: "chain" as const }));
  try {
    const v: unknown = JSON.parse(out);
    if (ok(v)) return Promise.resolve(v);
  } catch {}
  return Promise.reject(new Error("The builder's answer is not one the chain would give."));
};

/** A chain for the draft's hole at period p. row: as the chain would list it; hex: its canonical data. */
export function makeLocalChain(host: BuilderHost, row: HoleRow, hex: string, p: number): LocalChain {
  host.load(row.id, hex);
  // The host is shared: its clock is set again before each read.
  const at = <T>(f: () => string, ok: (v: unknown) => v is T) => (host.setperiod(p), answer(f(), ok));
  return {
    holes: () => Promise.resolve([row]),
    state: (id: string) => at(() => host.state(id), checks.state),
    period: () => Promise.resolve(p),
    now: () => p * RULES.periodMs + RULES.periodMs / 2,
    weather: (id: string, q: number) => at(() => host.forecast(id, q), checks.weather),
    simulateFrom: (id: string, ball: Vec2, shot: string, stroke: number, q: number) => at(() => host.from(id, ball[0], ball[1], shot, stroke, q), checks.simFrom),
    simulateRound: (id: string, shots: readonly string[], q: number | null | undefined) => at(() => host.round(id, shots.join(";"), q ?? p), checks.simRound),
    simulateCommit: (id: string, ball: Vec2, stroke: number, shots: readonly string[], q: number) => at(() => host.commit(id, ball[0], ball[1], stroke, shots.join(";"), q), checks.simRound),
    extras: (id: string, stroke: number) => at(() => host.extras(id, Math.max(0, stroke | 0)), checks.extras),
  };
}
