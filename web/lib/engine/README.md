# engine: the game's parts

`createGame` ([`../engine.ts`](../engine.ts)) holds a game's state and ties
these parts together. Nothing here simulates a ball: a shot is asked of the
chain, the chain answers with a path, and the path is walked on screen.

| | |
|---|---|
| `loader.ts` `list.ts` | the hole list, and a hole loaded: its state, its build, its shaders compiled |
| `input.ts` `aim.ts` | the player's hand (the pull, the keys), and the preview dots |
| `shot.ts` `replay.ts` | a shot asked of the chain, and its round; the chain's path walked on screen |
| `forecast.ts` `extras.ts` | the weather a stroke is played in and the timed pieces' clock; a timed hole's pieces, stroke by stroke |
| `camera.ts` `pip.ts` `loop.ts` `pace.ts` | where the camera goes, the pip that points to a cup out of view; which frames are drawn, and in which graphics tier |
| `snapshot.ts` | what the interface is told: one `Snapshot` at a time, through `onChange` |
| `rival.ts` | a duel's ghost |
| `recorder.ts` `probes.ts` `audit.ts` | loaded on demand: the shot clip; the test hooks of a page opened with `?camlog` |

A part is `makeX(E: Live)`: it works on the engine's live state (`Live`, in
[`types.ts`](types.ts)), never imports `../engine.ts`, and takes no file
name that [`../scene/`](../scene/) already has. Read `types.ts`, then
`createGame`, then `shot.ts` and `replay.ts`.
```sh
npm test         # from web/: aim, camera, pace, replay, probes and audit have unit tests
npm run smoke    # a hole played and holed in a headless Chrome (a local chain and the dev server running)
```
