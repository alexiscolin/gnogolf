// What a gnome costs to draw, as the budget's test and the generator count it.
import * as THREE from "three";
import { makeBall, type Skin } from "./gnome";
import "./gnome-dress"; // registers the wardrobe: a collection gnome is counted dressed
import type { Gnome } from "./data";

/** A built gnome's triangles (ink hulls and instanced copies counted), draws, height and reach. */
export function costOf(g: Gnome) {
  let tris = 0, draws = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite) || !o.visible) return;
    draws++;
    const geo = o.geometry as THREE.BufferGeometry, n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    tris += o instanceof THREE.InstancedMesh ? n * o.count : n;
  });
  const box = new THREE.Box3().setFromObject(g.userData.body, true);
  return { tris, draws, top: box.max.y, reach: g.userData.reach };
}

export const trianglesOf = (skin: Skin) => costOf(makeBall(skin)).tris;
