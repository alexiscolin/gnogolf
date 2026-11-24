// The studio every picture is made in: the renderer, the lit scene, and the
// light of a hole's time of day.
import * as THREE from "three";
import { isTouch } from "../device";
import { quality } from "./materials";
import type { LitScene } from "./data";

/** The pixel ratio cap: 1.25 on a desktop (sharp on retina, 30% fewer pixels
 *  than 1.5), 1 on a phone or tablet, whose screens are dense already. */
export const maxDpr = () => (isTouch() ? 1 : 1.25);

export function makeRenderer(canvas: HTMLCanvasElement) {
  // Light on the machine: the integrated GPU where there are two (the fans
  // stay off), no stencil buffer (nothing uses it), and a pixel ratio capped
  // where toon shading shows no difference. MSAA stays: the ink outlines need it.
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power", stencil: false });
  r.setPixelRatio(Math.min(devicePixelRatio, maxDpr()));
  return r;
}
/** A weak or software GPU, by the name the renderer's context gives it. */
export const weakGpu = (renderer: THREE.WebGLRenderer) => {
  try {
    const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); // (a GL string, whatever the typings say)
    return /swiftshader|llvmpipe|softpipe|software|mali-[4-7]\d\d|mali-g[57]\d\b|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]\d\d/i.test(name);
  } catch {
    return false;
  }
};

export function makeScene(): LitScene {
  const scene = new THREE.Scene() as LitScene;
  const sky = new THREE.HemisphereLight(0xfff3df, 0x9fc4b3, 1.3);
  const sun = new THREE.DirectionalLight(0xfff6e2, 0.7);
  sun.position.set(24, 40, 6);
  scene.add(sky, sun);
  scene.userData.lights = { sky, sun };
  return scene;
}

/**
 * A studio for pictures (the showcases: piece-showcase.ts, gnome-showcase.ts):
 * a canvas of its own, size px square, its renderer at a pixel ratio of 1, a
 * lit scene. snap(camera, px, quality) draws the scene and scales it to px
 * square, a WebP data URL (read in the same task: the drawing buffer is not
 * kept); dispose() lets its renderer and its WebGL context go (a page holds
 * about sixteen).
 */
export function makeStudio(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = makeScene(), out = document.createElement("canvas");
  return {
    canvas,
    scene,
    snap(camera: THREE.Camera, px: number, quality: number) {
      renderer.render(scene, camera);
      out.width = out.height = px;
      const x = out.getContext("2d")!;
      x.imageSmoothingQuality = "high";
      x.drawImage(canvas, 0, 0, px, px);
      return out.toDataURL("image/webp", quality);
    },
    dispose() {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// A hole is played at one moment of the day, and keeps it: day, evening or
// night. The light changes here, and the fog's colour (a pale mist by day, a
// rosy haze at dusk, a blue murk at night); the sky behind the canvas is the page's.
// Under ground (the Crystal Mines) the light is the scene's own:
// "cave" a blue-slate hemisphere and a soft warm key from above, as if from
// the lantern strings; "gallery" the dark (holes 2 and 15, and "Lights out"),
// where only the crystals, the lava and the headlamp light the way. Their
// fog is the vault's dark. low: the Low tier's ambient, a step up.
const TIMES: Record<string, { sky: readonly [number, number, number]; sun: readonly [number, number, readonly [number, number, number]]; fog: number; low?: number }> = {
  day:   { sky: [0xfff3df, 0x9fc4b3, 1.3], sun: [0xfff6e2, 0.7, [24, 40, 6]], fog: 0xdfe6e2 },
  dusk:  { sky: [0xffd2b0, 0x6f7fa8, 1.05], sun: [0xff9d62, 0.95, [-20, 14, 10]], fog: 0xd9b3a4 },
  night: { sky: [0x8ea2dc, 0x1f3342, 0.62], sun: [0xc4d4ff, 0.38, [10, 30, -10]], fog: 0x3e5372 },
  cave:    { sky: [0xb9c6f2, 0x2c3456, 1.3], sun: [0xffd9a8, 0.55, [6, 40, 14]], fog: 0x15122b, low: 1.2 },
  gallery: { sky: [0x7f8fd0, 0x1a1636, 0.42], sun: [0xffcf9a, 0.16, [6, 40, 14]], fog: 0x0b0918, low: 1.35 },
};

/** Day for most holes, evening or night for some — stable per hole. */
// ?og: every hole by day, for its link card (media/og/og.mjs)
const DAY = typeof location !== "undefined" && /[?&]og(&|=|$)/.test(location.search);
// by the hole's number in its cup ("garden/4/v1": 4, not its version), or an id's last number
export const timeOf = (id: unknown) => {
  if (DAY) return "day";
  const n = Number((String(id).match(/(\d+)(?:\/v\d+)?$/) || [])[1]);
  const h = Number.isFinite(n) ? n : [...String(id)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
  return ["day", "day", "dusk", "day", "night", "dusk"][h % 6];
};

export function setLighting(scene: LitScene, time: string) {
  const t = TIMES[time] || TIMES.day, { sky, sun } = scene.userData.lights;
  sky.color.set(t.sky[0]);
  sky.groundColor.set(t.sky[1]);
  sky.intensity = t.sky[2] * (t.low && quality.low ? t.low : 1);
  sun.color.set(t.sun[0]);
  sun.intensity = t.sun[1];
  sun.position.set(...t.sun[2]);
  if (scene.fog) scene.fog.color.set(t.fog);
  scene.userData.time = time;
}
