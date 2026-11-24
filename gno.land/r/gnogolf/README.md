# The realms

What Gnogolf keeps on chain, and the source of each of the 90 course holes.

| | |
|---|---|
| [`golf/v2/`](golf/v2/) | the rules: holes, rounds, previews, boards, the gnoweb page ([its API](../../../docs/golf.md)) |
| [`store/`](store/) | the records, apart from the rules, so that new rules take them on |
| [`gnomes/`](gnomes/) | the gnome collection: the catalogue, the sale, the earned ones ([its design](../../../docs/specs/gnomes-realm.md)) |
| [`golf/`](golf/) | v1, the rules before: on onyx, its records copied into v2 |
| `hole<n>` (the Garden), `island<n>`, `town<n>`, `mountain<n>`, `mines<n>` | a course hole each, 18 a cup |

A hole is not deployed: `scripts/holedata.sh` encodes the 90 into
[data/holes.txt](../../../data/holes.txt), which the owner publishes
([ADR-002](../../../adr/adr-002-holes-as-data.md)). A realm is deployed with
every file of its folder but its tests: keep a README out of it.

Start with `golf/v2/golf.gno`, from its package comment down. A realm's
`z_*_filetest.gno` hold its gas and storage goldens. From the repo's root
([the toolchain](../../../docs/development.md#the-toolchain)):
```sh
t=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNOHOME=$t/gnohome $t/gno test ./gno.land/r/gnogolf/store   # one realm
scripts/holedata.sh   # after a change to a hole: data/holes.txt, made again
```
