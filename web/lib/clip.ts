// The shot clip without a browser: its format, the stretch of the holing stroke it shows, its sky and its file's name.

/** The MP4s a clip may be recorded as, best first: MP4 is the one video X takes. */
const MP4 = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4"];

/** The first MP4 this browser records, or "": no clip is offered then. */
export function clipMime(supported: (type: string) => boolean) {
  return MP4.find((t) => { try { return supported(t); } catch { return false; } }) || "";
}

/** The MP4 this browser can make a clip in, or "": it needs a canvas it can film and a MediaRecorder that writes MP4. */
export function clipSupport(w: { MediaRecorder?: { isTypeSupported(type: string): boolean }; HTMLCanvasElement?: { prototype: object } } = globalThis) {
  if (!w.MediaRecorder || !w.HTMLCanvasElement || !("captureStream" in w.HTMLCanvasElement.prototype)) return "";
  const rec = w.MediaRecorder;
  return clipMime((t) => rec.isTypeSupported(t));
}

/** How long a clip holds on each part, in ms: the gnome still before the release, the moment after the drop, the stroke at most, the closing card, its fade in, the result's pop. */
export const CLIP = { lead: 700, tail: 1800, max: 8000, outro: 1800, fade: 300, pop: 150 };

/** The stretch of the holing stroke a clip shows, from each path step's time on screen (ms): from the release when it all fits in max, else its last steps with no lead. length: the clip's expected ms. */
export function clipWindow(ms: readonly number[]) {
  const { lead, tail, max } = CLIP, all = ms.reduce((a, b) => a + b, 0);
  if (lead + all + tail <= max) return { from: 0, lead, length: lead + all + tail };
  let from = ms.length - 1, run = ms[from] || 0;
  while (from > 0 && run + ms[from - 1] + tail <= max) run += ms[--from];
  return { from: Math.max(from, 0), lead: 0, length: run + tail };
}

/** The sky's colour stops (offset 0..1, colour) from its CSS background, as getComputedStyle gives it. The day's when unreadable. */
export function skyStops(css: string): [number, string][] {
  const stops = [...css.matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)%/gi)].map((m): [number, string] => [Math.min(1, Math.max(0, Number(m[2]) / 100)), m[1]]);
  return stops.length ? stops : [[0, "#fdebcf"], [1, "#bfd9cc"]];
}

/** The clip's file name: gnogolf-garden-3.mp4 for a course hole, whatever its version; gnogolf-<slug>.mp4 for a community one. */
export function clipName(id: string) {
  const parts = id.replace(/\/v\d+$/, "").split("/");
  const last = parts[parts.length - 1] || "";
  const name = (/^\d+$/.test(last) ? parts.slice(-2).join("-") : last).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `gnogolf${name ? "-" + name : ""}.mp4`;
}
