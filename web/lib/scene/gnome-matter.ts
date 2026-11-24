// What a gnome is made of: each material its own bands of light and marks, the skin's colours kept.
import * as THREE from "three";
import { flat, hullOf, share, texOf, once } from "./materials";
import { seeded } from "./common";
import { md } from "./data";
import type { Material } from "../gnomes/vocab";
import type { Skin } from "./gnome";

/** The parts of a gnome a material dresses. */
export interface Dressed {
  body: THREE.Mesh;
  hat: THREE.Mesh[];
  beard: THREE.Mesh[];
  prop: THREE.Mesh[];
}

/** Materials that dress the beard too. */
const WHOLE: ReadonlySet<Material> = new Set(["stone", "wool", "crystal", "frost"]);
/** Polished materials take a fourth, bright band of light. */
const POLISHED: ReadonlySet<Material> = new Set(["metal", "glaze", "porcelain", "crystal", "frost"]);

// A toon gradient of light levels: SHINE ends in a narrow bright band.
const bands = (levels: number[]) => {
  const t = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return share(t);
};
const SHINE = bands([92, 165, 225, 225, 255]), MATTE = bands([128, 196, 240]);

const css = (v: number) => "#" + new THREE.Color(v).getHexString();
/** A 64 px repeating texture, painted with a generator seeded by key. */
function painted(key: string, paint: (x: CanvasRenderingContext2D, rand: () => number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  paint(c.getContext("2d")!, seeded(key));
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Each material's marks in base colour a and detail colour b, on a 64 px square wrapped round the part.
const MARKS: Partial<Record<Material, (x: CanvasRenderingContext2D, r: () => number, a: string, b: string) => void>> = {
  wood: (x, r, a, b) => {
    // fine grain running down, half seen: a carving, not a barrel
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1, x.globalAlpha = 0.4;
    for (let k = 0; k < 9; k++) {
      x.beginPath();
      const x0 = k * 7 + r() * 3;
      for (let i = 0; i <= 64; i += 8) x.lineTo(x0 + Math.sin(i / 9 + k) * 2.2, i);
      x.stroke();
    }
  },
  porcelain: (x, _, a, b) => {
    // a painted band of rings and dots round the middle, a line above and below
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.fillStyle = b, x.lineWidth = 1.5;
    for (const y of [24, 42]) x.beginPath(), x.moveTo(0, y), x.lineTo(64, y), x.stroke();
    for (let i = 0; i < 4; i++) x.beginPath(), x.arc(i * 16 + 8, 33, 4.5, 0, Math.PI * 2), x.stroke(), x.beginPath(), x.arc(i * 16 + 8, 33, 1.5, 0, Math.PI * 2), x.fill();
  },
  stone: (x, r, a, b) => {
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.fillStyle = b;
    for (let i = 0; i < 46; i++) x.beginPath(), x.arc(r() * 64, r() * 64, 0.6 + r() * 1.6, 0, Math.PI * 2), x.fill();
  },
  wool: (x, _, a, b) => {
    // rows of knitted Vs
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1.2;
    for (let y = 2; y < 64; y += 6) for (let i = 0; i < 64; i += 6) x.beginPath(), x.moveTo(i, y), x.lineTo(i + 3, y + 4), x.lineTo(i + 6, y), x.stroke();
  },
  gingerbread: (x, _, a, b) => {
    // icing: a wavy line round the middle and a row of dots
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.fillStyle = b, x.lineWidth = 2.4, x.beginPath();
    for (let i = 0; i <= 64; i += 4) x.lineTo(i, 30 + (i % 8 ? 3 : -3));
    x.stroke();
    for (let i = 0; i < 4; i++) x.beginPath(), x.arc(i * 16 + 8, 42, 2, 0, Math.PI * 2), x.fill();
  },
  lava: (x, r, a, b) => {
    // A crust split by cracks; the same map lights them as the emissive map.
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1.8;
    for (let k = 0; k < 7; k++) {
      x.beginPath();
      let px = r() * 64, py = r() * 64;
      x.moveTo(px, py);
      for (let i = 0; i < 4; i++) x.lineTo((px += (r() - 0.5) * 26), (py += (r() - 0.5) * 26));
      x.stroke();
    }
  },
  frost: (x, r, a, b) => {
    x.fillStyle = a, x.fillRect(0, 0, 64, 64), x.strokeStyle = b, x.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const cx = r() * 64, cy = r() * 64, s = 2 + r() * 3;
      for (let k = 0; k < 3; k++) x.beginPath(), x.moveTo(cx - s * Math.cos(k), cy - s * Math.sin(k)), x.lineTo(cx + s * Math.cos(k), cy + s * Math.sin(k)), x.stroke();
    }
  },
};

const METAL_LIFT = new THREE.Color(0x141414);
/** A material's surface in a base and a detail colour, made once per kind and pair. */
function surface(kind: Material, base: number, detail: number): THREE.Material {
  const key = `${kind}:${base}:${detail}`;
  return once("gnome-matter:" + key, () => {
    const marks = MARKS[kind], map = marks ? share(painted(key, (x, r) => marks(x, r, css(base), css(detail)))) : null;
    const opts: THREE.MeshToonMaterialParameters = {};
    if (POLISHED.has(kind) || kind === "stone") opts.gradientMap = POLISHED.has(kind) ? SHINE : MATTE; // else flat()'s own bands
    if (map) opts.map = map;
    if (kind === "lava") Object.assign(opts, { emissive: detail, emissiveMap: map, emissiveIntensity: 0.8 });
    // One emissive for every metal part: the bake merges them into one draw, which has one emissive.
    if (kind === "metal") opts.emissive = METAL_LIFT;
    if (kind === "crystal") Object.assign(opts, { transparent: true, opacity: 0.86, emissive: new THREE.Color(detail).multiplyScalar(0.25) });
    const m = flat(map ? 0xffffff : base, opts);
    if (kind === "crystal") md(m).base = 0.86; // a ghost fades it from this opacity
    return m;
  });
}

const GLINT = share(new THREE.MeshBasicMaterial({ color: 0xffffff }));
/** Two white dabs where the light hits the body. */
function glint(g: THREE.Group) {
  for (const [dir, r] of [[[-0.5, 0.42, 0.75], 0.07], [[-0.62, 0.22, 0.75], 0.035]] as const) {
    const n = new THREE.Vector3(...dir).normalize(), d = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), GLINT);
    d.position.copy(n).multiplyScalar(0.548);
    d.scale.set(1, 0.65, 0.25);
    d.lookAt(n.clone().multiplyScalar(2));
    g.add(d);
  }
}

/** Dresses a gnome in his material, each part keeping its own colour. Returns what moves with time, or null. */
export function dressMatter(g: THREE.Group, skin: Skin, parts: Dressed): ((t: number) => void) | null {
  const kind = skin.material;
  if (!kind) return null;
  const detail = skin.materialColor ?? 0xffffff;
  const dress = (o: THREE.Mesh) => {
    const v = (o.material as THREE.MeshToonMaterial).color?.getHex() ?? 0xffffff;
    o.material = surface(kind, v, detail);
  };
  [parts.body, ...parts.hat, ...parts.prop, ...(WHOLE.has(kind) ? parts.beard : [])].forEach(dress);
  if (kind === "crystal") {
    // The body as flat facets.
    const facets = new THREE.IcosahedronGeometry(0.55, 1);
    facets.computeVertexNormals(); // not indexed: each face keeps its own normal
    for (const o of parts.body.parent!.children) if (o instanceof THREE.Mesh) o.geometry = facets;
  }
  if (kind === "neon") {
    // its ink line lit, a little heavier: a sign at night
    const line = hullOf(0.04, detail);
    g.traverse((o) => o instanceof THREE.Mesh && md(o.material as THREE.Material).hull && (o.material = line));
  }
  if (kind === "metal") {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.548, 0.035, 6, 32), surface("metal", detail, detail));
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.1;
    g.add(band);
  }
  if (POLISHED.has(kind) && kind !== "crystal") glint(g);
  if (kind === "lava") {
    const m = parts.body.material as THREE.MeshToonMaterial;
    return (t) => (m.emissiveIntensity = 0.65 + 0.35 * Math.sin(t / 700));
  }
  return null;
}
