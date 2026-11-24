// The player's hand: the pull on the canvas, the arrow keys, the wheel that turns the view, and a pull played from a script.
import * as THREE from "three";
import { sound, setSilent } from "../feel";
import { pullShot, RULES, wait } from "../chain";
import { bandTo } from "../scene/fx";
import { BALL_R } from "../terrain";
import { steerAim, type makeAimer } from "./aim";
import type { makeCamera } from "./camera";
import type { makeRival } from "./rival";
import type { Live, Pull, Shot } from "./types";

const { maxPower: MAX_POWER } = RULES;

interface Needs {
  canvas: HTMLCanvasElement;
  alive: () => boolean;
  cam: ReturnType<typeof makeCamera>;
  rival: ReturnType<typeof makeRival>;
  aimer: ReturnType<typeof makeAimer>;
  placeBall: () => void;
  fire: (angleDeg: number, power: number) => Promise<void>;
}

export function makeInput(E: Live, pull: Pull, { canvas, alive, cam, rival, aimer, placeBall, fire }: Needs) {
  const { g, camera, aim, band, ground, publish } = E;
  const { preview, dropAim, ghosts } = aimer;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  let shot: Shot = { angle: 0, power: 0 };

  // the pull let go or dropped; one that had a power and did not shoot counts as a cancel
  const endPull = (fires = false) => {
    if (pull.pulled && !fires) pull.cancels++;
    pull.pulled = pull.dragging = g.aiming = false;
    g.spin = 0;
    dropAim();
    void publish();
  };

  // The canvas is a fixed full-window backdrop: its rect is read once a resize,
  // not on each pointer move (that would force a layout in the input path).
  let rect: DOMRect | null = null;
  const dropRect = () => (rect = null);
  window.addEventListener("resize", dropRect);
  function boardPoint(cx: number, cy: number) {
    const r = rect || (rect = canvas.getBoundingClientRect());
    const x = ((cx - r.left) / r.width) * 2 - 1;
    const y = -((cy - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc.set(x, y), camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
  }

  // A slingshot: press anywhere, pull back, let go. The shot flies away from the pull.
  function onMove(ev: PointerEvent) {
    if (!pull.dragging || g.flying || !pull.press) return;
    // behind the gnome: where the pointer is, steer() reads it every frame
    if (g.cam === "third" && pull.press.yaw != null) return void ((pull.press.lx = ev.clientX), (pull.press.ly = ev.clientY), steer(0));
    // the power is the pointer's distance on screen from where the pull began, whatever the camera does
    const px = Math.hypot(ev.clientX - pull.press.x, ev.clientY - pull.press.y);
    if (px < 6) {
      // back at the start: no pull, letting go shoots nothing. The shot is cleared too,
      // or it would keep its power and the elastic would stay out.
      if (shot.power > 0) {
        shot.power = 0;
        g.power = 0;
        band.visible = aim.visible = false;
        lastBar = 0;
        void publish();
      }
      return;
    }
    // both ends through the camera as it is now: an easing camera moves the
    // board under a still hand, and must not turn the shot
    const from = boardPoint(pull.press.x, pull.press.y), to = boardPoint(ev.clientX, ev.clientY);
    if (!from || !to) return;
    const dir = Math.atan2(from.y - to.y, from.x - to.x);
    aimAt(pullShot(px, window.innerWidth, window.innerHeight, dir, MAX_POWER));
  }
  // Behind the gnome the pull steers: called every frame (dt), and at each pointer move (0).
  function steer(dt: number) {
    if (!pull.dragging || g.flying || !pull.press || pull.press.yaw == null || g.cam !== "third") return;
    const down = Math.max(0, (pull.press.ly ?? pull.press.y) - pull.press.y);
    const a = steerAim(pull.press.yaw, (pull.press.lx ?? pull.press.x) - pull.press.x, down, dt, window.innerWidth, window.innerHeight);
    pull.press.yaw = a.yaw;
    if (a.spin !== (g.spin || 0)) (g.spin = a.spin), void publish();
    if (!a.shot) {
      // at the start's height: no power, the aim still turns
      (shot.angle = a.dir), (g.facing = shot.angle);
      if (shot.power > 0) (shot.power = 0), (g.power = 0), (band.visible = aim.visible = false), (lastBar = 0), void publish();
      return;
    }
    aimAt(a.shot);
  }
  function aimAt({ deg, power }: { deg: number; power: number }) {
    shot.angle = (deg * Math.PI) / 180;
    shot.deg = deg;
    shot.power = power;
    pull.pulled = true;
    g.facing = shot.angle;
    g.power = shot.power / MAX_POWER;
    creak();

    band.visible = true;
    aim.visible = aimer.shows();
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    placeBall();
    // the HUD shows only the power bar: told only when the bar would move
    const bar = Math.round(g.power * 40);
    if (bar !== lastBar) {
      lastBar = bar;
      void publish();
    }
  }
  let lastBar = -1;

  const onDown = (ev: PointerEvent) => {
    // one finger, one primary button: a second finger (a pinch by reflex, there is no zoom)
    // drops the pull instead of letting it shoot
    if (!ev.isPrimary) return onCancel();
    if (ev.button > 0) return;
    if (g.flying || g.done) return;
    if (rival.busy()) return; // the ghost's turn: the next aim waits for it
    rival.peek(false); // back from the ghost's ball to the player's
    cam.finishGlide(); // the intro glide, if still on: finished now, quickly
    // a new press takes over whatever aim was held (a keyboard aim, a lost pull)
    pull.dragging = true;
    g.aiming = true;
    ghosts(true);
    shot = { angle: 0, power: 0 };
    pull.press = { x: ev.clientX, y: ev.clientY };
    // third person: the heading the pull is measured from, frozen for the pull
    if (g.cam === "third" && g.view === "ball") pull.press.yaw = shot.angle = cam.yaw();
    // no dots until the chain has answered for this pull
    if (aim.userData.dots) aim.userData.dots.count = 0;
    else for (const d of aim.children) d.visible = false;
    canvas.setPointerCapture(ev.pointerId);
    void publish();
  };
  const onUp = () => {
    if (!pull.dragging) return;
    const fires = shot.power > 0.3;
    endPull(fires);
    pull.press = null;
    if (fires) void fire(shot.deg ?? 0, shot.power);
  };

  // the OS took the pointer away (a system gesture, a call): drop the pull, no shot
  const onCancel = () => {
    pull.press = null;
    if (pull.dragging) endPull();
  };

  // Keyboard: ←/→ turn the aim, ↑/↓ set the power, Space or Enter shoots,
  // Escape drops the aim. The same preview and the same fire() as the mouse.
  canvas.tabIndex = -1; // until the course is shown (cover)
  canvas.setAttribute("role", "application"); // a screen reader passes it the arrows and Space instead of reading with them
  canvas.setAttribute("aria-label", "Course. Arrow keys aim and set the power, Space shoots.");
  const onKey = (ev: KeyboardEvent) => {
    if (g.flying || g.done || !g.s) return;
    // an aim key waits for the ghost's turn, as a press does
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(ev.key)) {
      if (rival.busy()) return;
      rival.peek(false);
      cam.finishGlide();
    }
    const step = ev.shiftKey ? 1 : 4;
    if (!g.aiming && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) {
      g.aiming = pull.dragging = pull.pulled = true;
      ghosts(true);
      // behind the gnome: from where the view looks, not at the cup through the walls
      shot = { angle: g.cam === "third" && g.view === "ball" ? cam.yaw() : Math.atan2(g.s.cup[1] - g.ball.y, g.s.cup[0] - g.ball.x), power: 3 };
    }
    if (ev.key === "ArrowLeft") shot.angle -= (step * Math.PI) / 180;
    else if (ev.key === "ArrowRight") shot.angle += (step * Math.PI) / 180;
    else if (ev.key === "ArrowUp") shot.power = Math.min(MAX_POWER, shot.power + 0.5);
    else if (ev.key === "ArrowDown") shot.power = Math.max(0.5, shot.power - 0.5);
    else if (ev.key === "Escape" && g.aiming) return void endPull();
    else if ((ev.key === " " || ev.key === "Enter") && g.aiming) {
      ev.preventDefault();
      const fires = shot.power > 0.3; // as a pull let go: no power shoots nothing
      endPull(fires);
      if (!fires) return;
      const k = pullShot(0, 1, 1, shot.angle, MAX_POWER); // the same rounding as a pull
      return void fire(k.deg, Math.round(shot.power * 100) / 100);
    } else return;
    ev.preventDefault();
    // rounded like a pull, so the preview is the shot
    shot.deg = pullShot(0, 1, 1, shot.angle, MAX_POWER).deg;
    shot.power = Math.round(shot.power * 100) / 100;
    g.facing = shot.angle;
    g.power = shot.power / MAX_POWER;
    creak();
    band.visible = true;
    aim.visible = aimer.shows();
    preview();
    bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
    placeBall();
    void publish();
  };
  canvas.addEventListener("keydown", onKey);
  // behind the gnome the wheel or a two-finger swipe turns the view; ctrl+wheel and a pinch stay the page's zoom
  const onWheel = (ev: WheelEvent) => {
    if (ev.ctrlKey || g.cam !== "third" || g.view !== "ball" || !g.s || g.flying || g.done || pull.dragging) return;
    ev.preventDefault();
    const px = (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY) * (ev.deltaMode ? 16 : 1);
    cam.finishGlide();
    cam.turn(-Math.max(-0.5, Math.min(0.5, (px * 0.3 * Math.PI) / 180))); // the pull's sense: a swipe right turns the view left
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("lostpointercapture", onCancel);
  // the window losing focus or the tab going away drops a pull in progress
  window.addEventListener("blur", onCancel);
  const onHide = () => document.hidden && onCancel();
  document.addEventListener("visibilitychange", onHide);

  // one creak per tenth of power the elastic gains or gives back
  let notch = 0;
  const creak = () => {
    const n = Math.round(g.power * 10);
    if (n !== notch && n > 0) sound("stretch", g.power);
    notch = n;
  };

  /** Plays "angle,power" shots as a player would, pulling the elastic first. Each goes through fire(), so the chain resolves it as usual. */
  async function demo(list: readonly string[]) {
    // A person does not pull straight to the right angle: the aim starts off and is corrected,
    // the pull overshoots and eases back. Only the release has to be exact.
    let n = 0;
    setSilent(true); // a demo is nobody's pull: no creak, no putt, no knock
    for (const item of list) {
      const [deg, power] = item.split(",").map(Number);
      const off = [9, -7, 5, -11][n % 4], over = [1.18, 1.1, 1.22, 1.14][n % 4];
      const pullMs = 1300 + (n % 3) * 250;
      await wait([900, 1400, 700, 1100][n % 4]); // looking at the course first
      const t0 = performance.now();
      pull.dragging = g.aiming = true;
      await new Promise<void>((res) => {
        const tick = (now: number) => {
          const k = Math.min((now - t0) / pullMs, 1);
          // the angle settles on target with a small overshoot of its own
          const settle = Math.exp(-4.5 * k) * Math.cos(7 * k);
          const a = deg + off * settle;
          // the pull rises past the target, then comes back to it
          const p = power * (k < 0.6 ? over * (1 - Math.pow(1 - k / 0.6, 2)) : over + (1 - over) * ((k - 0.6) / 0.4));
          shot = { angle: (a * Math.PI) / 180, power: Math.min(p, MAX_POWER) };
          g.facing = shot.angle;
          g.power = shot.power / MAX_POWER;
          aim.visible = band.visible = true;
          bandTo(band, g.ball, shot.angle, shot.power, BALL_R + ground(g.ball.x, g.ball.y));
          placeBall();
          preview();
          void publish();
          if (k < 1) requestAnimationFrame(tick);
          else res();
        };
        requestAnimationFrame(tick);
      });
      shot = { angle: (deg * Math.PI) / 180, power };
      await wait([450, 700, 350, 600][n % 4]); // holding it, then letting go
      endPull();
      await fire(deg, power);
      if (g.done || !alive()) return setSilent(false);
      n++;
    }
    setSilent(false);
  }

  return {
    steer,
    demo,
    get shot() {
      return shot;
    },
    stop() {
      window.removeEventListener("resize", dropRect);
      window.removeEventListener("blur", onCancel);
      document.removeEventListener("visibilitychange", onHide);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("lostpointercapture", onCancel);
    },
  };
}
