package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// noSale is a published collection with the mint open and no sale.
func noSale(t *testing.T, rlm realm) {
	published(t, rlm)
	mintOpen = true
}

// winter is a second series of three Commons, ids 721 to 723.
func winter(t *testing.T) {
	urequire.NoError(t, addSeries("winter-2027", placeholderRows(721, [len(tiers)]int64{3})))
}

func TestASaleOpensItsSeriesAtItsStart(cur realm, t *testing.T) {
	noSale(t, cur)
	winter(t)
	a := nthOfTier(0, 0)
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { OpenSale(cross(cur), genesisName, now(), 0) })
	testing.SetRealm(asUser(deployer, nil))
	OpenSale(cross(cur), genesisName, now()+3600, 0)

	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "not on sale yet", func() { Buy(cross(cur), itoa(a)) })
	skip(3600)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), itoa(a))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsWithMessage(t, cur, "gnomes: gnome 721 is not on sale", func() { Buy(cross(cur), "721") }, "its series on no sale")
	testing.SetRealm(asUser(alice, ugnot(tiers[topTier].price)))
	Buy(cross(cur), itoa(genesisTotal())) // its last id, a Legendary: the whole series is on sale
}

func TestASaleIsCheckedWhole(cur realm, t *testing.T) {
	noSale(t, cur)
	urequire.NoError(t, openSale(genesisName, now(), 0))
	uassert.ErrorContains(t, openSale(genesisName, now(), 0), "gnomes: series genesis is on sale already", "twice")
	uassert.ErrorContains(t, openSale("spring", now(), 0), "gnomes: no series spring")
	winter(t)
	uassert.ErrorContains(t, openSale("winter-2027", now(), maxHours+1), "a player window is 0 to 168 hours")
	uassert.ErrorContains(t, openSale("winter-2027", now(), -1), "a player window is 0 to 168 hours")
	uassert.Equal(t, 1, len(sales))
}

// The player window: for its first hours a sale sells only to wallets with
// a record in store, a few each; then to anyone.
func TestThePlayerWindowIsForPlayers(cur realm, t *testing.T) {
	noSale(t, cur)
	urequire.NoError(t, openSale(genesisName, now(), 48))
	played("pro", alice)

	testing.SetRealm(asUser(bob, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "players only", func() { Buy(cross(cur), itoa(nthOfTier(0, 0))) })

	for i := 0; i < int(playerCap[0]); i++ {
		testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
		Buy(cross(cur), itoa(nthOfTier(0, i)))
	}
	next := itoa(nthOfTier(0, int(playerCap[0])))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "player window", func() { Buy(cross(cur), next) })

	skip(48 * 3600)
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), next) // the window is over: the lifetime cap alone
	testing.SetRealm(asUser(bob, ugnot(tiers[0].price)))
	Buy(cross(cur), itoa(nthOfTier(0, int(playerCap[0])+1)))
}

func TestARecordInEitherModeCounts(t *testing.T) {
	assisted, pro, none := testutils.TestAddress("assisted"), testutils.TestAddress("pro"), testutils.TestAddress("none")
	f := newFake()
	golfRows = f
	uassert.False(t, hasRecord(assisted))
	f.set("totals", "assisted "+assisted.String(), "1")
	f.set("totals", "pro "+pro.String(), "1")
	uassert.True(t, hasRecord(assisted))
	uassert.True(t, hasRecord(pro))
	uassert.False(t, hasRecord(none))
}

// SetPrice moves the sales yet to open, never one already opened: nobody who
// bought early is undercut.
func TestASaleKeepsItsPrices(cur realm, t *testing.T) {
	noSale(t, cur)
	winter(t)
	first := nthOfTier(0, 0)
	urequire.NoError(t, openSale(genesisName, now(), 0))

	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetPrice(cross(cur), "common", minPrice) })
	testing.SetRealm(asUser(deployer, nil))
	SetPrice(cross(cur), "common", 45_000_000)
	urequire.AbortsContains(t, cur, "between", func() { SetPrice(cross(cur), "common", minPrice-1) })
	urequire.AbortsContains(t, cur, "between", func() { SetPrice(cross(cur), "common", maxPrice+1) })
	urequire.AbortsContains(t, cur, "unknown tier", func() { SetPrice(cross(cur), "mythic", minPrice) })
	uassert.True(t, strings.Contains(Gnome("721"), `"price":45000000,`), "a series on no sale shows the next price")
	urequire.NoError(t, openSale("winter-2027", now(), 0))

	uassert.Equal(t, tiers[0].price, priceOf(first), "the genesis's price stands")
	uassert.Equal(t, int64(45_000_000), priceOf(721), "the next sale takes the new one")
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), itoa(first))
	testing.SetRealm(asUser(alice, ugnot(45_000_000)))
	Buy(cross(cur), "721")
}

// A sale is never changed, so a far start (one in milliseconds, say) would
// hold every genesis close after it. Starts are bounded: a day back to a year
// ahead.
func TestASaleStartsWithinADayBackAndAYearAhead(cur realm, t *testing.T) {
	noSale(t, cur)
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "gnomes: a sale starts from a day before now to a year after (unix seconds)",
		func() { OpenSale(cross(cur), genesisName, now()*1000, 0) }, "milliseconds")
	SetCloseAt(cross(cur), now()+closeNotice) // the close is the owner's still
	for name, w := range map[string][2]int64{
		"a day and a second back": {now() - maxSaleBehind - 1, 0},
		"a year and a second on":  {now() + maxSaleAhead + 1, 0},
		"negative":                {-1, 0},
		"its window overflows":    {1<<63 - 3600, maxHours},
		"the far end of int64":    {1<<63 - 1, 0},
		"the far end, backwards":  {-1 << 63, 0},
	} {
		uassert.ErrorContains(t, openSale(genesisName, w[0], w[1]), "a sale starts from", name)
	}
	uassert.Equal(t, 0, len(sales))
	closeAt = now() + 2*maxSaleAhead
	urequire.NoError(t, openSale(genesisName, now()-maxSaleBehind, maxHours), "a day back")
	winter(t)
	urequire.NoError(t, openSale("winter-2027", now()+maxSaleAhead, maxHours), "a year on")
}

// A sale yet to start has sold nothing and can be withdrawn. Its series is
// free for another, and the close it held is free to come forward. A sale
// under way never is.
func TestASaleYetToStartCanBeCancelled(cur realm, t *testing.T) {
	noSale(t, cur)
	winter(t)
	later := now() + 30*24*3600
	urequire.NoError(t, openSale("winter-2027", now(), 0))
	urequire.NoError(t, openSale(genesisName, later, 0))
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { CancelSale(cross(cur), genesisName) })
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsWithMessage(t, cur, "gnomes: series spring is on no sale", func() { CancelSale(cross(cur), "spring") })
	urequire.AbortsWithMessage(t, cur, "gnomes: series winter-2027 is on sale since "+dateOf(sales[0].start)+": a sale is withdrawn only before it starts",
		func() { CancelSale(cross(cur), "winter-2027") })
	urequire.AbortsContains(t, cur, "the genesis sale starts on", func() { SetCloseAt(cross(cur), now()+7*24*3600) })

	CancelSale(cross(cur), genesisName)
	uassert.Equal(t, 1, len(sales))
	uassert.Equal(t, -1, saleAt(1))
	uassert.Equal(t, "winter-2027", sales[0].series, "the other sale stands")
	SetCloseAt(cross(cur), now()+7*24*3600) // held by it no more
	urequire.NoError(t, openSale(genesisName, now()+3600, 0), "free to open anew")
	skip(3600)
	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1")
	testing.SetRealm(asUser(deployer, nil))
	urequire.AbortsContains(t, cur, "a sale is withdrawn only before it starts", func() { CancelSale(cross(cur), genesisName) }, "started since")
}

// A sale's player window is counted under its series, not its place in the
// list: withdrawing a sale before it never hands a buyer a fresh window.
func TestAWindowSurvivesASaleCancelledBeforeIt(cur realm, t *testing.T) {
	noSale(t, cur)
	winter(t)
	urequire.NoError(t, openSale("winter-2027", now()+24*3600, 0))
	urequire.NoError(t, openSale(genesisName, now(), 48))
	played("pro", alice)
	for i := 0; i < int(playerCap[0]); i++ {
		testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
		Buy(cross(cur), itoa(nthOfTier(0, i)))
	}
	testing.SetRealm(asUser(deployer, nil))
	CancelSale(cross(cur), "winter-2027")
	next := itoa(nthOfTier(0, int(playerCap[0])))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "the player window takes 3 common a wallet", func() { Buy(cross(cur), next) })
	uassert.True(t, strings.Contains(CanBuy(alice, next), `"window":{"until":`+itoa(sales[0].playersUntil)+`,"left":{"common":0,`), CanBuy(alice, next))
}

// Each series' window is its own: what a wallet bought in the genesis's
// does not count in another's.
func TestEachSaleHasItsOwnWindow(cur realm, t *testing.T) {
	noSale(t, cur)
	winter(t)
	urequire.NoError(t, openSale(genesisName, now(), 48))
	urequire.NoError(t, openSale("winter-2027", now(), 48))
	played("pro", bob)
	testing.SetRealm(asUser(bob, ugnot(3*tiers[0].price)))
	Buy(cross(cur), idsOf(0, 3))
	testing.SetRealm(asUser(bob, ugnot(3*tiers[0].price)))
	uassert.Equal(t, "721,722,723", Buy(cross(cur), "721,722,723"))
	testing.SetRealm(asUser(bob, ugnot(tiers[0].price)))
	urequire.AbortsContains(t, cur, "the player window takes 3 common a wallet", func() { Buy(cross(cur), itoa(nthOfTier(0, 3))) })
}
