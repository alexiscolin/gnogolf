package gnomes

import "gno.land/p/nt/grc721/v0"

// Burn destroys gnome tid, which the caller must hold; its deposit returns to
// them. An approved operator cannot burn. A sold id is never sold again; an
// earned kind can be minted again, under a new id. The cleanup comes before
// the ledger's burn, which removes the owner before OnBurn runs and gives it
// the id alone.
func Burn(cur realm, tid string) {
	caller := cur.Previous().Address()
	if o, err := token.OwnerOf(grc721.TokenID(tid)); err != nil || o != caller {
		panic(errNotYours)
	}
	id := parseID(tid)
	held.Remove(heldKey(caller, id, rankOf(id)))
	unequip(caller, tid)
	if v := kindOf.Get(tid); v != nil {
		kindOf.Remove(tid)
		earned.Remove(caller.String() + " " + v.(string))
	}
	if err := ledger.Burn(grc721.TokenID(tid)); err != nil {
		panic(err)
	}
}
