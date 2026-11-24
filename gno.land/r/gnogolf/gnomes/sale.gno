package gnomes

import (
	"chain"
	"errors"
	"time"
)

// A sale puts a whole series on sale from its start, its first hours for
// players only (a record in store), at the prices of the day it was opened.
// It is never changed, and withdrawn only before it starts (CancelSale): a
// later SetPrice never undercuts a buyer.
type sale struct {
	series       string            // its series' name, one sale a series
	start        int64             // block time, unix seconds
	playersUntil int64             // the end of its player window; start when none
	prices       [len(tiers)]int64 // ugnot, per tier, as opened
}

// sales are in opening order, at most one a series.
var sales []sale

// prices is what the next sale opens at, per tier.
var prices [len(tiers)]int64

// SetPrice sets a tier's price for sales not yet opened. Owner only.
func SetPrice(cur realm, tierName string, ugnot int64) {
	assertOwner(0, cur)
	i := tierAt(tierName)
	if i < 0 {
		panic("gnomes: unknown tier " + tierName)
	}
	if ugnot < minPrice || ugnot > maxPrice {
		panic("gnomes: a price is between " + itoa(minPrice) + " and " + itoa(maxPrice) + " ugnot")
	}
	prices[i] = ugnot
	chain.Emit("PriceSet", "tier", tierName, "price", itoa(ugnot))
}

// OpenSale puts every gnome of series name on sale from start (unix seconds,
// block time, from a day before now to a year after) at the current prices.
// For its first playerHours (0 for none) only wallets with a record may buy.
// Owner only, once a series. A genesis sale must start before its closing
// date, if one is set (close.gno).
func OpenSale(cur realm, name string, start, playerHours int64) {
	assertOwner(0, cur)
	if err := openSale(name, start, playerHours); err != nil {
		panic(err)
	}
	chain.Emit("SaleOpened", "series", name, "start", itoa(start),
		"playersUntil", itoa(sales[len(sales)-1].playersUntil))
}

func openSale(name string, start, playerHours int64) error {
	si := seriesNamed(name)
	if si < 0 {
		return errors.New("gnomes: no series " + name)
	}
	// A start in milliseconds would hold every genesis close after it.
	if t := now(); start < t-maxSaleBehind || start > t+maxSaleAhead {
		return errors.New("gnomes: a sale starts from a day before now to a year after (unix seconds)")
	}
	if err := checkCloseFor(si, start); err != nil {
		return err
	}
	if playerHours < 0 || playerHours > maxHours {
		return errors.New("gnomes: a player window is 0 to " + itoa(maxHours) + " hours")
	}
	if saleOf(name) >= 0 {
		return errors.New("gnomes: series " + name + " is on sale already")
	}
	sales = append(sales, sale{series: name, start: start,
		playersUntil: start + playerHours*3600, prices: prices}) // both bounded: no overflow
	return nil
}

// CancelSale withdraws series name's sale before it starts, while none of its
// gnomes can have sold. The series may then be opened again. A sale under way
// is never withdrawn. Owner only.
func CancelSale(cur realm, name string) {
	assertOwner(0, cur)
	s, err := cancelSale(name)
	if err != nil {
		panic(err)
	}
	chain.Emit("SaleCancelled", "series", s.series, "start", itoa(s.start))
}

func cancelSale(name string) (sale, error) {
	i := saleOf(name)
	if i < 0 {
		return sale{}, errors.New("gnomes: series " + name + " is on no sale")
	}
	s := sales[i]
	if now() >= s.start {
		return s, errors.New("gnomes: series " + name + " is on sale since " + dateOf(s.start) +
			": a sale is withdrawn only before it starts")
	}
	rest := make([]sale, 0, len(sales)-1)
	sales = append(append(rest, sales[:i]...), sales[i+1:]...)
	return s, nil
}

// saleOf returns the index of series name's sale, -1 when none.
func saleOf(name string) int {
	for i, s := range sales {
		if s.series == name {
			return i
		}
	}
	return -1
}

// saleAt returns the index of the sale gnome id is sold in, -1 when none.
func saleAt(id int64) int {
	if si := seriesAt(id); si >= 0 {
		return saleOf(catalogue[si].name)
	}
	return -1
}

func now() int64 { return time.Now().Unix() }
