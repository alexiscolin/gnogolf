#!/bin/sh
# wasm.sh [--check]: the browser's physics, built from the deployed .gno
# sources themselves, so there is no fork to maintain:
#   web/lib/sim/golf.wasm     the aim preview, which every player loads
#   web/lib/sim/builder.wasm  the same, plus PublishMine's checks and author.Fit (-tags builder)
# --check rebuilds into a scratch folder, fails if a committed .wasm is not
# that build, then runs the parity test (scripts/wasmparity.ts).
#
# The .gno files are copied as .go into a Go module named gno.land
# (scripts/wasm/go.mod), so their import paths stay what they are:
#   p/gnogolf/physics, course   every file but the tests (course/author and physics/build too, for the builder)
#   p/nt/ufmt/v0                the onyx toolchain's, copied the same way
#   r/gnogolf/golf              the declarations the roots reach, extracted from the realm (scripts/wasm/extract);
#                               local.go and local_builder.go, hand-written, give the realm's storage and clock
#   gnovm/math                  the GnoVM's own math (gnovm/stdlibs/math), which the copies import in place of "math"
# The generated files are not kept (.gitignore). Each .wasm is, and embeds the
# sha256 of every deployed .gno file it was built from (sources()): the page
# reads the deployed files back and compares before it trusts a preview.
#
# Same numbers as the chain's: the GnoVM computes float64 in software,
# correctly rounded as IEEE 754 says, and so are WebAssembly's f64 operations,
# with no fused multiply-add. The math functions are the GnoVM's own source,
# not TinyGo's (which calls a C libm). The parity test is the proof.
#
# TinyGo, not Go's own wasm port: 84 KB gzipped against 700. Reproducible:
# TinyGo and its Go are pinned (TINYGO_VERSION, GOTOOLCHAIN), with no debug
# information.
#
# Env:
#   GNO      the onyx gno binary, for its GNOROOT (the toolchain's: see check.sh)
#   TINYGO   the tinygo binary (in PATH, else tinygo-0.42.0/bin/tinygo beside the toolchain's folder)
#   WASMOPT  binaryen's wasm-opt, when not in PATH
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
here=$root/scripts/wasm
realm=gno.land/r/gnogolf/golf/v2 # the rules the site plays
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
GNO=${GNO:-$toolchain/gno}
TINYGO_VERSION=0.42.0
TINYGO=${TINYGO:-$(command -v tinygo || echo "$(dirname "$toolchain")/tinygo-$TINYGO_VERSION/bin/tinygo")}
export GOTOOLCHAIN=go1.26.0
if ! "$TINYGO" version 2>/dev/null | grep -q "^tinygo version $TINYGO_VERSION "; then
	echo "wasm.sh: TinyGo $TINYGO_VERSION is needed (brew install tinygo-org/tools/tinygo, or set TINYGO); found: $("$TINYGO" version 2>&1 || true)" >&2
	exit 1
fi
if ! "$TINYGO" env WASMOPT >/dev/null; then
	echo "wasm.sh: TinyGo needs binaryen's wasm-opt, in PATH or WASMOPT" >&2
	exit 1
fi
gnoroot=$(GNOHOME=$toolchain/gnohome "$GNO" env GNOROOT)
gnoroot=$(echo "$gnoroot" | sed 's/^GNOROOT="\(.*\)"$/\1/')

rm -rf "$here/p" "$here/gnovm"
gnomath() { sed -e 's#^import "math"$#import "gno.land/gnovm/math"#' -e 's#^\(	*\)"math"$#\1"gno.land/gnovm/math"#'; }
copy() { # copy <from dir> <to dir>: the package's files but its tests
	mkdir -p "$2"
	for f in "$1"/*.gno; do
		case $f in *_test.gno | *_filetest.gno) continue ;; esac
		gnomath <"$f" >"$2/$(basename "$f" .gno).go"
	done
}
copy "$root/gno.land/p/gnogolf/physics" "$here/p/gnogolf/physics"
copy "$root/gno.land/p/gnogolf/course" "$here/p/gnogolf/course"
copy "$root/gno.land/p/gnogolf/course/author" "$here/p/gnogolf/course/author"
copy "$root/gno.land/p/gnogolf/physics/build" "$here/p/gnogolf/physics/build"
copy "$gnoroot/examples/gno.land/p/nt/ufmt/v0" "$here/p/nt/ufmt/v0"
copy "$gnoroot/gnovm/stdlibs/math" "$here/gnovm/math"
rm "$here/gnovm/math/native.go" # native.gno: the natives' declarations, bodiless
cp "$gnoroot/gnovm/stdlibs/math/native.go" "$here/gnovm/math/native.go"
# extract <out.go> <tag> <root>…: the realm's declarations the roots reach,
# into the module's r/gnogolf/golf, built under the tag; it prints the
# realm's files they came from
extract() {
	o=$1 tag=$2
	shift 2
	f=$(cd "$here" && go run ./extract "$root/$realm" "r/gnogolf/golf/$o" entry,readHole,holeData,Period "$@")
	{ printf '//go:build %s\n\n' "$tag" && gnomath <"$here/r/gnogolf/golf/$o"; } >"$here/r/gnogolf/golf/$o.tmp"
	mv "$here/r/gnogolf/golf/$o.tmp" "$here/r/gnogolf/golf/$o"
	echo "$f"
}
aim="SimulateFrom simulateRound entry.hole"
golf=$(extract golf.go '!builder' $aim)
builder=$(extract golf_builder.go builder $aim HoleState Extras Weather SimulateCommit maxData newWork worstGas maxShotGas validSlug cleanName cleanText maxNote linkish jstr)
if grep -rln '^import "math"$\|^	"math"$' "$here/p" "$here/r" "$here/gnovm" --include=*.go | grep -v '/gnovm/math/native.go$'; then
	echo "wasm.sh: a file above still imports Go's math" >&2
	exit 1
fi

# sources: the realm's files a build is made from, as the repo has them (the
# page reads the deployed ones back through stage.sh's prefix). Not
# course/author, which is not deployed: only the builder's Fit runs it, and
# --check holds it to these sources like the rest.
sources() { # sources <out.go> <tag> <the realm's files>
	{
		printf '//go:build %s\n\n' "$2"
		echo "// Code generated by scripts/wasm.sh. DO NOT EDIT."
		echo
		echo "package main"
		echo
		printf '%s' 'const sources = `{'
		sep=""
		for f in $(cd "$root" && ls gno.land/p/gnogolf/physics/*.gno gno.land/p/gnogolf/course/*.gno | grep -Ev '_(file)?test\.gno$') \
			$(for g in $3; do echo "$realm/$g"; done); do
			printf '%s"%s":"%s"' "$sep" "$f" "$(shasum -a 256 "$root/$f" | cut -d' ' -f1)"
			sep=","
		done
		echo '}`'
	} >"$here/$1"
}
sources sources.go '!builder' "$golf"
sources sources_builder.go builder "$builder"

(cd "$here" && GOOS=wasip1 GOARCH=wasm go vet ./... && GOOS=wasip1 GOARCH=wasm go vet -tags builder ./...)
out=$root/web/lib/sim
if [ "${1:-}" = "--check" ]; then
	out=$(mktemp -d)
	trap 'rm -rf "$out"' EXIT
fi
# golf.wasm, the aim preview every player loads; builder.wasm, the same and
# the hole builder's calls (-tags builder: main_builder.go, local_builder.go)
build() { # build <name> <tag> <the realm's files>
	(cd "$here" && "$TINYGO" build -o "$out/$1.wasm" -tags "$2" -target wasip1 -buildmode c-shared -scheduler none -no-debug -opt 2 -panic print .)
	size=$(wc -c <"$out/$1.wasm" | tr -d ' ') gz=$(gzip -9c "$out/$1.wasm" | wc -c | tr -d ' ')
	echo "$1.wasm: $size B, $gz B gzipped (from $(echo $3 | tr ' ' ','), physics, course)"
}
build golf "" "$golf"
build builder builder "$builder"
# builder.wasm's budget
if [ "$size" -gt 300000 ] || [ "$gz" -gt 130000 ]; then
	echo "wasm.sh: builder.wasm is over 300 KB, or 130 KB gzipped" >&2
	exit 1
fi

if [ "${1:-}" = "--check" ]; then
	for w in golf builder; do
		if ! cmp -s "$out/$w.wasm" "$root/web/lib/sim/$w.wasm"; then
			echo "wasm.sh: web/lib/sim/$w.wasm is not the build of these sources: run scripts/wasm.sh" >&2
			exit 1
		fi
	done
	cd "$root/web" && node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./test/setup.mjs ../scripts/wasmparity.ts
fi
