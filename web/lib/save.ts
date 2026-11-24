// A finished round on its way to the chain: what the save sends, the round
// kept for the tab read back, the time it must be saved by, and its cost in
// a line.

import { costOf } from "./adena";
import { isAddress, isHoleId, RULES } from "./chain";
import type { Mode } from "./types";

/** A finished round, as far as saving it goes: what the save and its gas read. */
export type SaveOf = { id: string; name?: string; shots: readonly string[]; strokes: number; period?: number | null; roundMode?: Mode | null; official?: boolean; walls?: number; pieces?: number; kind?: string; pts?: readonly number[]; works?: readonly number[]; fixed?: number };
export const saveOf = (s: SaveOf): SaveOf => ({ id: s.id, name: s.name, shots: s.shots, strokes: s.strokes, period: s.period, roundMode: s.roundMode, official: s.official, walls: s.walls, pieces: s.pieces, kind: s.kind, pts: s.pts, works: s.works, fixed: s.fixed });
// a shot as the game records it: angle, power and, on a timed hole, the tick
const SHOT = /^-?\d{1,3}(\.\d{1,4})?,\d{1,2}(\.\d{1,4})?(,\d{1,5})?$/;
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
/**
 * A round kept for the tab (sessionStorage), read back: only one in the shape
 * the save sends is taken, anything else is dropped (null). The chain checks
 * every shot again before Adena opens; this keeps the card honest about what
 * it would sign.
 */
export function pendingOf(v: unknown): SaveOf | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const shots = r.shots;
  if (typeof r.id !== "string" || !isHoleId(r.id)) return null;
  if (!Array.isArray(shots) || !shots.length || shots.length > RULES.maxRoundStrokes || !shots.every((x) => typeof x === "string" && SHOT.test(x))) return null;
  if (!Number.isSafeInteger(r.strokes) || (r.strokes as number) < 1 || (r.strokes as number) > RULES.maxRoundStrokes) return null;
  if (!(r.period == null || Number.isSafeInteger(r.period))) return null;
  if (!(r.roundMode == null || r.roundMode === "pro" || r.roundMode === "assisted")) return null;
  if (![r.walls, r.pieces, r.fixed].every((x) => x == null || num(x)) || !(r.kind == null || typeof r.kind === "string")) return null;
  if (![r.pts, r.works].every((l) => l == null || (Array.isArray(l) && l.every(num)))) return null;
  const name = typeof r.name === "string" ? r.name.slice(0, 60) : undefined;
  return saveOf({ ...(r as SaveOf), name, official: r.official === true });
}

// A round is saved in the weather it was played in: the chain takes it while
// that period is the current one or the one just gone, so until the start of
// period + 2 (weather.gno, five-minute periods), by the time of the block that
// takes the transaction. On the chain's clock (chain.now: the last block time
// read), and SAVE_MARGIN early: the signing and the block's inclusion.
const SAVE_MARGIN = 15 * 1000;
export const saveBy = (period: number) => (period + 2) * RULES.periodMs - SAVE_MARGIN;

/** A round's cost in one short line: the total, and whether it is a first save
 *  there. deposit: what the save stores, in ugnot; test: a testnet's GNOT. */
export const costLine = (gas: number, gasPrice: number, saved: boolean | null, deposit: number, test = false) => {
  const g = Number(costOf(gas, gasPrice)), d = deposit / 1e6, unit = test ? "test GNOT" : "GNOT";
  return saved === true ? `About ${g.toFixed(2)} ${unit}` : `About ${(g + d).toFixed(2)} ${unit} (first save on this hole)`;
};

/** A node on this machine sends this address some GNOT from its test1 account:
 *  gnokey's command, "" unless every part checks (it is pasted into a shell). */
export const fundCmd = (address: string, chainId: string, rpc: string) => {
  let host = "";
  try { host = new URL(rpc).host; } catch {}
  return isAddress(address) && /^[\w.-]+$/.test(chainId) && /^[\w.:[\]-]+$/.test(host)
    ? `gnokey maketx send -send 50000000ugnot -to ${address} -gas-fee 1000000ugnot -gas-wanted 2000000 -chainid ${chainId} -remote ${host} -broadcast test1`
    : "";
};
