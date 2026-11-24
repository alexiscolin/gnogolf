// Proofs that survive an edit: each weather's latest round is replayed on the
// new hole by the realm's code, and kept if it holes in the same strokes.
import { makeLocalChain } from "./localchain";
import { replay, type Proof } from "./proof";
import { holeRow } from "./testmode";
import type { Draft } from "./draft";
import { weatherName } from "./rules";
import type { BuilderHost } from "./wasm";


/** The rounds to replay on the hole as it is now (key): per id and weather, the latest proof of another key, unless the hole already has one. */
export function toCarry(proofs: readonly Proof[], key: string, author: string, slug: string): Proof[] {
  const mine = proofs.filter((p) => p.id.startsWith(`${author}/${slug}/v`)), held = new Set(mine.filter((p) => p.key === key).map((p) => `${p.id} ${p.kind}`));
  const last = new Map<string, Proof>();
  for (const p of mine) if (p.key !== key && !held.has(`${p.id} ${p.kind}`)) last.set(`${p.id} ${p.kind}`, p);
  return [...last.values()];
}

/** Why a round no longer holds, in plain words. */
function brokenLine(kind: string, why: string): string {
  const round = `Your ${weatherName(kind)} round`;
  if (/did not drop/.test(why)) return `${round} now stops short`;
  const early = /dropped at stroke (\d+)/.exec(why);
  if (early) return `${round} now drops at stroke ${early[1]}, before its last shot`;
  if (/another weather/.test(why)) return `${round}'s weather is not this hole's any more`;
  if (/units of work/.test(why)) return `${round} now takes too much work for the chain`;
  return `${round} no longer holds: ${why}`;
}

/** The proofs kept, keyed to the new hole, and the weathers whose round broke. */
export interface Carried {
  proofs: Proof[];
  broken: { kind: string; why: string }[];
}

/** Replays the draft's older rounds on hex, the new hole's canonical bytes, whose proof key is key. */
export async function carry(host: BuilderHost, d: Draft, hex: string, key: string, author: string): Promise<Carried> {
  const out: Carried = { proofs: [], broken: [] };
  for (const p of toCarry(d.proofs, key, author, d.slug)) {
    const r = await replay(makeLocalChain(host, holeRow(p.id, d), hex, p.period), { key, id: p.id, kind: p.kind, period: p.period, shots: p.shots });
    if (typeof r !== "string" && r.strokes === p.strokes) out.proofs.push(r);
    else out.broken.push({ kind: p.kind, why: brokenLine(p.kind, typeof r === "string" ? r : "The ball did not drop.") });
  }
  return out;
}

/** A round just proved, replayed in each weather still to prove: the proofs of those it holes in too. */
export const holdsToo = (host: BuilderHost, d: Draft, hex: string, p: Proof, left: readonly { kind: string; period: number }[]): Promise<Proof[]> =>
  holdsIn(host, d, hex, p, left.filter((w) => w.kind !== p.kind));

/** A round's shots replayed under id in each weather given, at its period: the proofs of those it holes in. A weather with a negative period is skipped. */
export async function holdsIn(host: BuilderHost, d: Draft, hex: string, r: { key: string; id: string; shots: readonly string[] }, left: readonly { kind: string; period: number }[]): Promise<Proof[]> {
  const out: Proof[] = [], row = holeRow(r.id, d);
  for (const { kind, period } of left) {
    if (period < 0) continue;
    const p = await replay(makeLocalChain(host, row, hex, period), { key: r.key, id: r.id, kind, period, shots: [...r.shots] });
    if (typeof p !== "string") out.push(p);
  }
  return out;
}

/** The weathers proved for the hole before (prev) and not for the hole now (key). */
export function dropped(proofs: readonly Proof[], prev: string | null, key: string): string[] {
  if (!prev || prev === key) return [];
  const now = new Set(proofs.filter((p) => p.key === key).map((p) => p.kind));
  return [...new Set(proofs.filter((p) => p.key === prev && !now.has(p.kind)).map((p) => p.kind))];
}

/** A draft keeps the proofs of this many keys: the hole as it is and the few before it. */
export const KEPT_KEYS = 4;

/** The draft's proofs with the carried ones added, the oldest keys dropped past KEPT_KEYS. */
export function withCarried(proofs: readonly Proof[], carried: readonly Proof[]): Proof[] {
  const all = [...proofs, ...carried], keys: string[] = [];
  for (let i = all.length - 1; i >= 0; i--) if (!keys.includes(all[i].key)) keys.push(all[i].key);
  const keep = new Set(keys.slice(0, KEPT_KEYS));
  return all.filter((p) => keep.has(p.key));
}
