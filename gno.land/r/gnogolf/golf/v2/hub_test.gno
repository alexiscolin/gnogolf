package golf

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
)

// The expected numbers come from web/lib/featured.ts's own draw.
func TestTheHubsDrawIsTheSites(t *testing.T) {
	const a = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5" // gnodev's test1, and another
	b := "g1" + strings.Repeat("q", 38)
	uassert.Equal(t, uint32(1277278921), draw(a, 20363))
	uassert.Equal(t, uint32(4003602704), draw(b, 20363))
	uassert.Equal(t, uint32(3880469319), draw(a, 1))
}

func TestTheHubPutsRecordsToBeatFirst(cur realm, t *testing.T) {
	id := copyHole(cur, "Hub")
	var ps []address
	for i := 0; i < 6; i++ {
		p := testutils.TestAddress("hub" + strconv.Itoa(i))
		giveName(cur, p, "hub"+strconv.Itoa(i))
		ps = append(ps, p)
		replayAs(cur, p, id, strings.Repeat("0,0.01;", i)+"0,1")
	}
	hub := Render("")
	beat := strings.Index(hub, "## Records to beat today")
	uassert.True(t, beat > 0 && beat < strings.Index(hub, "## The boards"), "records to beat before the boards")
	uassert.True(t, strings.Index(hub, "## Community holes") < strings.Index(hub, "## The boards"), "the boards after the holes")
	section := hub[beat:strings.Index(hub, "## The boards")]
	section = section[:strings.Index(section, "\n## ")+1]
	uassert.True(t, strings.Contains(section, "Today's pick") || strings.Contains(section, "Fast start") || strings.Contains(section, "Best average"), section)
	uassert.True(t, strings.Contains(section, "race their ghosts"), "each a way to race them")
	first := strings.Split(CourseLeaderboard("assisted", 0, 3), `"player":"`)[1:]
	uassert.Equal(t, 3, len(first))
	for _, r := range first {
		p := r[:strings.Index(r, `"`)]
		uassert.False(t, strings.Contains(section, p), "never the ranking's first three: "+p)
	}
	uassert.True(t, strings.Contains(hub, "## Fair play"))
	uassert.True(t, strings.Contains(hub, "steps of 0.01"))
	uassert.True(t, strings.Contains(hub, "("+dataHub+")"), "a link to where the records are kept")
	uassert.True(t, strings.Contains(hub, "three days after their code is on chain"), "who can change what says the rules can be replaced")
}
