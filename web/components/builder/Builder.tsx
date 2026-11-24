"use client";

// The Builder on a computer: builder.wasm loaded, then the drafts this
// browser keeps (Start), the editor (Build, with Play over it) and Publish.
// A hole remixed from the game (?remix=) opens as a new draft. The author is
// the address this browser keeps, else the account Adena already shares with
// the site (read without a popup). Loaded only by gate.tsx: never on a phone.
import "@/app/title.css";
import "@/app/build/builder.css";
import "@/app/build/phone.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { DRAFT_PREFIX, dropDraft, keptText, loadDrafts, newKey, saveDraft, saveOver, type Draft, type Kept } from "@/lib/builder/draft";
import { endpoints, keepAuthor, knownAuthor, remixId } from "@/lib/builder/holes";
import { remixFrom } from "@/lib/builder/importing";
import { census } from "@/lib/builder/drawn";
import { makeChain } from "@/lib/chain";
import { loadBuilder } from "@/lib/builder/load";
import type { BuilderHost } from "@/lib/builder/wasm";
import Editor from "./Editor";
import Header from "./Header";
import Publish from "./Publish";
import Start from "./Start";
import { current } from "@/lib/adena";
import { firstRun, HINTS_KEY, ownSlug } from "@/lib/builder/templates";

export default function Builder() {
  const [host, setHost] = useState<BuilderHost | null>(null);
  const [failed, setFailed] = useState("");
  const [drafts, setDrafts] = useState<Kept[]>([]);
  // the open draft: its key, how many times opened (a fresh editor each), its step, Play at once (back from Publish;
  // readdress: its address changed first) and the id it was proved under (for Publish)
  const [open, setOpen] = useState<{ at: string; n: number; step: "edit" | "publish"; play?: boolean; readdress?: boolean; next?: string } | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [unkept, setUnkept] = useState(false);
  const [hints, setHints] = useState(false);
  const [said, setSaid] = useState(""); // why a remix asked for did not open
  const [opened, setOpened] = useState(""); // why a file opened as it is is broken ("" none)
  // the open draft as this tab last read or wrote it (a save writes only over that), and whether another tab has changed it since
  const was = useRef<string | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  const openAt = useCallback((at: string) => {
    was.current = keptText(at);
    setElsewhere(false);
    setOpen({ at, n: 0, step: "edit" });
  }, []);
  // a draft added (a new hole, a file, a remix) under its own key and an address no other draft has, then opened
  const among = useRef<readonly Kept[]>([]);
  among.current = drafts;
  const add = useCallback((d: Draft, others: readonly Kept[] = among.current) => {
    const key = newKey(), draft = ownSlug(d, others.map((k) => k.draft));
    setUnkept(!saveDraft(key, draft));
    setDrafts((list) => [...list, { key, draft }]);
    openAt(key);
  }, [openAt]);
  useEffect(() => {
    const list = loadDrafts();
    // a remix asked for (taken from the address at once: a reload does not make another)
    const remix = remixId(window.location.search), url = new URL(window.location.href);
    if (remix) url.searchParams.delete("remix"), window.history.replaceState(window.history.state, "", url);
    // a new player opens the Garden's dogleg with the first run's hints (not on a remix)
    let hinted = true;
    try { hinted = !!localStorage.getItem(HINTS_KEY); } catch {}
    const first = remix ? null : firstRun(list.map((k) => k.draft), hinted);
    setDrafts(list);
    if (first) add(first, list), setHints(true);
    // the address kept, else the account Adena already shares (no popup), kept like a typed one unless one was given
    // meanwhile; a game under way keeps the author it opened with
    const kept = knownAuthor();
    setAuthor(kept);
    if (!kept) void current().then((a) => a && !knownAuthor() && (keepAuthor(a.address), setAuthor((was) => was ?? a.address)));
    void loadBuilder().then((h) => {
      setHost(h);
      if (!remix) return;
      const { rpc, web } = endpoints(window.location.search);
      void remixFrom(makeChain({ rpc, web }), h, census, remix).then((d) => {
        if (typeof d === "string") return setSaid(d);
        add(d);
      });
    }, (e: Error) => setFailed(e.message));
  }, [add]);
  const at = open?.at;
  const update = useCallback((f: (d: Draft) => Draft) => {
    if (!at) return;
    setDrafts((list) => list.map((k) => {
      if (k.key !== at) return k;
      const draft = f(k.draft);
      // (changed in another tab: kept here only, until this tab says which stands)
      const kept = elsewhere ? "elsewhere" : saveOver(at, draft, was.current);
      if (kept === "elsewhere") setElsewhere(true);
      else (setUnkept(kept === null), kept && (was.current = kept.kept));
      return { key: at, draft };
    }));
  }, [at, elsewhere]);
  // while this tab keeps every draft, its list follows what the other tabs keep (each saves only its own drafts)
  const home = !open && !unkept;
  useEffect(() => {
    if (!home) return;
    const on = (e: StorageEvent) => (e.key === null || e.key.startsWith(DRAFT_PREFIX)) && setDrafts(loadDrafts());
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [home]);
  const onSave = useCallback((d: Draft) => update(() => d), [update]);
  // the first run's hints seen: never again in this browser
  const onHinted = useCallback(() => {
    try { localStorage.setItem(HINTS_KEY, "1"); } catch {}
    setHints(false);
  }, []);

  if (failed) return <main className="builder-off" role="alert"><h2>The Builder could not load.</h2><p>{failed}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  if (!host) return <main className="builder-off" aria-busy="true"><p>Loading the Builder…</p></main>;
  const d = open && drafts.find((k) => k.key === open.at)?.draft;
  // the open draft changed or deleted in another tab: open it as kept there (gone: back to the holes), or keep this tab's
  const theirs = () => {
    const list = loadDrafts();
    setDrafts(list);
    if (open && list.some((k) => k.key === open.at)) (was.current = keptText(open.at), setElsewhere(false), setOpen({ ...open, n: open.n + 1, step: "edit", play: false }));
    else (setElsewhere(false), setOpen(null));
  };
  const mine = () => open && d && (setUnkept(!saveDraft(open.at, d)), (was.current = keptText(open.at)), setElsewhere(false));
  const unkeptNote = (
    <>
      {unkept && <p className="bench__unkept" role="status">This browser keeps nothing (a private window?): export your hole before you leave.</p>}
      {elsewhere && (
        <p className="bench__unkept bench__unkept--elsewhere" role="alert">This hole was changed in another tab: your edits here are not kept.
          <Button size="s" onClick={theirs}>Open it as kept</Button><Button size="s" onClick={mine}>Keep mine</Button></p>
      )}
    </>
  );
  if (open && d) {
    const edit = (play = false, readdress = false) => setOpen({ ...open, n: open.n + 1, step: "edit", play, readdress });
    if (open.step === "publish" && author) {
      return (
        <div className={`pbench tint--${d.world}`}>
          <Header title={d.title} world={d.world} step="publish"
            steps={{ edit: { locked: "", done: true }, play: { locked: "", done: true }, publish: { locked: "", done: false } }}
            action={null} history={null} onTitle={(t) => update((x) => ({ ...x, title: t }))}
            onStep={(s) => s !== "publish" && edit(s === "play")} onBack={() => edit()} />
          <Publish host={host} draft={d} author={author} next={open.next ?? ""} onDraft={(x) => update(() => x)} onRetest={() => edit(true)} onReaddress={() => edit(true, true)} onBuild={() => edit()} onDone={(id) => update((x) => ({ ...x, from: id }))} />
          {unkeptNote}
        </div>
      );
    }
    return (
      <>
        <Editor key={`${open.at}/${open.n}`} host={host} first={d} author={author} onSave={onSave} onBack={() => (setOpened(""), setOpen(null), unkept || setDrafts(loadDrafts()))}
          onPublish={(next) => setOpen({ ...open, step: "publish", next })} onAuthor={setAuthor} play={open.play} readdress={open.readdress} opened={opened}
          taken={drafts.filter((k) => k.key !== open.at).map((k) => k.draft.slug)}
          hints={hints} onHinted={onHinted} />
        {unkeptNote}
      </>
    );
  }
  return (
    <Start host={host} author={author} drafts={drafts} said={said}
      onOpen={openAt}
      onAdd={(d, broken = "") => { add(d); setOpened(broken); }}
      onDelete={(key) => { dropDraft(key); setDrafts((list) => list.filter((k) => k.key !== key)); }} />
  );
}
