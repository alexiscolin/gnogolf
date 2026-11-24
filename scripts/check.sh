#!/bin/sh
# check.sh [--smoke]: everything that must pass before a commit or a deploy,
# the quick checks first. The client's types (its tests', the scripts' and
# media's too), lint, the realm sync check, the gnome catalogue and looks;
# then the Gno packages' tests with the onyx toolchain (their gas and storage
# goldens included), the course holes' fingerprints, the deployed packages
# staged as addpkg takes them (stage.sh: at the deploy's paths, the repo's
# files byte for byte, linted), the gnomes' portrait art (art.gno, as the
# client's gnome traces it; headless Chrome), and the aim preview's wasm
# (wasm.sh --check: the build of these sources, bit for bit, and the realm's
# answers on the whole course, byte for byte; TinyGo and binaryen's wasm-opt
# needed); then the unit tests with their coverage floor, and with --smoke
# the end-to-end run against a local chain and dev server. Stops at the
# first failure. This is also what a CI would run.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)

cd "$root/web"
echo "== typecheck: the client, its tests, the scripts, media"
npx tsc --noEmit
npx tsc --noEmit -p test
npx tsc --noEmit -p ../scripts
npx tsc --noEmit -p ../media
echo "== lint" && npm run -s lint
echo "== selfcheck" && npm run -s selfcheck
echo "== the gnome catalogue: data/gnomes.json as data/gnomes/ makes it, every rule held" && npm run -s gnomes -- --check
echo "== the realm's rows: each series' as the catalogue makes them, each row's tier its traits'" && npm run -s gnomes:rows -- --check
echo "== the gnomes' golden looks: every one drawn as it was" && npm run -s gnomes:looks

# The onyx toolchain: GNO_TOOLCHAIN is the folder of the gno, gnokey and
# gnodev built from a gno checkout at the tag chain/onyx, each finding its
# GNOROOT (that checkout) by itself; GNO is the gno binary alone. Without it
# the check fails: SKIP_GNO=1 checks the client alone, and says so.
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
skipped=""
if [ "${SKIP_GNO:-}" = 1 ]; then
	skipped=" (the Gno tests skipped: SKIP_GNO=1)"
	echo "check.sh: SKIP_GNO=1: the Gno tests are skipped" >&2
elif [ -x "$GNO" ]; then
	echo "== gno test (onyx toolchain)"
	(cd "$root" && GNOHOME=$toolchain/gnohome "$GNO" test ./gno.land/p/gnogolf/... ./gno.land/r/gnogolf/golf/... ./gno.land/r/gnogolf/store ./gno.land/r/gnogolf/gnomes)
	echo "== the holes' fingerprints, and data/holes.txt (what publishdata.sh publishes) their data"
	GNO=$GNO GNOHOME=$toolchain/gnohome "$root/scripts/holedata.sh" --check
	echo "== the staged packages: the repo's, byte for byte, and linted"
	stage=$(mktemp -d)
	trap 'rm -rf "$stage"' EXIT
	GNO=$GNO "$root/scripts/stage.sh" nym-stagecheck000 "$stage" # any name will do
	MAINNET=1 GNO=$GNO "$root/scripts/stage.sh" nym-stagecheck000 "$stage" # without v1, nor the import of its records
	# the gnomes' portrait art: art.gno, what media/gnomes/portrait/build.mjs
	# traces from the client's gnome (headless Chrome; CHROME, see
	# media/lib/cdp.mjs), byte for byte
	echo "== the gnomes' portrait art: art.gno, as the client's gnome traces it"
	node "$root/media/gnomes/portrait/build.mjs" --check
	echo "== the aim preview's wasm: the build of these sources, answering as the realm, byte for byte"
	GNO=$GNO "$root/scripts/wasm.sh" --check
	# the holes' par plans: the solver's, kept out of the public repo
	[ -f "$root/private/botcheck/hole-bests.json" ] || skipped="$skipped (the wasm parity: random shots only, no par plans)"
else
	echo "check.sh: no onyx gno at $GNO. Build the toolchain there (the README, \"Run it\"), or set GNO_TOOLCHAIN (or GNO) to one; SKIP_GNO=1 checks the client alone." >&2
	exit 1
fi

echo "== unit tests" && npm test --silent
# the bot check's scoring: its rules are the private notes' (private/, beside the code), when checked out
if [ -f ../private/botcheck/score.test.ts ]; then
	echo "== the bot check: its types and its scoring" && npx tsc --noEmit -p ../private/botcheck/tsconfig.json
	node --experimental-strip-types --disable-warning=ExperimentalWarning --test ../private/botcheck/score.test.ts
fi
if [ "${1:-}" = "--smoke" ]; then echo "== smoke" && npm run -s smoke; fi
echo "all checks passed$skipped"
