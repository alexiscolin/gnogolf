package golf

import (
	"chain"
	"strconv"
	"strings"

	v1 "gno.land/r/gnogolf/golf"
)

// The v1 migration, onyx only: stage.sh leaves this file out of the mainnet
// deploy. Holes and records are read from v1 on chain in the call that writes
// them, so nobody types a value in. Nothing is replayed: v1 already did, with
// the same physics. A hole keeps v1's id, so its weather and records still fit.

// EventImported is a v1 record copied in. EventNotImported is one left on v1:
// it has a shot finer than validShot takes, so its ghost would not replay here.
const (
	EventImported    = "Imported"
	EventNotImported = "NotImported"
)

func init() {
	importNote = "The owner can also copy a v1 course hole into a slot here that has none (ImportHole), and v1's records of it onto its boards and the standings (ImportRecord), read from v1 in the same call: v1 has no near-copy rule, so a record sent again there and copied ranks here. "
}

// ImportHole copies v1's current version of a course slot, by id
// ("garden/7/v3"): its data, provenance, plays and wear. Owner only, into a
// slot v2 has nothing in yet. It returns the hole's id.
func ImportHole(cur realm, id string) string {
	begin()
	r := importHoleNow(cur, id)
	flush(cur)
	return r
}

func importHoleNow(cur realm, id string) string {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can import a course hole")
	}
	cut := strings.LastIndex(id, "/v")
	if cut < 0 || v1.Current(id[:cut]) != id {
		panic("golf: " + id + " is not a course slot's current version on v1")
	}
	slot := id[:cut]
	key, ok := slotKeyOf(slot)
	if !ok {
		panic("golf: " + slot + " is not a course slot")
	}
	return importHole(id, key, v1.HoleData(id), jobject(v1.Versions(slot), id), jobject(v1.Holes(), id), v1.HoleState(id))
}

// importHole stores version id in slot key from v1's answers: HoleData
// (hexData), its Versions row (ver), its Holes row (row) and HoleState (state).
func importHole(id, key, hexData, ver, row, state string) string {
	cut := strings.LastIndex(id, "/v")
	slot := id[:cut]
	if slots.Has(key) {
		panic("golf: " + slot + " already has a version here")
	}
	h, data, sum := decodeData(hexData)
	if own := h.World + "/" + strconv.Itoa(int(h.Order)); own != slot {
		panic("golf: v1's data of " + id + " is " + own) // v1 checked it at publish: cannot happen
	}
	e := dataEntry(slot, atoi(id[cut+2:]), h, address(jget(ver, "by")), sum, jget(ver, "note"))
	e.height = atoi64(jget(ver, "height"))
	e.plays = atoi(jget(row, "plays"))
	e.official = true
	saveEntry(e)
	holeData.Set(e.id, data)
	slots.Set(key, e.id)
	for i, c := range strings.Split(jget(state, "cells"), ",") {
		if c != "0" && c != "" && i < wearCells {
			e.wear().Set(pad(i, 3), itoa(atoi(c)))
		}
	}
	chain.Emit(EventHolePublished, "hole", e.id, "slot", slot, "sha", sum, "by", e.by.String(), "official", "true")
	return e.id
}

// ImportRecord copies a player's v1 best on an imported hole in a mode, from
// v1's Ghost, and seats it as a finish would. Owner only: v1 plays on with no
// near-copy rule, so its later rounds are not for anyone to rank here. The hole
// must hold v1's data, by its sha. Idempotent: a record already as good stays,
// a better v1 one replaces it. A record with a shot finer than 0.01, which the
// game never sends, stays on v1. It reports whether it copied anything.
func ImportRecord(cur realm, hole, mode string, player address) bool {
	begin()
	r := importRecordNow(cur, hole, mode, player)
	flush(cur)
	return r
}

func importRecordNow(cur realm, hole, mode string, player address) bool {
	if !isOwner(cur.Previous().Address()) {
		panic("golf: only the owner can import a record")
	}
	e, m := mustHole(hole), modeOf(mode)
	if !e.official || e.next != "" {
		panic("golf: " + hole + " is not a current course hole here")
	}
	// Versions lists a slot's newest 100: an older version is refused, never
	// wrongly let in.
	if jget(jobject(v1.Versions(e.slot), e.id), "sha") != e.sha {
		panic("golf: " + hole + " here is not v1's " + hole)
	}
	// v1's standing height, for the tie-break: the Players page that starts
	// just before the player's key.
	p, at := player.String(), int64(0)
	if row := v1.Players(mode, p[:len(p)-1], 1); jget(row, "player") == p {
		at = atoi64(jget(row, "height"))
	}
	return importRecord(e, m, p, v1.Ghost(hole, mode, player), at)
}

// importRecord copies p's best on e in mode m from v1's Ghost g. at is the
// height of p's v1 standing, the course ranking's tie-break, 0 for none.
func importRecord(e *entry, m int, p, g string, at int64) bool {
	if g == "null" {
		return false
	}
	strokes, shots := atoi(jget(g, "strokes")), jget(g, "shots")
	if strokes < 1 || jget(g, "hole") != e.id {
		panic("golf: v1's record of " + e.id + " does not read") // v1 writes them: cannot happen
	}
	for _, s := range strings.Split(shots, ";") {
		if a, pw, _ := parseShot(s); !cents(a) || !cents(pw) {
			chain.Emit(EventNotImported, "hole", e.id, "player", p, "mode", modeNames[m], "shot", s)
			return false
		}
	}
	best, _ := e.bests(m).Get(p)
	was, wasCopy := bestStrokes(best), e.copies(m).Has(p)
	if was > 0 && was <= strokes && !wasCopy { // a v1 record replaces a copy played here
		return false
	}
	if wasCopy { // a copy played here: never counted, never on the board
		e.copies(m).Remove(p)
		was = 0
	} else if was > 0 {
		e.board(m).Remove(boardKey(best, p))
	}
	best = itoa(strokes) + " " + i64(atoi64(jget(g, "height"))) + " " + i64(atoi64(jget(g, "period"))) + " " + shots
	e.bests(m).Set(p, best)
	r := &row{player: p}
	if v, ok := totals[m].Get(p); ok {
		r = decodeRow(v)
	}
	if at == 0 { // no v1 standing: the record's height
		at = atoi64(jget(g, "height"))
	}
	if at < r.height { // a later finish here wins
		at = r.height
	}
	if was == 0 {
		setRow(m, r, r.holes+1, r.strokes+strokes, r.par+e.par, at)
	} else {
		setRow(m, r, r.holes, r.strokes+strokes-was, r.par, at)
	}
	if named(p) {
		seat(e, m, p, best)
	}
	saveEntry(e)
	chain.Emit(EventImported, "hole", e.id, "player", p, "mode", modeNames[m], "strokes", itoa(strokes))
	return true
}

// jobject is the v1 list j from the object whose "id" is id, "" if none. jget
// then reads that object: every object holds every field, so the first match is
// its own.
func jobject(j, id string) string {
	i := strings.Index(j, `{"id":`+jstr(id)+`,`)
	if i < 0 {
		return ""
	}
	return j[i:]
}

// jget is field k of v1's JSON as jstr writes it: a string unescaped, a number,
// or the inside of an array. "" if absent.
func jget(j, k string) string {
	i := strings.Index(j, `"`+k+`":`)
	if i < 0 {
		return ""
	}
	v := j[i+len(k)+3:]
	switch {
	case v == "":
		return ""
	case v[0] == '"':
		end := 1
		for end < len(v) && v[end] != '"' {
			if v[end] == '\\' {
				end++
			}
			end++
		}
		s, err := strconv.Unquote(v[:end+1])
		if err != nil {
			panic("golf: v1's " + k + " does not read")
		}
		return s
	case v[0] == '[':
		return v[1:strings.Index(v, "]")]
	}
	return v[:strings.IndexAny(v, ",}]")]
}
