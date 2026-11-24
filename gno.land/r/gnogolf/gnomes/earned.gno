package gnomes

import (
	"chain"
	"chain/runtime/unsafe"
	"strconv"
	"strings"

	"gno.land/p/gnogolf/jsonq"
	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/grc721/v0"
	"gno.land/r/gnogolf/store"
)

// The nine gnomes players earn (web/lib/card.ts UNLOCKS): minted free once
// store proves the feat, and bound to their player. The proof reads store's
// rows in golf/v2's key layout and never calls golf/v2:
//
//   - "slots": "<world rank><world>/<order>" -> the slot's current version
//     id (slotKey);
//   - "bests": "<id> <mode> <player>" -> "<strokes> <height> <period>
//     <shots>" (bestOf). A best with a "copies" row does not count, as in
//     golf's Claim;
//   - "holes": "<id>" -> the entry, whose field 2 is the par (encodeEntry).
//
// bests carry no format version, so the proof refuses unless store's writer
// is the rules it reads: a new format can refuse a mint, never prove a false
// one. AcceptRules follows a rules change.

// rulesAtDeploy is the golf realm whose rows the proof reads at deploy.
// stage.sh rewrites this path.
const rulesAtDeploy = "gno.land/r/gnogolf/golf/v2"

// rules is the golf realm whose rows the proof reads.
var rules string

// AcceptRules makes path the rules the proof reads. path must be store's
// current writer: the owner can follow a rules change, never point the proof
// elsewhere. Panics while store is paused, when it has no writer. Owner only.
func AcceptRules(cur realm, path string) {
	assertOwner(0, cur)
	w := golfRows.Writer()
	if !strings.HasPrefix(w, "gno.land/r/") {
		panic("gnomes: store has no rules to accept: its writer is \"" + w + "\", not a realm (\"\" while paused)")
	}
	if path != w {
		panic("gnomes: the rules accepted are store's writer, " + w + ", not " + path)
	}
	rules = path
	chain.Emit("RulesAccepted", "rules", path)
}

// firstEarned is above any id a catalogue can reach: 64 series of 1,000 rows
// end at 64,000.
const firstEarned = 1_000_001

// earnedTier is an earned token's tier, outside the sale's.
const earnedTier = -1

// earnedKinds are in UNLOCKS order: a token's kind byte is the index + 1.
// earnedNames are GNOMES' (web/lib/scene/gnome.ts), earnedNeeds UNLOCKS'
// need. selfcheck.ts holds all three to the client's.
var (
	earnedKinds = []string{"wizard", "viking", "golden", "pirate", "diver", "baker", "mayor", "king", "miner"}
	earnedNames = []string{"The Wizard", "The Viking", "The Golden Gnome", "The Pirate", "The Diver", "The Baker", "The Mayor", "The Gnome King", "The Miner"}
	earnedNeeds = []string{"Finish the Garden Cup", "Garden Cup at par or under", "Five holes-in-one", "Finish the Island Cup",
		"Island Cup at par or under", "Finish Mushroom Town", "Mushroom Town at par or under", "The four cups at par or under", "Finish the Crystal Mines"}
)

var (
	earned     *bptree.BPTree // "<player> <kind>" -> id, once per player and kind
	kindOf     *bptree.BPTree // id -> kind
	nextEarned int64          // the next earned id; never reused
	earnedOpen bool           // the owner's switch over MintEarned alone; starts open
)

// EarnedOpen reports whether MintEarned is open.
func EarnedOpen() bool { return earnedOpen }

// SetEarnedOpen opens or closes MintEarned alone, apart from the sale's
// switch (SetMintOpen): the owner's stop for a fault in the proof. Owner only.
func SetEarnedOpen(cur realm, open bool) {
	assertOwner(0, cur)
	if open == earnedOpen {
		return
	}
	earnedOpen = open
	chain.Emit("EarnedOpen", "open", strconv.FormatBool(open))
}

const (
	errEntry     = "gnomes: a hole entry not as golf/v2 keeps it: "
	errBest      = "gnomes: a best not as golf/v2 writes it: "
	errRules     = "rules changed"
	errKind      = "gnomes: no such earned gnome: "
	errEarned    = "gnomes: already minted: "
	errNotProven = "gnomes: not proven: "
	errNoEarned  = "gnomes: earned gnomes are paused: none is minted until the owner resumes them"
	maxMissing   = 20
	maxCupSlots  = 300 // a store page (store maxPage): a cup the proof reads whole
)

// worlds are golf/v2's cups in its order: a slot key's first digit.
var worlds = []string{"garden", "island", "town", "mountain", "mines"}

// reader is what the proof reads of store; the tests put their own rows here.
type reader interface {
	Page(name, start, end string, limit int) string
	Get(name, key string) (string, bool)
	Has(name, key string) bool
	Writer() string
}

type storeReader struct{}

func (storeReader) Page(name, start, end string, limit int) string {
	return store.Page(name, start, end, limit)
}
func (storeReader) Get(name, key string) (string, bool) { return store.Get(name, key) }
func (storeReader) Has(name, key string) bool           { return store.Has(name, key) }
func (storeReader) Writer() string                      { return store.Writer() }

var golfRows reader = storeReader{}

// MintEarned mints the caller's earned gnome of kind ("wizard" … "miner")
// once store proves the feat, and returns its id. It is free: the caller pays
// only the deposit. Once per player and kind, until it is burned. Panics
// unless called directly by a user, with no coins, while EarnedOpen.
func MintEarned(cur realm, kind string) string {
	if !cur.Previous().IsUserCall() {
		panic(errNotUserCall)
	}
	if !earnedOpen {
		panic(errNoEarned)
	}
	if len(unsafe.OriginSend()) > 0 {
		panic("gnomes: an earned gnome is free: send nothing with it")
	}
	player := cur.Previous().Address()
	k := kindIndex(kind)
	if k == 0 {
		panic(errKind + kind)
	}
	key := player.String() + " " + kind
	if earned.Has(key) {
		panic(errEarned + kind)
	}
	ok, _, why := prove(kind, player.String())
	if why != "" {
		panic("gnomes: " + why)
	}
	if !ok {
		panic(errNotProven + kind)
	}
	id := nextEarned
	nextEarned++
	tid := itoa(id)
	earned.Set(key, tid)
	kindOf.Set(tid, kind)
	if err := ledger.Mint(player, grc721.TokenID(tid)); err != nil {
		panic(err)
	}
	chain.Emit("GnomeEarned", "id", tid, "kind", kind, "player", player.String())
	return tid
}

func kindIndex(kind string) int {
	for i, k := range earnedKinds {
		if k == kind {
			return i + 1
		}
	}
	return 0
}

// isEarned reports whether id is in the earned range.
func isEarned(id int64) bool { return id >= firstEarned }

// earnedAt returns earned token id as a gnome, false if it was never minted
// or was burned.
func earnedAt(id int64) (gnome, bool) {
	v := kindOf.Get(itoa(id))
	if v == nil {
		return gnome{}, false
	}
	k := kindIndex(v.(string))
	return gnome{id: id, series: "earned", tier: earnedTier, kind: k, name: earnedNames[k-1], traits: earnedTraits(k)}, true
}

// earnedTraits are kind k's traits in the designer's codec
// (web/lib/gnomes/codec.ts, format 1): tier 0, the kind, every other field
// plain. The client draws GNOMES' own gnome for the kind.
func earnedTraits(k int) string {
	return "010000" + string(hexDigits[k>>4]) + string(hexDigits[k&0xf]) + "000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff"
}

// A cup is a player's results on its current versions.
type cup struct {
	holes, finished, strokes, par, aces int
	missing                             []string
}

func (c *cup) add(o cup) {
	c.holes += o.holes
	c.finished += o.finished
	c.strokes += o.strokes
	c.par += o.par
	c.aces += o.aces
	for _, m := range o.missing {
		if len(c.missing) < maxMissing {
			c.missing = append(c.missing, m)
		}
	}
}

func (c cup) all() bool   { return c.holes > 0 && c.finished == c.holes }
func (c cup) clean() bool { return c.all() && c.strokes <= c.par }

// prove returns whether player has proven kind, the cups' results, and why
// the proof cannot be read ("" when it can).
func prove(kind, player string) (bool, cup, string) {
	if kindIndex(kind) == 0 {
		panic(errKind + kind)
	}
	if golfRows.Writer() != rules {
		return false, cup{}, errRules
	}
	switch kind {
	case "wizard", "pirate", "baker", "miner":
		c := cupOf(map[string]string{"wizard": "garden", "pirate": "island", "baker": "town", "miner": "mines"}[kind], player, false)
		return c.all(), c, ""
	case "viking", "diver", "mayor":
		c := cupOf(map[string]string{"viking": "garden", "diver": "island", "mayor": "town"}[kind], player, true)
		return c.clean(), c, ""
	case "golden":
		var c cup
		for _, w := range worlds {
			c.add(cupOf(w, player, false))
		}
		return c.aces >= 5, c, ""
	}
	// king: viking's proof on each of the four classic cups
	var c cup
	ok := true
	for _, w := range worlds[:4] {
		one := cupOf(w, player, true)
		ok = ok && one.clean()
		c.add(one)
	}
	return ok, c, ""
}

// cupOf reads player's results on world's current versions: one page of
// slots, a best per mode and slot, and the pars if withPar.
func cupOf(world, player string, withPar bool) cup {
	d := strconv.Itoa(worldRank(world))
	start, end := d+world+"/", d+world+"0"
	slots := pageRows(golfRows.Page("slots", start, end, maxCupSlots))
	// A cup that does not fit one page is refused, never proven from its first
	// page (golf takes up to 999 slots a world).
	if len(slots) == maxCupSlots && golfRows.Page("slots", slots[maxCupSlots-1][0]+"\x00", end, 1) != "" {
		panic("gnomes: " + world + ": cup too large for the proof")
	}
	var c cup
	for _, kv := range slots {
		c.holes++
		if withPar {
			c.par += parOf(kv[1])
		}
		b := lowerBest(kv[1], player)
		if b == 0 {
			if len(c.missing) < maxMissing {
				c.missing = append(c.missing, slotName(kv[0]))
			}
			continue
		}
		c.finished++
		c.strokes += b
		if b == 1 {
			c.aces++
		}
	}
	return c
}

func worldRank(w string) int {
	for i, x := range worlds {
		if x == w {
			return i
		}
	}
	panic("gnomes: no such world: " + w)
}

// slotName is a slot key as the player knows the hole: "0garden/007" -> "garden/7".
func slotName(key string) string {
	s := key[1:]
	i := strings.LastIndexByte(s, '/') + 1
	return s[:i] + strings.TrimLeft(s[i:], "0")
}

// lowerBest is player's lower best on version id across both modes, 0 for
// none. A copy does not count.
func lowerBest(id, player string) int {
	low := 0
	for _, mode := range []string{"assisted", "pro"} {
		k := id + " " + mode + " " + player
		b, ok := golfRows.Get("bests", k)
		if !ok || golfRows.Has("copies", k) {
			continue
		}
		if s := strokesOf(b); low == 0 || s < low {
			low = s
		}
	}
	return low
}

// strokesOf is a best's strokes: one to three digits, then a space (bestOf).
func strokesOf(b string) int {
	n, i := 0, 0
	for i < len(b) && i < 4 && b[i] >= '0' && b[i] <= '9' {
		n = n*10 + int(b[i]-'0')
		i++
	}
	if i == 0 || i > 3 || i >= len(b) || b[i] != ' ' || n == 0 {
		panic(errBest + strconv.Quote(b))
	}
	return n
}

// parOf is a version's par: field 2 of its entry, format "1" (encodeEntry).
func parOf(id string) int {
	s, ok := golfRows.Get("holes", id)
	if !ok {
		panic(errEntry + id)
	}
	f, i, ok := field(s, 0)
	if !ok || f != "1" {
		panic(errEntry + id)
	}
	var par string
	for k := 0; k < 3; k++ {
		if par, i, ok = field(s, i); !ok {
			panic(errEntry + id)
		}
	}
	n, err := strconv.Atoi(par)
	if err != nil || n < 1 {
		panic(errEntry + id)
	}
	return n
}

// pageRows splits a store page into key and value pairs, each written as its
// length, ":" and itself.
func pageRows(p string) [][2]string {
	var out [][2]string
	for i := 0; i < len(p); {
		k, j, ok := field(p, i)
		v, l, ok2 := field(p, j)
		if !ok || !ok2 {
			panic("gnomes: a store page not as store writes it")
		}
		out = append(out, [2]string{k, v})
		i = l
	}
	return out
}

// field reads one "<len>:<value>" of s from i: the value and the next index.
func field(s string, i int) (string, int, bool) {
	n, j := 0, i
	for j < len(s) && j-i < 6 && s[j] >= '0' && s[j] <= '9' {
		n = n*10 + int(s[j]-'0')
		j++
	}
	if j == i || j >= len(s) || s[j] != ':' || len(s)-j-1 < n {
		return "", 0, false
	}
	return s[j+1 : j+1+n], j + 1 + n, true
}

// Proof returns what MintEarned(kind) would find for player, as JSON:
//
//	{"version":1,"kind":"viking","player":"g1…","ok":false,"minted":"",
//	 "holes":18,"finished":16,"strokes":48,"par":54,"missing":["garden/1",…]}
//
// "reason" is set when the proof cannot be read: "paused" (SetEarnedOpen) or
// "rules changed". Panics for an unknown kind.
func Proof(kind string, player address) string {
	ok, c, why := prove(kind, player.String())
	if !earnedOpen {
		why = "paused"
	}
	minted := ""
	if v := earned.Get(player.String() + " " + kind); v != nil {
		minted = v.(string)
	}
	var b strings.Builder
	b.WriteString(`{"version":1,"kind":"` + kind + `","player":` + jsonq.Quote(player.String()) + `,"ok":` + strconv.FormatBool(ok) +
		`,"minted":"` + minted + `","holes":` + strconv.Itoa(c.holes) + `,"finished":` + strconv.Itoa(c.finished) +
		`,"strokes":` + strconv.Itoa(c.strokes) + `,"par":` + strconv.Itoa(c.par) + `,"missing":[`)
	for i, m := range c.missing {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(jsonq.Quote(m))
	}
	b.WriteString("]")
	if why != "" {
		b.WriteString(`,"reason":"` + why + `"`)
	}
	b.WriteString("}")
	return b.String()
}
