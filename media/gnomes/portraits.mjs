// @ts-check
// The game's own gnomes (web/lib/scene/gnome.ts GNOMES) and a duel's ghost,
// cut out on no background as the picker's stage first shows them, drawn by
// the game's own makeBall in headless Chrome (web/lib/scene/gnome-portrait.ts,
// bundled with a pinned esbuild: no dependency added): a WebP each in
// web/public/portraits/, what a card shows of a gnome at once
// (gnome.ts portraitOf; portraits.test.ts holds each to have one). No dev
// server, no chain. Run it again after a change to how a gnome is drawn.
//   node media/gnomes/portraits.mjs
import fs from "node:fs";
import { bundledPage, SEEDED, webpUnder } from "../lib/page.mjs";

const ROOT = new URL("../../", import.meta.url), OUT = new URL("web/public/portraits/", ROOT);
/** The picture's side (a menu panel shows it some 350 CSS pixels tall: sharp on a 2x screen), drawn at RENDER first; its bytes at most. */
const PX = 1024, RENDER = 2048, MAX_BYTES = 30_000;

const ENTRY = `import { makePortraits } from "./web/lib/scene/gnome-portrait";
${SEEDED}
const s = makePortraits(${RENDER});
window.ids = s.ids;
window.shot = (id, px, q) => ((seed = 7), s.shot(id, px, q));
window.ready = true;`;
// (its imports resolve from the repo's root, and read process.env)
const b = await bundledPage(ENTRY, { cwd: ROOT.pathname, name: "portraits.js", define: { "process.env.NODE_ENV": '"production"' }, motion: true, width: 600, height: 600 });

fs.mkdirSync(OUT, { recursive: true });
let bytes = 0, most = 0;
/** @type {string[]} */
const ids = await b.js("ids");
for (const id of ids) {
  const img = await webpUnder((q) => b.js(`shot(${JSON.stringify(id)}, ${PX}, ${q})`), MAX_BYTES, 0.9);
  fs.writeFileSync(new URL(`${id}.webp`, OUT), img);
  bytes += img.length;
  most = Math.max(most, img.length);
}
console.log(`${ids.length} portraits, ${Math.round(bytes / 1024)} KB, ${most} B at most`);
if (b.errors.length) console.log("page errors:", b.errors.slice(0, 5));
b.kill();
process.exit(0);
