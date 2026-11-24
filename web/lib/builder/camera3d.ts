// The 3D board's camera. Orthographic, so a board point (x, y), the scene's (x, 0, y), shows on the pixel toScreen gives it.
import * as THREE from "three";
import { toBoard, type Look, type View } from "./view";

// Any height does for an orthographic camera, as long as the scene fits between near and far.
const STAND = 200;

/** Sets cam to show the ground as the view and the look map it, on a board of w × h pixels. */
export function orthoFor(cam: THREE.OrthographicCamera, v: View, look: Look, size: { w: number; h: number }) {
  const { w, h } = size, mid = toBoard(v, look, [w / 2, h / 2]), down = toBoard(v, look, [w / 2, h / 2 + 1]);
  // g: the screen's down along the ground, a unit. The camera leans back from it by the tilt.
  const g = new THREE.Vector3(down[0] - mid[0], 0, down[1] - mid[1]).normalize(), y = new THREE.Vector3(0, 1, 0);
  const s = Math.sin(look.tilt), c = Math.cos(look.tilt), target = new THREE.Vector3(mid[0], 0, mid[1]);
  cam.position.copy(target).addScaledVector(y, c * STAND).addScaledVector(g, s * STAND);
  cam.up.copy(y).multiplyScalar(s).addScaledVector(g, -c);
  cam.lookAt(target);
  Object.assign(cam, { left: -w / 2 / v.k, right: w / 2 / v.k, top: h / 2 / v.k, bottom: -h / 2 / v.k, near: 1, far: 2 * STAND });
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}
