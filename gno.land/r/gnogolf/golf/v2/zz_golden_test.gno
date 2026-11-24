package golf

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/urequire/v0"
)

// The golden tests pin exact outputs: a change that only makes the code
// cheaper must leave every one of these byte for byte as it was. A change to
// them is a change to the game, and says so by failing here.

func lane(zones []physics.Zone, walls ...[]physics.Wall) *physics.Field {
	return &physics.Field{
		Walls:    build.Walls(append([][]physics.Wall{build.Box(physics.V(0, 0), physics.V(40, 10))}, walls...)...),
		Zones:    zones,
		Friction: 0.86,
		Radius:   0.5,
		Bounce:   0.85,
	}
}

// the fixtures: one of each thing a stroke can meet
func goldHoles() map[string]*course.Simple {
	sea := []physics.Vec2{physics.V(1, 3), physics.V(39, 3), physics.V(39, 7), physics.V(1, 7)}
	return map[string]*course.Simple{
		"timed": {W: 40, H: 10, Title: "Timed", Tee: physics.V(3, 5), Pin: physics.V(37, 5), Substeps: 22, CupRadius: 1.2,
			Course: lane(nil, build.Timed(build.Bar(physics.V(20, 0.5), physics.V(20, 9.5), 0.5, 'T', "tram"), 12, 5, 0))},
		"slope": {W: 40, H: 10, Title: "Slope", Tee: physics.V(3, 5), Pin: physics.V(37, 5), Substeps: 24, CupRadius: 1.2,
			Course: lane([]physics.Zone{{Kind: physics.Slope, Min: physics.V(12, 0), Max: physics.V(24, 10), Vec: physics.V(-0.25, 0), Skin: "slope"}})},
		"sea": {W: 40, H: 10, Title: "Sea", Tee: physics.V(3, 5), Pin: physics.V(37, 5), Substeps: 22, CupRadius: 1.2, World: "island",
			Course: lane([]physics.Zone{{Kind: physics.Hazard, Min: physics.V(0, 0), Max: physics.V(40, 10), Vec: physics.V(3, 5), Skin: "sea", Poly: sea, Outside: true}})},
		"tunnel": {W: 40, H: 10, Title: "Tunnel", Tee: physics.V(3, 5), Pin: physics.V(37, 5), Substeps: 22, CupRadius: 1.2,
			Course: lane([]physics.Zone{{Kind: physics.Tunnel, Min: physics.V(14, 3), Max: physics.V(17, 7), Vec: physics.V(30, 5), Skin: "tunnel", Round: true}},
				build.Bar(physics.V(22, 0), physics.V(22, 10), 0.6, '#', "hedge"))},
		"pulse": {W: 40, H: 10, Title: "Pulse", Tee: physics.V(3, 5), Pin: physics.V(37, 5), Substeps: 22, CupRadius: 1.2,
			Pulses: []course.Pulse{{Every: 2, On: 1, Walls: build.Bar(physics.V(20, 3), physics.V(20, 7), 0.5, '=', "gate door")}},
			Course: lane(nil, build.Bar(physics.V(20, 0), physics.V(20, 3), 0.5, '|', "gate"), build.Bar(physics.V(20, 7), physics.V(20, 10), 0.5, '|', "gate"))},
		"storm": {W: 40, H: 10, Title: "Storm", Tee: physics.V(3, 5), Pin: physics.V(37, 5), Substeps: 22, CupRadius: 1.2, World: "island",
			Course: lane(nil)},
	}
}

var goldShots = "0,6;15,4.5,3;-30,8,7;170,2"

func sum(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:8])
}

// the period of a kind of weather for a hole: the first at or before now
func periodOf(id, world string, h *course.Simple, kind string) int64 {
	for p := Period(); p > Period()-2000; p-- {
		if course.ForecastFor(id, world, h, p).Kind == kind {
			return p
		}
	}
	panic("no " + kind + " period")
}

// golden: fixture -> sha256 prefix of its replay (SimulateRoundIn, in a
// period of the weather chosen for it), its forecast, and its HoleState with
// "official":true, the flag these were taken with (a fixture is a community
// entry here, goldAt).
var golden = map[string][3]string{
	"pulse":  {"2df4849397343b5c", "076ac3e7c0d705a9", "e80fe259799b6bb7"},
	"sea":    {"9cc043701ff301c4", "c3224daa821020f4", "e73fad3555ef963b"},
	"slope":  {"0983305ba509f74d", "0757d6c38ca9a9ef", "cdf79e14c4936c42"},
	"storm":  {"51af6518629e6a99", "217b2a005fc76324", "70fda29e98eedd34"},
	"timed":  {"d32d1dc343013582", "c3224daa821020f4", "82144ad536460597"},
	"tunnel": {"325ffde22c9b1a13", "c3224daa821020f4", "8746d7b3047b3df4"},
}

// goldAt keeps h as data under id, listed as the hashes have it: the world
// "garden" when it names none (data always names one), and no order of its
// own.
func goldAt(id string, h *course.Simple) {
	if h.World == "" {
		h.World = "garden"
	}
	community.Set(id, encodeEntry(newEntry(id, cleanName(h.Title), h.Par(), h.World, 1<<20)))
	holeData.Set(id, course.Encode(h))
}

func TestGoldenReplays(cur realm, t *testing.T) {
	for name, h := range goldHoles() {
		id := "gno.land/r/gnogolf/gold_" + name
		goldAt(id, h)
		kind := course.Clear
		if name == "storm" {
			kind = "storm"
		}
		if name == "slope" {
			kind = "rain"
		}
		world := h.World
		if world == "" {
			world = "garden"
		}
		p := periodOf(id, world, h, kind)
		// the period's offset from now, not its number, is what repeats
		got := [3]string{
			sum(SimulateRoundIn(id, goldShots, p)),
			sum(forecastJSON("", weatherOf(mustHole(id), h, p))),
			sum(strings.Replace(HoleState(id), `"official":false`, `"official":true`, 1)),
		}
		want, ok := golden[name]
		if !ok {
			t.Errorf("golden %q: {%q, %q, %q} (period %d)", name, got[0], got[1], got[2], p)
			continue
		}
		if got != want {
			t.Errorf("%s changed: got %v, want %v", name, got, want)
		}
	}
}

func TestARoundHasAStrokeLimit(cur realm, t *testing.T) {
	id := register(cur, "limit")
	for i := 0; i < maxRoundStrokes; i++ {
		testing.SetRealm(testing.NewUserRealm(player))
		Launch(cross(cur), id, 180, 0.5)
	}
	testing.SetRealm(testing.NewUserRealm(player))
	urequire.AbortsContains(t, cur, "stroke limit", func() { Launch(cross(cur), id, 180, 0.5) })
	page := Render(id + "/" + player.String())
	urequire.True(t, strings.Contains(page, "It is at the stroke limit: Reset (below) before the next shot."), page)
}

func TestAFuturePeriodIsRefused(cur realm, t *testing.T) {
	id := register(cur, "ahead")
	urequire.PanicsContains(t, cur, "has not come yet", func() { Weather(id, Period()+1) }) // a query: no realm crossing, a plain panic
}

func TestOfficialHolesAreListedFirst(cur realm, t *testing.T) {
	for i := 0; i < maxListed+2; i++ {
		register(cur, "a"+strconv.Itoa(i))
	}
	id := courseHole(cur, 999) // the last slot of the garden
	l := listed()
	if len(l) != maxListed {
		t.Fatalf("the list is capped at %d, got %d", maxListed, len(l))
	}
	found := false
	for _, e := range l {
		if e.id == id {
			found = true
		}
	}
	if !found {
		t.Fatal("an official hole is always on the list")
	}
}

func TestTheTopIsTen(cur realm, t *testing.T) {
	id := courseHole(cur, 998)
	for i := 0; i < topSize+3; i++ {
		p := testutils.TestAddress("top" + strconv.Itoa(i))
		giveName(cur, p, "top"+strconv.Itoa(i))
		testing.SetRealm(testing.NewUserRealm(p))
		PlayRound(cross(cur), id, "0,0.01;0,1")
	}
	lb := Leaderboard("assisted")
	if n := strings.Count(lb, `"player"`); n != topSize {
		t.Fatalf("the top shows %d, got %d: %s", topSize, n, lb)
	}
}
