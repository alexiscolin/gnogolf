// Audience measurement on PostHog Cloud EU, anonymous and first-party: no banner.
// Without NEXT_PUBLIC_POSTHOG_KEY nothing loads and nothing is sent. Never who: every event is scrubbed.
import type { CaptureResult, PostHog } from "posthog-js";
import { camlog } from "./testhooks";
import { isTouch, reducedMotion } from "./device";
import type { Mode } from "./types";
import type { UiAction } from "./uitrack";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
/** The PostHog survey the feedback sheet answers. */
const SURVEY = process.env.NEXT_PUBLIC_POSTHOG_SURVEY || "";
/** The commit this build is of. */
const BUILD = process.env.NEXT_PUBLIC_BUILD || "dev";
/** 13 months, the CNIL's longest for an audience id: the cookie's life. */
const MAX_DAYS = 390;

type Value = string | number | boolean | null | undefined;
type Props = Record<string, Value>;
/** How a duel's rival was found: a pick of the rival screen's, a dare link, a board. */
export type RivalKind = "today" | "level" | "self" | "friend" | "surprise" | "board" | "link";
/** Where the wallet sheet was opened from. */
export type WalletFrom = "hud" | "card" | "pending" | "phone" | "rival" | "board" | "about" | "support";
/** The wallet sheet's steps, in its order; done: none left. */
export const WALLET_STEPS = ["adena", "connect", "funds", "name", "save"] as const;
/** What sent a Save to the wallet sheet instead of Adena: the first step missing. */
export type SaveBlock = "no_adena" | "no_account" | "no_funds" | "wrong_node" | "no_name" | null;
/** Why a name typed is refused: a rule of the registrar's broken, taken, too close to one taken, refused otherwise. */
export type NameRefusal = "chars" | "reserved" | "length" | "digits" | "taken" | "lookalike" | "invalid" | "no_registrar";
/** Where a shared link was shared from: its src=. */
export type ShareSrc = "hole" | "cup" | "board" | "duel";
/** What a share button offers, by its words: a dare, a duel's dare back, a place, your own ghost, the round. */
export type ShareKind = "dare" | "dare_back" | "share_rank" | "share_ghost" | "share";
/** A round: the hole, its cup, solo or a duel, the aim. */
export type Play = { hole: string; cup: string; mode: "solo" | "duel"; aim: Mode };

/** The game's own events: what autocapture and the pageviews can't see. */
export interface Events {
  screen: { name: string };
  boot: { title_ms: number; hole_ms: number };
  hole_loaded: { hole: string; world: string; state_ms: number; world_ms: number; build_ms: number; compile_ms: number };
  hole_started: Play & { weather: string; period: number | null };
  stroke: { hole: string; n: number; power: number; angle: number; result: "holed" | "hazard" | "rest"; cause: string; bounces: number; chain_ms: number; sim_ms?: number; fly_ms: number; aim_ms: number; cancels: number };
  hole_finished: Play & { strokes: number; par: number; place: number; first: boolean };
  hole_abandoned: Play & { strokes: number; why?: "left" };
  restart: { hole: string; strokes: number; holed: boolean };
  fps: { hole: string; tier: string; fps: number; fps_p10: number; long: number; frames: number; memory_mb: number | null };
  perf: { tier: string; slow: boolean };
  save: { stage: "sent" | "ok" | "cancelled" | "failed"; via: "adena" | "gnokey"; parts?: number; part?: number; gas?: number; ms?: number; reason?: string; best?: boolean };
  name_registered: { ok: boolean; via: "save" | "form" | "gnokey"; reason?: string };
  badge_earned: { id: string };
  progress_restored: { holes: number; asked: boolean };
  flags_stale: { hours: number };
  cup_complete: { cup: string; strokes: number; vs_par: number; best: boolean };
  duel_started: Pick<Play, "hole" | "cup"> & { rival: RivalKind; ghost: number; mixed: boolean };
  duel_result: { rival: RivalKind; result: "win" | "loss" | "tie"; strokes: number; ghost: number };
  share: { target: string; what: "hole" | "cup" | "board" | "clip" | "gnome"; kind?: ShareKind; dare?: boolean; saved?: boolean };
  wallet: { adena: boolean; connected: boolean };
  wallet_connect: { stage: "asked" | "ok" | "refused"; reason?: string };
  pending_restored: { hole: string; strokes: number; left_s: number | null };
  save_expired: { where: "card" | "pending"; hole: string; strokes: number };
  duel_dropped: { rival: RivalKind };
  sim_off: { why: "sources" | "load" | "mismatch"; hole?: string; period?: number; shot?: string; n?: number };
  finished_shown: { primary: "save" | "next" | "rematch" | "cup"; can_save: boolean; phone_only: boolean; duel: boolean };
  save_clicked: { from: "card" | "pending" | "sheet"; blocked: SaveBlock };
  name_refused: { reason: NameRefusal; via: "save" | "form" };
  wallet_step: { step: (typeof WALLET_STEPS)[number] | "done"; from: WalletFrom };
  ui: { action: UiAction; mode?: string; kind?: string; cup?: string; host?: string; locked?: boolean; found?: boolean };
}

export type Feedback = { rating: number; hard: string[]; more: string; familiar: string };

/** A dev build with no key: the sheet shown all the same, its answers logged, nothing sent. */
export const feedbackLocal = () => !KEY && process.env.NODE_ENV !== "production";
/** Whether feedback can be asked here: measured, not objected to, not a test-hooks page. */
export const canFeedback = () => (!!KEY || feedbackLocal()) && !optedOut() && !camlog();
/** Sends the feedback sheet's answers to PostHog's capture endpoint on a one-off id: they tie to no visit. Resolves whether it went. */
export async function feedback(f: Feedback, where: Props): Promise<boolean> {
  if (!canFeedback()) return false;
  const answers = [f.rating, f.hard, f.more, f.familiar], event = SURVEY ? "survey sent" : "feedback";
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
  try {
    // PostHog's responses tab reads each answer by its question's id; the index keys are its older form
    const questions = SURVEY && KEY ? await surveyQuestions() : [];
    const properties = {
      ...(SURVEY ? { $survey_id: SURVEY, $survey_completed: true, $survey_submission_id: crypto.randomUUID() } : {}),
      ...Object.fromEntries(answers.map((a, i) => [i ? `$survey_response_${i}` : "$survey_response", a])),
      ...Object.fromEntries(questions.map((q, i) => [`$survey_response_${q.id}`, answers[i]])),
      ...(questions.length ? { $survey_questions: questions.map((q, i) => ({ id: q.id, question: q.question, response: answers[i] })) } : {}),
      // the page's URL and host, as posthog-js says them: the test-account filters read them
      $current_url: globalThis.location?.href, $host: globalThis.location?.host, $pathname: globalThis.location?.pathname, $lib: "web",
      build: BUILD, viewport: sizeOf(globalThis.innerWidth || 0), touch: isTouch(),
      ...where,
    };
    if (!KEY) return (console.info("gnogolf feedback (local: nothing sent)", event, properties), true);
    const body = clean({ event, properties: { ...properties, distinct_id: crypto.randomUUID(), $process_person_profile: false } } as unknown as CaptureResult);
    const r = await fetch(`${OPTIONS.api_host}/i/v0/e/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: KEY, ...body }), signal: ac.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

type Question = { id: string; question: string };
let questionsRead: Promise<Question[]> | null = null;
/** The survey's questions, read once a visit from PostHog's public survey list. */
function surveyQuestions(): Promise<Question[]> {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 3000); // too slow: the answers go by their index keys alone
  return (questionsRead ||= fetch(`${OPTIONS.api_host}/api/surveys/?token=${KEY}`, { signal: ac.signal })
    .finally(() => clearTimeout(t))
    .then((r) => r.json() as Promise<{ surveys?: { id: string; questions: Question[] }[] }>)
    .then((d) => (d.surveys || []).find((s) => s.id === SURVEY)?.questions.map(({ id, question }) => ({ id, question })) || [])
    .catch(() => ((questionsRead = null), [])));
}

let ph: PostHog | null = null, started = false;
const queue: ((p: PostHog) => void)[] = [];

// the visitor's objection, kept in this browser; off holds it for this page when storage is blocked
const OFF = "gnogolf.noStats";
let off = false;
/** Whether the visitor objected to the measurement. */
export const optedOut = () => {
  try {
    return off || localStorage.getItem(OFF) === "1";
  } catch {
    return off;
  }
};
/** The visitor objects: nothing more goes, nothing loads again, and what PostHog kept in this browser goes. */
export function optOut() {
  off = true;
  try { localStorage.setItem(OFF, "1"); } catch {}
  queue.length = 0;
  // never reset(): it forgets the opt-out too
  if (ph) ph.opt_out_capturing();
  // this host's cookies only: cross_subdomain_cookie is off
  try {
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (/^(ph_|__ph_opt_in_out_)/.test(name)) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  } catch {}
}

// where PostHog never loads, the first 200 wait and the rest are dropped
function run(f: (p: PostHog) => void) {
  if (!KEY || optedOut()) return;
  if (ph) f(ph);
  else if (queue.length < 200) queue.push(f);
}

/** One of the game's events. */
export const track = <E extends keyof Events>(event: E, props: Events[E]) => run((p) => void p.capture(event, props));
/** One of the game's events as the page goes, by beacon: the tab may be closing. */
export const trackLeaving = <E extends keyof Events>(event: E, props: Events[E]) => run((p) => void p.capture(event, props, { transport: "sendBeacon" }));
/** Said with every event from now on. */
export const register = (props: Props) => run((p) => p.register(props));
/** Once a session: true the first time key is asked. */
export function once(key: string) {
  try {
    if (sessionStorage.getItem(`gnogolf.said.${key}`)) return false;
    sessionStorage.setItem(`gnogolf.said.${key}`, "1");
  } catch {}
  return true;
}
const told = new Map<string, number>();
/** A failure the game handled, where it happened and around what. The same one 3 times at most a page. */
export function trackError(where: string, err: unknown, props: Props = {}) {
  if (!KEY) return;
  const e = err instanceof Error ? err : new Error(String(err)), k = `${where}:${e.message}`, n = told.get(k) || 0;
  if (n >= 3) return;
  told.set(k, n + 1);
  run((p) => void p.captureException(e, { where, ...props }));
}

/** How many holes this browser's card holds, coarsely. */
export const cardHoles = (n: number) => (n < 1 ? "0" : n < 4 ? "1-3" : n < 10 ? "4-9" : "10+");

/** The step a save is missing, null if it may go to Adena. wrong_node: too few GNOT here with Adena on another network. */
export function saveBlock({ adena, account, lack, elsewhere }: { adena: boolean; account: boolean; lack: number | null; elsewhere: boolean }): SaveBlock {
  if (!account) return adena ? "no_account" : "no_adena";
  return lack != null && lack > 0 ? (elsewhere ? "wrong_node" : "no_funds") : null;
}

/** A failure in a word, to group them: its kind, or what its message names. */
export function failure(err: unknown) {
  const kind = err instanceof Error && (err as Error & { kind?: string }).kind, m = err instanceof Error ? err.message : String(err);
  return kind || (/out of gas/i.test(m) ? "gas" : /insufficient/i.test(m) ? "funds" : /locked/i.test(m) ? "locked" : /already open/i.test(m) ? "busy" : /cancelled|rejected/i.test(m) ? "cancelled" : /not installed/i.test(m) ? "no_adena" : /network|chain id|RPC/i.test(m) ? "network" : "other");
}

const G1 = /g1[0-9a-z]{38}/g; // a gno.land address, anywhere in a string
// what a URL keeps of its query: where in the game, never who nor a share's text
const KEEP = new Set(["cup", "hole", "gnome", "screen", "src"]);
/** A gnome as it may leave: the game's by its id, a held one as "token". */
export const gnomeWord = (id: string) => (/^t\d/.test(id) ? "token" : id);
/** A string as it may leave: URLs keep only KEEP; addresses, gno.land names and what follows "address(" go. free: a player's own words, where a recovery phrase goes only when the words are nothing else. */
export function scrub(v: string, free = false) {
  if (/^https?:\/\//.test(v))
    try {
      const u = new URL(v);
      for (const k of [...u.searchParams.keys()]) if (!KEEP.has(k)) u.searchParams.delete(k);
      const gnome = u.searchParams.get("gnome");
      if (gnome) u.searchParams.set("gnome", gnomeWord(gnome));
      v = u.href;
    } catch {}
  v = v
    .replace(G1, "g1…")
    .replace(/nym-[a-z0-9._-]+/gi, "nym-…")
    .replace(/address\(.*/gs, "address(…)");
  // a net for what should never pass here: a private key's hex, a recovery phrase
  v = v.replace(/\b(?:0x)?[0-9a-f]{64,}\b/gi, "hex…");
  return free ? v.replace(/^\s*(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\s*$/i, "words…") : v.replace(/\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/gi, "words…");
}
const deep = (v: unknown, free = false): unknown =>
  typeof v === "string" ? scrub(v, free) : Array.isArray(v) ? v.map((x) => deep(x, free)) : v && typeof v === "object" && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, free || k.startsWith("$survey_response") || k === "$survey_questions")])) : v;
/** An event with every string scrubbed. */
export const clean = (e: CaptureResult | null): CaptureResult | null => e && ({ ...e, properties: deep(e.properties), $set: deep(e.$set), $set_once: deep(e.$set_once) } as CaptureResult);

/** PostHog's init options. */
export const OPTIONS = {
  api_host: process.env.NODE_ENV === "production" ? "/e" : "https://eu.i.posthog.com", // the site's own path: a blocker sees no PostHog
  ui_host: "https://eu.posthog.com",
  defaults: "2026-08-30",
  person_profiles: "identified_only", // and nobody is identified: anonymous events only
  // first-party, this host only, 13 months at most
  persistence: "cookie",
  opt_out_persistence_by_default: true, // an objection takes the cookie away, and none is written again
  cross_subdomain_cookie: false,
  cookie_expiration: MAX_DAYS,
  capture_pageview: "history_change", // the address bar follows the screens
  capture_pageleave: true,
  autocapture: true,
  mask_all_text: true, // the boards show names and addresses
  mask_all_element_attributes: true,
  capture_dead_clicks: true,
  capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: true },
  capture_performance: { web_vitals: true, network_timing: false },
  disable_session_recording: true,
  enable_heatmaps: false,
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  advanced_disable_flags: true,
  before_send: clean,
} as const;

// the page as a word: what a layout is laid out for
const sizeOf = (w: number) => (w < 600 ? "phone" : w < 1024 ? "tablet" : "desktop");

/** Loads PostHog once the page is idle, then sends what was said meanwhile. load: the import, the tests give theirs. */
export function start(load: () => Promise<{ default: PostHog }> = () => import("posthog-js")) {
  if (!KEY || started || camlog() || optedOut()) return;
  started = true;
  const net = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  register({ build: BUILD, touch: isTouch(), reduced_motion: reducedMotion(), dpr: devicePixelRatio, viewport: sizeOf(innerWidth), locale: navigator.language, online: navigator.onLine, net: net && net.effectiveType });
  return new Promise<void>((done) => {
    const go = () =>
      void load()
        .then(({ default: p }) => {
          if (optedOut()) return; // objected while it loaded
          p.init(KEY, {
            ...OPTIONS,
            loaded: (p) => {
              // an id older than 13 months starts again, its device id too
              const day = Math.floor(Date.now() / 864e5), since = Number(p.get_property("since_day"));
              if (since && day - since > MAX_DAYS) p.reset(true);
              p.register_once({ since_day: day });
            },
          });
          ph = p;
          for (const f of queue.splice(0)) f(p);
        })
        .catch(() => {}) // blocked, or offline: the game goes on without
        .finally(done);
    if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1000);
  });
}
