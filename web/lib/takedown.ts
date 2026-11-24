// The takedown list, served at /takedown.json: community holes the site no longer shows, whatever the chain still keeps.
import { isAddress, isSlug } from "./chain";

// a list of a few thousand holes is some 200 kB; past this it is not read at all
const MAX_BYTES = 1 << 20;

/** The aliases taken down, "<address>/<slug>": none if the list is too big, not JSON, or another chain's. */
export function readTakedown(text: string, chainId: string): ReadonlySet<string> {
  const out = new Set<string>();
  if (text.length > MAX_BYTES) return out;
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return out;
  }
  if (!j || typeof j !== "object") return out;
  const { chain, holes } = j as Record<string, unknown>;
  if ((typeof chain === "string" && chain && chain !== chainId) || !Array.isArray(holes)) return out;
  for (const h of holes) {
    if (typeof h !== "string") continue;
    const [addr, slug, ...rest] = h.split("/");
    if (!rest.length && isAddress(addr) && isSlug(slug)) out.add(h);
  }
  return out;
}

/** The site's list for the chain played on, read anew. None served: none taken down. A failed read rejects. */
export async function loadTakedown(chain: { chainId: () => Promise<string> }, get: Get = fetch): Promise<ReadonlySet<string>> {
  const [text, id] = await Promise.all([get("/takedown.json", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : r.status === 404 ? "" : Promise.reject(new Error(`takedown ${r.status}`)))), chain.chainId()]);
  return readTakedown(text, id);
}

/** No hole taken down: what a reader falls back to when the list cannot be read. */
export const NO_TAKEN: ReadonlySet<string> = new Set();

type Get = (url: string, init?: RequestInit) => Promise<Response>;
// the lists read this visit, by loader and chain id
const read = new WeakMap<Get, Map<string, Promise<ReadonlySet<string>>>>();
/** The site's list for the chain played on, read once a visit. A failed read is not kept. */
export async function takedownOf(chain: { chainId: () => Promise<string> }, get: Get = fetch): Promise<ReadonlySet<string>> {
  const id = await chain.chainId();
  const lists = read.get(get) ?? new Map<string, Promise<ReadonlySet<string>>>();
  read.set(get, lists);
  let p = lists.get(id);
  if (!p) lists.set(id, (p = loadTakedown({ chainId: () => Promise.resolve(id) }, get).catch((e: unknown) => (lists.delete(id), Promise.reject(e instanceof Error ? e : new Error(String(e)))))));
  return p;
}

/** Whether a hole is taken down: its alias, or any version of it. */
export function takenDown(set: ReadonlySet<string>, id: string) {
  const [addr, slug] = id.split("/");
  return set.has(`${addr}/${slug}`);
}
