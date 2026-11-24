package gnomes

import (
	"errors"

	"gno.land/p/nt/grc721/v0"
)

// The GRC721 surface, what wallets and marketplaces call. Transfers and
// approvals go through the caller-scoped teller, which acts as
// cur.Previous() with the ledger's checks: a caller moves their own gnomes
// and the ones they were approved for, nothing else.

// TransferFrom moves tid from from to to, for its holder or an operator they
// approved; an earned gnome refuses to move (holdings.gno).
func TransferFrom(cur realm, from, to address, tid string) {
	if err := teller.TransferFrom(0, cur, from, to, grc721.TokenID(tid)); err != nil {
		panic(err)
	}
}

// Approve lets to move tid once; an earned gnome is refused, so no market
// lists it.
func Approve(cur realm, to address, tid string) {
	if isEarned(parseID(tid)) {
		panic(errBound)
	}
	if err := teller.Approve(0, cur, to, grc721.TokenID(tid)); err != nil {
		panic(err)
	}
}

// SetApprovalForAll lets operator move every gnome of the caller's; an
// earned one still refuses to move (holdings.gno).
func SetApprovalForAll(cur realm, operator address, approved bool) {
	if err := teller.SetApprovalForAll(0, cur, operator, approved); err != nil {
		panic(err)
	}
}

// Name is the collection's name (tokenName).
func Name() string { return token.GetName() }

// Symbol is the collection's ticker (tokenSymbol).
func Symbol() string { return token.GetSymbol() }

// OwnerOf is who holds tid; an error when nobody does.
func OwnerOf(tid string) (address, error) { return token.OwnerOf(grc721.TokenID(tid)) }

// BalanceOf is how many gnomes addr holds.
func BalanceOf(addr address) (int64, error) { return token.BalanceOf(addr) }

// TotalSupply is how many gnomes exist: those minted, less those burned.
func TotalSupply() int64 { return token.TotalSupply() }

// GetApproved is the address Approve let move tid; an error when there is none.
func GetApproved(tid string) (address, error) { return token.GetApproved(grc721.TokenID(tid)) }

// IsApprovedForAll reports whether operator may move every gnome of owner's.
func IsApprovedForAll(owner, operator address) bool {
	return token.IsApprovedForAll(owner, operator)
}

// TokenOfOwnerByIndex is owner's i-th token, best first as the locker lists
// them, from its index (there is no TokenByIndex: no list of every token is
// kept).
func TokenOfOwnerByIndex(owner address, i int64) (string, error) {
	if i >= 0 {
		if ids, _ := heldPage(owner, i, 1); len(ids) == 1 {
			return itoa(ids[0]), nil
		}
	}
	return "", errors.New("gnomes: no such index")
}

// RoyaltyInfo returns who receives the royalty on a resale of tid at
// salePrice, and how much (EIP-2981: advisory, a marketplace pays it), in
// royalty/v0's shape.
func RoyaltyInfo(tid string, salePrice int64) (address, int64, error) {
	return royalties.RoyaltyInfo(grc721.TokenID(tid), salePrice)
}
