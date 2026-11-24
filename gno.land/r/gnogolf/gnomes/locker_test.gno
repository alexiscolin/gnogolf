package gnomes

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// holding gives alice n gnomes (ids 1 to n).
func holding(t *testing.T, rlm realm, n int64) {
	fresh(t, rlm)
	for id := int64(1); id <= n; id++ {
		mintTo(alice, mustGnome(id))
	}
}

// readAll reads alice's whole collection, page by page, as a client does,
// and returns how many rows it got and how many pages it took.
func readAll() (int, int) {
	rows, pages := 0, 0
	for offset := int64(0); offset >= 0; pages++ {
		p := GnomesOf(alice, offset)
		rows += countRows(p)
		i := strings.Index(p, `"next":`) + len(`"next":`)
		j := strings.Index(p[i:], ",")
		offset, _ = strconv.ParseInt(p[i:i+j], 10, 64)
	}
	return rows, pages
}

func TestACollectionOf1_50And205ReadsInPages(cur realm, t *testing.T) {
	for _, c := range []struct {
		n     int64
		pages int
	}{{1, 1}, {50, 1}, {100, 1}, {101, 2}, {205, 3}} {
		holding(t, cur, c.n)
		rows, pages := readAll()
		uassert.Equal(t, int(c.n), rows, itoa(c.n))
		uassert.Equal(t, c.pages, pages, itoa(c.n))
		uassert.True(t, strings.Contains(GnomesOf(alice, 0), `"total":`+itoa(c.n)+`,`))
		uassert.True(t, strings.Contains(GnomesOf(alice, 0), lockerRow(1)), "id, tier and traits")
	}
}

// The gas of reading a whole collection is the difference of each pair below
// (the same holding with and without the reads) under `gno test -v`. A
// query's limit is 3e9.
func TestLockerGasHold1(cur realm, t *testing.T)   { holding(t, cur, 1) }
func TestLockerGasRead1(cur realm, t *testing.T)   { holding(t, cur, 1); readAll() }
func TestLockerGasHold50(cur realm, t *testing.T)  { holding(t, cur, 50) }
func TestLockerGasRead50(cur realm, t *testing.T)  { holding(t, cur, 50); readAll() }
func TestLockerGasHold205(cur realm, t *testing.T) { holding(t, cur, 205) }
func TestLockerGasRead205(cur realm, t *testing.T) { holding(t, cur, 205); readAll() }

// Anyone reads anyone's collection: a read takes no caller.
func TestAnyoneReadsAnothersCollection(cur realm, t *testing.T) {
	holding(t, cur, 3)
	testing.SetRealm(asUser(bob, nil))
	uassert.Equal(t, 3, countRows(GnomesOf(alice, 0)))
	Equip(cross(cur), "") // bob's own, nothing to do with alice's
	uassert.Equal(t, "", Equipped(bob))
}
