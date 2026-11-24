// Words the screens and the plain modules say alike: a count and its noun,
// and what a thrown value has to say.

/** "stroke" or "strokes", as n says (the word alone, where the number is set apart). */
export const plural = (word: string, n: number) => word + (n === 1 ? "" : "s");
/** A noun counted: counted("hole")(1) is "1 hole", counted("hole")(6) "6 holes". */
export const counted = (word: string) => (n: number) => `${n} ${plural(word, n)}`;
/** The error's own sentence, or the value said as it is. */
export const messageOf = (e: unknown) => String((e && typeof e === "object" && "message" in e && e.message) || e);
