# Writing a client

The realm is the game. A client draws it and submits shots; it never decides
what a shot does. The full API is in [docs/golf.md](docs/golf.md); this page
is what a client needs of it, and the rules it must keep.

A working client lives in `web/`: Next.js, a static export of plain files
with no server side, talking to a gno node over HTTP (
[docs/development.md](docs/development.md#by-hand) says how to run and build it, and what a build
for a public host needs). Everything under `web/lib` is plain TypeScript that
knows nothing about React (the game: `lib/engine.ts`, `lib/scene.ts`,
`lib/chain.ts`); the realm's answers are typed in `lib/types.ts` and checked
in `lib/chain.ts`. Swapping the framework means rewriting the HUD, never the
game.

The golf realm is `gno.land/r/<ns>/gnogolf/golf/v2` on a chain (`<ns>`: the
deploy's namespace, `nym-alexiscolin000` on onyx) and
`gno.land/r/gnogolf/golf/v2` on a local gnodev; the web client takes it at
build time (`NEXT_PUBLIC_REALM`).

## Four rules

1. **Never reimplement the shot played.** The chain returns the ball's whole
   path; the client replays it. The realm's own code built to wasm may answer
   in the page (see `SimulateFrom` below); a reimplementation may not:
   matching float64 GnoVM semantics by hand, the ball would eventually land
   somewhere on screen that the chain disagrees with. This is the one rule
   that, if broken, breaks everything else quietly.
2. **Skin is a hint, geometry is the contract.** Draw any hole from its shapes
   alone and treat an unknown skin as the plain form — an unrecognised wall is a
   wall, a post is a post, a zone is a tinted area. An author ships
   `"giant skull"` today, an artist adds the mesh next month, nothing breaks in
   between. What a zone *does* is in its fields (`kind`, `air`, `capped`),
   never in its skin. And look a skin up as a key of your own tables only
   (`Object.hasOwn`, the web client's `own()`): a skin is any string an
   author wrote, and `table["constructor"]` would answer with
   `Object.prototype`'s.
3. **Two points far apart in a path mean a tunnel.** The ball is somewhere else.
   Do not interpolate across the gap; cut, or play a pipe animation.
   **`"air"` says where the ball is off the ground**: a string with one `0`/`1`
   per path point. A fast ball that goes over the top of a slope takes off —
   further the faster it is and the steeper the hill — and in the air it flies
   over water, sand and tunnel mouths, and cannot drop into the cup; walls still
   stop it. Draw a jump only where `air` says so.
4. **Preview is free, committing is not.** Every `Simulate*` read costs
   nothing and needs no wallet. Only the writes (`PlayRound*`, `Launch`,
   `Reset`, `Claim`) are transactions.

## Hole ids

A hole is read by its id or its alias, and written by its exact id
([golf.md](docs/golf.md#ids)): `garden/7/v2` is a version of the slot
`garden/7`, `g1…/my-hole/v1` a version of someone's own hole `g1…/my-hole`.
Write with the `"hole"` that `HoleState` returned (or the `"id"` in
`Holes()`): a write given an alias panics, so shots aimed at one version can
never be replayed on another. A version with a non-empty `"next"` is
archived: still playable, its records kept, but out of the course ranking.

Old links and saved scores may still carry the 74 realms the course once
was (`gno.land/r/gnogolf/hole1` and so on). `data/holes.txt` maps each slot
to the realm its data was built from (`garden/17` was `hole19`: a hole's old
number isn't its order), and the web client rewrites old paths to slots
(`lib/card.ts`).

## The reads

All are `vm/qeval` ABCI queries: plain HTTP GET, no wallet, no gas.

```
GET <rpc>/abci_query?path="vm/qeval"&data=0x<hex of "<pkgpath>.<expression>">
```

The expression syntax is `<pkgpath>.<call>` — a dot, not a newline. The reply
carries a base64 Gno-typed result that has to be unwrapped twice:

```js
const call = `gno.land/r/gnogolf/golf/v2.SimulateRound("garden/2", "0,6")`
const hex  = [...new TextEncoder().encode(call)]
               .map(b => b.toString(16).padStart(2, "0")).join("")
const res  = await fetch(`${rpc}/abci_query?path=%22vm/qeval%22&data=0x${hex}`)
const raw  = atob((await res.json()).result.response.ResponseBase.Data)
//  raw === '("{\\"version\\":1,\\"holed\\":false,…}" string)'
const json = JSON.parse(JSON.parse(raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(" string)"))))
```

`@gnolang/tm2-js-client` and `gno-js-client` wrap this; Adena is built on them.
The raw form above is here so the contract does not depend on a library version.
Each answer's JSON is in [golf.md](docs/golf.md#reads).

### Which reads to use

| To | Read |
|---|---|
| build a menu | `Holes()` (the course first, at most 120; a `"successor"` is the realm the course moved to: offer to go there), then `Community(after, limit)` for the rest |
| pick a hole of the day, the same for everyone all day | `DayCandidates(after, limit)` from a point in alias order the day picks, round to it: those with a `born` block before the day began |
| draw a hole and aim | `HoleState(hole)`: the geometry, weather and wear, without the rounds |
| preview the first stroke | `SimulateRoundAt(hole, shots, period)`, from the tee exactly |
| preview any later stroke | `SimulateFrom(hole, x, y, shot, stroke, period)` from the last `"rest"` |
| check a commit before signing | `SimulateCommit(hole, x, y, stroke, shots, period)` |
| read back a round under way | `Round(hole, player)` (`null` once holed: a holed round is not kept, its best is, read with `Ghost`) |
| a player's place | `Rank(mode, player)` on the course, `HoleRank(hole, mode, player)` on a hole, not the whole `Players` list |
| the boards | `Leaderboard(mode)` for a top ten, `CourseLeaderboard(mode, offset, limit)` and `HoleLeaderboard(hole, mode, offset, limit)` a page at a time, `Bests`, `Standings` |
| check an old recorded round | `SimulateRoundIn(hole, shots, period)`, in its own weather however old |
| list a player's ghosts (the holes they have a best on) | `BestOf(hole, mode, player)` over the holes, both modes (the web client asks them all in one `qeval`) |
| race a player's best (a duel's ghost) | `Ghost(hole, mode, player)`, then its strokes: the first with `SimulateRoundIn`, each later one with `SimulateFrom` from the `"rest"` before, in its `"period"` |
| rank rounds saved before a name | the write `Claim()`, best sent with the name's `Register` in one transaction |

### Drawing a hole

`HoleState(hole)` is everything to draw
([its shape](docs/golf.md#holestatehole-string-string)):

- **The cup and the ball.** `cupR` is the radius a ball holes in (1.2 on the
  four cups, 1.1 and 1.0 on the Crystal Mines' later holes): draw the cup
  that size. `ballR` is the ball's (0.5 on every course hole): its centre
  stays that far from walls and posts, so a ball drawn that size touches
  walls instead of sinking into them.
- **The board.** `board` is the hole's own size, up to 96 a side. A hole need
  not be a rectangle: whatever its walls fence off is ground the ball never
  reaches (the web client flood-fills from the tee to find the green, and
  draws the rest as garden).
- **Zones.** `zones[].vec` means a different thing per kind
  ([physics.md](docs/physics.md#zone)): a slope's push, a tunnel's
  destination, where a loop's track comes back down; a `surface` uses
  `scale`, a friction multiplier, and a `hazard` sends the ball back to where
  the stroke was played from (the path's first point). Polygon zones add
  `"poly"` and `"outside"` (the zone is everything in its box *but* the
  polygon: the sea around a lane with no rails).
- **`air` and `capped`** appear on a zone only when true. `air` is a slope
  that is moving air, not ground (a cannon's gust): draw it as air whatever
  its skin, and never as a hill. `capped` air never speeds the ball up, it
  only bends and brakes it. The weather's zones never carry the two flags:
  the wind is always both.
- **Pieces that come and go.** Timed walls and zones add `"every"`, `"on"`
  and `"phase"` (see Timing below). A `timed` hole also changes with the
  stroke: a gate shuts every other stroke, a mole pops up one stroke in
  three. `Extras(hole, stroke)` returns the walls, posts and zones it adds at
  stroke N (0 = the first shot): draw them over the hole's own and read them
  again after every shot. The clock is the stroke number in the player's own
  round, so a preview and a record always meet the same course.
- **Wear** is one counter per cell, 16×8 stretched over the board: how many
  balls came to rest there. It is the only thing that changes on its own,
  and it is the theme's to interpret: a worn track in grass, a glowing
  trace, cracks, polish. Map the number to intensity and stay out of the way.

`official` says the hole is one of the course's (cups, numbers, rankings);
anyone else's hole is a community hole.

### `SimulateRoundAt(hole, shots, period)`: the first stroke, the way a record will

`shots` is `"angle,power;angle,power;…"`: the angle in degrees (0 = +X,
90 = +Y), the power above 0 and up to 10, both in steps of 0.01
([golf.md](docs/golf.md#units-and-formats): a finer one panics). The chain
replays them from the tee, read-only, and returns the last shot's path plus
`strokes`, `holed` and `period`. `SimulateRound(hole, shots)` is the same in
the current weather. Replaying the decisions is what keeps the free game and
a recorded one identical — `PlayRoundAt` with the same string records
exactly what was shown. Format each number the same way on both calls (the
web client uses `toFixed(4)`).

### `SimulateFrom(hole, ballX, ballY, shot, stroke, period)`: one stroke, from an exact ball

The same stroke `PlayRoundAt` would play, for one shot's gas instead of the
whole round's. `ballX, ballY` is the `"rest"` of the previous answer (`Round`,
`SimulateRound*`, `SimulateFrom`, `SimulateCommit`), passed exactly as it came
(it is the shortest decimal that reads back as the same float64); `shot` is
`"angle,power,tick"`; `stroke` is the stroke number (0 = the first). The
rounded `ball` and path points are for drawing only: after a bounce or two a
rounding error is a different ball. The web client asks the first stroke with
`SimulateRound*` (the tee exactly) and every later one with `SimulateFrom`.

Its assisted aim previews are these two reads worked out in the page itself:
`web/lib/sim/golf.wasm`, the realm's own code built from its `.gno` files
(`scripts/wasm.sh`), which answers byte for byte as the realm does
(`scripts/wasmparity.ts` plays the whole course through both). It is used only
once the realm's deployed files are the ones it was built from, and every
answer the chain gives the aim (the hand at rest, the shot let go) is checked
against it: one difference, and the previews are the chain's again for the
visit. The shot let go sets off on the page's answer, in either mode, with the
chain asked at the same time; its answer, checked while the ball rolls, is the
shot (a difference plays the stroke again as the chain has it), and a saved
round is replayed on the chain in any case.

### `SimulateCommit(hole, ballX, ballY, stroke, shots, period)`: check a commit

What the next `PlayRoundAt` or `PlayRoundPro` of `shots` would do, from the
exact ball at stroke number `stroke`. It refuses what that commit would
refuse, so a client can check every commit of a long round before it signs
any. A heavy hole can't replay 12 full shots in one transaction: a list over
its work budget is refused with `commit the first N, then the rest`. Record
such a round in several transactions (the first with `Reset` if a round is
under way), each continuing the round.

### Weather

Every hole has a weather, the same for every player, that turns every 5
minutes of chain time (`Period()`: the block time over 300). It is seeded by
the version's id, so a new version of a slot has weather of its own
([course.md](docs/course.md#weather) has the climates and what each kind
lays on the board). It comes as zones that a client draws and the chain
plays under, like the hole's own: `HoleState`'s `"weather"` for the current
period (its `kind` is `""` when it is clear), `Weather(hole, period)` for any
period that has come. A round is played in one weather, from its first stroke
to the cup:

- Record with `PlayRoundAt(cur, hole, shots, period)`, passing the period the
  round was previewed in. A first stroke takes the current period or the one
  before, so a round played across the turn records exactly what was shown.
- A round under way keeps its first stroke's period, and can be played on
  until the next period is over; after that it must be `Reset`.
- `SimulateRoundAt` and `SimulateCommit` refuse the periods the commit would
  refuse; `SimulateFrom` takes any period that has come.

### Timing: the third field of a shot

A shot is `"angle,power"` or `"angle,power,tick"`. The tick is where the timed
pieces were when the player let go: the tram, the mill's sails, the clock hand,
the planks, the lift, the storm's gusts. The stroke's field starts its clock
there, so a timed wall or zone stands in substep i when
`(i + tick + phase) % every < on` ([physics.md](docs/physics.md#timed-walls-and-zones)).
The chain clamps the tick to 0..1023, and a missing third field is tick 0.
Show the pieces moving at one substep per tick of your clock, and send the
tick at release. Rounds keep the decisions as played, in `"shots":"a,p,t;…"`.

## Animating a path

A stroke comes back as `path`, one point per substep; `air`, one `0`/`1` per
point; `cause`, one letter per point for what most acted on the ball in that
substep (`b` a bounce, `s` a hill, `w` wind or a gust, `i` a slippery
surface, `-` nothing but friction); `rest`, the exact resting point; `holed`
and `bounces`.

**A substep is a constant slice of time.** Play every segment over the same
duration (around 70 ms; the web client's is 72) and the ball slows down on
its own: on one surface, rolling resistance takes the same speed off every
substep (`Crr·G`, 0.224 on the usual green, see
[physics.md](docs/physics.md#the-model)), so the segments shrink evenly and
the last, slowest ones stutter most. Smooth the *timing* if it reads as a
stutter; never move a point. About 15 points at 70 ms is a second, some 60
frames.

Between two points the ball runs straight, except in a step where it hit
something (`cause` `b`): drawn as the chord, that step cuts the corner where
the ball bounced, looks slow, and makes the next one look fast. The web
client finds the corner from the walls and posts (`cornersOf` in
`lib/engine/replay.ts`).

- **Tunnels and hazards.** A substep is walked in moves of at most
  `physics.MaxMove` (1.5), so a fast ball meets every zone it crosses. A
  tunnel jump is recognised by where the step *lands* (the zone's `vec`), a
  hazard's by landing back on the path's first point, not by where it
  starts: a fast ball enters the zone after the last point it recorded
  outside it.
- **Loops.** A ball heading into a `loop` at its `scale` (a speed per
  substep) or faster is put at its `vec` with 0.8 of its speed: a jump. A
  slower one is put back just outside the edge it came in by, rolling back at
  half speed: a step ending inside the mouth, then one back out. One that
  comes in more than 25° off straight falls off the side and is put down at
  rest in front of the mouth.
- **The cup.** A ball drops in when it rolls over the cup slowly enough
  (`course.Capture`: 1.9 units per substep over the middle of a 1.2 cup,
  less nearer its rim), not only when it stops on it. The path is cut there
  and ends on the pin. Never while the ball is in the air.
- **A ball does not stop on a hill.** When a stroke's substeps run out with
  the ball on a slope steeper than its rolling resistance, it keeps rolling,
  up to `physics.MaxRollOn` (120) extra substeps, until it is off the slope.
  So a path can have more points than the hole's substeps: replay every
  point you are given, at the same pace.

## The writes

Every write is a `MsgCall` to the golf realm, signed by the wallet (Adena, or
a `gnokey maketx call` the player pastes), and takes the exact version id.
There is no `MsgRun`: onyx and mainnet restrict `maketx run` to one seeded
account.

- `PlayRoundAt(cur, hole, shots, period)` records assisted shots, continuing
  the caller's round under way, or starting one from the tee: a holed round
  is not kept (its best is), so a new one needs nothing first. It answers
  `"holed in N strokes"` when it holes, which the transaction's result
  carries. To record what `SimulateRoundAt` showed from the tee over a round
  left under way (`Round` is not `null`), send `Reset(cur, hole)` and
  `PlayRoundAt` in the same transaction.
- `PlayRoundPro(cur, hole, shots, period)` is the same for a round played
  without the aim preview. A round keeps the mode of its first stroke, and
  each mode (`"assisted"`, `"pro"`) has its own records and ranking.
- `Launch(cur, hole, angle, power)` is one shot, one transaction, always pro:
  it is how gnoweb plays.
- `Reset(cur, hole)` abandons a round under way: the ball goes back to the
  tee.
- `Claim(cur)` puts on the boards the rounds a player saved before taking a
  gno.land name.

`PublishMine` is how authors add holes of their own, and `Publish` is the
owner's; neither is a player's concern.

## Skin vocabulary

`hedge shelf gate mill` (walls) · `bumper` (post) · `sand slope tunnel water`
(zones), and many more, world by world: the web client's `lib/scene` is the
catalogue. Weather skins are `wind rain fog storm snow`. A theme pack is a
lookup table from these to meshes, not code. Anything else falls back to
rule 2.

## Coordinates

X right, Y **down**, in board units over the hole's own `board`, angles in
degrees at the realm boundary and radians inside the physics package. A
three.js scene will want Y flipped or the camera rotated; do it once, at the
edge.
