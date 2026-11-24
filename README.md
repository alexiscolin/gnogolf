![Gnogolf: 3D mini-golf on gno.land](docs/img/banner.png)

# Gnogolf

3D mini-golf where the chain rolls the ball. You pull back, you let go, and a
realm on [gno.land](https://gno.land) plays the shot. There is no game
server, and no way to fake a score.

**[Play at gnogolf.xyz](https://gnogolf.xyz).** It's free and you don't need
a wallet. [The pitch, in one page](docs/pitch.md).

## The game

- **Five cups, 90 holes.** Garden, Island, Mushroom Town and Mountain, then
  the Crystal Mines, the expert cup. Windmills, trams, a volcano, and pieces
  you have to time.
- **Weather.** Wind, rain, fog, storm, snow. It turns every five minutes of
  chain time and is the same for everyone, so a hole you know by heart plays
  differently in a storm.
- **Ghost duels.** Every best round on the boards is a ghost you can race,
  stroke for stroke: a rival picked for the day, a player at your level, a
  friend, or yourself. It's their real round, replayed by the chain.
- **Boards.** One per hole, and a ranking over the whole course. They list
  players with a gno.land name, which you can take without leaving the game.
  A bot check keeps machine-made rounds off them
  ([docs/leaderboards.md](docs/leaderboards.md)).
- **Dares.** A saved round gives you a link: whoever opens it races your
  ghost.
- **Gnomes and badges** to unlock as you play.

Still behind a switch, and in this repo: the **Builder** (draw a hole, hole
it in every weather that moves the ball, publish it, own it) and the **gnome
collection** (720 gnomes to buy or to earn).

## How it works

The client never sends "I scored 2". It sends what you decided (an angle, a
power, the moment you let go) and the `golf` realm rolls the ball with its
own physics. A round on the boards is the chain's replay of your shots, and
anyone can replay it again.

- Playing costs nothing: a shot's preview is a read-only query.
- Keeping a score is one transaction a hole (more for a long round), signed
  with [Adena](https://www.adena.app/) or pasted to `gnokey`. The chain keeps
  only your best, so the storage deposit is paid once per hole: about 0.29
  GNOT for your first, about 0.10 for each one after, plus about 0.05 of fees
  a transaction.
- The page runs the realm's own code, built to wasm, to draw the aim line
  and set the ball off the moment you let go. It checks its sources against
  the chain's first, and every answer after.
- A hole is data on the chain, not code. You can read one on gnoweb before
  you play it.
- Visits are counted anonymously, and About turns that off in one click
  ([docs/analytics.md](docs/analytics.md)).

## Run it

You need Go, Node 22.6 or later, and a
[gnolang/gno](https://github.com/gnolang/gno) checkout next to this repo. The
game runs on onyx (`onyx-1`, mainnet's code), so the tools are built from the
tag `chain/onyx`, into the folder the scripts look in:

```sh
t=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
git -C ../gno worktree add ../gno-onyx chain/onyx
(cd ../gno-onyx/gnovm && go build -o $t/gno ./cmd/gno)
(cd ../gno-onyx/gno.land && go build -o $t/gnokey ./cmd/gnokey)
(cd ../gno-onyx/contribs/gnodev && go build -o $t/gnodev .)
(cd web && npm ci)
```

### Everything, in one command

```sh
scripts/try-local.sh
```

A local chain with the 90 holes, the gnome shop and the Builder, two
throwaway wallets, and the site built with every switch on. It prints the
links and what to try; `TAILNET=0` keeps it on this machine.
[docs/try-local.md](docs/try-local.md) has the rest.

### By hand

**The chain**, from this repo's root:

```sh
export PATH=$t:$PATH
gnodev local -empty-blocks -empty-blocks-interval 5
```

gnoweb is on `http://127.0.0.1:8888` and the RPC on `http://127.0.0.1:26657`,
where the client looks. Three things we learned the hard way:

- **Keep `-empty-blocks`.** Without it gnodev only makes a block when a
  transaction arrives, so its clock stops, and every new round looks like its
  weather is already over.
- **Keep port 26657.** Adena's built-in `dev` network points there, and it
  won't add a second one.
- **Open `http://127.0.0.1:8888/r/sys/namereg/v0` once.** gnodev loads
  packages lazily, and taking a name straight after a restart fails until the
  registrar is loaded.

**The holes.** The course is data (`data/holes.txt`) and only golf's owner
publishes it. Under gnodev that's `test1`, which your gnokey needs once
(`gnokey add test1 --recover`, with the mnemonic gnodev prints):

```sh
scripts/publishdata.sh test1   # skips the slots already up to date
```

To save a round from the game, fund your Adena account from `test1` with
`gnokey maketx send`.

**The client.**

```sh
cd web
npm run dev     # the game on http://localhost:3000
npm run build   # a static site in web/out
```

A build for a public host needs `NEXT_PUBLIC_REALM`, `NEXT_PUBLIC_RPC`,
`NEXT_PUBLIC_WEB` and `NEXT_PUBLIC_NETWORK` (`netlify.toml` lists them).
Without them the site plays a chain on the visitor's own machine.

## Dev mode

`npm run dev` answers to things the public site never does. They all travel
in the URL.

| In the URL | What it does |
|---|---|
| `?hole=garden/7`, `?cup=garden&hole=7` | opens a hole (any build) |
| `?screen=cups` | straight to the cups; also `modes`, `rival`, `pick` (any build) |
| `?rpc=`, `?web=` | another node, another gnoweb (a dev or local build) |
| `?play` | skips the title |
| `?shot=angle,power` | fires a shot on load: how the smoke test and the screenshots are taken |
| `?demo=angle,power;angle,power` | plays these shots once the game starts |
| `?weather=wind,rain,fog,storm` | shows that forecast without asking the chain |
| `?world=island` | dresses the hole in another world's look |
| `?traits=<hex>`, `?rivaltraits=<hex>` | plays as a collection gnome, dresses every ghost in one |
| `?clips` | offers a clip of the holing shot |
| `/g/?geo=blocked` | the shop as a blocked region sees it |

The switches of a build, set in the environment (`web/.env.example`):

- `NEXT_PUBLIC_BUILDER=1`: the Builder, at `/build` on a computer.
- `NEXT_PUBLIC_GNOMES=1`: the gnome shop, at `/g`.
- `NEXT_PUBLIC_COMMUNITY=1`: the community's holes beside the cups.
- `NEXT_PUBLIC_CLIPS=1`: a clip of the holing shot on the finished card.
- `NEXT_PUBLIC_TEST_HOOKS=1`: the hooks above in a production build served
  locally, on a page opened with `?camlog`.
- `NEXT_PUBLIC_POSTHOG_KEY`: the audience measurement. Unset, nothing loads.

## Checks

```sh
scripts/check.sh              # everything that must pass before a commit
SKIP_GNO=1 scripts/check.sh   # the client alone
scripts/check.sh --smoke      # then a played round, on a local chain and npm run dev
```

`check.sh` runs the Gno tests with their gas and storage goldens, the holes'
fingerprints, the packages staged as a deploy takes them, the gnomes'
portraits and catalogue, the wasm against the realm byte for byte, then the
types, the linter, and the unit tests with their coverage floor. Besides the
toolchain it needs TinyGo 0.42.0
(`brew install tinygo-org/tools/tinygo`, with binaryen's `wasm-opt`) and
Chrome (`CHROME` says where).

After changing the physics, the course or the golf realm's simulation,
rebuild the wasm with `npm run wasm` and commit it: `check.sh` fails until
you do.

## Writing a hole

A hole is geometry: a `course.Simple`, encoded as data and published with
`golf.PublishMine(slug, hexData, note)` once the owner opens publishing
(closed at launch, until the Builder). It becomes a community hole: playable,
with a board of its own, in no cup and not in the rankings.

```go
var me = &course.Simple{
	World: "garden", Order: 21,
	W: 40, H: 12, // the board: 1 to 96 a side
	Title:     "First Hole",
	Strokes:   3, // par
	Tee:       physics.V(4, 6),
	Pin:       physics.V(35, 6),
	Substeps:  24,
	CupRadius: 1.2,

	Course: &physics.Field{
		Walls: build.Walls(
			build.Box(physics.V(0, 0), physics.V(40, 12)),
			build.Bar(physics.V(20, 0), physics.V(20, 7), 0.8, '=', "hedge"),
		),
		Posts: []physics.Post{
			{Circle: physics.Circle{C: physics.V(28, 4), R: 1.0}, Bounce: 1.2, Skin: "bumper"},
		},
		Zones: []physics.Zone{
			{Kind: physics.Surface, Min: physics.V(10, 8), Max: physics.V(16, 12), Scale: 0.55, Skin: "sand"},
		},
		Friction: 0.86,
		Bounce:   0.85,
		Radius:   0.5,
	},
}

var hexData = hex.EncodeToString([]byte(course.Encode(me)))
```

Its id is `<your address>/<slug>/v1`, and only you can add versions to it. A
`Skin` is a hint: a client that doesn't know `"hedge"` draws a plain wall.
The course's own holes, in `gno.land/r/gnogolf/`, are the best examples, and
[docs/course.md](docs/course.md) is the contract.

Or draw it in the Builder: a palette of each world's pieces, a board where
nothing the chain would refuse can be placed, the hole in 3D as players will
see it, and the chain's own checks run in the page. It has you hole it in
each weather that moves the ball before it publishes, the cost shown first.

## Who can change what

The golf realm has one role, its owner. The owner publishes the course's
holes and their new versions (an old version stays playable, with its
records), opens or closes community publishing, can hide a community hole
from the lists for abuse, and can hand the role on or give it up for good.

The owner can't edit or delete a hole, a round or a score, and can't touch
the weather or the physics. The records live in a realm of their own,
`store`: new rules take over three days after their code is on chain, where
anyone can read it first. [The details](docs/golf.md#who-can-change-what).

## Repo layout

```
gno.land/p/gnogolf/physics   the 2D rolling-ball engine
gno.land/p/gnogolf/course    the hole contract and the weather
gno.land/p/gnogolf/weblink   the rule an owner's link follows
gno.land/p/gnogolf/jsonq     a string quoted as JSON
gno.land/r/gnogolf/store     the records: holes, rounds, bests, boards
gno.land/r/gnogolf/golf/v2   the rules: rounds, previews, boards, the gnoweb page
gno.land/r/gnogolf/golf      v1, the rules before: on onyx, its records copied into v2
gno.land/r/gnogolf/gnomes    the gnome collection: the catalogue, the sale, the earned ones
gno.land/r/gnogolf/<hole>    each course hole's source
web/                         the client: Next.js and three.js, a static export
web/lib/engine, web/lib/scene   the game and its 3D, plain TypeScript, no React
web/lib/builder              the Builder: the palette, the draft, the checks, test mode, publishing
web/lib/sim                  golf.wasm (the aim line) and builder.wasm (the Builder's checks)
web/lib/gnomes               the gnomes: the catalogue, the looks, the shop
scripts/                     checks, deploys, the local playground, the end-to-end runs
media/                       the trailer, the share pictures, the gnomes' portraits
data/                        the course and the gnome catalogue, as data
```

On a chain the packages sit under their owner's name: `p/<ns>/gnogolf/…` and
`r/<ns>/gnogolf/…`. `scripts/stage.sh <ns> <out>` stages them so
(`MAINNET=1` leaves out v1 and the import of its records).

## Docs

- [docs/pitch.md](docs/pitch.md): the game in one page, to share.
- [CLIENT.md](CLIENT.md): how to write a client.
- [docs/golf.md](docs/golf.md): the realm's API, and how it's updated after the deploy.
- [docs/physics.md](docs/physics.md): the physics, usable by other Gno games.
- [docs/course.md](docs/course.md): the hole contract, timed pieces, weather.
- [docs/leaderboards.md](docs/leaderboards.md): the boards, the ghost duels, the bot check.
- [docs/gnomes/design.md](docs/gnomes/design.md): the rules every gnome is made to.
- [docs/analytics.md](docs/analytics.md): the anonymous audience measurement.
- [docs/try-local.md](docs/try-local.md): the whole game on this machine.
- [adr/](adr/): the architecture decisions.
