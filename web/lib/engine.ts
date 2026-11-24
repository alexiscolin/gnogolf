// The game: aim, ask the chain, walk the path it answers. Nothing here simulates a ball.
// This file holds the state and ties the parts of engine/ together.

import * as THREE from "three";
import { sound, ambience } from "./feel";
import { makeWeather } from "./scene/weather";
import { makeCauses } from "./scene/cause";
import { loadWorld } from "./scene/worlds";
import { makeChain, isHoleId, type Chain } from "./chain";
import { at, disposeCourse, releaseShared, setTime, motion } from "./scene/materials";
import { makeRenderer, makeScene } from "./scene/studio";
import { makeBall, gnomeById, headlamp } from "./scene/gnome";
import { makeAim, makeBand, makeConfetti, type Confetti } from "./scene/fx";
import { BALL_R } from "./terrain";
import { makeCamera } from "./engine/camera";
import { track, trackError } from "./analytics";
import { makeReplay } from "./engine/replay";
import { makeAimer } from "./engine/aim";
import { makeRival } from "./engine/rival";
import { makePublisher } from "./engine/snapshot";
import { makeLoop } from "./engine/loop";
import { makeCupPip } from "./engine/pip";
import { makeForecast } from "./engine/forecast";
import { makeExtras } from "./engine/extras";
import { makeLoader } from "./engine/loader";
import { makeShot } from "./engine/shot";
import { makeInput } from "./engine/input";
import { inWorld, linked } from "./engine/list";
import { messageOf } from "./words";
import type { Ghost, Mode } from "./types";
import { ud, type Gnome } from "./scene/data";
import { makeHoling, makeTrail, type GnomeTrail, type Holed } from "./scene/gnome-fx";
import type { promo as Promo } from "./promo";
import type { probes as Probes } from "./engine/probes";
import type { ClipRun } from "./engine/recorder";
import { drawCard, loadBadge, type Caption } from "./brand";
import type { CamMode, ErrorKind, GameState, GfxMode, Link, Live, Mood, Pull, Snapshot } from "./engine/types";

export type { CamMode, GameState, GfxMode, Link, Snapshot } from "./engine/types";
export type Game = ReturnType<typeof createGame>;

/** What createGame takes: the chain's addresses, the looks, and who to tell. */
export interface GameOptions {
  rpc?: string;
  web?: string;
  /** The chain played on; the network's (rpc, web) by default. */
  chain?: Chain;
  gnome?: string;
  world?: string;
  weather?: string;
  aimMode?: Mode;
  camMode?: CamMode;
  gfx?: GfxMode;
  /** The trailer rig and the test hooks: the page loads them only when its link asks. */
  promo?: typeof Promo;
  probes?: typeof Probes;
  /** A renderer lent for the game: handed back on destroy as it was, never disposed. */
  renderer?: THREE.WebGLRenderer;
  /** ?camlog: the camera logs every frame. */
  log?: boolean;
  onChange?: (snap: Snapshot) => void;
  /** The ball dropped. shots includes the holing stroke, which no snapshot says yet. */
  onHoled?: (r: { id: string; strokes: number; shots: readonly string[] }) => void;
  /** The player's address, if known: their own community hole plays before they hold a best on it. */
  self?: () => string | null;
}

const camOf = (m: string): CamMode => (m === "far" || m === "third" ? m : "classic");

// What the HUD covers, in CSS pixels: the camera frames what is left.
const HUD = { top: 108, bottom: 136, side: 14 };
const OVERVIEW_MS = 1500; // how long a new hole is shown whole before closing on the ball

const NO_PROMO: typeof Promo = { on: false, attach() {}, camera() {} };

export function createGame(canvas: HTMLCanvasElement, { rpc, web, chain: given, gnome, world: forceWorld = "", weather: fakeWeather0 = "", aimMode = "assisted", camMode = "classic", gfx = "auto", promo = NO_PROMO, probes, renderer: lent, log: logCam = false, onChange = () => {}, onHoled = () => {}, self = () => null }: GameOptions = {}) {
  const chain = given ?? makeChain({ rpc, web });

  const renderer = lent ?? makeRenderer(canvas), lentDpr = renderer.getPixelRatio();
  const scene = makeScene();
  const causes = makeCauses(scene);
  const weather = makeWeather(scene, {
    camera: () => camera, // made further down
    onFlash() {
      g.flash = (g.flash || 0) + 1;
      void publish();
    },
  });
  // near 3, far 260: the farthest scenery measured is 210 away, and a 1..400 range
  // made far-off faces flicker into each other.
  const camera = new THREE.PerspectiveCamera(30, 1, 3, 260);
  let ball: Gnome = makeBall(gnomeById(gnome)), gnomeId = gnome || "";
  const aim = makeAim();
  const band = makeBand();
  scene.add(ball, aim, band);
  let confetti: Confetti | Holed | null = null;
  // a collection gnome's trail while he rolls; the base gnomes have none
  let trail: GnomeTrail | null = null, trailUntil = 0;
  const trailAt = new THREE.Vector3();
  // Never drawn: compiled with the hole, so the winning putt links no shader.
  const aside = new THREE.Group(), confettiWarm = makeConfetti([0, 0]);
  aside.add(confettiWarm.group);
  let holingWarm: Holed | null = null;
  const dressTrail = (id: string) => {
    if (trail) (scene.remove(trail.group), disposeCourse(trail.group));
    trail = makeTrail(gnomeById(id));
    if (trail) scene.add(trail.group);
    if (holingWarm) (aside.remove(holingWarm.group), disposeCourse(holingWarm.group));
    holingWarm = makeHoling(gnomeById(id), new THREE.Vector3());
    if (holingWarm) aside.add(holingWarm.group);
  };
  dressTrail(gnomeId);
  const dropConfetti = () => {
    if (!confetti) return;
    scene.remove(confetti.group);
    disposeCourse(confetti.group);
    confetti = null;
  };
  // confetti at the cup: the player's holing, or the ghost's
  const cheer = () => {
    if (!g.s) return;
    dropConfetti();
    scene.add((confetti = makeConfetti(g.s.cup, ground(g.s.cup[0], g.s.cup[1]))).group);
    sound("pop");
  };
  // the player's holing: a collection gnome's own effect, else the confetti
  let mine: Holed | null = null;
  const cheerMine = () => {
    const h = g.s && makeHoling(gnomeById(gnomeId), new THREE.Vector3(g.s.cup[0], ground(g.s.cup[0], g.s.cup[1]), g.s.cup[1]));
    if (!h) return cheer();
    dropConfetti();
    scene.add((confetti = mine = h).group);
    sound("pop");
  };
  let blinkAt = 0, blinkUntil = 0;
  // the gnome's moods: a hop when he holes out, a head shake out of the water
  let joyUntil = 0, shakeUntil = 0;
  const mood: Mood = {
    joy(now) { joyUntil = now + 1400; },
    shake(now) { shakeUntil = now + 900; },
    hop(now) { return now < joyUntil ? Math.abs(Math.sin((joyUntil - now) / 110)) * 0.7 : 0; },
    tick(now) {
      const body = ball.userData.body;
      if (now < shakeUntil) body.rotation.z = Math.sin(now / 45) * 0.35 * ((shakeUntil - now) / 900);
      else if (body.rotation.z && !g.flying) body.rotation.z *= 0.8;
    },
  };
  let righting: { from: THREE.Quaternion; to: THREE.Quaternion; t: number } | null = null; // the gnome getting back on his feet after a roll

  const g: GameState = {
    list: [], id: null, s: null, course: null,
    ball: { x: 0, y: 0 }, strokes: 0, flying: false,
    facing: Math.PI / 2, power: 0, aiming: false, holed: false, error: null,
    // the camera: "overview" frames the island, "ball" follows the gnome
    view: "overview", rig: null, over: null, started: false,
    cam: "classic", shots: [], pts: [], works: [], rest: null,
  };
  let closeIn: ReturnType<typeof setTimeout> | undefined;
  /** The ground height under a board point — cosmetic, the chain's physics is flat. */
  const ground = (x: number, z: number) => (g.course ? g.course.userData.height(x, z) : 0);
  const lift = (p: readonly [number, number]) => at(p, BALL_R + ground(p[0], p[1]));
  g.cam = camOf(camMode);
  const home = () => (g.cam === "far" ? "overview" : "ball");

  function placeBall() {
    ball.position.set(g.ball.x, BALL_R + ground(g.ball.x, g.ball.y), g.ball.y);
    ball.userData.shade.position.y = -BALL_R + 0.02; // on the ground under him; offWalls keeps its x and z
    righting = null; // placing him ends a righting under way
    ball.scale.setScalar(1); // back out of the cup after a hole
    ball.userData.body.rotation.set(0, Math.PI / 2 - g.facing, 0);
  }

  function rightUp() {
    const body = ball.userData.body;
    const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - g.facing, 0));
    righting = { from: body.quaternion.clone(), to, t: 0 };
  }

  const fail = (err: unknown, kind: ErrorKind) => {
    trackError(kind, err, { hole: g.id });
    g.error = messageOf(err);
    g.errorKind = kind;
    void publish();
  };

  let alive = true;
  // a round keeps the mode of its first stroke
  let mode: Mode = aimMode === "pro" ? "pro" : "assisted";
  let cut = 0; // bumped to stop every running animation: each keeps the value it started with

  // The parts set their listeners and timers as they are made: this order is theirs.
  // One made further down is reached through a function, called only once the game runs.
  const { publish, perList, stop: stopTelling } = makePublisher(g, chain, {
    alive: () => alive, onChange, woke: (now) => loop.woke(now), warming: () => loader.warming(), pulse: () => extras.pulse(), mode: () => mode, tier: () => loop.tier, rival: () => rival.state(),
  });

  const view = { ...HUD, w: 0, h: 0 };
  const screen = () => ((view.w = window.innerWidth), (view.h = window.innerHeight), view);

  // the intro's end: one glide to the player's camera (Far is there already), a cut under reduced motion
  const intro = () => (setView(home()), g.view === "ball" && (motion ? cam.glide() : cam.jump()));
  function setView(v: GameState["view"]) {
    clearTimeout(closeIn);
    g.view = v;
    void publish();
  }
  // the hole shown whole for a moment first
  const introSoon = () => (closeIn = setTimeout(intro, OVERVIEW_MS));

  const E: Live = {
    g, camera, scene, chain, aim, band, causes, mood, publish, screen, ground, lift, log: logCam,
    info: () => renderer.info,
    zones: () => forecast.zonesNow(),
    landing: () => null, // the replay's, once made (below)
    tickNow: () => forecast.tickNow(),
    stop: () => cut++,
    showAt: (t) => forecast.showAt(t),
    get ball() { return ball; },
    get dragging() { return pull.dragging; },
    get shot() { return input.shot; },
    get clock() { return forecast.clock; },
    get cut() { return cut; },
    get mode() { return mode; },
    get strokeExtras() { return forecast.strokeEx; },
    get extras() { return extras.built(); },
  };

  const loop = makeLoop(E, { renderer, weather, gfx, alive: () => alive, warming: () => loader.warming(), everyOf: () => forecast.everyOf(), isBusy, draw });
  const pip = makeCupPip(E, canvas.parentElement, HUD);
  const forecast = makeForecast(E, { weather, fake: fakeWeather0 });
  const cam = makeCamera(E);
  window.addEventListener("pointermove", cam.hover);
  const rp = makeReplay(E);
  E.landing = rp.landing;
  // a duel's ghost: another player's best, a stroke after each of the player's
  const rival = makeRival(E, { showClock: forecast.showClock, restTimed: forecast.restTimed, told: () => void publish(), warm: () => void loader.warm(), gnome: () => gnomeId, cheer });
  E.rivalAt = rival.at;
  const aimer = makeAimer(E);
  const { preview, dropAim } = aimer;
  // aimFrom: since when the stroke could be aimed (hole ready, uncovered, or the last stroke over)
  const pull: Pull = { dragging: false, press: null, pulled: false, cancels: 0, aimFrom: performance.now() };
  const aimable = () => (pull.aimFrom = performance.now());
  const extras = makeExtras(E, { alive: () => alive, onStroke: forecast.stroke });
  const loader = makeLoader(E, {
    renderer, weather, aside, forceWorld, self, alive: () => alive, fail, cam, rival, aimer, extras, applyWeather: forecast.applyWeather,
    newRound: (ask) => round.newRound(ask), aimable, resize: loop.resize, frame: loop.frame, setView, introSoon,
  });
  const { load, start, warmAside } = loader;
  const round = makeShot(E, pull, {
    alive: () => alive, onHoled, fail, cam, rp, rival, aimer, forecast, extras, perList, prefetch: loader.prefetch, sayFps: loop.sayFps,
    aimable, placeBall, rightUp, dropConfetti, cheerMine, trail: () => trail,
  });
  const { newRound, fire } = round;
  const input = makeInput(E, pull, { canvas, alive: () => alive, cam, rival, aimer, placeBall, fire });

  /** Whether something on the course wants every frame: a shot, an aim, an effect still playing. */
  function isBusy(now: number) {
    return promo.on || g.flying || rival.busy() || pull.dragging || aimer.moving() || (g.cam === "third" && g.aiming) || extras.growing() || !!confetti || !!righting || !cam.settled() || now < trailUntil;
  }

  let lastTickPreview = 0; // when the dots were last redrawn for the pieces' clock
  /** One frame: each part moved on, in this order, then the picture drawn. */
  function draw(now: number, elapsed: number, dt: number) {
    input.steer(dt);
    cam.update(dt);
    promo.camera(camera); // the trailer's camera; nothing without ?promo
    setTime(now / 1000);
    extras.grow(dt);
    if (g.course) g.course.userData.tick(now / 1000);
    if (!g.flying && !rival.busy() && g.course) {
      forecast.run(elapsed);
      // aiming at moving pieces: the dots follow them
      if (pull.dragging && forecast.everyOf() && aimer.shows() && now - lastTickPreview > 250) (lastTickPreview = now), preview();
    }
    // a world's canopy fades what stands between the camera and the ball, and the cup when the screen shows it
    if (g.course && g.course.userData.fade) g.course.userData.fade(camera.position, ball.position, g.s && !pip.onScreen().off ? pip.at : null);
    weather.tick(now / 1000);
    causes.tick(now / 1000);
    aimer.step(now);
    rp.fadeSlopes(dt);
    // the fog's range: the rig's framing, or the camera's real distance when further
    // (a glide starts far out while the rig already names the close framing)
    if (g.rig) weather.view(g.view === "ball" ? Math.max(g.rig.dist, camera.position.distanceTo(ball.position)) : g.rig.dist);
    const ex = extras.built(), exTick = ex && ud(ex).tick;
    if (exTick) exTick(now / 1000);
    const flag = g.course && g.course.userData.flag;
    if (flag) {
      // a wind leans the flag down-wind, and sets it flapping faster
      const wv = g.weather && g.weather.wind, ws = wv ? Math.hypot(wv[0], wv[1]) : 0;
      flag.rotation.x = wv ? (wv[1] / (ws || 1)) * Math.min(0.35, ws * 5) : 0;
      flag.rotation.z = wv ? -(wv[0] / (ws || 1)) * Math.min(0.35, ws * 5) : 0;
      flag.rotation.y = now / (900 - Math.min(600, ws * 6000));
      flag.position.y = (ud(flag).baseY ?? 0) + Math.abs(Math.sin(now / 420)) * 0.5;
    }
    if (righting) {
      righting.t = Math.min(righting.t + dt / 0.45, 1);
      const k = 1 - Math.pow(1 - righting.t, 3);
      ball.userData.body.quaternion.slerpQuaternions(righting.from, righting.to, k);
      if (righting.t >= 1) righting = null;
    }
    // the shadow stays on the ground, whatever he does above it
    const floor = BALL_R + ground(ball.position.x, ball.position.z);
    ball.userData.shade.position.y = floor - ball.position.y - BALL_R + 0.02;
    rp.offWalls(); // and clear of the walls he runs along
    rival.frame();
    if (trail) {
      // laid on the ground under him while he rolls; it fades once he stops
      if (g.flying && ball.visible) (trail.push(trailAt.set(ball.position.x, floor + 0.04, ball.position.z), now / 1000), (trailUntil = now + 700));
      trail.step(now / 1000);
    }
    ball.userData.tick?.(now); // a Legendary's piece, lava's glow
    if (!g.flying) {
      // at rest on a deck that moves (a seesaw), he rides it
      if (g.course && g.course.userData.lifts && !g.done && !g.holed) ball.position.y = floor; // never a holed ball, it stays down in the cup
      // an idle gnome breathes; his shadow breathes with him, on the ground
      const bob = Math.sin(now / 520) * 0.06;
      ball.userData.body.position.y = bob + mood.hop(now);
      ball.userData.shade.scale.setScalar(1 - bob * 1.5);
    }
    // he blinks every few seconds, twice now and then
    const eyes = ball.userData.eyes;
    if (eyes) {
      if (now > blinkAt) {
        blinkUntil = now + 130;
        blinkAt = now + 2200 + Math.random() * 3200;
        if (Math.random() < 0.25) blinkAt = now + 260; // a double blink
      }
      const shut = now < blinkUntil ? 0.12 : 1;
      for (const e of eyes) e.scale.y = shut;
    }
    mood.tick(now);
    if (confetti && !confetti.step(dt)) dropConfetti();
    renderer.render(scene, camera);
    pip.frame();
  }

  /** Swap the gnome; cosmetic only, the chain never sees it. */
  const setGnome = (id: string) => {
    scene.remove(ball);
    disposeCourse(ball);
    ball = makeBall(gnomeById((gnomeId = id)));
    dressTrail(id);
    if (g.s) (headlamp(ball, g.s.world === "mines"), warmAside()); // his holing's shaders compiled now, not at the putt
    scene.add(ball);
    if (g.s) placeBall();
  };
  promo.attach({ g, chain, fire, ball: () => ball, ghost: () => rival.ball(), every: () => forecast.everyOf(), setClock: forecast.setClock, setGnome }); // ?promo only
  const api = {
    start,
    load,
    /** The hole a link names (its id, or a cup and a place in it), or null. */
    find: (link: Link) => {
      const h = linked(g, link);
      // an archived id is not in the list: the load asks the chain
      return h ? h.id : "id" in link && isHoleId(link.id) ? link.id : null;
    },
    /** The hole being played. */
    current: () => g.id,
    /** Play a world: its first hole, and its holes in the menu. */
    setWorld(w: string) {
      loadWorld(w).catch(() => {}); // fetched while the player picks a gnome
      // from its first hole, wherever the last round stopped
      const first = inWorld(g, w)[0];
      g.world = w;
      if (first && first.id === g.id && !g.shots.length) return; // on screen, not played yet
      if (first) void load(first.id);
      else void publish();
    },
    /** An opaque screen is over the course (or gone): stop drawing it meanwhile. */
    cover(on: boolean) {
      g.covered = !!on;
      if (!on) aimable();
      canvas.tabIndex = on ? -1 : 0; // a hidden course is not a place for Tab to land
    },
    /** Leave the title screen: the hole whole, then the ball. direct (a link to this hole) goes straight to the player's camera. */
    play(direct = false) {
      g.started = true;
      if (!direct) {
        // from the overview, whatever came before
        if (g.view !== "overview") (setView("overview"), cam.jump());
        return void introSoon();
      }
      cam.jump(); // in its framing at once, not glided in
      setView(home());
    },
    /** Plays a list of "angle,power" shots as a player would, pulling the elastic before each one. */
    demo: input.demo,
    /** A picture to share: the course as it is now, the score on a card over it. */
    async snapshot(caption: Caption) {
      await loadBadge(); // the card's badge, before the draw
      // drawn and read in the same task, so the drawing buffer is still there
      renderer.render(scene, camera);
      const src = renderer.domElement, W = 1200, H = Math.round((W * src.height) / src.width);
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d")!;
      x.drawImage(src, 0, 0, W, H);
      drawCard(x, W, H, caption);
      return new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    },
    /** The holing stroke replayed and recorded: an MP4, or null (nothing won, or cancelled). The recorder is fetched on the first clip. */
    clip(run: ClipRun, caption: Caption) {
      const stroke = round.won();
      if (!stroke || !g.s) return Promise.resolve(null);
      const hide = () => [ball, rival.ball(), aim, band, confetti && confetti.group];
      return Promise.all([import("./engine/recorder"), loadBadge()]).then(([m]) => m.recordClip({ E, stroke, gnome: gnomeId, showClock: forecast.showClock, hide, card: (x, w, h) => drawCard(x, w, h, caption, 0.6), term: caption.term, challenge: caption.challenge || `${caption.title} · ${caption.score}` }, run));
    },
    /** Races a ghost on this hole, from the tee; null drops the duel. */
    race(ghost: Ghost | null) {
      rival.race(ghost);
    },
    /** Dismiss a shot error and keep playing. */
    clearError() {
      g.error = null;
      g.failed = null;
      void publish();
    },
    setGnome,
    /** Graphics: "auto" | "high" | "low". The outlines follow at the next hole built: now, if this one is unplayed. */
    setGfx(m: string) {
      if (loop.setGfx(m) && g.id && !g.flying && !g.shots.length) void load(g.id);
      void publish();
    },
    /** Toggle between the whole course and the ball. */
    toggleView: () => setView(g.view === "ball" ? "overview" : "ball"),
    /** The aim mode for the next round ("assisted" | "pro"); a round under way is restarted. */
    setMode(m: string) {
      mode = m === "pro" ? "pro" : "assisted";
      if (g.shots.length && g.roundMode !== mode) (newRound(), setView(home()));
      void publish();
    },
    /** The camera: "classic" | "far" | "third". */
    setCam(m: string) {
      g.cam = camOf(m);
      // every switch starts clean: the chase state reset, a pull under way
      // dropped, and the pose eased from where the camera actually is
      cam.resetFollow();
      cam.finishGlide();
      if (pull.dragging) (pull.dragging = g.aiming = false), (pull.press = null), dropAim();
      setView(home());
    },
    reset() {
      if (g.id) track("restart", { hole: g.id, strokes: g.strokes, holed: !!g.done });
      newRound();
      setView(home());
    },
    /** In a duel: the camera on the ghost's ball, or back on the player's (their next aim does too). */
    peekRival: (on: boolean) => rival.peek(on),
    shoot: fire,
    chain,
    destroy() {
      alive = false;
      forecast.stop();
      input.stop();
      window.removeEventListener("pointermove", cam.hover);
      loop.stop();
      weather.dispose();
      causes.dispose();
      ambience({});
      clearTimeout(closeIn);
      round.stop();
      stopTelling();
      dropAim(); // and any preview on its way
      cut++; // every animation still running stops at its next frame
      if (g.course) disposeCourse(g.course);
      for (const o of [ball, aim, band, confetti && confetti.group, aside, trail && trail.group]) if (o) disposeCourse(o);
      rival.dispose();
      // a lent renderer keeps the shared looks and goes back at its own pixel ratio, GL state reset
      if (lent) (renderer.setPixelRatio(lentDpr), renderer.resetState());
      else (renderer.dispose(), releaseShared());
      pip.remove();
    },
  };
  // the test hooks: always in the type, there only when the page asked
  const hooked: Partial<ReturnType<typeof Probes>> = probes ? probes(E, { cam, rp, placeBall, fakeWeather: forecast.fake, stroke: forecast.stroke, aimDrawn: aimer.drawn, fx: () => ({ trail: !!trail && trail.group.visible, holing: !!confetti && confetti === mine }) }) : {};
  return Object.assign(api, hooked);
}
