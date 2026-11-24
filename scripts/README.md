# scripts

What checks, builds, deploys and tries the game. The shell scripts run from
any folder; the `.ts` and `.mjs` ones run with Node, most through an
`npm run` of `web/package.json`. A file's first comment says how it is run.

| | |
|---|---|
| the checks | `check.sh` (all of them, before a commit), `selfcheck.ts`, `scenelooks.ts`, `gnomelooks.ts`, `wasmparity.ts`, `smoke.ts` |
| the course | `holedata.sh` (the holes' sources into `data/holes.txt`), `paritydata.sh`, `publishdata.sh` (onto a chain) |
| a deploy | `stage.sh` (the packages under their owner's name), `importv1.sh` (onyx's v1 records into v2) |
| the wasm | `wasm.sh` and `wasm/`: the realm's own Gno built with TinyGo, into `web/lib/sim/` |
| a local chain | `try-local.sh` (the whole game, to try by hand) and its `playground-server.mjs`, `e2e-builder.sh`, `e2e-gnomes.sh`, `lib/e2e.sh` (what they share) |
| the gnomes | `gnomes.ts` (the catalogue), `gnomerows.ts`, `gnomestats.ts`, `gnomeassets.mjs` (what the site serves of it) |
| the Builder | `starters.ts`, `tileholes.ts`, `builderui.ts`, `builderwalk.ts`, `builderbench.ts` |

```sh
scripts/check.sh              # everything that must pass before a commit
SKIP_GNO=1 scripts/check.sh   # the client alone, as the CI runs it
scripts/try-local.sh          # a local chain with the 90 holes, two wallets, the site
```

What they need (the onyx toolchain, TinyGo, Chrome):
[docs/development.md](../docs/development.md#checks). The playground:
[docs/try-local.md](../docs/try-local.md).
