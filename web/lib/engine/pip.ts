// The cup's pip. The cup off the picture, before the first stroke (Classic and
// Third person, the camera on the gnome): a small inked pip at the edge of the
// free screen, pointing to it. It fades once the cup is in view or a shot is played.
import * as THREE from "three";
import type { Live } from "./types";

/** parent: where the pip goes (the canvas's parent); HUD: the part of the screen the HUD covers, in CSS pixels. */
export function makeCupPip(E: Live, parent: HTMLElement | null, HUD: { top: number; bottom: number; side: number }) {
  const { g, camera, ground } = E;
  const pip = document.createElement("div");
  pip.className = "cuppip";
  pip.setAttribute("aria-hidden", "true");
  pip.innerHTML = '<svg viewBox="-24 -24 48 48" width="56" height="56"><path d="M 13 -6 L 22 0 L 13 6 Z" class="cuppip__arrow"/><circle r="13" class="cuppip__disc"/><path d="M -4 7 V -8 L 7 -4 L -4 0" class="cuppip__flag"/></svg>';
  parent?.appendChild(pip);
  const cupNdc = new THREE.Vector3(), cupAt3 = new THREE.Vector3();
  let pipOn = false;
  /** The cup (cupAt3, on the ground) as the camera shows it: where on the screen (NDC, turned round when behind it),
   *  the free part's bounds there (inside the HUD's bands), and whether it is off that part. */
  function cupOnScreen() {
    const s = g.s!, w = window.innerWidth, h = window.innerHeight;
    cupNdc.copy(cupAt3.set(s.cup[0], ground(s.cup[0], s.cup[1]), s.cup[1])).project(camera);
    const behind = cupNdc.z > 1, x = behind ? -cupNdc.x : cupNdc.x, y = behind ? -cupNdc.y : cupNdc.y;
    const x1 = 1 - (2 * (HUD.side + 26)) / w, y1 = 1 - (2 * (HUD.top + 26)) / h, y0 = -1 + (2 * (HUD.bottom + 26)) / h;
    return { x, y, x1, y0, y1, off: behind || Math.abs(x) > x1 || y < y0 || y > y1 };
  }
  function cupPip() {
    const want = !!g.s && g.started && g.view === "ball" && g.cam !== "far" && !g.shots.length && !g.flying && !g.holed && !g.covered;
    let show = false;
    if (want && g.s) {
      const { x, y, x1, y0, y1, off } = cupOnScreen(), w = window.innerWidth, h = window.innerHeight, cy = (y0 + y1) / 2, ry = (y1 - y0) / 2;
      show = off;
      if (show) {
        // on the line from the free part's centre toward the cup, at its edge
        let dx = x, dy = y - cy;
        if (Math.hypot(dx, dy) < 1e-6) (dx = 0), (dy = -1); // right behind: at the bottom
        const k = Math.min(Math.abs(dx) > 1e-6 ? x1 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? ry / Math.abs(dy) : Infinity);
        const px = ((dx * k + 1) / 2) * w, py = ((1 - (cy + dy * k)) / 2) * h;
        pip.style.transform = `translate(${(px - 28).toFixed(1)}px, ${(py - 28).toFixed(1)}px)`;
        pip.style.setProperty("--a", `${Math.atan2(-dy * h, dx * w).toFixed(3)}rad`);
      }
    }
    if (show !== pipOn) pip.classList.toggle("cuppip--on", (pipOn = show));
  }

  return {
    onScreen: cupOnScreen,
    /** The cup on the ground, as onScreen last placed it. */
    at: cupAt3,
    /** A frame: the pip shown, moved or hidden. */
    frame: cupPip,
    remove: () => pip.remove(),
  };
}
