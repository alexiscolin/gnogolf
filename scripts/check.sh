#!/bin/sh
# check.sh [--smoke]: everything that must pass before a commit or a deploy,
# the quick checks first. It stops at the first failure. A CI would run the same.
#
#   the client  types, lint, selfcheck, the gnome catalogue and looks, the scene's golden builds
#   Gno         the packages' tests, the holes' fingerprints, the staged packages (stage.sh),
#               the gnomes' portrait art (headless Chrome), the aim preview's wasm (TinyGo, wasm-opt)
#   the tests   the unit tests, with their coverage floor
#   --smoke     then the end-to-end run against a local chain and dev server
#
# Env: GNO_TOOLCHAIN, GNO, SKIP_GNO (below). What it needs: docs/development.md.
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
echo "== the scene's golden: every course hole, stroke and palette piece built as it was" && npm run -s scene:looks

# GNO_TOOLCHAIN is the folder of the onyx gno, gnokey and gnodev, built from a
# gno checkout at the tag chain/onyx. GNO is the gno binary alone. Without one
# the check fails; SKIP_GNO=1 checks the client alone, and says so.
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
	# headless Chrome (CHROME: see media/lib/cdp.mjs)
	echo "== the gnomes' portrait art: art.gno, as the client's gnome traces it"
	node "$root/media/gnomes/portrait/build.mjs" --check
	echo "== the aim preview's wasm: the build of these sources, answering as the realm, byte for byte"
	GNO=$GNO "$root/scripts/wasm.sh" --check
	# the holes' par plans: the solver's, kept out of the public repo
	[ -f "$root/private/botcheck/hole-bests.json" ] || skipped="$skipped (the wasm parity: random shots only, no par plans)"
else
	echo "check.sh: no onyx gno at $GNO. Build the toolchain there (docs/development.md, \"The toolchain\"), or set GNO_TOOLCHAIN (or GNO) to one; SKIP_GNO=1 checks the client alone." >&2
	exit 1
fi

echo "== unit tests" && npm test --silent
# the bot check's scoring, when private/ is checked out
if [ -f ../private/botcheck/score.test.ts ]; then
	echo "== the bot check: its types and its scoring" && npx tsc --noEmit -p ../private/botcheck/tsconfig.json
	node --experimental-strip-types --disable-warning=ExperimentalWarning --test ../private/botcheck/score.test.ts
fi
if [ "${1:-}" = "--smoke" ]; then echo "== smoke" && npm run -s smoke; fi
echo "all checks passed$skipped"
