package gnomes

import (
	"chain"
	"chain/banker"
	"chain/runtime/unsafe"
	"strings"

	"gno.land/p/nt/bptree/v0"
)

// Buy sells the caller 1 to 5 catalogue gnomes, their ids separated by commas
// ("217,301"), and returns ids. Each must be on sale and unsold, and the
// caller's caps hold for the whole list. The call must send exactly the sum
// of their prices (-send "<sum>ugnot"), which goes to the treasury before it
// returns. Any refusal reverts the call, coins included.
//
// Only a direct user call (maketx call) is taken: a realm or a run script in
// between could keep the coins it attached while OriginSend still reported
// them.
func Buy(cur realm, ids string) string {
	if !cur.Previous().IsUserCall() {
		panic(errNotUserCall)
	}
	buyer := cur.Previous().Address()
	o, _, why := check(buyer, ids, now())
	if why != "" {
		panic(why)
	}

	// Exactly one coin of the sum: anything else underpays or leaves coins
	// behind.
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != payDenom || sent[0].Amount != o.total {
		panic("gnomes: wrong payment, send exactly " + itoa(o.total) + payDenom)
	}

	// State first, then coins: nothing below calls out but the banker, which
	// runs no code.
	for i := range tiers {
		o.had[i] += o.count[i]
	}
	bought.Set(buyer.String(), *o.had)
	for k, c := range o.windowCount {
		inWindow.Set(k, *c)
	}
	for i, g := range o.gnomes {
		mintTo(buyer, g)
		chain.Emit("GnomeBought", "id", itoa(g.id), "buyer", buyer.String(),
			"price", itoa(o.paid[i]), "treasury", treasury.String())
	}
	// An OriginSend banker spends this call's envelope and nothing else.
	banker.NewBanker(banker.BankerTypeOriginSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, o.total)))
	return ids
}

// order is a list Buy takes, priced, with the buyer's cap counts as they
// will be once it is sold.
type order struct {
	gnomes      []gnome
	paid        []int64
	count       [len(tiers)]int64             // per tier, in the list
	had         *[len(tiers)]int64            // the buyer's lifetime counts before it
	windowCount map[string]*[len(tiers)]int64 // per sale in its player window (windowKey), the list included
	total       int64
}

// check runs every refusal of Buy but the caller's and the payment's, in
// Buy's order. It returns buyer's order at time t, or a code (CanBuy's
// "reason") and the sentence Buy panics with. It writes nothing, so Buy and
// CanBuy cannot disagree.
func check(buyer address, ids string, t int64) (o order, code, why string) {
	if !mintOpen {
		return o, "paused", errClosed
	}
	list, why := readIDs(ids)
	if why != "" {
		return o, "ids", why
	}
	player := false // asked of store once, only when a window needs it
	o.windowCount = map[string]*[len(tiers)]int64{}
	for _, id := range list {
		g, ok := gnomeAt(id)
		if !ok {
			return o, "unknown", errNoGnome
		}
		si := saleAt(id)
		if si < 0 {
			return o, "unlisted", "gnomes: gnome " + itoa(id) + " is not on sale"
		}
		s := sales[si]
		if t < s.start {
			return o, "later", "gnomes: gnome " + itoa(id) + " is not on sale yet"
		}
		if isSold(id) {
			return o, "taken", errSold
		}
		if isClosed(id) {
			return o, "closed", errClosedOn()
		}
		if t < s.playersUntil {
			if !player && !hasRecord(buyer) {
				return o, "players-only", "gnomes: players only until " + dateOf(s.playersUntil) + ": finish a hole first"
			}
			player = true
			k := windowKey(s.series, buyer)
			if o.windowCount[k] == nil {
				o.windowCount[k] = counts(inWindow, k)
			}
			o.windowCount[k][g.tier]++
			if o.windowCount[k][g.tier] > playerCap[g.tier] {
				return o, "window-cap", "gnomes: the player window takes " + itoa(playerCap[g.tier]) + " " + tiers[g.tier].name + " a wallet"
			}
		}
		o.count[g.tier]++
		o.total += s.prices[g.tier] // at most 5 times maxPrice: no overflow
		o.gnomes, o.paid = append(o.gnomes, g), append(o.paid, s.prices[g.tier])
	}
	o.had = counts(bought, buyer.String())
	for i := range tiers {
		if o.count[i] > 0 && o.had[i]+o.count[i] > lifetimeCap[i] {
			return o, "cap", "gnomes: the cap is " + itoa(lifetimeCap[i]) + " " + tiers[i].name + " a wallet"
		}
	}
	return o, "", ""
}

// readIDs reads "1,2,3": 1 to maxBatch distinct ids, as parseID takes them.
// It returns the list, or the sentence refusing it.
func readIDs(ids string) ([]int64, string) {
	parts := strings.Split(ids, ",")
	if ids == "" || len(parts) > maxBatch {
		return nil, "gnomes: name 1 to " + itoa(maxBatch) + " gnomes, as ids separated by commas"
	}
	list := make([]int64, 0, len(parts))
	for _, p := range parts {
		id := parseID(p)
		if id == 0 {
			return nil, "gnomes: not a gnome id: " + p
		}
		for _, seen := range list {
			if seen == id {
				return nil, "gnomes: gnome " + p + " is named twice"
			}
		}
		list = append(list, id)
	}
	return list, ""
}

// parseID reads a decimal token id with no sign and no leading zero; 0 for
// anything else.
func parseID(s string) int64 {
	if len(s) == 0 || len(s) > 9 || s[0] == '0' {
		return 0
	}
	n := int64(0)
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0
		}
		n = n*10 + int64(s[i]-'0')
	}
	return n
}

// counts returns a copy of the per-tier counts tree keeps under key.
func counts(tree *bptree.BPTree, key string) *[len(tiers)]int64 {
	c := &[len(tiers)]int64{}
	if v := tree.Get(key); v != nil {
		*c = v.([len(tiers)]int64)
	}
	return c
}

// windowKey is buyer's row in inWindow for series name's sale. It is keyed
// by series, not by the sale's index, which CancelSale moves.
func windowKey(name string, buyer address) string { return name + " " + buyer.String() }
