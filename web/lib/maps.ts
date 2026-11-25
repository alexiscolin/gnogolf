// A hole's map (components/HoleMap.tsx) without a wait. A course hole's comes
// from the site's own file (public/maps/course.json, made of data/holes.txt by
// scripts/coursemaps.ts) once the chain's hash of that version's data is the
// file's; any other version's is read from the chain once. Both answers are
// kept in this browser under the version's id, which never changes.
import { isObj, whichOf, type Chain, type Which } from "./chain";
import { inTurn, type MapHole } from "./duel";
import type { HoleRow } from "./types";

/** What a map is read with: a hole's state, its alias's versions, and which chain's realm it is on. */
export type MapChain = Pick<Chain, "state" | "versions"> & Which;
type CourseMap = MapHole & { sha: string };

const SHA = /^[0-9a-f]{64}$/;
const isVec = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const all = (v: unknown, ok: (x: unknown) => boolean) => Array.isArray(v) && v.every(ok);
/** A map HoleMap can draw: a bad answer, or a shape from before a change, is not one. */
export const isMap = (m: unknown): m is MapHole =>
  isObj(m) && typeof m.world === "string" && isVec(m.start) && isVec(m.cup) && (m.cupR === undefined || Number.isFinite(m.cupR)) &&
  all(m.walls, (w) => isObj(w) && isVec(w.a) && isVec(w.b)) &&
  all(m.posts, (p) => isObj(p) && isVec(p.c) && Number.isFinite(p.r)) &&
  all(m.zones, (z) => isObj(z) && typeof z.kind === "string" && typeof z.skin === "string" && isVec(z.min) && isVec(z.max) && isVec(z.vec) && (z.poly === undefined || all(z.poly, isVec)));
const isShas = (v: unknown): v is Record<string, string> => isObj(v) && Object.values(v).every((s) => typeof s === "string" && SHA.test(s));

// the site's maps by slot, the course's current versions as the chain lists them by id, and each version's hash as the chain gave it
const course = new Map<string, CourseMap>(), current = new Map<string, HoleRow>(), shas = new Map<string, string>();
const seen = new Map<string, MapHole>(), asked = new Map<string, Promise<MapHole>>();
let file: Promise<void> | null = null, recalled: Promise<void> | null = null;

/** The site's course maps, fetched once a visit (a failed read is asked again the next time). */
export function loadCourse(get: (url: string) => Promise<Response> = (u) => fetch(u)): Promise<void> {
  return (file ??= get("/maps/course.json")
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : Promise.reject(new Error("no course maps"))))
    .then((maps) => { for (const [slot, m] of Object.entries(isObj(maps) ? maps : {})) if (isMap(m) && SHA.test((m as CourseMap).sha)) course.set(slot, m as CourseMap); })
    .catch(() => void (file = null)));
}

// (the versioned store: a later shape of map takes a new name, and the old one's entries go with it)
const STORE = "gnogolf-maps-v1", OLD = ["gnogolf-maps"], MOST = 300;
let store: Promise<Cache> | null = null;
// (no Cache API off https, or in a private window: read from the chain each visit)
const open = () => (store ??= (OLD.forEach((n) => void caches.delete(n).catch(() => {})), caches.open(STORE)));
const keyOf = async (chain: Which, id = "") => `/maps/${encodeURIComponent(await whichOf(chain))}/${id ? `kept/${encodeURIComponent(id)}` : "shas"}`;
/** This browser's copy under a key, if it still is what ok wants: one that is not is dropped. */
async function kept<T>(key: string, ok: (v: unknown) => v is T): Promise<T | null> {
  try {
    const c = await open(), r = await c.match(key);
    if (!r) return null;
    const v: unknown = await r.json().catch(() => null);
    if (ok(v)) return v;
    await c.delete(key);
  } catch {}
  return null;
}
async function keep(key: string, v: unknown) {
  try {
    const c = await open();
    await c.put(key, new Response(JSON.stringify(v)));
    // (the oldest go first: the store never holds more than MOST)
    const keys = await c.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MOST)).map((k) => c.delete(k)));
  } catch {}
}

/** The chain's list of holes, as last read: the site's map is a slot's current version's only, and the hashes this browser checked come back with it. */
export function knowCourse(chain: MapChain, rows: readonly HoleRow[]) {
  current.clear();
  for (const h of rows) if (h.official && !h.next && h.slot) current.set(h.id, h);
  recalled ??= keyOf(chain).then((k) => kept(k, isShas)).then((was) => { for (const [id, sha] of Object.entries(was || {})) if (!shas.has(id)) shas.set(id, sha); }).catch(() => {});
}

// a course version's hash, asked of the chain once a browser (a read that fails: no hash, the map is read from the chain)
async function hashOf(chain: MapChain, row: HoleRow) {
  await recalled;
  if (shas.has(row.id)) return;
  for (const v of (await chain.versions(row.slot!).catch(() => null))?.versions ?? []) if (SHA.test(v.sha)) shas.set(v.id, v.sha);
  if (shas.has(row.id)) void keyOf(chain).then((k) => keep(k, Object.fromEntries([...shas].filter(([id]) => current.has(id))))).catch(() => {});
}

// the site's map of a version, only when the chain's hash of its data is the file's: never another version's lanes
function own(id: string): MapHole | undefined {
  const row = current.get(id), m = row && course.get(row.slot!);
  return m && m.sha === shas.get(id) ? m : undefined;
}

/** A map this visit already has, with no wait. */
export const mapNow = (id: string): MapHole | undefined => seen.get(id) ?? own(id);

/** A version's map: the site's own, else this browser's copy, else the chain's, kept from then on. A read that failed is asked again the next time. */
export function mapOf(chain: MapChain, id: string): Promise<MapHole> {
  let p = asked.get(id);
  if (p) return p;
  p = (async () => {
    const row = current.get(id);
    if (row && (await loadCourse(), course.has(row.slot!))) await hashOf(chain, row);
    let m = own(id);
    if (!m) {
      // (a chain that cannot say which it is keeps nothing: its maps are read each visit)
      const key = await keyOf(chain, id).catch(() => null);
      m = (key && (await kept(key, isMap))) || undefined;
      if (!m) {
        const { world, start, cup, cupR, walls, posts, zones } = await chain.state(id);
        m = { world, start, cup, cupR, walls, posts, zones };
        if (!isMap(m)) throw new Error(`${id}: not a map`);
        if (key) void keep(key, m);
      }
    }
    seen.set(id, m);
    return m;
  })();
  asked.set(id, p);
  p.catch(() => asked.delete(id));
  return p;
}

const turn = inTurn(2);
/** These versions' maps read ahead, two at a time: there when their screen opens. */
export const warmMaps = (chain: MapChain, ids: readonly string[]) => void ids.map((id) => turn(() => mapOf(chain, id)).catch(() => {}));
