// The game's screens by name, and the one before each: where its Back button
// and Escape go.

const SCREENS = ["title", "modes", "rival", "ghosts", "worlds", "community", "pick", "play", "shop"] as const;
export type Screen = (typeof SCREENS)[number];
export const isScreen = (v: unknown): v is Screen => SCREENS.some((x) => x === v);
// the screen before each one, for its Back button and Escape (the picker's: the cups, or a duel's ghosts)
export const BACK = { modes: "title", rival: "modes", ghosts: "rival", worlds: "modes", community: "worlds" } as const satisfies Partial<Record<Screen, Screen>>;
