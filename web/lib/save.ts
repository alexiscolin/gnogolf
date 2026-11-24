// A finished round on its way to the chain: what the save sends, the round kept for the tab, its deadline and its cost.

import { costOf } from "./adena";
import { isAddress, isHoleId, RULES, type Chain } from "./chain";
import type { Mode } from "./types";

/** A finished round as the save and its gas read it. */
export type SaveOf = { id: string; name?: string; shots: readonly string[]; strokes: number; period?: number | null; roundMode?: Mode | null; official?: boolean; walls?: number; pieces?: number; kind?: string; pts?: readonly number[]; works?: readonly number[]; fixed?: number };
export const saveOf = (s: SaveOf): SaveOf => ({ id: s.id, name: s.name, shots: s.shots, strokes: s.strokes, period: s.period, roundMode: s.roundMode, official: s.official, walls: s.walls, pieces: s.pieces, kind: s.kind, pts: s.pts, works: s.works, fixed: s.fixed });
// a shot as the game records it: angle, power and, on a timed hole, the tick
const SHOT = /^-?\d{1,3}(\.\d{1,4})?,\d{1,2}(\.\d{1,4})?(,\d{1,5})?$/;
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
/** A round kept for the tab, read back: one not in the shape the save sends is dropped. The chain checks every shot again before Adena opens. */
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

/** The last finished round not yet on the chain, kept for the tab: installing Adena means reloading the page. */
export const PENDING = "gnogolf.pending";
/** A round's key: its hole, mode, weather and shots. The same shots in another mode or weather are another round. */
export const roundOf = (r: SaveOf) => `${r.id}#${r.roundMode || "assisted"}#${r.period ?? ""}#${r.shots.join(";")}`;
/** The rounds whose last commit went, kept for the tab: one sent before a reload is read again, never sent again. */
export const SENT = "gnogolf.sent";
/** A sent round's key, with its chain's: the same round on another node or realm is another one. */
export const sentKey = (c: Pick<Chain, "rpc" | "realm">, address: string, r: SaveOf) => `${c.rpc}|${c.realm}|${address}|${roundOf(r)}`;
export const loadSent = () => {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(SENT) || "[]");
    return Array.isArray(v) ? v.filter((e: unknown): e is [string, NonNullable<Rec>] => Array.isArray(e) && typeof e[0] === "string" && typeof (e[1] as { at?: unknown } | null)?.at === "string") : [];
  } catch {
    return [];
  }
};

/** How a save goes. refused: stale, its weather is over; final, the chain played it otherwise than here. unsure: sent, Adena said it went, so a save again only reads it; was, the player's best there before. saved: stays, the older best the chain kept. */
export type Rec = null
  | { at: "signing"; part?: number; of?: number }
  | { at: "checking" }
  | { at: "refused"; error: string; stale: boolean; final?: true }
  | { at: "unsure"; error: string; sent: boolean; hash?: string; was?: number }
  | { at: "saved"; stays?: number };
/** A save under way: its button waits. */
export const busy = (rec: Rec) => rec?.at === "signing" || rec?.at === "checking";
/** A save's button. A round sent but not confirmed yet is only read again. */
export const saveLabel = (rec: Rec) =>
  rec?.at === "signing" ? "Waiting for Adena…" : rec?.at === "checking" ? "Checking the chain…" : rec?.at === "unsure" && rec.sent ? "Check again" : "Save on-chain";

// The chain takes a round while its weather's period is the current one or the one just gone: until the start of period + 2.
// SAVE_MARGIN early, for the signing and the block's inclusion.
const SAVE_MARGIN = 15 * 1000;
/** The time a round must be saved by, in ms on the chain's clock. */
export const saveBy = (period: number) => (period + 2) * RULES.periodMs - SAVE_MARGIN;

/** A round's cost in one short line. deposit: what the save stores, in ugnot. test: a testnet's GNOT. */
export const costLine = (gas: number, gasPrice: number, saved: boolean | null, deposit: number, test = false) => {
  const g = Number(costOf(gas, gasPrice)), d = deposit / 1e6, unit = test ? "test GNOT" : "GNOT";
  return saved === true ? `About ${g.toFixed(2)} ${unit}` : `About ${(g + d).toFixed(2)} ${unit} (first save on this hole)`;
};

/** gnokey's command for a node on this machine to send this address GNOT from test1. "" unless every part checks: it is pasted into a shell. */
export const fundCmd = (address: string, chainId: string, rpc: string) => {
  let host = "";
  try { host = new URL(rpc).host; } catch {}
  return isAddress(address) && /^[\w.-]+$/.test(chainId) && /^[\w.:[\]-]+$/.test(host)
    ? `gnokey maketx send -send 50000000ugnot -to ${address} -gas-fee 1000000ugnot -gas-wanted 2000000 -chainid ${chainId} -remote ${host} -broadcast test1`
    : "";
};
