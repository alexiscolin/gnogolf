"use client";

// The Builder's start on a computer: the workshop's sign with the one call to
// build (a plain green in the world chosen), that world's templates, then
// "Your holes": the drafts this browser keeps (the whole card opens one), the
// author's holes on the chain with who played them and the Builder's badges,
// and a file or a published hole opened. Shown at once: builder.wasm loads
// behind it, awaited only by what runs it. A new player never lands here
// first: the first run opens the Garden's dogleg.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton, FrontHead } from "@/components/About";
import { HoleMap, MapSlot, NoMap, useHoleMaps } from "@/components/HoleMap";
import { Portrait } from "@/components/Stage";
import { Emblem } from "@/components/Worlds";
import { Button, Segmented, Sheet } from "@/components/ui";
import { gnomeById } from "@/lib/scene/gnome";
import { exportDraft, type Draft, type Kept } from "@/lib/builder/draft";
import { draftMap, draftState } from "@/lib/builder/cards";
import { draftFile, fromFile, openPublished, type Opened } from "@/lib/builder/importing";
import { census } from "@/lib/builder/drawn";
import { isHoleId, makeChain } from "@/lib/chain";
import { startsIn } from "@/lib/builder/templates";
import { endpoints, playLink } from "@/lib/builder/holes";
import { goToMenu } from "@/lib/menu";
import { proofKey } from "@/lib/builder/proof";
import { versionOf } from "@/lib/builder/testmode";
import { FIELD, weatherName, worldName } from "@/lib/builder/rules";
import { factsOf, isFresh, loadSeen, statsLine, statsOf, versusLine, type HoleStats } from "@/lib/builder/rewards";
import { loadBuilder } from "@/lib/builder/load";
import type { HoleRow } from "@/lib/types";
import { BuilderBadges, SaveTestRound } from "./Rewards";
import { useRewards } from "./useRewards";
import { saveFile } from "./share";

const WORLDS = Object.keys(FIELD);
/** A draft file's most: a draft of every limit at once is far under it. */
const MAX_FILE = 1 << 20;

const download = (d: Draft) => saveFile(new Blob([exportDraft(d)], { type: "application/json" }), draftFile(d));

export default function Start({ author, drafts, said = "", onOpen, onAdd, onDelete }: {
  author: string | null;
  drafts: readonly Kept[];
  /** why something asked of the Builder on arrival (a remix) did not open */
  said?: string;
  onOpen: (key: string) => void;
  /** a new draft, and why it is broken if it is (a file opened as it is: "" if it passes) */
  onAdd: (d: Draft, broken?: string) => void;
  onDelete: (key: string) => void;
}) {
  const [world, setWorld] = useState("garden");
  const [hole, setHole] = useState("");
  const [why, setWhy] = useState(said);
  useEffect(() => void (said && setWhy(said)), [said]);
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState<string | null>(null); // the draft asked to be deleted, before the sheet's yes
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter(); // (the game's menu without a reload: the app's own navigation)
  // the world's templates, and its plain green: the sign's Build
  const starts = useMemo(() => startsIn(world).map((s) => ({ ...s, map: draftMap(s.draft) })), [world]);
  const scratch = starts.find((s) => s.name === "scratch"), templates = starts.filter((s) => s !== scratch);
  const keys = useKeys(drafts);
  const { chain, keep } = useMemo(() => {
    const { rpc, web, keep } = endpoints(window.location.search);
    return { chain: makeChain({ rpc, web }), keep };
  }, []);
  // the author's holes on the chain: each draft's own (its alias), and those this browser has no draft of
  const { got, reload } = useRewards(chain, author);
  const rowOf = (d: Draft) => (author && d.slug && got?.rows.find((h) => h.slot === `${author}/${d.slug}`)) || null;
  const elsewhere = got?.rows.filter((h) => !drafts.some((k) => rowOf(k.draft) === h)) ?? [];
  const maps = useHoleMaps(chain, elsewhere.map((h) => h.id));
  // while the chain is read: the room of the holes it listed at the last look (those with no draft here), so nothing moves
  const seen = useMemo(() => Object.keys(loadSeen()), []);
  const coming = author && !got ? seen.filter((id) => id.startsWith(`${author}/`) && !drafts.some((k) => k.draft.slug && id.startsWith(`${author}/${k.draft.slug}/`))) : [];
  const live = (h: HoleRow) => {
    if (!got || !author) return null;
    const s = statsOf(h, got.saved, author);
    return <Live s={s} fresh={isFresh(h.id, s, got.seen)} />;
  };
  const take = (r: Draft | Opened | string) => (typeof r === "string" ? setWhy(r) : (setWhy(""), "broken" in r ? onAdd(r.draft, r.broken) : onAdd(r)));
  const openFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return setWhy("That file is too big to be a draft.");
    void f.text().then(async (t) => fromFile(t, await loadBuilder(), census)).then(take, () => setWhy("That file could not be read."));
  };
  const openHole = (id = hole.trim()) => {
    if (!isHoleId(id)) return setWhy("A hole's address is like g1…/its-name, or g1…/its-name/v2.");
    setBusy(true);
    void loadBuilder().then((host) => openPublished(chain, host, census, id, author)).then(take, () => setWhy("The Builder could not load. Try again in a moment.")).finally(() => setBusy(false));
  };
  const count = drafts.length + elsewhere.length, any = count + coming.length > 0;
  const wiped = drafts.find((k) => k.key === wipe);
  const fresh = (
    <section className="bholes__starts" aria-labelledby="bholes-new">
      {/* the templates: ready-made holes to change (their green painted bigger or smaller at once), quieter than the sign's Build */}
      <h3 id="bholes-new" className="h-section">Or start from a template</h3>
      <ul>
        {templates.map((s) => (
          <li key={s.name}>
            <button type="button" className="bholes__start" aria-label={`${s.title}: ${s.line}, par ${s.draft.par}. Start it`} onClick={() => onAdd(s.draft)}>
              <span className="bholes__map"><HoleMap hole={s.map} className="bholes__svg" /></span>
              <b>{s.title}</b>
              <span className="bholes__line">{s.line}</span>
              <span className="bholes__foot" aria-hidden="true">
                <span className="bholes__par">Par {s.draft.par}</span>
                <span className="bholes__go">Start <i>→</i></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  const mine = (
    <section className="bholes__mine" aria-labelledby="bholes-mine">
      <h3 id="bholes-mine" className="h-section bholes__h">Your holes {any && <small>{count}</small>}</h3>
      {got && author && got.rows.length > 0 ? <BuilderBadges facts={factsOf(got.rows, got.saved, author)} /> : coming.length > 0 && <BuilderBadges />}
      {any ? (
        <ul className="bholes__list">
          {drafts.map(({ key, draft: d }) => {
            // (under the id its Publish would go by: the version after the one on the chain, else its first; the author unknown, the best of its ids)
            const h = rowOf(d), st = draftState(d, keys.get(key) ?? null, author && d.slug ? `${author}/${d.slug}/v${(h ? versionOf(h.id) : 0) + 1}` : null);
            const checking = d.proofs.length > 0 && !keys.has(key); // (its rounds read against the hole as it is: builder.wasm, loading)
            return (
              <li key={key} className="bholes__draft bholes__draft--open">
                <span className="bholes__map bholes__map--s"><HoleMap hole={draftMap(d)} className="bholes__svg" /></span>
                <span className="bholes__name">
                  {/* the whole card opens it (this button's area covers it: its other links over it) */}
                  <button type="button" className="bholes__pick" title={d.title || undefined} onClick={() => onOpen(key)}><b>{d.title || "A hole with no name yet"}</b></button>
                  <small>{worldName(d.world)} · {d.pieces.length} pieces</small>
                  {/* its weathers, ticked as holed (published and none holed here since: its line on the chain says it all, unless its
                      rounds were of the version before: played again for the next) */}
                  {!(h && st.stage === "new" && !st.again) && (
                    <span className={`bholes__state bholes__state--${st.stage}${checking ? " wait" : ""}`} aria-busy={checking || undefined} aria-label={`Weathers holed: ${st.word}`} title={st.stage === "ready" ? "Sunk in every weather: ready to publish" : st.again ? `Play it again for ${st.again}: each version has weather of its own` : "Each weather marked ○ is still to sink before it can be published"}>
                      {st.ticks.map((t, k) => <span key={t.kind} className={t.done ? "on" : undefined}>{k ? " · " : ""}{weatherName(t.kind)}{t.done ? " ✓" : " ○"}</span>)}
                    </span>
                  )}
                  {h && live(h)}
                  {/* the author's test round, the record to beat while none of theirs is saved */}
                  {h && got && author && !statsOf(h, got.saved, author).mine && <SaveTestRound chain={chain} proofs={d.proofs} id={h.id} world={d.world} author={author} onSaved={reload} />}
                </span>
                <span className="bholes__acts">
                  {h && <a className="linkish" href={playLink(h, keep)}>Play</a>}
                  <button type="button" className="linkish" onClick={() => download(d)}>Export</button>
                  <button type="button" className="linkish" onClick={() => setWipe(key)}>Delete</button>
                </span>
              </li>
            );
          })}
          {/* published from another browser (or the draft deleted): on the chain, opened as its next version */}
          {elsewhere.map((h) => {
            const m = maps.get(h.id);
            return (
              <li key={h.id} className="bholes__draft">
                <span className="bholes__map bholes__map--s"><MapSlot hole={m} className="bholes__svg" wait /></span>
                <span className="bholes__name">
                  <b>{h.name || h.slot}</b>
                  <small>{worldName(h.world)} · par {h.par}</small>
                  {live(h)}
                </span>
                <span className="bholes__acts">
                  <a className="linkish" href={playLink(h, keep)}>Play</a>
                  <button type="button" className="linkish" disabled={busy} onClick={() => openHole(h.id)}>Open its next version</button>
                </span>
              </li>
            );
          })}
          {coming.map((id) => <li key={id} className="bholes__draft wait" aria-hidden="true"><span className="bholes__map bholes__map--s"><NoMap className="bholes__svg" /></span></li>)}
        </ul>
      ) : (
        <p className="bholes__none">No hole of yours yet: build one above, it opens ready to play.</p>
      )}
    </section>
  );
  return (
    <div className={`screen worlds front bholes tint--${world}`}>
      <BackButton label="Back to the game" onClick={() => goToMenu(router, keep)} />
      <div className="worlds__in bholes__in">
        {/* making a hole first, whoever comes: the sign's Build, the templates; then the holes made */}
        <header className="bholes__sign">
          <span className="bholes__gnome"><Emblem id="build" /><Portrait skin={gnomeById("miner")} /></span>
          <div className="bholes__say">
            <FrontHead eyebrow="The Builder" title="Hard hats on!" />
            <p>Build your own hole, sink it in every weather, put your name on it.</p>
          </div>
          <div className="bholes__bar">
            {/* the worlds as the game's choices side by side, each with its emblem (the cups' own) */}
            <Segmented label="Its world" className="bholes__worlds" options={WORLDS.map((w) => [w, <><Emblem id={w} />{worldName(w)}</>] as const)} value={world} onChange={setWorld} />
            {scratch && <Button variant="gold" className="btn--play btn--cta bholes__build" onClick={() => onAdd(scratch.draft)}>Build a new hole <i aria-hidden="true">→</i></Button>}
          </div>
        </header>
        {fresh}
        {mine}
        {wiped && (
          // the game's own sheet (focus in, Tab kept, Escape, focus back to the row's Delete)
          <Sheet className="confirm" role="alertdialog" label="Delete this hole" onClose={() => setWipe(null)}>
            <h2>Delete &ldquo;{wiped.draft.title || "this hole"}&rdquo;?</h2>
            <p>It goes from this browser. Export it first to keep a copy.</p>
            <div className="banner__row">
              <Button onClick={() => setWipe(null)}>Keep it</Button>
              <Button variant="primary" className="btn--danger" onClick={() => (onDelete(wiped.key), setWipe(null))}>Delete</Button>
            </div>
          </Sheet>
        )}
        <details className="bholes__more">
          <summary>Open a file, or a published hole</summary>
          <div className="bholes__open">
            <Button onClick={() => file.current?.click()}>Open a file…</Button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => (openFile(e.target.files?.[0]), (e.target.value = ""))} />
            <span className="bholes__hole">
              <input value={hole} placeholder="g1…/its-name" aria-label="A published hole's address" spellCheck={false} autoCapitalize="off" onChange={(e) => setHole(e.target.value)} />
              <Button disabled={!hole.trim() || busy} onClick={() => openHole()}>{busy ? "Reading…" : "Open"}</Button>
            </span>
          </div>
        </details>
        {why && <p className="bholes__why" role="alert">{why}</p>}
        <i className="front__veil" aria-hidden="true" />
      </div>
    </div>
  );
}

/** A published hole's line on its card: on the chain, a dot for what is new since the last look, its players and plays, its best against the author's. */
function Live({ s, fresh }: { s: HoleStats; fresh: boolean }) {
  const vs = versusLine(s);
  return (
    <>
      <span className="bholes__state bholes__state--live">On gno.land{fresh && <i className="bholes__dot" role="img" aria-label="New since your last visit" title="New since your last visit" />}</span>
      <small className="bholes__stats">{statsLine(s)}</small>
      {vs && <small className="bholes__stats">{vs}</small>}
    </>
  );
}

/** Each proved draft's proof key by its own key (proof.ts proofKey: the hole as it is now), for its state, once builder.wasm is in; null when a fit refuses. */
function useKeys(drafts: readonly Kept[]) {
  const [keys, setKeys] = useState<ReadonlyMap<string, string | null>>(new Map());
  useEffect(() => {
    const proved = drafts.filter((k) => k.draft.proofs.length);
    if (!proved.length) return;
    let live = true;
    void loadBuilder().then((host) => Promise.all(proved.map((k) => proofKey(k.draft, host)))).then((found) => live && setKeys(new Map(proved.map((k, i) => [k.key, found[i]]))), () => {});
    return () => void (live = false);
  }, [drafts]);
  return keys;
}
