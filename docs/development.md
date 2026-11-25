# Developing Gnogolf

Everything a developer needs past the README: the toolchain, running the game
by hand, the dev mode, the checks, writing a hole, and where things live.

## The toolchain

You need Go, Node 22.15 or later, and a
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

`scripts/try-local.sh` then runs the whole game on this machine
([docs/try-local.md](try-local.md)).

## By hand

**The chain**, from the repo's root:

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

## Deploying the site

gnogolf.xyz is a Netlify site built from this repo: `netlify.toml` holds the
build (`web/`, `npm ci && npm run build`, publishes `web/out`), the redirects
and the headers. The `NEXT_PUBLIC_*` variables live in the site's settings
on Netlify, never in the repo; a build without them fails on purpose.

- With the repo linked (Site configuration → Build & deploy → Link
  repository), every push to `main` deploys and every pull request gets a
  preview link.
- Without it, from the repo's root, with the Netlify CLI logged in and the
  folder linked to the site once (`npx netlify-cli link`):

  ```sh
  npx netlify-cli deploy --build          # a draft URL, to try first
  npx netlify-cli deploy --build --prod   # gnogolf.xyz
  ```

Play a hole on the draft before going live: it runs against the real chain.

## Dev mode

What the URL opens. `npm run dev` answers to all of it; a row says when
another build does.

| In the URL | What it does |
|---|---|
| `?hole=garden/7`, `?cup=garden&hole=7` | opens a hole; with `&screen=pick`, its gnome picker (any build) |
| `?screen=cups` | straight to the cups; also `modes`, `rival`, `community` (any build) |
| `?rpc=`, `?web=` | another node, another gnoweb (a dev or local build): this machine's, or over https a `*.gno.land` host, the build's own or one in `NEXT_PUBLIC_ALLOWED_HOSTS` |
| `?play` | skips the title |
| `?shot=angle,power` | fires a shot on load |
| `?demo=angle,power;angle,power` | plays these shots once the game starts |
| `?weather=wind,rain,fog,storm` | shows that forecast without asking the chain |
| `?world=island` | dresses the hole in another world's look |
| `?traits=<hex>`, `?rivaltraits=<hex>` | plays as a collection gnome, dresses every ghost in one |
| `?clips` | offers a clip of the holing shot (`npm run dev` only) |
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
SKIP_GNO=1 scripts/check.sh   # the client alone, as the CI runs it
scripts/check.sh --smoke      # then a played round, on a local chain and npm run dev
```

`check.sh` runs the types and the linter, the Gno tests with their gas and
storage goldens, the holes' fingerprints, the packages staged as a deploy
takes them, the gnomes' portraits, catalogue and looks, the scene's builds
against their golden, the wasm against the realm byte for byte, and the unit
tests with their coverage floor. Besides the toolchain it needs TinyGo 0.42.0
(`brew install tinygo-org/tools/tinygo`, with binaryen's `wasm-opt`) and
Chrome (`CHROME` says where).

After changing the physics, the course or the golf realm's simulation,
rebuild the wasm with `npm run wasm` and commit it: `check.sh` fails until
you do. The end-to-end runs, each on a chain of its own:
`scripts/e2e-builder.sh` and `scripts/e2e-gnomes.sh`.

## Writing a hole

A hole is geometry: a `course.Simple`, encoded as data and published with
`golf.PublishMine(slug, hexData, note)` while the owner keeps publishing
open (it is, on onyx). It becomes a community hole: playable, with a board of
its own, in no cup and not in the rankings.

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
[course.md](course.md) is the contract. Or draw it in the Builder, which runs
the chain's own checks in the page and has you hole it in each weather that
moves the ball before it publishes.

## Who can change what

The golf realm has one role, its owner. The owner publishes the course's
holes and their new versions (an old version stays playable, with its
records), opens or closes community publishing, can hide a community hole
from the lists for abuse, and can hand the role on or give it up for good.

The owner can't edit or delete a hole, a round or a score, and can't touch
the weather or the physics. The records live in a realm of their own,
`store`: new rules take over three days after their code is on chain, where
anyone can read it first. [The details](golf.md#who-can-change-what).

## Where things live

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

## The other docs

- [CLIENT.md](../CLIENT.md): how to write a client.
- [golf.md](golf.md): the realm's API, and how it's updated after the deploy.
- [physics.md](physics.md): the physics, usable by other Gno games.
- [course.md](course.md): the hole contract, timed pieces, weather.
- [leaderboards.md](leaderboards.md): the boards, the ghost duels, the bot check.
- [gnomes/design.md](gnomes/design.md): the rules every gnome is made to.
- [analytics.md](analytics.md): the anonymous audience measurement.
- [try-local.md](try-local.md): the whole game on this machine.
- [specs/](specs/): the Builder's, the gnomes' and the interface's specs.
- [adr/](../adr/): the architecture decisions.
