#!/bin/sh
# publishdata.sh <key>: publishes every course hole of data/holes.txt into its
# slot, as the course's owner (<key>, a gnokey key name). Each hole is one
# `gnokey maketx call` of golf's Publish(slot, hex, ""), simulated first, then
# sent. A slot that already holds the data is skipped ("nothing to publish"),
# so the script can be run again after a failure. Then it checks every slot.
# The key's password is asked once and handed to each call on its stdin.
#
# publishdata.sh -verify: the check alone, a read with no key. It fails when a
# slot is missing or does not hold the sha data/holes.txt lists it with.
#
#   scripts/publishdata.sh test1                                  a local gnodev
#   REALM=gno.land/r/nym-alexiscolin000/gnogolf/golf/v2 REMOTE=https://rpc.onyx.testnets.gno.land:443 \
#     CHAINID=onyx-1 scripts/publishdata.sh <your-key-name>
#
# Env:
#   REALM        the golf realm (gno.land/r/gnogolf/golf/v2)
#   REMOTE       the node (127.0.0.1:26657)
#   CHAINID      its chain id (dev)
#   GNOKEY       the gnokey (the onyx toolchain's: see check.sh)
#   MAX_DEPOSIT  a call's storage deposit cap (10000000ugnot; a hole stores 4 to 35 KB)
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
realm=${REALM:-gno.land/r/gnogolf/golf/v2}
remote=${REMOTE:-127.0.0.1:26657}
chainid=${CHAINID:-dev}
toolchain=${GNO_TOOLCHAIN:-${XDG_CACHE_HOME:-$HOME/.cache}/gno-toolchains/onyx}
gnokey=${GNOKEY:-$toolchain/gnokey}
holes=$root/data/holes.txt

# verify: one read over every slot. vm/qeval reaches only the realm's own
# names, so a slot's entry in Versions is found by hand.
verify() {
	list=$(awk '{printf "%s{\"%s\", \"%s\"}", (NR > 1 ? ", " : ""), $1, $3}' "$holes")
	expr='func() string { at := func(s, sub string) int { for i := 0; i+len(sub) <= len(s); i++ { if s[i:i+len(sub)] == sub { return i } }; return -1 }; bad := ""; for _, h := range [][2]string{'"$list"'} { id := Current(h[0]); v := Versions(h[0]); i := at(v, `"id":"`+id+`"`); if id != "" && i >= 0 { v = v[i:]; if j := at(v, "}"); j >= 0 && at(v[:j], `"sha":"`+h[1]) >= 0 { continue } }; bad += " " + h[0] }; if bad == "" { return "every slot holds its data" }; return "missing or other:" + bad }()'
	out=$("$gnokey" query vm/qeval -remote "$remote" -data "$realm.$expr")
	echo "$out"
	case $out in *'"every slot holds its data"'*) ;; *) return 1 ;; esac
}

if [ "${1:-}" = -verify ]; then
	verify
	exit
fi
key=${1:?usage: publishdata.sh <key> | -verify}

# the node's price, "<price>ugnot/<gas>gas" as ugnot a gas
price=$("$gnokey" query auth/gasprice -remote "$remote" | tr -d " \n" | sed -n 's/.*"gas":"*\([0-9]*\)"*,"price":"\([0-9]*\)ugnot".*/\2 \1/p')
[ -n "$price" ] || { echo "publishdata.sh: no gas price at $remote" >&2; exit 1; }

# the terminal's echo comes back however the script ends (an error, ^C)
trap 'stty echo 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
printf 'Password for %s: ' "$key" >&2
stty -echo 2>/dev/null || true
read -r pass
stty echo 2>/dev/null || true
echo >&2

# publish <slot> <hex> <gas> <only|test>: one Publish call, simulated alone
# (only) or simulated and sent (test), its output in out. A call signed
# before the last one landed reads the account's old sequence ("signature
# verification failed"): it is sent again a block later.
publish() {
	fee=$(echo "$price" | awk -v g="$3" '{printf "%d", g * $1 / $2 + 1}')
	for try in 1 2 3; do
		out=$(printf '%s\n' "$pass" | "$gnokey" maketx call -pkgpath "$realm" -func Publish -args "$1" -args "$2" -args "" \
			-gas-wanted "$3" -gas-fee "${fee}ugnot" -max-deposit "${MAX_DEPOSIT:-10000000ugnot}" \
			-broadcast -simulate "$4" -chainid "$chainid" -remote "$remote" -insecure-password-stdin "$key" 2>&1) && return 0
		echo "$out" | grep -q "signature verification failed" || return 1
		sleep 6
	done
	return 1
}

n=0
while read -r slot _ _ hex; do
	n=$((n + 1))
	# The simulation asks what Publish of b bytes costs and a fifth more (a
	# course hole takes under 25M and 55K a byte). The call then asks what the
	# simulation used and a tenth more: the state can differ by a few bytes
	# by the time it lands.
	gas=$(awk -v b=$((${#hex} / 2)) 'BEGIN {printf "%d", (25000000 + 55000 * b) * 1.2}')
	printf '%2d %-12s ' "$n" "$slot"
	if publish "$slot" "$hex" "$gas" only; then
		gas=$(echo "$out" | awk '/GAS USED/ {printf "%d", ($3 * 11 + 9) / 10}')
		publish "$slot" "$hex" "$gas" test || true
	fi
	if echo "$out" | grep -q "^OK!"; then
		echo "$out" | awk '/GAS WANTED|GAS USED|STORAGE DELTA|TX HASH/ {printf "%s  ", $0} END {print ""}'
	elif echo "$out" | grep -q "nothing to publish"; then
		echo "already current"
	else
		echo "$out" >&2
		exit 1
	fi
done <"$holes"
verify
