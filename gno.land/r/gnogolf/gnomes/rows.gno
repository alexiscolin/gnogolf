package gnomes

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// A series' rows are read in place. Ids follow on with no gap, so an id's row
// is found by bisection on byte offsets, stepping back to the line's start:
// about ten steps for the genesis.

// rowOf returns the line of gnome id in rows, "" when there is none.
func rowOf(rows string, id int64) string {
	lo, hi := 0, len(rows)
	for lo < hi {
		mid := lo + (hi-lo)/2
		start := lineStart(rows, mid)
		end := lineEnd(rows, start)
		at := idOf(rows[start:end])
		switch {
		case at == id:
			return rows[start:end]
		case at < id:
			lo = end + 1
		default:
			hi = start
		}
	}
	return ""
}

// lineStart is the first byte of the line containing offset i.
func lineStart(rows string, i int) int {
	return strings.LastIndexByte(rows[:i], '\n') + 1
}

// lineEnd is the offset of the newline ending the line starting at start,
// or len(rows) for the last line.
func lineEnd(rows string, start int) int {
	if n := strings.IndexByte(rows[start:], '\n'); n >= 0 {
		return start + n
	}
	return len(rows)
}

// idOf reads the id at the start of a row, 0 when there is none.
func idOf(row string) int64 {
	n := strings.IndexByte(row, '|')
	if n < 0 {
		return 0
	}
	return parseID(row[:n])
}

// parseRow reads "id|tier|name|traits", checking every field.
func parseRow(row string) (gnome, error) {
	f := strings.Split(row, "|")
	if len(f) != 4 {
		return gnome{}, errors.New("gnomes: a row is id|tier|name|traits")
	}
	id := parseID(f[0])
	if id == 0 {
		return gnome{}, errors.New("gnomes: a row starts with its id")
	}
	ti := tierAt(f[1])
	if ti < 0 {
		return gnome{}, errors.New("gnomes: unknown tier " + f[1])
	}
	if !plainName(f[2]) {
		return gnome{}, errors.New("gnomes: a name is 1 to " + itoa(maxGnomeName) + " bytes of letters, digits, spaces and - ' .")
	}
	if !printable(f[3], maxTraits) {
		return gnome{}, errors.New("gnomes: traits are 1 to " + itoa(maxTraits) + " bytes of printable ASCII")
	}
	return gnome{id: id, tier: ti, name: f[2], traits: f[3]}, nil
}

// plainName reports whether s may be a gnome's name, wherever it is shown
// (gnoweb's Markdown, a wallet's text, a market's JSON, the portrait's SVG):
// 1 to maxGnomeName bytes of valid UTF-8, each rune a Latin letter (ASCII,
// Latin-1, Latin Extended-A), a digit, a space or one of - ' . So nothing a
// page reads as markup or a link, and nothing unseen: no control, bidi,
// zero-width or combining rune. web/lib/gnomes/rows.ts keeps the same rule
// (rowcases_test.gno).
func plainName(s string) bool {
	if s == "" || len(s) > maxGnomeName || !utf8.ValidString(s) {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == ' ', r == '-', r == '\'', r == '.':
		case r >= 0xc0 && r <= 0x17f && r != 0xd7 && r != 0xf7: // À to ſ, less × and ÷
		default:
			return false
		}
	}
	return true
}

// printable reports whether s is 1 to max bytes of printable ASCII, a space
// included.
func printable(s string, max int) bool {
	if s == "" || len(s) > max {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] > 0x7e {
			return false
		}
	}
	return true
}
