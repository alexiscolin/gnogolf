package golf

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
	v1 "gno.land/r/gnogolf/golf"
)

// v1 has no owner under `gno test`, so no course hole: a v1 community hole
// stands in, its id rewritten as a course slot's in v1's answers (as).
func TestTheMigrationCopiesV1sBoards(cur realm, t *testing.T) {
	author := testutils.TestAddress("imauthor")
	testing.SetRealm(testing.NewUserRealm(author))
	from := v1.PublishMine(cross(cur), "old", hexOf(cupHole("garden", 95, "Old")), "the old one")
	id := "garden/95/v3" // v1 had republished the slot: its earlier versions stay on v1
	as := func(s string) string { return strings.ReplaceAll(s, from, id) }

	a, b, c := testutils.TestAddress("ima"), testutils.TestAddress("imb"), testutils.TestAddress("imc")
	giveName(cur, a, "ima")
	giveName(cur, b, "imb")
	for _, x := range []struct {
		p     address
		shots string
	}{{a, "0,0.01;0,1"}, {b, "0,0.01;0,0.01;0,1"}, {c, "0,1"}} { // c unnamed: kept, not ranked
		testing.SetRealm(testing.NewUserRealm(x.p))
		v1.PlayRound(cross(cur), from, x.shots)
	}

	key, _ := slotKeyOf("garden/95")
	alias := from[:strings.LastIndex(from, "/v")]
	importHole(id, key, v1.HoleData(from), jobject(as(v1.Versions(alias)), id), jobject(as(v1.Community("", 100)), id), v1.HoleState(from))
	saved(cur)
	e := find(id)
	uassert.Equal(t, author, e.by)
	uassert.Equal(t, "the old one", e.note)
	uassert.Equal(t, jget(jobject(v1.Community("", 100), from), "plays"), itoa(e.plays))
	vs := Versions("garden/95")
	uassert.Equal(t, 1, strings.Count(vs, `"id":`), vs)
	uassert.True(t, strings.Contains(vs, `"versions":[{"id":"garden/95/v3"`), vs)
	uassert.True(t, strings.Contains(Render(id+"/data"), "version 3 of"))
	cells := func(s string) string { return jget(s, "cells") }
	uassert.Equal(t, cells(v1.HoleState(from)), cells(HoleState(id)), "the wear")

	for _, p := range []address{a, b, c} {
		at := int64(0) // v1 keeps no standing for a community hole: c's is made up
		if p == c {
			at = 777
		}
		uassert.True(t, importRecord(find(id), assisted, p.String(), as(v1.Ghost(from, "assisted", p)), at))
		saved(cur)
	}
	same := func() {
		for _, p := range []address{a, b, c} {
			uassert.Equal(t, as(v1.Ghost(from, "assisted", p)), Ghost(id, "assisted", p))
			uassert.Equal(t, as(v1.HoleRank(from, "assisted", p)), HoleRank(id, "assisted", p))
		}
		uassert.Equal(t, as(v1.Records(from, "assisted", "", 10)), Records(id, "assisted", "", 10))
		uassert.Equal(t, as(v1.HoleLeaderboard(from, "assisted", 0, 10)), HoleLeaderboard(id, "assisted", 0, 10))
	}
	same()
	holes, strokes, _ := standingOf("assisted", a)
	uassert.Equal(t, 1, holes, "the course standing, as a finish here builds it")
	uassert.Equal(t, 2, strokes)
	uassert.Equal(t, 1, BestOf(id, "assisted", c), "an unnamed player's: kept, off the board")
	uassert.Equal(t, int64(777), rowFor(assisted, c.String()).height, "the standing's tie-break: v1's")

	uassert.False(t, importRecord(find(id), assisted, a.String(), as(v1.Ghost(from, "assisted", a)), 0), "twice: nothing")
	testing.SetRealm(testing.NewUserRealm(b))
	v1.Reset(cross(cur), from)
	testing.SetRealm(testing.NewUserRealm(b))
	v1.PlayRound(cross(cur), from, "0,1") // b's better v1 round
	uassert.True(t, importRecord(find(id), assisted, b.String(), as(v1.Ghost(from, "assisted", b)), 0))
	saved(cur)
	same()
	_, strokes, _ = standingOf("assisted", b)
	uassert.Equal(t, 1, strokes, "counted once")
	uassert.False(t, importRecord(find(id), assisted, a.String(), "null", 0), "no v1 record: nothing")

	d := testutils.TestAddress("imd")
	giveName(cur, d, "imd")
	testing.SetRealm(testing.NewUserRealm(d))
	v1.PlayRound(cross(cur), from, "0.001,1") // finer than the game sends
	uassert.False(t, importRecord(find(id), assisted, d.String(), as(v1.Ghost(from, "assisted", d)), 0), "left on v1")
	uassert.Equal(t, 0, BestOf(id, "assisted", d))

	// a copy sent here gives way to the player's own v1 record, worse or not
	g, f := testutils.TestAddress("img"), testutils.TestAddress("imf")
	giveName(cur, g, "img")
	giveName(cur, f, "imf")
	replayAs(cur, g, id, "0.37,0.01;0.41,0.01;0.29,1")
	replayAs(cur, f, id, "0.40,0.02;0.38,0.01;0.31,1.01")
	urequire.True(t, copiesOf(id, assisted).Has(f.String()), "a copy of g's record")
	testing.SetRealm(testing.NewUserRealm(f))
	v1.PlayRound(cross(cur), from, "0,0.01;0,0.01;0,0.01;0,1")
	uassert.True(t, importRecord(find(id), assisted, f.String(), as(v1.Ghost(from, "assisted", f)), 0))
	saved(cur)
	uassert.False(t, copiesOf(id, assisted).Has(f.String()), "no longer a copy")
	uassert.Equal(t, 4, BestOf(id, "assisted", f))
	holes, _, _ = standingOf("assisted", f)
	uassert.Equal(t, 1, holes, "counted once")
	uassert.NotEqual(t, "0", holeRank(id, f), "and ranked")
}

func TestTheMigrationsRefusals(cur realm, t *testing.T) {
	setOwner(deployer)
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner", func() { ImportHole(cross(cur), "garden/96/v1") })
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "not a course slot's current version on v1", func() { ImportHole(cross(cur), "garden/96/v1") })
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "not a course slot's current version on v1", func() { ImportHole(cross(cur), "garden") })
	id := copyHole(cur, "Import")
	key, _ := slotKeyOf(id[:strings.LastIndex(id, "/v")])
	uassert.PanicsContains(t, cur, "already has a version here", func() { importHole(id, key, "", "", "", "") })
	testing.SetRealm(testing.NewUserRealm(heir))
	urequire.AbortsContains(t, cur, "only the owner can import a record", func() { ImportRecord(cross(cur), id, "assisted", heir) })
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, errUnknownHole, func() { ImportRecord(cross(cur), "garden/96/v1", "assisted", heir) })
	other := mine(cur, "importme", cupHole("garden", 1, "Mine"))
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "is not a current course hole", func() { ImportRecord(cross(cur), other, "assisted", heir) })
	testing.SetRealm(testing.NewUserRealm(deployer))
	urequire.AbortsContains(t, cur, "is not v1's", func() { ImportRecord(cross(cur), id, "assisted", heir) }) // published here, not imported
}

func TestTheHubSaysTheOwnerImports(t *testing.T) {
	uassert.True(t, strings.Contains(Render(""), "onto its boards and the standings (ImportRecord)"))
}

func TestJgetReadsV1sJSON(t *testing.T) {
	j := `{"id":"a/v1","note":"say \"hi\" \\ é","n":12,"cells":[0,3,1]},{"id":"a/v10","note":"x"}`
	uassert.Equal(t, `say "hi" \ é`, jget(j, "note"))
	uassert.Equal(t, "12", jget(j, "n"))
	uassert.Equal(t, "0,3,1", jget(j, "cells"))
	uassert.Equal(t, "", jget(j, "none"))
	uassert.Equal(t, "x", jget(jobject(j, "a/v10"), "note"))
	uassert.Equal(t, "", jobject(j, "a/v2"))
}
