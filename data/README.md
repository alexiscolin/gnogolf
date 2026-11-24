# data

The course and the gnome collection as data. But for the collection's
source, each file is made by a script and held by a check: change what it
is made from, run the script, commit both.

| | | made by |
|---|---|---|
| `holes.txt` | the 90 course holes as GG1, a line each: slot, package, hash, data | `scripts/holedata.sh`, from the holes' sources in `gno.land/r/gnogolf/` |
| `gnomes/series.json` `gnomes/genesis/` | the collection's source: its series, their archetypes, Epics and Legendaries | hand |
| `gnomes.json` | the catalogue: every gnome, with his traits | `scripts/gnomes.ts`, from `gnomes/` |
| `gnomes/rows/` | the rows the gnomes realm is given, a file a series | `scripts/gnomerows.ts`, from `gnomes.json` |
| `gnomes/looks.golden.json` | what each gnome is drawn as | `scripts/gnomelooks.ts`, from the client's gnome |
| `scene.golden.json` | a hash of what the scene builds for each hole and palette piece | `scripts/scenelooks.ts`, from the client's scene |

`scripts/publishdata.sh` publishes `holes.txt`. The checks, which `scripts/check.sh` runs too:
```sh
scripts/holedata.sh --check   # needs the onyx toolchain
cd web && npm run gnomes -- --check && npm run gnomes:rows -- --check && npm run gnomes:looks && npm run scene:looks
```

The formats: GG1 in [docs/course.md](../docs/course.md#holes-as-data-gg1), a
gnome's traits in [docs/gnomes/design.md](../docs/gnomes/design.md). Why data:
[ADR-002](../adr/adr-002-holes-as-data.md), [ADR-008](../adr/adr-008-gnome-catalogue.md).
