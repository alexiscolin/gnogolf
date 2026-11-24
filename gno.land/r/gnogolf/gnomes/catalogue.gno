package gnomes

import (
	"chain"
	"errors"
)

// A series is one drop of the catalogue, published whole by the owner and
// never changed: its gnomes may be owned. The genesis comes first; a later
// drop is one more AddSeries, with no new code. Its rows are one gnome a
// line,
//
//	id|tier|name|traits
//
// ids following on from the last series with no gap. They are kept as one
// string and read in place (rows.gno): as structs they would cost several
// times the deposit.
type series struct {
	name        string
	first, last int64  // the ids of its first and last rows
	rows        string // written once: nothing that changes is kept beside it, so no sale rewrites it
}

// A gnome is one row of the catalogue, or an earned gnome (earned.gno).
type gnome struct {
	id     int64
	series string
	tier   int // index in tiers, earnedTier for an earned one
	kind   int // an earned one's: 1 to 9 (earnedKinds); 0 otherwise
	name   string
	traits string
}

// Bounds: every read walks the series, and AddSeries checks a series' rows in
// one call.
const (
	maxSeries     = 64
	maxSeriesRows = 1000
	maxSeriesName = 32
	maxGnomeName  = 48
	maxTraits     = 256
)

// AddSeries publishes the next series of the catalogue from its rows.
// Refused whole if any row is wrong. Owner only.
func AddSeries(cur realm, name, data string) {
	assertOwner(0, cur)
	if err := addSeries(name, data); err != nil {
		panic(err)
	}
	s := catalogue[len(catalogue)-1]
	chain.Emit("SeriesAdded", "series", name, "first", itoa(s.first), "last", itoa(s.last))
}

func addSeries(name, data string) error {
	if len(catalogue) >= maxSeries {
		return errors.New("gnomes: at most " + itoa(maxSeries) + " series")
	}
	if !validSlug(name) {
		return errors.New("gnomes: a series name is 1 to " + itoa(maxSeriesName) + " of [a-z0-9-]")
	}
	if seriesNamed(name) >= 0 {
		return errors.New("gnomes: series " + name + " is already published")
	}
	if (len(catalogue) == 0) != (name == genesisName) {
		return errors.New("gnomes: the genesis first, and once")
	}
	if data == "" {
		return errors.New("gnomes: a series has rows")
	}
	first := lastID() + 1
	next := first
	var count [len(tiers)]int64
	for start := 0; start <= len(data); {
		end := lineEnd(data, start)
		g, err := parseRow(data[start:end])
		if err != nil {
			return errors.New(err.Error() + ", row " + itoa(next))
		}
		if g.id != next {
			return errors.New("gnomes: row " + itoa(g.id) + " where " + itoa(next) + " was due")
		}
		count[g.tier]++
		next++
		if next-first > maxSeriesRows {
			return errors.New("gnomes: a series has at most " + itoa(maxSeriesRows) + " rows")
		}
		start = end + 1
	}
	if name == genesisName {
		for i, tr := range tiers {
			if count[i] != genesisSupply[i] {
				return errors.New("gnomes: the genesis has " + itoa(count[i]) + " " + tr.name +
					", the config says " + itoa(genesisSupply[i]))
			}
		}
	}
	catalogue = append(catalogue, series{name: name, first: first, last: next - 1, rows: data})
	return nil
}

// lastID is the id of the catalogue's last gnome, 0 before the genesis.
func lastID() int64 {
	if len(catalogue) == 0 {
		return 0
	}
	return catalogue[len(catalogue)-1].last
}

// gnomeAt returns gnome id from the catalogue, false when there is none.
func gnomeAt(id int64) (gnome, bool) {
	si := seriesAt(id)
	if si < 0 {
		return gnome{}, false
	}
	s := catalogue[si]
	g, err := parseRow(rowOf(s.rows, id))
	if err != nil {
		return gnome{}, false
	}
	g.series = s.name
	return g, true
}

// seriesAt returns the index of the series gnome id is in, -1 when none.
func seriesAt(id int64) int {
	for i, s := range catalogue {
		if id >= s.first && id <= s.last {
			return i
		}
	}
	return -1
}

// seriesNamed returns the index of series name, -1 when none.
func seriesNamed(name string) int {
	for i, s := range catalogue {
		if s.name == name {
			return i
		}
	}
	return -1
}

func validSlug(s string) bool {
	if s == "" || len(s) > maxSeriesName {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}
