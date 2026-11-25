// The game's screen, read as source (no DOM here; components/Golf.tsx, its parts in components/game, its screens'
// names in lib/screens.ts): the hole-finished card is said (finished_shown) once the
// player's best on the round on offer was asked, answered or not, and each round asks afresh; the community's holes
// are one of the game's screens (components/Title.tsx: no title scene behind their address); a link to the author's
// own unheld hole opens only while they are still on the cups.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const GAME = new URL("../components/game/", import.meta.url);
const golf = [new URL("../components/Golf.tsx", import.meta.url), ...fs.readdirSync(GAME).map((f) => new URL(f, GAME)), new URL("../lib/screens.ts", import.meta.url)].map((f) => fs.readFileSync(f, "utf8")).join("\n");
const title = fs.readFileSync(new URL("../components/Title.tsx", import.meta.url), "utf8");

void test("finished_shown waits for this round's best: the hole played again in the same mode is not answered yet", () => {
  assert.ok(/setBest\(null\);\s*setBestAsked\(""\);/.test(golf), "the last ask forgotten as a new one starts");
  assert.ok(golf.includes("bestAsked !== `${saveId}#${saveMode}`"), "and the card's event waits for its own");
});

void test("the community's holes, a screen of the game's: its title focused as it comes, Escape and Back to the cups, its own address", () => {
  assert.ok(/const SCREENS = \[[^\]]*"community"/.test(golf) && golf.includes(`community: "worlds"`), "a screen, the cups before it");
  assert.ok(golf.includes(`onCommunity={() => setScreen("community")}`), "the band under the cups opens it");
  assert.ok(/\|\| screen === "community"\) q\.set\("screen", screen\)/.test(golf) && golf.includes(`p.get("screen") === "community" ? "community"`), "?screen=community: a step Back returns to it, a reload lands on it");
  assert.ok(title.includes("screen=(cups|rival|community)\\b"), "its address a link past the title, as the cups': the loader alone, no scene built behind it");
});

void test("a link to the author's own hole not holed yet opens once their account is known, only while they are on the cups it landed on", () => {
  assert.ok(/if \(screen !== "worlds"\) unheldLink\.current = "";\s*\}, \[screen\]\);\s*useEffect\(\(\) => \{\s*const link = unheldLink\.current/.test(golf), "forgotten as they leave, before the account's answer is looked at");
});

void test("what is fetched ahead: the Builder's code on a computer alone, nothing in a round or on a data saver, the title held for its three pictures only", () => {
  const builder = golf.split("\n").filter((l) => /import\("@\/(lib|components)\/builder\/|router\.prefetch\(buildLink/.test(l));
  assert.equal(builder.length, 2, "its wasm, and its page with its screens' code");
  for (const l of builder) assert.ok(/builderComputer\(\) (&&|\|\|)/.test(l), l.trim().slice(0, 90));
  assert.ok(golf.includes("const builderComputer = () => builderOn() && onComputer("), "the flag, and no phone (lib/builder/route.ts)");
  assert.ok(golf.includes(`const ahead = screen !== "play" && !leanLink();`));
  const idle = golf.split("\n").filter((l) => l.includes("whenIdle(["));
  assert.equal(idle.length, 3);
  for (const l of idle) assert.ok(/^\s*(if \(ahead && .*\) )?return whenIdle\(\[/.test(l), "each stopped as its effect is left: " + l.trim().slice(0, 60));
  assert.ok(golf.includes(`void warmPortraits([gnomeById(gnome), "ghost", gnomeById("miner")]).then(() => live && setWarm(true));`), "no other file holds the title");
});
