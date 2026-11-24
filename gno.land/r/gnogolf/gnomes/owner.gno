package gnomes

import (
	"chain"
	"chain/banker"
	"strings"

	"gno.land/p/gnogolf/weblink"
)

// owner is the collection's only role: the deployer, set at init. Every check
// is on the immediate caller (cur.Previous().Address()), never the signer, so
// a realm the owner calls cannot act in their name. The role passes by
// Transfer then Accept. There is no Renounce.
var (
	owner   address // "" holds no power
	pending address // the address a Transfer offered the role to, "" if none
)

// treasury receives every sale, the royalty and Sweep's strays. It is the
// deployer at deploy. It moves in two steps: SetTreasury offers it, and the
// new address takes it with AcceptTreasury, signed from that address, so a
// mistyped one never receives a sale.
var (
	treasury        address
	pendingTreasury address // the address SetTreasury offered it to, "" if none
)

// siteURL is the game's site, "" until the owner sets it. A gnome's page is
// <site>g/<id>/, TokenMetadata's external_url. The image is the on-chain SVG,
// so nothing a wallet shows depends on it.
var siteURL string

// testDeployer owns the collection under `gno test`, which deploys with no
// signer: testutils.TestAddress("deployer").
const testDeployer = address("g1v3jhqmr009jhyh6lta047h6lta047h6lur0t0x")

// ownerAtDeploy returns the deployer. A deploy with no signer is refused
// outside `gno test` (chain "dev").
func ownerAtDeploy(deployer address, chainID string) address {
	if deployer != "" {
		return deployer
	}
	if chainID != "dev" {
		panic("gnomes: no owner: gnomes must be deployed by an account")
	}
	return testDeployer
}

// Owner returns the collection's owner.
func Owner() address { return owner }

// Pending returns the address Transfer offered the role to, "" if none.
func Pending() address { return pending }

// Treasury returns the address sales are paid to.
func Treasury() address { return treasury }

// PendingTreasury returns the address SetTreasury offered the treasury to, ""
// if none.
func PendingTreasury() address { return pendingTreasury }

// SiteURL returns the game's site, "" until the owner sets it.
func SiteURL() string { return siteURL }

func isOwner(caller address) bool { return owner != "" && caller == owner }

// assertOwner panics unless rlm is the live cur of a crossing function the
// owner called.
func assertOwner(_ int, rlm realm) {
	if !rlm.IsCurrent() || !isOwner(rlm.Previous().Address()) {
		panic(errNotOwner)
	}
}

// Transfer offers the role to to, which takes it with Accept. Offering it to
// the owner cancels an offer. The treasury does not move. Owner only.
func Transfer(cur realm, to address) {
	assertOwner(0, cur)
	if !to.IsValid() {
		panic("gnomes: not an address: " + to.String())
	}
	if to == owner {
		pending = ""
		chain.Emit("OwnershipOfferCancelled", "owner", owner.String())
		return
	}
	pending = to
	chain.Emit("OwnershipOffered", "owner", owner.String(), "to", to.String())
}

// Accept takes the role Transfer offered the caller.
func Accept(cur realm) {
	caller := cur.Previous().Address()
	if owner == "" || pending == "" || caller != pending {
		panic("gnomes: no transfer of the collection is offered to you")
	}
	from := owner
	owner, pending = caller, ""
	chain.Emit("OwnershipTransfer", "from", from.String(), "to", owner.String())
}

// SetTreasury offers the treasury to to, which takes it with AcceptTreasury;
// until then sales are paid where they were. Offering it to the current
// treasury cancels an offer. The realm's own address is refused: sales would
// stay in the realm. Owner only.
func SetTreasury(cur realm, to address) {
	assertOwner(0, cur)
	if !to.IsValid() {
		panic("gnomes: not an address: " + to.String())
	}
	if to == cur.Address() {
		panic("gnomes: the treasury is not the realm's own address")
	}
	if to == treasury {
		pendingTreasury = ""
		chain.Emit("TreasuryOfferCancelled", "treasury", treasury.String())
		return
	}
	pendingTreasury = to
	chain.Emit("TreasuryOffered", "treasury", treasury.String(), "to", to.String())
}

// AcceptTreasury takes the treasury SetTreasury offered the caller, and the
// royalty with it. It must be a direct user call, which proves someone holds
// the address: a realm cannot take it.
func AcceptTreasury(cur realm) {
	caller := cur.Previous().Address()
	if pendingTreasury == "" || caller != pendingTreasury || !cur.Previous().IsUserCall() {
		panic("gnomes: no treasury is offered to you")
	}
	from := treasury
	treasury, pendingTreasury = caller, ""
	if err := royaltyLedger.SetDefaultRoyalty(treasury, royaltyBps); err != nil {
		panic(err)
	}
	chain.Emit("TreasurySet", "from", from.String(), "to", treasury.String())
}

// SetSiteURL sets the game's site, which a gnome's external_url names. url
// must pass weblink.Valid (https://, at most 100 of letters, digits and
// "-._~/:%", no query or fragment) and end with "/". Owner only.
func SetSiteURL(cur realm, url string) {
	assertOwner(0, cur)
	if !weblink.Valid(url) || !strings.HasSuffix(url, "/") {
		panic("gnomes: a site link is https:// and up to 100 of a-z, A-Z, 0-9 and -._~/:%, ending with /")
	}
	siteURL = url
	chain.Emit("SiteURLSet", "url", url)
}

// Sweep sends the treasury the ugnot the realm holds: coins sent to it outside
// a sale. Owner only.
func Sweep(cur realm) {
	assertOwner(0, cur)
	amount := banker.NewReadonlyBanker().GetCoin(cur.Address(), payDenom)
	if amount <= 0 {
		return
	}
	banker.NewBanker(banker.BankerTypeRealmSend, cur).
		SendCoins(cur.Address(), treasury, chain.NewCoins(chain.NewCoin(payDenom, amount)))
	chain.Emit("Swept", "amount", itoa(amount), "to", treasury.String())
}
