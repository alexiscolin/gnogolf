# scene: the picture

three.js, and none of the game's rules: a hole's state goes in (the chain's
JSON, [CLIENT.md](../../../CLIENT.md#drawing-a-hole)), meshes come out.

| | |
|---|---|
| `course.ts` | `buildHole`: the board, the lane and its pieces. The way in. |
| `pieces.ts` `props.ts` `zones.ts` | what stands on the lane, by the skin the chain names |
| `worlds.ts` | the contract a world fills, and the worlds' loader |
| `garden.ts` `island.ts` `town.ts` `mountain.ts` `mines.ts` | one world each: what stands round the board; a world's parts beside it, flat, by prefix (`mines-*.ts`) |
| `studio.ts` `rigs.ts` `materials.ts` `bake.ts` | the renderer and its light, where the camera stands, the shared materials, the merge |
| `weather.ts` `cause.ts` `fx.ts` `sight.ts` | the weather drawn, why the ball does what it does, the aim's dots and the confetti |
| `gnome.ts` `gnome-*.ts` | the gnome, and the collection's wardrobe |
| `title.ts` `titlebake.ts` `*-showcase.ts` | the title's splash, and the stages the media scripts take their pictures on |
| `data.ts` `state.ts` `census.ts` `common.ts` | the shapes and the helpers they share |

Read `worlds.ts` first (the contract), then `buildHole`, then `garden.ts`.
Only the garden is in the first load: a world's files are named `<world>.ts`
and `<world>-<part>.ts`, and `../../test/bundle.test.ts` holds them out of it.

```sh
npm run scene:looks              # from web/: each hole and piece built as data/scene.golden.json has it
npm run scene:looks -- --write   # after a change that is meant
```
