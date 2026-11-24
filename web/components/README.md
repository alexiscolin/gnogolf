# components: the interface

React, over the game in [`../lib/`](../lib/): what renders, and the hooks
that drive it. A component imports `lib/` and other components, never
`app/`, where its CSS is (`../app/globals.css` and the files beside it).
```
ui.tsx  button.ts   the shared controls: every button, switch and sheet is one of these
hooks.ts            the hooks two features share
Golf.tsx            the game's screen: the canvas, the game made on it, which screen shows
game/               Golf.tsx's parts: the HUD, the picker, the save, the win card, its hooks
Title.tsx Modes.tsx Worlds.tsx Leaderboard.tsx …   one screen or widget a file
builder/            the Builder's screens (its logic: ../lib/builder/)
gnomes/             the gnome shop's screens (its logic: ../lib/gnomes/)
```

Start with `Golf.tsx`: it calls `createGame` (`../lib/engine.ts`) on its
canvas, and is told what the game does through `onChange`.

- A feature's own hook sits beside it as `useX.ts`; one that two features
  share goes in `hooks.ts`.
- A helper that is not React (a word, a link, a parser) lives in `lib/`, once.
- A button is a `Button` of `ui.tsx`, never a class written by hand (`../test/buttons.test.ts`).

From `web/`: `npm run typecheck`, `npm run lint`, `npm test`. The Builder's and
the shop's screens: [gui-design.md](../../docs/specs/gui-design.md).
