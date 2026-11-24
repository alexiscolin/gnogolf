# The packages

Pure Gno packages, without state: the realms in
[`gno.land/r/gnogolf/`](../../r/gnogolf/) import them, and any other Gno game can.

| | |
|---|---|
| [`physics/`](physics/) | the 2D rolling-ball engine: a `Field` of walls, posts and zones, and `Step`, which rolls one shot |
| [`physics/build/`](physics/build/) | what a hole's source is written with: a box, a bar, an outline, curves |
| [`course/`](course/) | what golf and a hole agree on: a hole as data (`Simple`, GG1), its weather, a stroke launched and holed |
| [`course/author/`](course/author/) | `Fit` and `Diff`: a hole's board sized to its walls, a hole compared with its data |
| [`course/fingerprint/`](course/fingerprint/) | a hole's shots hashed to one string, which each hole's test pins |
| [`weblink/`](weblink/) | the rule a link set by a realm's owner must follow |
| [`jsonq/`](jsonq/) | a string quoted as JSON |

Start with `physics/step.gno`, then `course/course.gno`; their contracts are
[docs/physics.md](../../../docs/physics.md) and [docs/course.md](../../../docs/course.md).
`physics`, `course`, `weblink` and `jsonq` are deployed with every file of
their folder but the tests (`scripts/stage.sh`): keep a README out of them.

The tests, from the repo's root ([the toolchain](../../../docs/development.md#the-toolchain)):
```sh
t=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNOHOME=$t/gnohome $t/gno test ./gno.land/p/gnogolf/...
```
