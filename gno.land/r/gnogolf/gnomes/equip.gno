package gnomes

import (
	"chain"
	"strings"

	"gno.land/p/gnogolf/jsonq"
	"gno.land/p/nt/grc721/v0"
)

// Wearing is free: a player wears their best gnome (the highest tier they
// hold, then its lowest id) unless they put another on with Equip, the one
// call here that costs. The game reads Worn and WornMany and dresses the ball
// from the traits.

// maxPlayers bounds WornMany.
const maxPlayers = 50

// Equip puts on gnome tid, which the caller must own; "" takes it off.
func Equip(cur realm, tid string) {
	caller := cur.Previous().Address()
	if tid == "" {
		equipped.Remove(caller.String())
	} else {
		if o, err := token.OwnerOf(grc721.TokenID(tid)); err != nil || o != caller {
			panic(errNotYours)
		}
		equipped.Set(caller.String(), tid)
	}
	chain.Emit("Equipped", "player", caller.String(), "id", tid)
}

// Equipped returns the gnome player put on with Equip, "" for none. Ownership
// is checked on read: a gnome sold on is no longer worn.
//
//	{"version":1,"player":"g1…","id":"104","name":"…","tier":"legendary","traits":"…"}
func Equipped(player address) string {
	if g, ok := equippedGnome(player); ok {
		return `{"version":1,` + wornFields(player, g) + `}`
	}
	return ""
}

// equippedGnome is the gnome player put on with Equip, while they hold it.
func equippedGnome(player address) (gnome, bool) {
	v := equipped.Get(player.String())
	if v == nil {
		return gnome{}, false
	}
	tid := v.(string)
	if o, err := token.OwnerOf(grc721.TokenID(tid)); err != nil || o != player {
		return gnome{}, false
	}
	return tokenAt(parseID(tid))
}

// wornFields are the JSON fields Equipped and Worn share.
func wornFields(player address, g gnome) string {
	return `"player":` + jsonq.Quote(player.String()) + `,"id":"` + itoa(g.id) + `","name":` + jsonq.Quote(g.name) +
		`,"tier":"` + tierName(g.tier) + `","traits":` + jsonq.Quote(g.traits)
}

// Worn returns the gnome player wears: the one put on with Equip while they
// hold it, else their best (their first row: heldKey), "" for none.
// "equipped" says which. One row read either way.
//
//	{"version":1,"player":"g1…","id":"104","name":"…","tier":"legendary","traits":"…","equipped":false}
func Worn(player address) string {
	if row := wornRow(player); row != "" {
		return `{"version":1,` + row
	}
	return ""
}

// wornRow is Worn's fields after its version, "" for none.
func wornRow(player address) string {
	if g, ok := equippedGnome(player); ok {
		return wornFields(player, g) + `,"equipped":true}`
	}
	ids, _ := heldPage(player, 0, 1)
	if len(ids) == 0 {
		return ""
	}
	g, ok := tokenAt(ids[0])
	if !ok {
		return ""
	}
	return wornFields(player, g) + `,"equipped":false}`
}

// WornMany returns Worn for the first maxPlayers of a comma-separated list,
// those who wear one: {"version":1,"rows":[<Worn's fields>, …]}. Repeats and
// non-addresses are skipped but count toward the bound, so the walk stays
// short.
func WornMany(players string) string {
	var b strings.Builder
	b.WriteString(`{"version":1,"rows":[`)
	n := 0
	seen := map[string]bool{}
	for i, p := range strings.SplitN(players, ",", maxPlayers+1) {
		if i == maxPlayers {
			break
		}
		if seen[p] || !address(p).IsValid() {
			continue
		}
		seen[p] = true
		if r := wornRow(address(p)); r != "" {
			if n > 0 {
				b.WriteString(",")
			}
			b.WriteString("{" + r)
			n++
		}
	}
	b.WriteString("]}")
	return b.String()
}
