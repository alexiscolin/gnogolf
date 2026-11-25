# builder: the Builder's logic

What `/build` does, without React: its screens are in
[`../../components/builder/`](../../components/builder/). An author draws a
hole, the page checks it with the chain's own code, and they hole it in
each weather before it is published.

| | |
|---|---|
| the draft | `draft.ts` (the hole as the editor works on it), `session.ts`, `edit.ts`, `gesture.ts`, `handles.ts`, `settings.ts`, `surface.ts`, `templates.ts`, `starters.ts` (written by `scripts/starters.ts`) |
| the palette | `palette.ts`, `bindings.ts`, `rules.ts`, `names.ts`, `tiles.ts`, `limits.ts` |
| the checks | `pipeline.ts` (`validate`: every check, cheapest first), `checks.ts`, `lane.ts`, `explain.ts`, `verdict.ts` |
| the chain's code in the page | `wasm.ts`, `load.ts`, `gg1.ts`, `localchain.ts`, `types.ts` |
| Play and the proof | `testmode.ts`, `proof.ts`, `carry.ts`, `quickshot.ts`, `difficulty.ts` with `meter.ts` |
| publishing, and after | `publish.ts`, `rewards.ts`, `holes.ts`, `importing.ts`, `naming.ts` |
| the board | `view.ts`, `camera3d.ts`, `stage.ts`, `editor.ts`, `keys.ts`, `juice.ts`, `cards.ts`, `route.ts` |

Read `draft.ts`, then `pipeline.ts`, then `proof.ts`. The design:
[hole-builder.md](../../../docs/specs/hole-builder.md); the checks in the
browser: [decision 006](../../../docs/decisions/006-hole-builder.md).
```sh
NEXT_PUBLIC_BUILDER=1 npm run dev   # from web/: the Builder, at /build
npm test                            # from web/: test/builder-*.test.ts
scripts/e2e-builder.sh              # holes published for real, on a local chain of its own
```
