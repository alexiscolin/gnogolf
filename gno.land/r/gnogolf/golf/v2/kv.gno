package golf

import (
	"strconv"
	"strings"

	"gno.land/r/gnogolf/store"
)

// view is the rows of one of store's collections under a prefix. The data lives
// in store, a realm apart from these rules, so that later rules can take it on.
// Writes are queued, read back by Get and Has, and sent in one batch when the
// entrypoint returns (flush). Iterate and ReverseIterate merge the queued
// writes in. Size, index and IterateByOffset read store as it stands and panic
// over rows this call has written: only read paths use them.
type view struct {
	c string // the collection
	p string // the prefix: "" for the whole collection, else ending with a space, which no id holds
}

var (
	queued []string          // set/del ops, four strings each, in order
	over   map[string]string // collection + "\x00" + key -> its value now; "\x00" for removed
	seen   map[string]*entry // versions loaded by this writing call, one object each (find)
)

// begin opens a call that writes: every crossing entrypoint that writes
// starts with it and ends with flush.
func begin() { seen = map[string]*entry{} }

const gone = "\x00"

func (v view) end() string {
	if v.p == "" {
		return ""
	}
	return v.p[:len(v.p)-1] + "!"
}

func (v view) Get(k string) (string, bool) {
	if x, ok := over[v.c+"\x00"+v.p+k]; ok {
		return x, x != gone
	}
	return store.Get(v.c, v.p+k)
}

func (v view) Has(k string) bool {
	_, ok := v.Get(k)
	return ok
}

func (v view) Set(k, x string) {
	queue("set", v.c, v.p+k, x)
}

// Remove drops a row, reporting whether it was there.
func (v view) Remove(k string) bool {
	if !v.Has(k) {
		return false
	}
	queue("del", v.c, v.p+k, gone)
	return true
}

func queue(op, c, k, x string) {
	if over == nil {
		over = map[string]string{}
	}
	if op == "del" {
		queued = append(queued, op, c, k, "")
	} else {
		queued = append(queued, op, c, k, x)
	}
	over[c+"\x00"+k] = x
}

// flush sends the queued writes to store, in batches store accepts. Every
// writing entrypoint ends with it, once its work went through: a refusal writes
// nothing.
func flush(cur realm) {
	for i := 0; i < len(queued); i += 4 * 64 {
		j := i + 4*64
		if j > len(queued) {
			j = len(queued)
		}
		store.Batch(cross(cur), queued[i:j])
	}
	queued, over, seen = nil, nil, nil
}

// clean panics if this call has written to the view: store lacks those rows.
func (v view) clean() {
	for k := range over {
		if strings.HasPrefix(k, v.c+"\x00"+v.p) {
			panic("golf: a walk over " + v.c + " " + v.p + "after writing to it in the same call")
		}
	}
}

// Size is how many rows the view holds.
func (v view) Size() int {
	v.clean()
	if v.p == "" {
		return store.Size(v.c)
	}
	return store.Index(v.c, v.end()) - store.Index(v.c, v.p)
}

// index is how many of its rows sort before k: k's place, from 0.
func (v view) index(k string) int {
	v.clean()
	return store.Index(v.c, v.p+k) - store.Index(v.c, v.p)
}

// Iterate walks the rows in [start, end) ascending, end "" for no bound. cb
// returning true stops it, and Iterate then reports true.
func (v view) Iterate(start, end string, cb func(key, x string) bool) bool {
	return v.walk(start, end, cb, false)
}

// ReverseIterate walks the rows in [start, end] descending, end "" for no
// bound. Like store's back walk, it includes its end.
func (v view) ReverseIterate(start, end string, cb func(key, x string) bool) bool {
	return v.walk(start, end, cb, true)
}

func (v view) walk(start, end string, cb func(key, x string) bool, back bool) bool {
	lo, hi := v.p+start, v.end()
	if end != "" {
		hi = v.p + end
	}
	// This call's own writes in the range, in walk order, merged into store's
	// rows as they come: a finish on an archived hole, then its drain.
	in := func(k string) bool { return k >= lo && (hi == "" || k < hi || back && k == hi) }
	var mine []string
	for ck := range over {
		if c, k, _ := strings.Cut(ck, "\x00"); c == v.c && in(k) {
			mine = append(mine, k)
		}
	}
	sortKeys(mine, back)
	emit := func(k, x string) bool { return cb(k[len(v.p):], x) }
	// Our writes before k (all for k ""); true if the walk stopped.
	flushMine := func(k string) bool {
		for len(mine) > 0 && (k == "" || (!back && mine[0] < k) || (back && mine[0] > k)) {
			m := mine[0]
			mine = mine[1:]
			if x := over[v.c+"\x00"+m]; x != gone && emit(m, x) {
				return true
			}
		}
		return false
	}
	// Pages start small and double: most walks stop after a few rows. A back
	// page includes its end, so each one after the first repeats the last key,
	// which is skipped.
	again, size := "", firstRead
	for {
		var page string
		if back {
			page = store.PageBack(v.c, lo, hi, size)
		} else {
			page = store.Page(v.c, lo, hi, size)
		}
		n, last := 0, ""
		for page != "" {
			var k, x string
			k, x, page = nextRow(page)
			n, last = n+1, k
			if k == again {
				continue
			}
			if flushMine(k) {
				return true
			}
			if len(mine) > 0 && mine[0] == k { // ours: as it stands now
				mine = mine[1:]
				if x = over[v.c+"\x00"+k]; x == gone {
					continue
				}
			}
			if emit(k, x) {
				return true
			}
		}
		if n < size {
			return flushMine("")
		}
		if back {
			hi, again = last, last
		} else {
			lo = last + "\x00" // the next key up
		}
		if size *= 2; size > maxRead {
			size = maxRead
		}
	}
}

// sortKeys sorts keys ascending, or descending for back. Insertion sort: there
// are only a handful.
func sortKeys(ks []string, back bool) {
	for i := 1; i < len(ks); i++ {
		for j := i; j > 0 && (!back && ks[j] < ks[j-1] || back && ks[j] > ks[j-1]); j-- {
			ks[j], ks[j-1] = ks[j-1], ks[j]
		}
	}
}

// IterateByOffset is count rows from the offset-th, fewer at the end.
func (v view) IterateByOffset(offset, count int, cb func(key, x string) bool) bool {
	v.clean()
	from, end := store.Index(v.c, v.p)+offset, v.end()
	for count > 0 {
		n := count
		if n > maxRead {
			n = maxRead
		}
		page, got := store.PageAt(v.c, from, n), 0
		for page != "" {
			var k, x string
			k, x, page = nextRow(page)
			if end != "" && k >= end || cb(k[len(v.p):], x) {
				return true
			}
			got++
		}
		if got < n {
			return false
		}
		from, count = from+got, count-got
	}
	return false
}

// Page sizes asked of store: a walk's first, and the largest.
const (
	firstRead = 8
	maxRead   = 300
)

// nextRow splits a store page into its first row and the rest. Each field is
// its length, ":" and itself.
func nextRow(page string) (string, string, string) {
	k, rest := field(page)
	x, rest := field(rest)
	return k, x, rest
}

func field(s string) (string, string) {
	i := strings.IndexByte(s, ':')
	if i < 0 {
		panic("golf: store's page unread")
	}
	n, err := strconv.Atoi(s[:i])
	if err != nil || n < 0 || i+1+n > len(s) {
		panic("golf: store's page unread")
	}
	return s[i+1 : i+1+n], s[i+1+n:]
}
