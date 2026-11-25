// A hole's map (components/HoleMap.tsx) without a wait. A course hole's comes
// from the site's own file (public/maps/course.json, made of data/holes.txt by
// scripts/coursemaps.ts); any other version's is read from the chain once and
// kept in this browser under its id, which never changes.
import { whichOf, type Chain, type Which } from "./chain";
import { inTurn, type MapHole } from "./duel";
import type { HoleRow } from "./types";

/** What a map is read with: a hole's state, and which chain's realm it is on. */
export type MapChain = Pick<Chain, "state"> & Which;
type CourseMap = MapHole & { name: string; par: number };

// the site's maps by slot, and the course's current versions as the chain lists them, by id
const course = new Map<string, CourseMap>(), current = new Map<string, HoleRow>();
const seen = new Map<string, MapHole>(), asked = new Map<string, Promise<MapHole>>();
let file: Promise<void> | null = null;

/** The site's course maps, fetched once a visit (a failed read is asked again the next time). */
export function loadCourse(get: (url: string) => Promise<Response> = (u) => fetch(u)): Promise<void> {
  return (file ??= get("/maps/course.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, CourseMap>>) : Promise.reject(new Error("no course maps"))))
    .then((all) => { for (const [slot, m] of Object.entries(all)) course.set(slot, m); })
    .catch(() => void (file = null)));
}

/** The chain's list of holes, as last read: the site's map is a slot's current version's only. */
export function knowCourse(rows: readonly HoleRow[]) {
  current.clear();
  for (const h of rows) if (h.official && !h.next && h.slot) current.set(h.id, h);
}

// shortcut: a slot republished with the same name and par before the site is rebuilt draws the old lanes; compare a hash once Holes() lists one
function own(id: string): MapHole | undefined {
  const row = current.get(id), m = row && course.get(row.slot!);
  return m && m.name === row.name && m.par === row.par ? m : undefined;
}

/** A map this visit already has, with no wait. */
export const mapNow = (id: string): MapHole | undefined => seen.get(id) ?? own(id);

const STORE = "gnogolf-maps";
const keyOf = async (chain: Which, id: string) => `/maps/kept/${encodeURIComponent(await whichOf(chain))}/${id}`;
// (no Cache API off https, or in a private window: read from the chain each visit)
async function kept(key: string): Promise<MapHole | null> {
  try {
    const r = await (await caches.open(STORE)).match(key);
    return r ? ((await r.json()) as MapHole) : null;
  } catch {
    return null;
  }
}
async function keep(key: string, m: MapHole) {
  try {
    await (await caches.open(STORE)).put(key, new Response(JSON.stringify(m)));
  } catch {}
}

/** A version's map: the site's own, else this browser's copy, else the chain's, kept from then on. A read that failed is asked again the next time. */
export function mapOf(chain: MapChain, id: string): Promise<MapHole> {
  let p = asked.get(id);
  if (p) return p;
  p = (async () => {
    if (current.has(id)) await loadCourse();
    let m = own(id);
    if (!m) {
      // (a chain that cannot say which it is keeps nothing: its maps are read each visit)
      const key = await keyOf(chain, id).catch(() => null);
      m = (key && (await kept(key))) || undefined;
      if (!m) {
        const { world, start, cup, cupR, walls, posts, zones } = await chain.state(id);
        m = { world, start, cup, cupR, walls, posts, zones };
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
