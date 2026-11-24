// What the aim's tests share: makeAimer (lib/engine/aim.ts) on the engine's
// state it reads, its dots a plain THREE.InstancedMesh, which needs no DOM,
// and the chain the test's own (the aim asks simulateFrom and simulateRound).
import * as THREE from "three";
import { makeAimer } from "../lib/engine/aim.ts";
import type { Live } from "../lib/engine/types.ts";
import type { Mode, Vec2 } from "../lib/types.ts";

/** The aim on chain, over garden/1 at period 1, the ball at the origin and no pull held, unless asked otherwise. */
export function aimRig(chain: object, { id = "garden/1", period = 1, ball = { x: 0, y: 0 }, dragging = false, shot = { angle: 0, power: 0, deg: undefined as number | undefined } } = {}) {
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 4, 3), new THREE.MeshBasicMaterial(), 64);
  dots.count = 0;
  const aim = new THREE.Group();
  aim.userData.dots = dots;
  const g = {
    roundMode: null as Mode | null,
    ball,
    period,
    shots: [] as string[],
    id: id as string | null,
    rest: null as Vec2 | null,
    round: 1,
    course: null as { userData: { ghosts?: (on: boolean) => void } } | null,
    weather: null as { fog?: boolean } | null,
    s: null as { walls: { a: Vec2; b: Vec2; skin: string }[]; posts: { c: Vec2; r: number; skin: string }[]; hole?: string; slot?: string } | null,
  };
  const band = { visible: false };
  const E = {
    g, chain, aim, band, ground: () => 0, mode: "assisted" as Mode, shot, dragging, tickNow: () => 0, landing: () => null, zones: () => [], clock: 0,
  } as unknown as Live & { dragging: boolean };
  return { E, g, aim, dots, band, aimer: makeAimer(E) };
}
