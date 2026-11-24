// Package gnomes is the Gnogolf gnomes as GRC721 tokens. The ball is a gnome:
// a player buys one from the catalogue at its sale's price, or earns one in
// play, and equips it. The owner publishes the catalogue a series at a time
// (catalogue.gno), each sold in one sale (sale.gno). A sale's payment goes to
// the treasury in the same call; Sweep forwards any other coin the realm
// receives.
package gnomes

import (
	"chain"
	"chain/runtime"
	"chain/runtime/unsafe"
	"strconv"

	"gno.land/p/nt/bptree/v0"
	"gno.land/p/nt/grc721/royalty/v0"
	"gno.land/p/nt/grc721/v0"
)

// The core state. setUp resets every file's.
var (
	// Not exported: grc721's Token hands any realm a teller (RealmTeller)
	// that approves past token.gno's rules, an earned gnome too.
	token     *grc721.Token    // the read side: name, symbol, owners, balances, approvals
	royalties *royalty.Royalty // EIP-2981, read side
)

// Never returned by reference: the ledgers and trees have mutators.
var (
	ledger        *grc721.PrivateLedger // write side: mint
	teller        grc721.Teller         // acts as this realm's caller: transfers, approvals
	royaltyLedger *royalty.Ledger

	mintOpen bool // the owner's switch over every sale; starts closed

	catalogue []series          // in publishing order, ids following on
	soldTier  [len(tiers)]int64 // sold per tier, every series
	sold      []byte            // a bit per catalogue id, bit id-1, set once sold; a burn does not clear it

	// bptrees pack many rows a node; avl costs about 2 KB of deposit a row
	bought   *bptree.BPTree // buyer -> [len(tiers)]int64, for the lifetime cap
	inWindow *bptree.BPTree // "<series> <buyer>" -> [len(tiers)]int64, for the player cap
	equipped *bptree.BPTree // player -> token id
)

func init(cur realm) { setUp(0, cur, ownerAtDeploy(unsafe.OriginCaller(), runtime.ChainID())) }

// setUp resets every file's state: an empty collection owned by deployer,
// sales closed, earned gnomes open. rlm must be this realm's live cur, which
// grc721 records as the token's home. Tests call it for a fresh collection.
func setUp(_ int, rlm realm, deployer address) {
	token, ledger = grc721.NewToken(tokenName, tokenSymbol, 0, rlm)
	teller = ledger.CallerTeller()
	royalties, royaltyLedger = royalty.NewRoyalty(ledger, royaltyBps)
	ledger.RegisterExtension(holdings{})
	if deployer.IsValid() {
		if err := royaltyLedger.SetDefaultRoyalty(deployer, royaltyBps); err != nil {
			panic(err)
		}
	}
	owner, pending, mintOpen = deployer, "", false
	treasury, pendingTreasury, siteURL = deployer, "", ""
	for i, tr := range tiers {
		prices[i] = tr.price
	}
	catalogue, sales, soldTier, sold = nil, nil, [len(tiers)]int64{}, nil
	closeAt, rules = 0, rulesAtDeploy
	bought, inWindow, equipped, held = seeded(), seeded(), seeded(), seeded()
	earned, kindOf, nextEarned, earnedOpen, golfRows = seeded(), seeded(), firstEarned, true, storeReader{}
}

// MintOpen reports whether sales are open.
func MintOpen() bool { return mintOpen }

// SetMintOpen opens or closes every sale at once. Owner only.
func SetMintOpen(cur realm, open bool) {
	assertOwner(0, cur)
	if open == mintOpen {
		return
	}
	mintOpen = open
	chain.Emit("MintOpen", "open", strconv.FormatBool(open))
}

// mintTo mints catalogue gnome g to whom: a sale's last step.
func mintTo(whom address, g gnome) {
	if err := ledger.Mint(whom, grc721.TokenID(itoa(g.id))); err != nil {
		panic(err)
	}
	held.Set(heldKey(whom, g.id, rankOfTier(g.tier)), "") // see holdings.OnMint
	for int64(len(sold))*8 < g.id {
		sold = append(sold, 0)
	}
	sold[(g.id-1)/8] |= 1 << uint((g.id-1)%8)
	soldTier[g.tier]++
}

// soldIn counts the sold ids from first to last, from the bitmap. A count kept
// in the series would rewrite its rows with every sale.
func soldIn(first, last int64) int64 {
	n := int64(0)
	for id := first; id <= last; id++ {
		if isSold(id) {
			n++
		}
	}
	return n
}

// isSold reports whether catalogue gnome id was ever sold. A burn does not
// unsell it.
func isSold(id int64) bool {
	return id >= 1 && id <= int64(len(sold))*8 && sold[(id-1)/8]&(1<<uint((id-1)%8)) != 0
}

// tokenAt returns gnome id, catalogue or earned.
func tokenAt(id int64) (gnome, bool) {
	if isEarned(id) {
		return earnedAt(id)
	}
	return gnomeAt(id)
}

// tierName is a tier's name, an earned gnome's included.
func tierName(t int) string {
	if t == earnedTier {
		return "earned"
	}
	return tiers[t].name
}

// SoldOfTier returns how many gnomes of tier i were sold across all series.
func SoldOfTier(i int) int64 {
	if i < 0 || i >= len(tiers) {
		return 0
	}
	return soldTier[i]
}

// Refusals are string constants: a stored error value costs a kilobyte of
// deposit.
const (
	errNotOwner    = "gnomes: only the owner can do this"
	errNotUserCall = "gnomes: call this directly from your account (maketx call)"
	errClosed      = "gnomes: the sale is closed"
	errNoGnome     = "gnomes: no such gnome"
	errSold        = "gnomes: this gnome is already sold"
	errNotYours    = "gnomes: not your gnome"
)

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
