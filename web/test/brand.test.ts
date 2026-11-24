// The share card's text: a hole's name, as long as the Builder lets one be,
// never drawn over the game's name and the site's address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawCard } from "../lib/brand.ts";

// a 2D context that keeps what it was asked to write (a letter 0.6 of its font's size wide)
type Text = { text: string; at: number; max?: number; align: string; px: number };
function canvas() {
  const written: Text[] = [], set = { font: "", textAlign: "left" }, px = () => Number(/(\d+)px/.exec(set.font)![1]);
  const ctx = new Proxy(set, {
    get: (t, k) =>
      k === "measureText" ? (text: string) => ({ width: text.length * px() * 0.6 })
      : k === "fillText" ? (text: string, at: number, _y: number, max?: number) => void written.push({ text, at, max, align: t.textAlign, px: px() })
      : k in t ? t[k as keyof typeof t] : () => undefined,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, written };
}
const width = (t: Text) => Math.min(t.text.length * t.px * 0.6, t.max ?? Infinity);

void test("drawCard: a long name squeezed short of the game's name and address; a short one drawn as it is", (t) => {
  Object.assign(globalThis, { window: { location: { origin: "https://gnogolf.xyz", pathname: "/", hostname: "gnogolf.xyz" } } });
  t.after(() => void delete (globalThis as { window?: unknown }).window);
  for (const title of ["The Long Way Round The Old Windmill Pond", "W".repeat(40), "Windmill"]) {
    const { ctx, written } = canvas();
    drawCard(ctx, 1200, 630, { eyebrow: "community · par 3", title, score: "12 strokes" });
    const brand = Math.max(...written.filter((t) => t.align === "left").map((t) => t.at + width(t)));
    const name = written.find((w) => w.text === title)!;
    assert.ok(name.at - width(name) > brand, `${title}: from ${name.at - width(name)}, the left block to ${brand}`);
    if (title === "Windmill") assert.equal(width(name), title.length * name.px * 0.6, "a short name at its own width");
  }
});
