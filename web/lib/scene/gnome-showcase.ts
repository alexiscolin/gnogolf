// One gnome on a plinth of his tier's colour, in the game's light: what the collection's thumbnails are drawn with.
import * as THREE from "three";
import { makeBall, type Skin } from "./gnome";
import "./gnome-dress"; // registers the collection's wardrobe
import { makeTrail } from "./gnome-fx";
import { makeStudio } from "./studio";
import { disposeCourse } from "./materials";
import { BALL_R } from "../terrain";
import { TIER_LOOK } from "../gnomes/catalogue";
import type { Tier } from "../gnomes/vocab";

/** A showcase on its own canvas of size px: show(skin, tier), then shot() for a picture, dispose() once done. */
export function makeShowcase(size = 512) {
  const studio = makeStudio(size), { scene } = studio;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  // Three-quarter view from the side he carries things (+x), high enough for the tallest hat.
  const target = new THREE.Vector3(0, 0.8, 0);
  camera.position.copy(target).add(new THREE.Vector3(0.68, 0.36, 0.72).normalize().multiplyScalar(4.9));
  camera.lookAt(target);
  const plinth = new THREE.Group();
  scene.add(plinth);
  let gnome: ReturnType<typeof makeBall> | null = null, trail: ReturnType<typeof makeTrail> = null;

  const dressPlinth = (tier: Tier) => {
    disposeCourse(plinth);
    plinth.clear();
    const look = TIER_LOOK[tier];
    const flatRing = (r0: number, r1: number, color: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.001;
      plinth.add(m);
    };
    flatRing(0, 0.72, look.plinth);
    const rings = { earned: 0, common: 0, rare: 1, epic: 2, legendary: 2 }[tier];
    for (let k = 0; k < rings; k++) flatRing(0.78 + k * 0.1, 0.83 + k * 0.1, look.frame);
    if (tier === "legendary")
      for (let k = 0; k < 16; k++) {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.26), new THREE.MeshBasicMaterial({ color: look.frame }));
        const a = (k / 16) * Math.PI * 2;
        ray.rotation.set(-Math.PI / 2, 0, -a);
        ray.position.set(Math.sin(a) * 1.16, 0.002, Math.cos(a) * 1.16);
        plinth.add(ray);
      }
  };

  return {
    canvas: studio.canvas,
    show(skin: Skin, tier: Tier) {
      for (const o of [gnome, trail && trail.group]) if (o) (scene.remove(o), disposeCourse(o));
      scene.background = new THREE.Color(TIER_LOOK[tier].ground);
      dressPlinth(tier);
      gnome = makeBall(skin);
      gnome.position.y = BALL_R;
      gnome.userData.shade.position.y = -BALL_R + 0.01;
      scene.add(gnome);
      trail = makeTrail(skin);
      if (trail) {
        // A curved trail laid behind him, as if he had just rolled in.
        for (let k = 14; k >= 0; k--) trail.push(new THREE.Vector3(0.08 * k, 0.04, -0.05 * k - 0.002 * k * k), (14 - k) * 0.03);
        trail.step(14 * 0.03);
        scene.add(trail.group);
      }
    },
    /** A WebP data URL of the gnome at time t (ms), turned by turn, at px square. */
    shot(px: number, quality: number, t = 0, turn = 0) {
      if (gnome) (gnome.userData.body.rotation.y = turn), gnome.userData.tick?.(t);
      return studio.snap(camera, px, quality);
    },
    /** Frees what it drew, its renderer and its WebGL context: a page holds about sixteen. */
    dispose() {
      for (const o of [gnome, trail && trail.group, plinth]) if (o) (scene.remove(o), disposeCourse(o));
      studio.dispose();
    },
  };
}
