// A shot and its round: the stroke asked of the chain, or of the page's own physics while the chain checks it.
import { buzz, sound } from "../feel";
import { shotOf, RULES, errorKind } from "../chain";
import { BALL_R } from "../terrain";
import { track } from "../analytics";
import { simReady, simStroke } from "../sim/client";
import { messageOf } from "../words";
import { outlived, MS_PER_STEP, SHOW_SPEED, type makeReplay } from "./replay";
import type { HoleRow, Stroke } from "../types";
import type { GnomeTrail } from "../scene/gnome-fx";
import type { makeCamera } from "./camera";
import type { makeRival } from "./rival";
import type { makeAimer } from "./aim";
import type { makeForecast } from "./forecast";
import type { makeExtras } from "./extras";
import type { ClipOf } from "./recorder";
import type { ErrorKind, Live, Pull } from "./types";

const { maxRoundStrokes } = RULES;

interface Needs {
  alive: () => boolean;
  onHoled: (r: { id: string; strokes: number; shots: readonly string[] }) => void;
  fail: (err: unknown, kind: ErrorKind) => void;
  cam: ReturnType<typeof makeCamera>;
  rp: ReturnType<typeof makeReplay>;
  rival: ReturnType<typeof makeRival>;
  aimer: ReturnType<typeof makeAimer>;
  forecast: ReturnType<typeof makeForecast>;
  extras: ReturnType<typeof makeExtras>;
  /** the cup's holes */
  perList: () => { holes: HoleRow[] };
  /** a hole's state read ahead */
  prefetch: (id: string) => void;
  /** the round's frame rate, said as it ends */
  sayFps: () => void;
  aimable: () => void;
  placeBall: () => void;
  /** the gnome back on his feet after a roll */
  rightUp: () => void;
  dropConfetti: () => void;
  /** the player's holing: his own effect, else the confetti */
  cheerMine: () => void;
  trail: () => GnomeTrail | null;
}

export function makeShot(E: Live, pull: Pull, { alive, onHoled, fail, cam, rp, rival, aimer, forecast, extras, perList, prefetch, sayFps, aimable, placeBall, rightUp, dropConfetti, cheerMine, trail }: Needs) {
  const { g, causes, mood, ground, publish, tickNow } = E;
  const { dropAim, strokeFrom, known } = aimer, { restTimed, stale, freshWeather, noStroke } = forecast, { askExtras, showExtras } = extras;
  let holedIn: ReturnType<typeof setTimeout> | undefined, joyIn: ReturnType<typeof setTimeout> | undefined; // the banner's delay after a hole, so the confetti can fly; the hop's
  // the round's holing stroke, kept for the shot clip
  let won: ClipOf["stroke"] | null = null;
  // said with the stroke: how long it was aimed, and the aims dropped before it
  let aimed = { ms: 0, cancels: 0 };

  /** A fresh round on the hole already built: back to the tee, nothing kept. */
  function newRound(ask = true) {
    sayFps(); // the round before's
    // the camera starts in its framing behind the gnome, not eased in from the last pose
    cam.resetFollow();
    cam.jump();
    g.roundMode = null;
    rp.clearGlow();
    restTimed();
    g.round = (g.round || 0) + 1;
    g.ride = null; // no ride's or fall's camera carried into a new round
    dropConfetti();
    trail()?.clear();
    clearTimeout(holedIn);
    g.flying = g.done = g.holed = g.aiming = false;
    g.error = null;
    g.strokes = 0;
    g.shots = []; // the round's decisions: what a record replays
    g.pts = []; // each stroke's path length and work, for the gas estimate
    g.works = [];
    g.rest = null; // the ball exactly as the chain left it: where the next stroke is asked from
    won = null;
    g.facing = Math.PI / 2; // at rest he looks at the player
    pull.dragging = pull.pulled = false;
    dropAim();
    aimable();
    pull.cancels = 0;
    E.ball.visible = true;
    if (g.s) {
      g.ball = { x: g.s.start[0], y: g.s.start[1] };
      placeBall();
      noStroke();
      if (ask) void showExtras();
      if (ask && stale()) void freshWeather();
    }
    rival.reset(); // the ghost back on the tee too
    void publish();
  }

  // Whatever a shot does (the chain erring, a replay throwing), flying, aiming and the drag are reset
  // when it is over. A round changed mid-flight has reset them itself: it is left alone.
  async function fire(angleDeg: number, power: number) {
    if (g.flying || !g.id || g.done || !g.course) return; // no island drawn, nothing to play on
    const round = g.round;
    aimed = { ms: Math.round(performance.now() - pull.aimFrom), cancels: pull.cancels };
    pull.cancels = 0;
    try {
      await shoot(angleDeg, power, round);
    } catch (err) {
      console.warn("gnogolf: a shot failed", err);
      if (round === g.round) (g.error = messageOf(err)), (g.errorKind = "shot");
    } finally {
      if (round === g.round) {
        pull.dragging = g.aiming = g.flying = false;
        pull.press = null;
        aimable();
      }
      void publish();
    }
  }

  async function shoot(angleDeg: number, power: number, round: number | undefined, again?: { res: Stroke; tick: number | null; chainMs: number }) {
    if (!g.id || !g.s) return;
    const id = g.id;
    if (g.shots.length >= maxRoundStrokes) {
      g.error = `${maxRoundStrokes} strokes is the most one round can hold.`;
      g.errorKind = "limit";
      void publish();
      return;
    }
    // the first stroke of a round in a period that is over would make it
    // unsaveable from the start: the current weather is read first
    if (!again && !g.shots.length && stale()) {
      g.flying = true; // no second shot while it is read
      await freshWeather();
      if (round !== g.round) return;
    }
    // round: the one this shot belongs to; its answer is dropped if the player restarted or changed hole meanwhile
    const tick = again ? again.tick : tickNow(); // where the timed pieces are as it is let go
    causes.shot();
    g.cause = null;
    // a light buzz where the phone can (Android; iOS has no web vibration), and the putter's tock
    buzz(12);
    sound("putt", 0.5 + power / 20);
    g.flying = true;
    g.error = null;
    void publish();

    let res: Stroke, check: Promise<Stroke> | null = null, checked = 0;
    const one = shotOf(angleDeg, power, tick), from = g.rest || g.s.start, asked = performance.now();
    const was = { shots: g.shots, pts: g.pts, works: g.works, rest: g.rest, roundMode: g.roundMode, strokes: g.strokes };
    try {
      // The aim preview already asked the chain this very stroke: its answer is the shot, no second trip.
      // Else the page's own answer sets it off, and the chain's is checked while the ball rolls.
      const kept = again ? again.res : known(id, g.shots, one);
      const own = kept || g.period == null || !simReady(id) ? null : await simStroke(id, g.shots, one, g.rest, g.period);
      // 3 s at most: slower, the chain is out of reach and the page's answer stands
      if (own) (check = strokeFrom(id, g.shots, one, g.rest, 3000, undefined, own)).then(() => (checked = performance.now()), () => (checked = performance.now()));
      res = kept || own || (await strokeFrom(id, g.shots, one, g.rest));
      if (round !== g.round) return;
    } catch (err) {
      if (round !== g.round) return;
      g.flying = false;
      fail(err, "shot");
      return;
    }
    if (!g.shots.length) g.roundMode = E.mode; // this round is played, and recorded, in this mode
    const flew = performance.now();
    g.shots = [...g.shots, one]; // a new list: what changed is seen by reference
    g.pts = [...g.pts, res.path.length];
    g.works = [...g.works, res.work || 0];
    g.rest = res.rest;
    g.tick0 = tick || 0;
    if (res.holed) won = { path: res.path, air: res.air, cause: res.cause, angle: angleDeg }; // what the shot clip plays again
    g.strokes = res.strokes || g.shots.length; // SimulateFrom has no count: a stroke is a shot
    if (res.holed) {
      g.done = true; // no more shots, even before the banner shows
      const holed = () => {
        // the round's own stroke count: SimulateFrom sends none, and the card would save nothing
        onHoled({ id, strokes: g.strokes, shots: g.shots });
        // the hole "Next hole" goes to: the next in this cup
        const cup = perList().holes, i = cup.findIndex((h) => h.id === id);
        if (cup.length) prefetch(cup[(i + 1) % cup.length].id);
        joyIn = setTimeout(() => alive() && round === g.round && mood.joy(performance.now()), 500);
      };
      // the card, the badges and the joy only once the chain agrees (or is out of reach)
      if (!check) holed();
      else void check.then((t) => round === g.round && JSON.stringify(t) === JSON.stringify(res) && holed(), (e) => round === g.round && errorKind(e) !== "chain" && holed());
    }
    void publish();
    // A safety net: a replay running well past what its path should take is cut, and the ball put
    // where the chain has it. expect: the path's time on screen; the budget leaves room for a splash or a tube.
    let expect = 0;
    for (let i = 0; i + 1 < res.path.length; i++) expect += Math.max(MS_PER_STEP, (Math.hypot(res.path[i + 1][0] - res.path[i][0], res.path[i + 1][1] - res.path[i][1]) / SHOW_SPEED) * 1000);
    const budget = 3500 + expect * 1.5;
    if (await outlived(rp.replay(res.path, res.holed, res.air, res.cause), budget)) {
      E.stop(); // every animation of this replay stops
      E.ball.visible = true; // cut in a tunnel: shown again
      console.warn(`gnogolf: replay cut after ${budget | 0} ms (path of ${res.path.length} steps)`);
    }
    restTimed();
    if (round !== g.round) return;
    if (check) {
      // out of reach, the page's answer stands (the save replays it on the chain); refused, it is undone and said
      let refusal: unknown = null;
      const truth = await check.catch((e) => (errorKind(e) === "chain" && (refusal = e), res));
      if (round !== g.round) return;
      if (refusal || JSON.stringify(truth) !== JSON.stringify(res)) {
        // a difference (never seen) turns the page's answers off and replays the chain's
        Object.assign(g, was);
        g.done = false;
        won = null;
        clearTimeout(joyIn);
        g.ball = { x: from[0], y: from[1] };
        E.ball.position.set(from[0], BALL_R + ground(from[0], from[1]), from[1]);
        E.ball.scale.setScalar(1); // a holed answer's drop shrank it
        if (refusal) return void ((g.flying = false), fail(refusal, "shot"));
        return shoot(angleDeg, power, round, { res: truth, tick, chainMs: checked - asked });
      }
    }
    // a hazard puts the ball back where the stroke was played from
    const back = Math.hypot(res.rest[0] - from[0], res.rest[1] - from[1]) < 0.01 && res.path.length > 2;
    track("stroke", {
      hole: id, n: g.shots.length, power: Math.round(power), angle: (Math.round(angleDeg / 45) * 45 + 360) % 360,
      result: res.holed ? "holed" : back ? "hazard" : "rest", cause: [...new Set(res.cause.replace(/-/g, ""))].sort().join(""), bounces: res.bounces,
      chain_ms: Math.round(again ? again.chainMs : check ? (checked || performance.now()) - asked : flew - asked), sim_ms: check ? Math.round(flew - asked) : undefined, fly_ms: Math.round(performance.now() - flew),
      aim_ms: aimed.ms, cancels: aimed.cancels,
    });

    const last = res.path[res.path.length - 1];
    g.ball = { x: last[0], y: last[1] };
    g.flying = false;
    // the duel's ghost answers among this stroke's pieces; then a timed hole changes for the
    // next stroke, its pieces asked meanwhile
    if (!res.holed && g.s && g.s.timed) askExtras();
    const answered = rival.turn(g.shots.length - 1, res.holed);
    void answered.finally(() => (aimable(), res.holed || void showExtras()));
    // a jump or a bounce may have ended mid-air: put him on the ground
    if (!res.holed) E.ball.position.set(last[0], BALL_R + ground(last[0], last[1]), last[1]);
    g.facing = Math.PI / 2; // at rest he looks at the player
    rightUp();
    if (res.holed) {
      cheerMine();
      sound("win", g.strokes === 1 ? 1 : 0); // a hole-in-one gets the longer fanfare
      // let the confetti fly (and a duel's ghost play the stroke that ties) before the banner covers the course
      void answered.then(() => {
        if (round === g.round) holedIn = setTimeout(() => {
          if (round !== g.round) return;
          g.holed = true;
          buzz([30, 60, 45]);
          sound("cup");
          void publish();
        }, 1600);
      });
    }
    void publish();
  }

  return {
    newRound,
    fire,
    /** The round's holing stroke, or null. */
    won: () => won,
    stop() {
      clearTimeout(holedIn);
      clearTimeout(joyIn);
    },
  };
}
