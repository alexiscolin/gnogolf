// Adena, the gno.land browser wallet: who is playing, and signing a round.
// The page sends decisions, never outcomes: the chain re-runs every shot itself.

import { RULES, PKG_PATH, isAddress, isSlug, nameShape, errorKind, type Chain } from "./chain";
import { trackError } from "./analytics";
import type { HoleState, Mode, Vec2, Zone } from "./types";

/** An Adena answer: its status, and a code, a type or a message when it failed. */
interface AdenaRes<T = unknown> {
  status: string;
  type?: string;
  code?: number;
  message?: string;
  data?: T;
}
interface Network {
  chainId: string;
  rpcUrl?: string;
  rpc_url?: string;
}
// a network's RPC, under either of the names Adena gives it
const rpcOf = (n: Network) => n.rpcUrl || n.rpc_url;
/** A /vm.m_call message, as DoContract takes it. */
interface Call {
  type: "/vm.m_call";
  /** max_deposit: the most the call may lock as storage deposit ("600000ugnot"), the chain's default if none */
  value: { caller: string; send: string; pkg_path: string; func: string; args: string[]; max_deposit?: string };
}
/** A /bank.MsgSend message: coins from the player's account to another. */
interface Send {
  type: "/bank.MsgSend";
  value: { from_address: string; to_address: string; amount: string };
}
/** The part of Adena's injected API this page calls. */
export interface Adena {
  AddEstablish(name: string): Promise<AdenaRes>;
  GetAccount(): Promise<AdenaRes<{ address: string; chainId: string }>>;
  GetNetwork?(): Promise<AdenaRes<Network>>;
  SwitchNetwork(chainId: string): Promise<AdenaRes>;
  AddNetwork(n: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaRes>;
  DoContract(tx: { messages: (Call | Send)[]; gasFee: number; gasWanted: number; memo: string; networkInfo?: { chainId: string; rpcUrl: string } }): Promise<AdenaRes<{ hash: string; height: number }>>;
  On?(event: "changedAccount" | "changedNetwork", fn: (...x: unknown[]) => void): void;
}
declare global {
  interface Window {
    adena?: Adena;
  }
}
/** A transaction Adena did not send. cancelled: the player said no. maybe: it failed without saying nothing went, so it may have landed. hash: the transaction's, when Adena gives it. */
export interface SendError extends Error {
  cancelled?: boolean;
  maybe?: boolean;
  hash?: string;
}
/** What the work model counts for a round, as the engine's snapshot has them. */
interface Work {
  walls?: number;
  pieces?: number;
  kind?: string;
  pts?: readonly number[];
  /** each stroke's work, the realm's SimulateFrom "work" */
  works?: readonly number[];
  /** the gas a commit spends before its shots, Weather()'s "gas"; 0 or none: not said */
  fixed?: number;
  /** each shot's share of setting the hole's pulses up */
  setup?: number;
}

const wallet = () => (typeof window !== "undefined" ? window.adena : undefined);

export const hasAdena = () => !!wallet();

// Adena's status codes worth telling apart
const CANCELLED = 4000, LOCKED = 2000, BUSY = 1001, NOT_CONNECTED = 1000;

/** What went wrong, in words a player can act on, and told to analytics. */
function why(res: AdenaRes | null | undefined, fallback: string) {
  const said = words(res, fallback);
  trackError("adena", said, { code: res && res.code, type: res && res.type, what: fallback });
  return said;
}
// Adena's codes for a transaction that never left it
const UNSENT = [CANCELLED, LOCKED, BUSY, NOT_CONNECTED];
function words(res: AdenaRes | null | undefined, fallback: string) {
  const code = res && res.code;
  if (code === CANCELLED) return "Cancelled in Adena — nothing was sent.";
  if (code === LOCKED) return "Adena is locked. Unlock it and try again.";
  if (code === BUSY) return "An Adena window is already open. Finish or close it first.";
  if (code === NOT_CONNECTED) return "Adena is not connected to this page yet.";
  return refusal(res) || (res && res.message) || fallback;
}
/** A refused transaction: the chain's own words where Adena passes them on, "" for none. */
function refusal(res: AdenaRes | null | undefined) {
  const d = res && (res.data as { error?: { message?: string } | string; log?: string } | undefined);
  // typeof null is "object": an error of null falls through to the log
  const chain = d && ((d.error && typeof d.error === "object" && d.error.message) || d.log || d.error);
  return typeof chain === "string" ? chain : "";
}

// the same address written the same way: Adena compares RPCs as strings
const norm = (u: string | null | undefined) => String(u || "").trim().replace(/\/+$/, "");
/** The node as a wallet reaches it. In the local playground the page reads its own /rpc and the wallet signs on the node's raw port. */
const walletNode = (rpc: string) => (process.env.NEXT_PUBLIC_PLAYGROUND === "1" && process.env.NEXT_PUBLIC_WALLET_RPC) || rpc;

/** Puts Adena on this page's chain, adding the network if it has never seen it. Runs before every signature: Adena's approval screen stays greyed until its active network is exactly networkInfo's. */
async function ensureNetwork(a: Adena, { chainId, rpc, name = `gno.land (${chainId})` }: { chainId?: string | null; rpc: string; name?: string }) {
  // no chain id, no signature: Adena would sign on whatever network it has on
  if (!chainId) throw new Error("The chain's id is not known yet (is the node up?). Try again in a moment.");
  rpc = walletNode(rpc);
  const active = async () => {
    try {
      const n = await a.GetNetwork?.();
      return n && n.data ? { id: n.data.chainId, rpc: norm(rpcOf(n.data)) } : null;
    } catch {
      return null;
    }
  };
  let now = await active();
  if (now && now.id === chainId && (!now.rpc || now.rpc === norm(rpc))) return;
  let r = await a.SwitchNetwork(chainId);
  if (r.status !== "success") {
    const add = await a.AddNetwork({ chainId, chainName: name, rpcUrl: norm(rpc) });
    if (add.status !== "success" && add.type !== "NETWORK_ALREADY_EXISTS") throw new Error(why(add, "Adena did not add the network."));
    r = await a.SwitchNetwork(chainId);
    if (r.status !== "success")
      throw new Error(
        `Adena already has a network on ${norm(rpc)} under another chain id (left from before this chain was restarted), so it cannot add “${chainId}”. ` +
          `In Adena: Settings → Change Network → remove the custom network on ${norm(rpc)}, then save again — the game adds the right one.`
      );
  }
  now = await active();
  if (now && now.rpc && now.rpc !== norm(rpc))
    throw new Error(`Adena switched to “${chainId}” but on ${now.rpc}, not ${norm(rpc)}. Edit that network's RPC in Adena to ${norm(rpc)}.`);
}

/** Connects, and moves Adena onto the chain this page plays on. */
export async function connect({ chainId, rpc, name }: { chainId?: string | null; rpc: string; name?: string }) {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");

  const est = await a.AddEstablish("Gnogolf");
  if (est.status !== "success" && est.type !== "ALREADY_CONNECTED") throw new Error(why(est, "Adena did not connect."));
  const acc = await a.GetAccount();
  if (acc.status !== "success") throw new Error(why(acc, "Adena did not share an account."));
  // a success without an account is no account
  const data = acc.data;
  if (!data || !isAddress(data.address)) throw new Error(why(acc, "Adena did not share an account."));
  const { address } = data;
  let on = data.chainId;

  if (chainId && on !== chainId) {
    await ensureNetwork(a, { chainId, rpc, name });
    on = chainId;
  }
  return { address, chainId: on, rpcOk: await onOurNode(rpc) };
}

// a URL's host and port, so that localhost and 127.0.0.1 compare equal
const port = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace("localhost", "127.0.0.1")}:${x.port || (x.protocol === "https:" ? 443 : 80)}`;
  } catch {
    return String(u);
  }
};
/** true when Adena's active network is this page's node, false when it is another, null when it cannot say. */
export async function onOurNode(rpc: string | null | undefined) {
  const a = wallet();
  if (!a || !a.GetNetwork || !rpc) return null;
  rpc = walletNode(rpc);
  try {
    const n = await a.GetNetwork();
    const url = n && n.data && rpcOf(n.data);
    return url ? port(url) === port(rpc) : null;
  } catch {
    return null;
  }
}

/** The account Adena already shares with this page, or null. No popup: a page Adena has not established with stays anonymous. */
export async function current() {
  const a = wallet();
  if (!a) return null;
  try {
    const acc = await a.GetAccount();
    return acc.status === "success" && acc.data && acc.data.address ? { address: acc.data.address, chainId: acc.data.chainId } : null;
  } catch {
    return null;
  }
}
/** The connected Adena account. */
export type Account = NonNullable<Awaited<ReturnType<typeof current>>>;

// Adena has no way to take a listener back: one pair is registered for the page, and subscribers come and go in a set.
const listeners = new Set<(...x: unknown[]) => void>();
let listening = false;
/** Follows the account and network chosen in Adena. */
export function onWalletChange(fn: (...x: unknown[]) => void) {
  const a = wallet();
  if (!a || !a.On) return () => {};
  if (!listening) {
    listening = true;
    const all = (...x: unknown[]) => listeners.forEach((f) => f(...x));
    a.On("changedAccount", all);
    a.On("changedNetwork", all);
  }
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// A commit's work by the realm's own model (golf.gno newWork, next, add), computed here exactly.
// The realm takes the larger of the path's count and the work its physics did, as here.
const WORK = RULES.work;
// zones as the work model counts them: one piece each, and one per polygon edge
const piecesOf = (zs: readonly { poly?: readonly unknown[] }[]) => zs.reduce((n, z) => n + 1 + ((z.poly && z.poly.length) || 0), 0);
/** The board's walls, pieces and set-up as the work model counts them, the forecast's zones on top. A realm that does not say them: the hole's own and the pulses seen so far. */
export function boardWork(s: HoleState | null, seen: { walls: number; posts: number; pieces: number }, weather: readonly Zone[] = []) {
  if (!s) return { walls: 0, pieces: 0, setup: 0 };
  const w = s.work || {
    walls: s.walls.length + seen.walls,
    pieces: s.walls.length + s.posts.length + piecesOf(s.zones) + seen.pieces,
    setup: seen.walls * WORK.pulseWall + seen.posts * WORK.pulsePost,
  };
  return { walls: w.walls, pieces: w.pieces + piecesOf(weather), setup: w.setup };
}
// what every shot of a commit costs before its own: the shot and the walls
const baseOf = (c: Work) => WORK.shot + (c.walls || 0) * WORK.wall;
// a stroke of unknown length counts as the longest path the realm takes
const workOf = (c: Work, i: number) => {
  const base = baseOf(c);
  return Math.max(base + ((c.pts || [])[i] ?? RULES.maxPath) * (WORK.point + (c.pieces || 0) * WORK.piece), base + ((c.works || [])[i] || 0) * WORK.unit) + (c.setup || 0);
};

/** The commits a round is recorded in, [[from, to), …] from stroke start, cut by the same sums as the realm's work.next: no commit of the split is one the chain refuses. */
export function commitsOf(c: Work, n = (c.pts || []).length, start = 0) {
  const parts: [number, number][] = [];
  const base = baseOf(c);
  let from = start, spent = 0, most = 0;
  for (let i = start; i < n; i++) {
    const cap = Math.min(RULES.maxWork, Math.trunc((WORK.budget - (c.fixed || 0) - spent - base) / WORK.unit) - RULES.maxWorkStep - Math.trunc((c.setup || 0) / WORK.unit));
    const over = cap < 1 || (cap < RULES.maxWork && ((c.works || [])[i] || 0) > cap);
    if (i > from && (i - from >= RULES.maxShots || spent + most > WORK.budget || over)) (parts.push([from, i]), (from = i), (spent = most = 0));
    const w = workOf(c, i);
    spent += w;
    most = Math.max(most, w);
  }
  if (n > from) parts.push([from, n]);
  return parts;
}

/** The fee asked: the gas at the price, with half again for a price that rises before the block. */
export const feeFor = (gasWanted: number, price: number) => Math.ceil(gasWanted * price * 1.5);
/** The deposit asked to store bytes at price ugnot a byte, a tenth more: the chain takes what is really written. */
export const depositFor = (bytes: number, price: number) => Math.ceil(bytes * price * 1.1);
/** Ugnot rounded up to the hundredth of a GNOT: never under what the wallet may be asked. */
export const upToHundredth = (ugnot: number) => Math.ceil(ugnot / 1e4) * 1e4;
/** That figure in GNOT, as a bill says it: 124900 → "0.13". */
export const aboutGnot = (ugnot: number) => (upToHundredth(ugnot) / 1e6).toFixed(2);
/** Ugnot a gas, asked when the chain's price is not given. */
export const PRICE = 0.001;
// Gas for one commit, calibrated on gno_call simulate=true: the work model bounds the shots at 1.2x to 1.6x their measured gas.
// Adena simulates every tx with 2e9 gas at most: the ask stays under it.
export const MAX_GAS = 1_900_000_000;
export const PER_CALL = 30e6; // the call itself, a Reset with it too
// a round's last commit also stores its finish: 30M to 40M the work model leaves out
const FINISH = 40e6;
// without the realm's own figure: rain and a storm on the heaviest course holes, 193M and 204M measured
const FORECAST: Record<string, number> = { rain: 200e6, storm: 210e6 };
/** The gas one commit of these strokes should need. */
export function gasOf(c: Work, from = 0, to = (c.pts || []).length) {
  let g = PER_CALL + (c.fixed || FORECAST[c.kind || ""] || 0) + (c.pts?.length && to > from && to >= c.pts.length ? FINISH : 0);
  for (let i = from; i < to; i++) g += workOf(c, i);
  return Math.min(Math.ceil(g), MAX_GAS);
}
/** The gas a round of n strokes should need in all: each of its commits pays its own call and fixed gas. */
export const roundGas = (c: Work, n: number) => commitsOf(c, n).reduce((g, [from, to]) => g + gasOf(c, from, to), 0);

/** Why a round the chain replays otherwise cannot be saved. */
export const replayDiffers = (strokes: number | null, holed: boolean) =>
  `The chain's replay ended differently (${strokes ?? "?"} strokes, ${holed ? "holed" : "not holed"}): this hole moves between shots. Play it again to save.`;

/** The commits a round is recorded in, each accepted by the chain as a read before Adena opens. check resolves with the chain's answer for a commit: its "rest" is where the next starts. The chain's "commit the first N" wins over the model. */
async function splitRound(shots: readonly string[], check: (list: string[], from: number, ball: Vec2 | null | undefined) => Promise<{ rest?: Vec2; holed?: boolean; strokes?: number } | null | undefined>, c: Work = {}) {
  const out: [number, number][] = [];
  for (let from = 0, ball: Vec2 | null | undefined = null; from < shots.length; ) {
    let to = commitsOf(c, shots.length, from)[0][1], r;
    try {
      r = await check(shots.slice(from, to), from, ball);
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).match(/commit the first (\d+)/);
      if (!m) throw e;
      const n = Number(m[1]);
      if (!(n >= 1 && n < to - from)) throw new Error("Even one shot of this round is more than one transaction can replay. It cannot be saved.");
      to = from + n;
      r = await check(shots.slice(from, to), from, ball);
    }
    // strokes counts from the tee. Only the last commit may hole: a round holed sooner is not kept.
    if (!r || r.strokes !== to || !!r.holed !== (to === shots.length)) throw new Error(replayDiffers(r ? r.strokes ?? null : null, !!(r && r.holed)));
    out.push([from, to]);
    ball = r && r.rest;
    from = to;
  }
  return out;
}

/** A round's commits as the chain cuts them: a SimulateRound from the tee, then a SimulateCommit from where the one before leaves the ball. ms: each read's time limit. */
export function chainSplit(chain: Pick<Chain, "simulateRound" | "simulateCommit">, s: SaveRound & { id: string }, period: number, ms = 8000) {
  const hole = s.id, shots = s.shots || [];
  return splitRound(shots, (list, from, ball) => (from && ball ? chain.simulateCommit(hole, ball, from, list, period, ms) : chain.simulateRound(hole, list, s.period, ms)), s);
}

// nothing is sent to an empty package path
const NO_REGISTRAR = "This chain has no name registrar: no name can be taken here.";

/** A commit's call: PlayRoundPro for a pro round, PlayRoundAt in the period it was played in, PlayRound with none. */
const playOf = (mode: Mode, hole: string, shots: string, period: number | null | undefined): [string, string[]] =>
  mode === "pro" ? ["PlayRoundPro", [hole, shots, String(period)]] : period == null ? ["PlayRound", [hole, shots]] : ["PlayRoundAt", [hole, shots, String(period)]];

/** Signs one commit of this round. reset: a Reset first, in the same transaction, over a round left under way. named: a gno.land name taken in the same signature, so the round is ranked as it lands. */
export async function recordRound({ address, realm, hole, shots, gas, period, reset = false, mode = "assisted", price = PRICE, chainId, rpc, named }: {
  address: string; realm: string; hole: string; shots: readonly string[]; gas?: number; period?: number | null; reset?: boolean; mode?: Mode; price?: number; chainId?: string | null; rpc: string;
  named?: { registrar: string; name: string } | null;
}) {
  if (named && !named.registrar) throw new Error(NO_REGISTRAR);
  // no balance gate here: Adena says when an account cannot pay, and the page warns beforehand
  // a pro round has its period: never a 0 the chain refuses
  if (mode === "pro" && period == null) throw new Error("This round has no weather period, so it cannot be saved. Play it again.");
  // the period signed is the whole number the chain checked
  if (period != null && !Number.isSafeInteger(period)) throw new Error("This round's weather period is not one the chain knows. Play it again.");
  return calls(
    address,
    [
      ...(named ? [[named.registrar, "Register", [named.name]] as const] : []),
      ...(reset ? [[realm, "Reset", [hole]] as const] : []),
      [realm, ...playOf(mode, hole, shots.join(";"), period)],
      ...(named ? [[realm, "Claim", []] as const] : []),
    ],
    Math.min((gas || MAX_GAS) + (named ? NAME_GAS : 0), MAX_GAS),
    price, chainId, rpc, "The transaction was not sent.",
  );
}

/** One transaction from the connected account. Adena simulates it and sets the final fee: gasWanted at price is a starting point. */
export async function send(messages: (Call | Send)[], gasWanted: number, price: number, chainId: string | null | undefined, rpc: string, failed: string, memo = "gnogolf") {
  const a = wallet();
  if (!a) throw new Error("Adena is not installed in this browser.");
  await ensureNetwork(a, { chainId, rpc });
  const res = await a.DoContract({
    messages,
    gasFee: feeFor(gasWanted, price),
    gasWanted,
    memo,
    // this exact chain: Adena's own "dev" is another node
    ...(chainId && rpc ? { networkInfo: { chainId, rpcUrl: norm(walletNode(rpc)) } } : {}),
  });
  if (res.status !== "success") {
    const e: SendError = new Error(why(res, failed));
    e.cancelled = res.code === CANCELLED;
    e.maybe = !UNSENT.some((c) => c === res.code) && !refusal(res);
    const hash = res.data && (res.data as { hash?: unknown }).hash;
    if (typeof hash === "string" && hash) e.hash = hash;
    throw e;
  }
  return res.data ?? null;
}

/** One transaction of plain calls from the connected account. maxDeposit caps each call's storage deposit ("600000ugnot"). */
const calls = (address: string, list: readonly (readonly [string, string, readonly string[]])[], gasWanted: number, price: number, chainId: string | null | undefined, rpc: string, failed: string, maxDeposit = "") =>
  send(list.map(([pkg_path, func, args]): Call => ({ type: "/vm.m_call", value: { caller: address, send: "", pkg_path, func, args: [...args], ...(maxDeposit && { max_deposit: maxDeposit }) } })), gasWanted, price, chainId, rpc, failed);

/** Whether PublishMine's realm, slug, data and deposit are of the shapes the chain takes. */
export const publishArgs = ({ realm, slug, hex, deposit }: { realm: string; slug: string; hex: string; deposit: number }) =>
  PKG_PATH.test(realm) && isSlug(slug) && /^(?:[0-9a-f]{2})+$/.test(hex) && Number.isSafeInteger(deposit) && deposit >= 0;

/** Publishes a hole from the Builder: golf's PublishMine at the gas and deposit the bill showed, the deposit capped at it. Refused before Adena opens for a slug, data or realm not of their shape. */
export function publishHole({ address, realm, slug, hex, note, gas, deposit, price = PRICE, chainId, rpc }: {
  address: string; realm: string; slug: string; hex: string; note: string; gas: number; deposit: number; price?: number; chainId?: string | null; rpc: string;
}) {
  if (!publishArgs({ realm, slug, hex, deposit })) {
    return Promise.reject(new Error("The hole was not published: its address or data is not one the chain takes."));
  }
  return calls(address, [[realm, "PublishMine", [slug, hex, note]]], Math.min(gas, MAX_GAS), price, chainId, rpc, "The hole was not published.", `${deposit}ugnot`);
}

// a bank send is a few hundred thousand gas: asked with room, Adena sets the final fee
const TIP_GAS = 2_000_000;
export const TIPS = [1, 5, 10] as const; // the GNOT a tip can be
/** A tip: GNOT sent from the player's account to the realm's owner. No contract. */
export async function sendTip({ from, to, gnot, price, chainId, rpc }: { from: string; to: string; gnot: number; price: number; chainId?: string | null; rpc: string }) {
  if (!isAddress(from) || !isAddress(to) || !TIPS.some((t) => t === gnot)) throw new Error("Nothing to send.");
  return send([{ type: "/bank.MsgSend", value: { from_address: from, to_address: to, amount: `${gnot * 1e6}ugnot` } }], TIP_GAS, price, chainId, rpc, "The tip was not sent.", "gnogolf tip");
}

// Claim seats each best the player kept unnamed: 70.2M with 3 bests, about 4M a best more.
// 180 bests, a whole course in both modes, take about 780M. Register takes 28M to 29.5M.
const CLAIM_GAS = 850_000_000, REGISTER_GAS = 60_000_000;
/** The gas a name taken with a save adds: Register's and Claim's. */
export const NAME_GAS = REGISTER_GAS + CLAIM_GAS;
/** The bytes a name taken with a save stores: Register's 3,628, and Claim's 620 a mode with a best plus 504 a best, all measured. holes: the player's bests per mode, this save's counted in. */
export const nameBytes = (holes: readonly number[]) => 3628 + holes.reduce((b, n) => b + (n > 0 ? 620 + 504 * n : 0), 0);

/** Takes a gno.land name for the connected account and ranks the rounds saved without one: one transaction, two calls. Only a direct call registers, which a message of this transaction is. */
export const registerName = ({ address, registrar, realm, name, price = PRICE, chainId, rpc }: {
  address: string; registrar: string; realm: string; name: string; price?: number; chainId?: string | null; rpc: string;
}) =>
  registrar
    ? calls(address, [[registrar, "Register", [name]], [realm, "Claim", []]], NAME_GAS, price, chainId, rpc, "The name was not registered.")
    : Promise.reject(new Error(NO_REGISTRAR));

/** Ranks the rounds a player saved before they had a name (golf's Claim). */
export const claimRounds = ({ address, realm, price = PRICE, chainId, rpc }: { address: string; realm: string; price?: number; chainId?: string | null; rpc: string }) =>
  calls(address, [[realm, "Claim", []]], CLAIM_GAS, price, chainId, rpc, "Your rounds were not ranked.");

// A community hole's data may be as large as the format allows: 115M to decode the largest.
// gnokey does not simulate first, so it asks that much more when the realm's figure is missing.
const DECODE_MAX = 115e6;
/** A holed round as gnokeyPlan reads it: the engine's snapshot. */
interface SaveRound extends Work {
  id: string | null;
  /** false: a community hole, of any size */
  official?: boolean;
  name?: string;
  shots?: readonly string[];
  period?: number | null;
  roundMode?: Mode | null;
}
// A gnokey paste goes into a shell: nothing the chain or the page's link says goes in unchecked.
/** Where the gnokey panel keeps the key's address, typed once. The Builder knows its author by it too. */
export const GNOKEY_ADDR_KEY = "gnogolf.gnokey.addr";
// an RPC as a command may carry it, "" for anything else
const remoteOf = (rpc: string) => (/^https?:\/\/[\w.:[\]-]+(\/[\w./-]*)?$/.test(norm(rpc)) ? norm(rpc) : "");
/** The end of every command: this chain's id and RPC, a placeholder for anything not of their shape, then the key's name. */
export function gnokeyOn(chainId: string | null | undefined, rpc: string, key = "<your-key-name>") {
  const chain = chainId && /^[\w.-]{1,64}$/.test(chainId) ? chainId : "<chain-id>";
  return `-broadcast -chainid ${chain} -remote ${remoteOf(walletNode(rpc)) || "<rpc-url>"} ${key}`;
}
/** One plain gnokey maketx call at gas, its fee as Adena's ask. on: gnokeyOn's. send: ugnot with it. maxDeposit: its storage deposit's cap, in ugnot. */
export const gnokeyCall = (pkg: string, func: string, args: readonly string[], gas: number, price: number, on: string, send = 0, maxDeposit?: number) =>
  `gnokey maketx call -pkgpath ${pkg} -func ${func}${args.map((a) => ` -args ${a}`).join("")}${send ? ` -send ${send}ugnot` : ""} -gas-fee ${feeFor(gas, price)}ugnot -gas-wanted ${gas}${maxDeposit === undefined ? "" : ` -max-deposit ${maxDeposit}ugnot`} ${on}`;

/** The same save for gnokey: one maketx call per commit, after a Reset of its own. The page does not know the key's address, so it cannot ask the chain first: a round left under way would otherwise go on from where it lies. */
export function gnokeyPlan(s: SaveRound, { realm, price = PRICE, chainId, rpc, parts: checked }: { realm: string; price?: number; chainId?: string | null; rpc: string; parts?: readonly (readonly [number, number])[] | null }) {
  const shots = s.shots || [], mode = s.roundMode || "assisted";
  if (!shots.length) return [];
  if (mode === "pro" && s.period == null) return []; // a pro round has its period, or it cannot be saved
  // pasted into a shell: a shot is digits, a sign, dots and commas, and nothing else goes in
  if (s.period != null && !Number.isSafeInteger(s.period)) return [];
  if (!/^[\w./-]{1,128}$/.test(String(s.id)) || !PKG_PATH.test(realm) || !shots.every((x) => /^[\d.,-]+$/.test(x))) return [];
  const on = gnokeyOn(chainId, rpc);
  const call = (func: string, args: readonly string[], gas: number) => gnokeyCall(realm, func, args, gas, price, on);
  // the chain's own cut when it was asked, the work model's otherwise
  const parts = checked && checked.length ? checked : commitsOf(s, shots.length);
  const plays = parts.map(([from, to]) => {
    // the shots are quoted: ";" ends a shell command
    const list = `'${shots.slice(from, to).join(";")}'`;
    const gas = Math.min(gasOf(s, from, to) + (s.official === false && !s.fixed ? DECODE_MAX : 0), MAX_GAS);
    return call(...playOf(mode, String(s.id), list, s.period), gas);
  });
  return [call("Reset", [String(s.id)], PER_CALL), ...plays];
}

/** What a save's paste runs first: the chain's Period() asked, and a round whose weather is over stops there, nothing sent. A chain that does not answer lets it go on. "" for a round with no period, or an RPC or realm not of their shape. */
export function gnokeyLate(period: number | null | undefined, { realm, rpc }: { realm: string; rpc: string }) {
  const remote = remoteOf(rpc);
  if (period == null || !Number.isSafeInteger(period) || !remote || !PKG_PATH.test(realm)) return "";
  return [
    `now=$(gnokey query vm/qeval -data '${realm}.Period()' -remote ${remote} 2>/dev/null | sed -n 's/^data: (\\([0-9]*\\) int64)$/\\1/p')`,
    `if [ -n "$now" ] && [ "$now" -gt ${period + 1} ]; then echo "Gnogolf: too late, this round's weather is over: nothing was sent. Play the hole again to save it." >&2; exit 1; fi`,
  ].join("\n");
}

/** gnokeyPlan's commands as one paste for bash or zsh: a subshell that stops at the first failure. Its send prints gnokey's output as it comes, and sends again a block later when the node refused the account's sequence. first: run before them. */
export function gnokeyPaste(plan: readonly string[], who: string, first = "") {
  const send = [
    "send() {",
    "  for try in 1 2 3; do",
    '    out=$("$@" 2>&1 | tee >(cat >&2))',
    "    if printf '%s\\n' \"$out\" | grep -q '^OK!'; then return 0; fi",
    "    printf '%s\\n' \"$out\" | grep -q 'signature verification failed' || return 1",
    '    echo "Gnogolf: the node had not taken the one before yet: sent again in a block (your password again)" >&2',
    "    sleep 6",
    "  done",
    "  return 1",
    "}",
  ].join("\n");
  const body = plan
    .map((command, k) => `echo "Gnogolf: transaction ${k + 1} of ${plan.length}"\nsend ${command.replace("<your-key-name>", () => who)}`)
    .join("\n\n");
  return `(\nset -e\n${send}\n\n${first ? `${first}\n\n` : ""}${body}\n)`;
}

/** Where a gnokey paste goes: this chain, at its gas price. */
export interface GnokeyAt { price?: number; chainId?: string | null; rpc: string }
/** A name taken with gnokey: Register, then golf's Claim, a transaction each. name: whole ("nym-…"). [] for a name or a registrar not of their shape. */
export function gnokeyName({ registrar, realm, name, price = PRICE, chainId, rpc }: GnokeyAt & { registrar: string; realm: string; name: string }) {
  if (!PKG_PATH.test(registrar) || !PKG_PATH.test(realm) || !nameShape(name)) return [];
  const on = gnokeyOn(chainId, rpc);
  return [gnokeyCall(registrar, "Register", [`'${name}'`], REGISTER_GAS, price, on), gnokeyCall(realm, "Claim", [], CLAIM_GAS, price, on)];
}
/** golf's Claim with gnokey: ranks the rounds saved before a name. */
export const gnokeyClaim = ({ realm, price = PRICE, chainId, rpc }: GnokeyAt & { realm: string }) =>
  PKG_PATH.test(realm) ? [gnokeyCall(realm, "Claim", [], CLAIM_GAS, price, gnokeyOn(chainId, rpc))] : [];
/** A tip with gnokey: one plain send of gnot, one of TIPS, to the realm's owner. */
export const gnokeyTip = ({ to, gnot, price = PRICE, chainId, rpc }: GnokeyAt & { to: string; gnot: number }) =>
  isAddress(to) && TIPS.some((t) => t === gnot)
    ? [`gnokey maketx send -send ${gnot * 1e6}ugnot -to ${to} -gas-fee ${feeFor(TIP_GAS, price)}ugnot -gas-wanted ${TIP_GAS} ${gnokeyOn(chainId, rpc)}`]
    : [];

/** The strokes a save's result says its round was holed in, null if it says none. */
export const holedIn = (result: string | null | undefined) => {
  const m = String(result || "").match(/holed in (\d+) strokes/);
  return m ? Number(m[1]) : null;
};

/** A transaction's result by its hash, or null while the chain cannot say. One that failed on the chain throws its log. */
export const resultOf = (chain: Pick<Chain, "txResult">, hash: string) =>
  chain.txResult(hash).catch((e: unknown) => {
    if (errorKind(e) === "chain") throw e;
    return null;
  });

/** What a save's last commit did, as the chain says it: { holed, left }, or undefined while the chain cannot say. Its result first, by its hash; else, once Adena said it went, the round the chain shows: none means holed. */
export async function readBack(chain: Pick<Chain, "txResult" | "round">, { hole, player, strokes, hash, sent }: { hole: string; player: string; strokes: number; hash?: string; sent: boolean }) {
  if (hash) {
    const result = await resultOf(chain, hash);
    if (result != null) return { holed: holedIn(result), left: Number((result.match(/after (\d+) strokes/) || [])[1]) || null };
  }
  if (!sent) return undefined;
  const now = await chain.round(hole, player).catch(() => undefined);
  return now === undefined ? undefined : now && now.strokes >= strokes ? { holed: null, left: now.strokes } : { holed: strokes, left: null };
}

/** The bytes a save stores, rounded up from an onyx gnodev's: 1,040 for a first finish on a hole and 512 for the hole's first play, 2,965 for a first finish in a mode, 30 and 23 a stroke for the ghost. */
export const depositBytes = (first: boolean, firstOnCourse = false, strokes = 0) => (!first ? 300 : (firstOnCourse ? 3200 : 1750) + 30 + 23 * strokes);

/** How much GNOT an account lacks to save a round (gas and deposit), 0 if it has enough; null if unknown. */
export const shortOf = (gas: number, price: number, deposit: number, balance: number | null | undefined) =>
  balance == null ? null : Math.max(0, feeFor(gas, price) + deposit - balance) / 1e6;

/** A round's gas in GNOT at today's price, shown before anyone signs. */
export const costOf = (gas: number, price = PRICE) => ((gas * price) / 1e6).toFixed(3);
