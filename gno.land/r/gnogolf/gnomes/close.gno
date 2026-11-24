package gnomes

import (
	"chain"
	"errors"
	"time"
)

// closeAt is the genesis sale's closing date, 0 for none: the genesis then
// sells until sold out. Once set it only comes forward and is never removed,
// so a buyer can count on it. From that block on, the genesis's unsold gnomes
// are closed for good: Buy and OpenSale refuse them. Later series and earned
// gnomes are never closed.
var closeAt int64

// closeNotice is the least notice of a close, or of one brought forward.
const closeNotice int64 = 7 * 24 * 3600

// CloseAt returns the genesis sale's closing date (unix seconds, block time),
// 0 for none.
func CloseAt() int64 { return closeAt }

// SetCloseAt sets the genesis sale's closing date, or brings it forward.
// Owner only. Panics before the genesis is published, once its sale has
// closed, and for a date later than the one set, less than closeNotice ahead,
// or not after the sale's start.
func SetCloseAt(cur realm, at int64) {
	assertOwner(0, cur)
	if len(catalogue) == 0 {
		panic("gnomes: publish the genesis first")
	}
	if genesisClosed() {
		panic("gnomes: the genesis sale closed on " + dateOf(closeAt))
	}
	if at < now()+closeNotice {
		panic("gnomes: a closing date is announced at least " + itoa(closeNotice/(24*3600)) + " days ahead")
	}
	if closeAt != 0 && at > closeAt {
		panic("gnomes: the closing date comes forward, never later than " + dateOf(closeAt))
	}
	if i := saleOf(genesisName); i >= 0 && sales[i].start >= at {
		panic("gnomes: the genesis sale starts on " + dateOf(sales[i].start) + ": the close comes after it")
	}
	closeAt = at
	chain.Emit("CloseAtSet", "at", itoa(at))
}

// genesisClosed reports whether the genesis sale has closed.
func genesisClosed() bool { return closeAt != 0 && now() >= closeAt }

// isClosed reports whether gnome id was left unsold by a closed sale.
func isClosed(id int64) bool {
	return genesisClosed() && seriesAt(id) == 0 && !isSold(id)
}

func errClosedOn() string { return "gnomes: the genesis sale closed on " + dateOf(closeAt) }

// checkCloseFor refuses a genesis sale (series 0) once the genesis has closed,
// or one starting at or after its closing date: nobody could buy from it.
func checkCloseFor(si int, start int64) error {
	switch {
	case si != 0:
		return nil
	case genesisClosed():
		return errors.New(errClosedOn())
	case closeAt != 0 && start >= closeAt:
		return errors.New("gnomes: the genesis sale starts before it closes, on " + dateOf(closeAt))
	}
	return nil
}

// dateOf writes a unix time as "2026-11-30 18:00 UTC".
func dateOf(t int64) string { return time.Unix(t, 0).UTC().Format("2006-01-02 15:04 UTC") }
