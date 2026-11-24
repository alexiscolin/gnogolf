package gnomes

import "gno.land/r/gnogolf/store"

// hasRecord reports whether addr has finished a hole, in either mode: what a
// sale's player window asks. golf/v2 keeps a row per player in store's
// "totals" ("assisted <addr>", "pro <addr>"). A read only: this realm never
// writes to store.
func hasRecord(addr address) bool {
	return store.Has("totals", "assisted "+addr.String()) || store.Has("totals", "pro "+addr.String())
}
