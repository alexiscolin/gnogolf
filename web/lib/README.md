# lib: the game, without React

Plain TypeScript: nothing here imports React, Next, `components/` or `app/`.
```
engine.ts   createGame: a game's state, and what ties its parts together
engine/     its parts: the camera, the aim, a shot, its replay, the frame loop
scene/      the picture, in three.js, built from a hole's state: shapes, never rules
sim/        the realm's own code in the page: two wasm and their worker
builder/    the Builder's logic: the draft, the checks, test mode, publishing
gnomes/     the gnome collection: the catalogue, the looks, the shop
*.ts        the plain modules, one job each: a file's first comment says which
```

Read `types.ts` first (the realm's JSON, typed), then `chain.ts` (every read
of the realm, each reply checked), `adena.ts` (the wallet) and `save.ts` (a
round on its way to the chain). [engine/](engine/), [scene/](scene/) and
[builder/](builder/) have a README each.

What a change keeps:
- The plain modules stay clear of three.js, `engine/` and `scene/`
  (`engine.ts` and `promo.ts` aside; today's exceptions: `chase.ts`, `prefs.ts`, `hints.ts`).
- `scene/` never imports `chain.ts`, `analytics.ts` or `engine/`.
- No barrel: an importer names the file that defines what it takes.
- What loads on demand stays behind its `import()` (`../test/bundle.test.ts`).
- `npm test`, from `web/`: the tests cover 80% of these lines (`scene/`, `engine.ts`, `promo.ts` aside).
