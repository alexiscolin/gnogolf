// A finished round on its way to the chain: what the save sends, the round
// kept for the tab read back and the keys it and the rounds sent are kept
// under, how a save goes, the time it must be saved by, and its cost in a
// line.

import { costOf } from "./adena";
import { isAddress, isHoleId, RULES, type Chain } from "./chain";
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

// the last finished round not yet on the chain, kept for this tab: installing
// Adena means reloading the page, and the round it was installed for must not go
export const PENDING = "gnogolf.pending";
// a round's key: its hole, mode, weather and shots (the same shots in another mode or weather are another round)
export const roundOf = (r: SaveOf) => `${r.id}#${r.roundMode || "assisted"}#${r.period ?? ""}#${r.shots.join(";")}`;
// the rounds whose last commit went, kept for the tab as PENDING is (by sentKey): a round sent
// before a reload is read again, never sent again
export const SENT = "gnogolf.sent";
// (and its chain's: the same round on another node or realm is another one)
export const sentKey = (c: Pick<Chain, "rpc" | "realm">, address: string, r: SaveOf) => `${c.rpc}|${c.realm}|${address}|${roundOf(r)}`;
export const loadSent = () => {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(SENT) || "[]");
    return Array.isArray(v) ? v.filter((e: unknown): e is [string, NonNullable<Rec>] => Array.isArray(e) && typeof e[0] === "string" && typeof (e[1] as { at?: unknown } | null)?.at === "string") : [];
  } catch {
    return [];
  }
};

/** How a save goes: signing (part of of), checking (sent: the chain read back), refused (why; stale: its
 *  weather is over; final: the chain played it, otherwise than here: sent, it is not offered again), unsure
 *  (why; sent: Adena said it went, so a save again only reads it again, by its hash if Adena gave one; else
 *  it may have gone: the player checks before saving again; was: the player's best there as the last
 *  commit went, 0 for none), or saved (stays: the older best the chain kept, this round not beating it: a
 *  tie keeps the older round). */
export type Rec = null
  | { at: "signing"; part?: number; of?: number }
  | { at: "checking" }
  | { at: "refused"; error: string; stale: boolean; final?: true }
  | { at: "unsure"; error: string; sent: boolean; hash?: string; was?: number }
  | { at: "saved"; stays?: number };
// a save under way: its button waits
export const busy = (rec: Rec) => rec?.at === "signing" || rec?.at === "checking";
// a save's button: what a click does now (a round sent but not confirmed yet is only read again)
export const saveLabel = (rec: Rec) =>
  rec?.at === "signing" ? "Waiting for Adena…" : rec?.at === "checking" ? "Checking the chain…" : rec?.at === "unsure" && rec.sent ? "Check again" : "Save on-chain";

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
