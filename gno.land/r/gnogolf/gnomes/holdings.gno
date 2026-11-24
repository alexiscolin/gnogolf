package gnomes

import (
	"strings"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/grc721/v0"
)

// holdings is the ledger's extension, called on every mint and transfer. It
// keeps the locker's index (GnomesOf), unequips a gnome that leaves its
// holder, and refuses to move an earned gnome: grc721 runs it after its own
// write, and its panic reverts the movement. A burn's cleanup is in Burn.
// Rows are in a bptree: grc721/enumerable's lists add 5 to 9 KB to a buy.
type holdings struct{}

var _ grc721.Extension = holdings{}

// held is "<holder> <rank><id on 9 digits>" -> "", best first per holder (heldKey).
var held *bptree.BPTree

const errBound = "gnomes: an earned gnome is bound to its player: it cannot be transferred or approved"

func (holdings) ExtensionKind() string { return "gnomes" }

// OnMint keeps an earned gnome's row. mintTo keeps a catalogue gnome's: it
// has the row parsed already, and a second read would double the sale's gas.
func (holdings) OnMint(to address, tid grc721.TokenID) {
	if id := parseID(string(tid)); isEarned(id) {
		held.Set(heldKey(to, id, rankOfTier(earnedTier)), "")
	}
}

func (holdings) OnTransfer(from, to address, tid grc721.TokenID) {
	id := parseID(string(tid))
	if isEarned(id) {
		panic(errBound)
	}
	r := rankOf(id)
	held.Remove(heldKey(from, id, r))
	held.Set(heldKey(to, id, r), "")
	unequip(from, string(tid))
}

func (holdings) OnBurn(tid grc721.TokenID) {} // Burn clears what is the burner's

// heldKey sorts a holder's rows best first: tier rank (0 for the top tier, an
// earned gnome last), then the id padded. A holder's first row is the gnome
// they wear by default (Worn).
func heldKey(holder address, id int64, rank int) string {
	s := itoa(id)
	return holder.String() + " " + string(rune('0'+rank)) + strings.Repeat("0", 9-len(s)) + s
}

// rankOfTier is where a tier sorts in a holder's rows: 0 is the best.
func rankOfTier(t int) int {
	if t == earnedTier {
		return len(tiers)
	}
	return len(tiers) - 1 - t
}

// rankOf is rankOfTier of gnome id, for a transfer or a burn, which have only
// the id.
func rankOf(id int64) int {
	g, ok := tokenAt(id)
	if !ok {
		return len(tiers)
	}
	return rankOfTier(g.tier)
}

// heldPage returns up to n of holder's ids from offset, best first, and
// whether more follow. It walks only the holder's rows, from the first.
func heldPage(holder address, offset int64, n int) ([]int64, bool) {
	var ids []int64
	more, i := false, int64(0)
	prefix := holder.String() + " "
	held.Iterate(prefix, holder.String()+"!", func(key string, _ any) bool {
		if i >= offset {
			if len(ids) == n {
				more = true
				return true
			}
			ids = append(ids, parseID(strings.TrimLeft(key[len(prefix)+1:], "0")))
		}
		i++
		return false
	})
	return ids, more
}

// unequip drops player's equipped gnome when it is tid.
func unequip(player address, tid string) {
	if v := equipped.Get(player.String()); v != nil && v.(string) == tid {
		equipped.Remove(player.String())
	}
}

// seeded returns a tree whose first leaf the deployer pays for, not the first
// player. Its key "" sorts before every other and no read shows it.
func seeded() *bptree.BPTree {
	t := bptree.NewBPTree32()
	t.Set("", "")
	return t
}
