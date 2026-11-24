# The client

The game in the browser: Next.js as a static export (plain files, no
server), three.js for the 3D, React for the interface on top. Three layers,
and a layer imports the ones under it, never the ones above:
```
app/          routes, metadata, CSS: no logic of the game
components/   React: the screens, and the hooks that drive them
lib/          the game in plain TypeScript: no React, no Next
test/         the unit tests (node:test), run by Node, without a browser
public/       served as it is: the font, the title's clips, the link cards
```

Start at `app/game.tsx`: it loads `components/Golf.tsx`, which makes the game on its
canvas with `createGame` (`lib/engine.ts`).
```sh
npm ci
npm run dev        # http://localhost:3000, against a local gnodev
npm test           # the unit tests, with their coverage floor
npm run typecheck && npm run lint
npm run build      # the static site, in out/
```

The chain to run beside it, and what the URL and the environment switch on:
[docs/development.md](../docs/development.md). A build's settings: [.env.example](.env.example).
