// Words the screens and the plain modules say alike.

import type { Mode } from "./types";

/** "stroke" or "strokes", as n says: the word alone. */
export const plural = (word: string, n: number) => word + (n === 1 ? "" : "s");
/** A noun counted: counted("hole")(1) is "1 hole", counted("hole")(6) "6 holes". */
export const counted = (word: string) => (n: number) => `${n} ${plural(word, n)}`;
/** The error's own sentence, or the value said as it is. */
export const messageOf = (e: unknown) => String((e && typeof e === "object" && "message" in e && e.message) || e);

/** "1 stroke", "3 strokes"; "1 hole", "6 holes"; "1 ghost", "4 ghosts". */
export const strokesWord = counted("stroke"), holesWord = counted("hole"), ghostsWord = counted("ghost");
/** A small count in words, as a sentence starts it ("Five"). Past ten, the figure. */
export const countWord = (n: number) => ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] || String(n);
/** A time left, as a clock says it ("4:07"). */
export const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** The aim modes as the game names them. AIMS: Pro first, as the switches show them. */
export const AIM_NAMES: Readonly<Record<Mode, string>> = { pro: "Pro", assisted: "Assisted" };
export const AIMS = Object.entries(AIM_NAMES) as [Mode, string][];
/** Why each aim mode has its own board: the chain can't see a screen. */
export const HONEST = "We can't check which mode you used, so each mode has its own board.";
