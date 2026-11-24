// The game's name on what leaves the page: the card on the shared picture and the clip, and the clip's last card.
import { siteHost } from "./site";

/** The page's ink, green and paper, for what is drawn on a canvas. */
export const INK = "#144134", GREEN = "#226c57", PAPER = "#fdf6e9";
const INK_SOFT = "#4f7a6c", HAT = "#e0524b";
/** The site's font stack, for text drawn on a canvas. */
export const FONT = "Fredoka, ui-rounded, system-ui, sans-serif";

/** The gnome's head as the logo draws it, in a 200 box. app/icon.svg keeps its own copy. */
export const GNOME = {
  face: { x: 40, y: 100, width: 120, height: 44, rx: 6 },
  beard: "M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z",
  hat: "M 28 95 Q 40 91 48.7 76 L 96.5 7 Q 100 -1.5 103.5 7 L 151.3 76 Q 160 91 172 95 Z",
  brim: { x: 26, y: 90, width: 148, height: 20, rx: 10 },
} as const;

/** What the card says of the hole: its cup, number and par over its name, and the score. term: the clip's word for it. */
export interface Caption {
  eyebrow: string;
  title: string;
  score: string;
  term?: string;
  /** the clip's closing ask, when not the hole and the score */
  challenge?: string;
}

// The badge is the favicon, or its PNG where a browser won't draw the SVG. Relative: the site may be served under a path.
let badge: Promise<HTMLImageElement | null> | null = null;
let drawn: HTMLImageElement | null = null;
const fetchImg = (src: string) => {
  const img = Object.assign(new Image(), { src });
  return img.decode().then(() => (img.naturalWidth ? img : null), () => null);
};
/** The badge, loaded; null if it can't be: the cards go without it. */
export function loadBadge(): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return (badge ||= fetchImg("icon.svg").then((img) => img || fetchImg("apple-icon.png")).then((img) => (drawn = img)));
}
const ready = () => drawn;

/** The card at the bottom: the badge, "Gnogolf" and the site's address on the left; the hole and the score on the right. k scales it. */
export function drawCard(x: CanvasRenderingContext2D, W: number, H: number, { eyebrow, title, score }: Caption, k = 1) {
  const w = W / k, logo = ready();
  x.save();
  x.translate(0, H);
  x.scale(k, k);
  x.fillStyle = PAPER;
  x.strokeStyle = INK;
  x.lineWidth = 5;
  x.beginPath();
  x.roundRect(32, -140, w - 64, 108, 22);
  x.fill();
  x.stroke();
  const left = logo ? 146 : 64;
  if (logo) x.drawImage(logo, 54, -130, 88, 88);
  x.fillStyle = INK;
  x.font = `700 44px ${FONT}`;
  x.fillText("Gnogolf", left, -84);
  const name = x.measureText("Gnogolf").width, host = siteHost();
  x.font = `600 26px ${FONT}`;
  x.fillStyle = HAT;
  x.fillText(host, left, -50);
  const end = left + Math.max(name, x.measureText(host).width) + 24;
  x.textAlign = "right";
  x.fillStyle = INK_SOFT;
  x.font = `700 22px ${FONT}`;
  x.fillText(eyebrow.toUpperCase(), w - 64, -96);
  x.fillStyle = HAT;
  x.font = `700 38px ${FONT}`;
  x.fillText(score, w - 64, -52);
  const room = x.measureText(score).width + 24;
  x.fillStyle = INK;
  x.fillText(title, w - 64 - room, -52, w - 64 - room - end); // a long name is squeezed, short of the left block
  x.restore();
}

/** A word shouted over the picture, centred at (0, 0): filled, inked round, with a paper halo so it reads on any ground. */
function shout(x: CanvasRenderingContext2D, text: string, px: number, fill: string) {
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `700 ${px}px ${FONT}`;
  x.lineJoin = "round";
  x.lineWidth = px * 0.17;
  x.strokeStyle = PAPER;
  x.strokeText(text, 0, 0);
  x.lineWidth = px * 0.08;
  x.strokeStyle = INK;
  x.strokeText(text, 0, 0);
  x.fillStyle = fill;
  x.fillText(text, 0, 0);
}

/** A pill, centred at (cx, cy), as the game's buttons: ink edge, a hard shadow under it. */
function pill(x: CanvasRenderingContext2D, cx: number, cy: number, parts: readonly [string, string][], px: number, bg: string) {
  x.font = `700 ${px}px ${FONT}`;
  const widths = parts.map(([t]) => x.measureText(t).width), w = widths.reduce((a, b) => a + b, 0) + px * 1.6, h = px * 1.9;
  x.fillStyle = INK;
  x.beginPath();
  x.roundRect(cx - w / 2, cy - h / 2 + px * 0.22, w, h, h / 2);
  x.fill();
  x.fillStyle = bg;
  x.strokeStyle = INK;
  x.lineWidth = px * 0.12;
  x.beginPath();
  x.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  x.fill();
  x.stroke();
  x.textAlign = "left";
  x.textBaseline = "middle";
  let at = cx - w / 2 + px * 0.8;
  parts.forEach(([t, c], i) => {
    x.fillStyle = c;
    x.fillText(t, at, cy + px * 0.04);
    at += widths[i];
  });
}

/** The result, large over the course once the ball is in. t (0..1) pops it in. */
export function drawTerm(x: CanvasRenderingContext2D, W: number, H: number, term: string, t: number) {
  const p = Math.max(0, Math.min(1, t)), s = H / 720;
  // an ease out that overshoots a little, then settles
  const k = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
  x.save();
  x.globalAlpha = p;
  x.translate(W / 2, H * 0.42);
  x.scale(k, k);
  x.rotate(-0.04);
  shout(x, term, Math.min(190, ((W * 0.85) / Math.max(term.length, 5)) * 1.9) * s, HAT);
  x.restore();
}

/** The clip's last card, faded in by a (0..1): the course's last moment blurred, an inked frame, the badge, the dare, the shot to beat, and where to play. */
export function drawOutro(x: CanvasRenderingContext2D, W: number, H: number, a: number, still: CanvasImageSource | null, challenge: string) {
  const logo = ready(), s = H / 720, p = Math.max(0, Math.min(1, a));
  x.save();
  x.globalAlpha = p;
  if (still) {
    x.filter = `blur(${14 * s}px)`;
    x.drawImage(still, -30 * s, -30 * s, W + 60 * s, H + 60 * s);
    x.filter = "none";
  }
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "rgba(120, 190, 235, .55)");
  sky.addColorStop(0.55, "rgba(253, 246, 233, .5)");
  sky.addColorStop(1, "rgba(240, 190, 120, .45)");
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);
  x.fillStyle = "rgba(255, 255, 255, .35)";
  for (let yy = 12 * s; yy < H; yy += 22 * s) for (let xx = 12 * s; xx < W; xx += 22 * s) x.fillRect(xx, yy, 2.5 * s, 2.5 * s);
  x.strokeStyle = INK;
  x.lineWidth = 3 * s;
  x.beginPath();
  x.roundRect(24 * s, 24 * s, W - 48 * s, H - 48 * s, 18 * s);
  x.stroke();
  // pops in a little behind the fade
  const k = 0.9 + 0.1 * Math.min(1, p * 1.4);
  x.translate(W / 2, H / 2);
  x.scale(k, k);
  x.translate(-W / 2, -H / 2);
  if (logo) {
    x.fillStyle = "rgba(253, 246, 233, .9)";
    x.beginPath();
    x.arc(W / 2, 175 * s, 118 * s, 0, Math.PI * 2);
    x.fill();
    x.drawImage(logo, W / 2 - 105 * s, 70 * s, 210 * s, 210 * s);
  }
  x.save();
  x.translate(W / 2, 360 * s);
  x.rotate(-0.03);
  shout(x, "Can you beat it?", 92 * s, GREEN); // green, as the logo's letters
  x.restore();
  pill(x, W / 2, 478 * s, [[challenge.toUpperCase(), PAPER]], 36 * s, GREEN);
  pill(x, W / 2, 585 * s, [["Play free at ", INK], [siteHost(), HAT]], 44 * s, PAPER);
  x.fillStyle = INK;
  x.textAlign = "center";
  x.font = `600 ${27 * s}px ${FONT}`;
  x.fillText("Every shot computed by the chain on gno.land", W / 2, 668 * s);
  x.restore();
}
