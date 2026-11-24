package gnomes

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func TestTokenURIIsAnOnChainSVG(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	_, err := TokenURI(itoa(id))
	uassert.Error(t, err, "not sold")

	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	uri, err := TokenURI(tid)
	urequire.NoError(t, err)
	urequire.True(t, strings.HasPrefix(uri, svgDataPrefix), uri)
	svg := decodeDataURI(t, uri)
	g := mustGnome(id)
	uassert.True(t, strings.HasPrefix(svg, "<svg"), svg)
	uassert.True(t, strings.Contains(svg, `<rect width="`+artSize+`" height="`+artSize+`" fill="#`+artTiers[(g.tier+1)*18:(g.tier+1)*18+6]+`"/>`), "the tier's ground is drawn")
	uassert.True(t, strings.Contains(svg, "<title>"+xmlEscape(g.name)+"</title>"), svg)
	uassert.True(t, strings.HasSuffix(svg, "</svg>"), svg)
}

// AddSeries holds names to plain letters (TestANameIsLettersAndPlainMarks);
// the SVG escapes them all the same.
func TestANameCannotInjectMarkup(t *testing.T) {
	svg := drawGnome(gnome{tier: 0, name: `<script>"x"</script>`, traits: classic})
	uassert.False(t, strings.Contains(svg, "<script>"), svg)
	uassert.True(t, strings.Contains(svg, "&lt;script&gt;&quot;x&quot;"), svg)
}

func TestXMLEscape(t *testing.T) {
	uassert.Equal(t, "a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;", xmlEscape(`a & <b> "c" 'd'`))
}

// classic is the plain look written out: every code plain, every colour unset.
const classic = "01010100000000ffff00ffff00ff00000000ff00ff00ff00ff00ff00ff"

// draw is a common gnome of traits drawn.
func draw(traits string) string { return drawGnome(gnome{tier: 0, name: "Pip", traits: traits}) }

// Traits the realm cannot read draw the Classic and never panic.
func TestUnreadableTraitsDrawTheClassic(t *testing.T) {
	want := draw(classic)
	for _, traits := range []string{"", "01", "v0.1", "zz", "0", "0101010", "01010100000000FFFF", "02010100000500ffff", "ff", strings.Repeat("01", 300)} {
		uassert.Equal(t, want, draw(traits), traits)
	}
}

// A code past its table, a colour past the palette, a thing worn past the
// vocab: plain, as codec.ts reads them. Missing bytes are plain, extra bytes
// ignored.
func TestUnknownTraitsDrawPlain(t *testing.T) {
	want := draw(classic)
	for _, f := range []int{fHat, fBeard, fPattern, fPiece, fMaterial, fTrail, fProp, fHatColour, fBrim, fBody, fAccent} {
		uassert.Equal(t, want, draw(with(classic, f, 250)), "field "+itoa(int64(f)))
	}
	uassert.Equal(t, want, draw(with(classic, fWear, 0x80)), "a thing worn past the vocab")
	uassert.Equal(t, want, draw("010101"), "short: the rest plain")
	uassert.Equal(t, want, draw(classic+"0a0b0c"), "long: the rest ignored")
}

// with is traits with field f set to v.
func with(traits string, f int, v byte) string {
	return traits[:2*f] + string(hexDigits[v>>4]) + string(hexDigits[v&0xf]) + traits[2*f+2:]
}

// The tables have a line for each code of the client's vocab
// (web/lib/gnomes/vocab.ts, props.ts). The counts only grow.
func TestTheArtCoversTheVocab(t *testing.T) {
	for _, c := range []struct {
		name   string
		got, n int
		at     func(int) string
	}{
		{"hats", artHatsN, 19, artHats}, {"beards", artBeardsN, 8, artBeards}, {"wear", artWearN, 22, artWear},
		{"pieces", artPiecesN, 7, artPieces}, {"patterns", artPatternsN, 7, artPatterns},
		{"materials", artMaterialsN, 12, artMaterials}, {"trails", artTrailsN, 18, artTrails},
		{"props", artPropsN, 73, artProps}, {"earned", artEarnedN, 9, artEarned},
	} {
		uassert.Equal(t, c.n, c.got, c.name)
		uassert.Equal(t, "", c.at(c.got), c.name+": nothing past the table")
	}
	uassert.Equal(t, 82*6, len(artPalette))
	uassert.Equal(t, 82, len(artDark))
	uassert.Equal(t, 5*18, len(artTiers))
}

// Every value of every drawn field changes the picture, and each colour where
// something takes it. Series, home, archetype, kind and holing are not drawn.
func TestEveryTraitIsDrawn(t *testing.T) {
	plain := draw(classic)
	for _, c := range []struct{ field, n int }{
		{fHat, artHatsN}, {fBeard, artBeardsN}, {fPiece, artPiecesN}, {fPattern, artPatternsN},
		{fMaterial, artMaterialsN}, {fTrail, artTrailsN}, {fProp, artPropsN},
	} {
		for k := 1; k < c.n; k++ { // 0 is the plain
			uassert.NotEqual(t, plain, draw(with(classic, c.field, byte(k))), "field "+itoa(int64(c.field))+" code "+itoa(int64(k)))
		}
	}
	for k := 0; k < artWearN; k++ {
		look := classic
		for i := 0; i < 4; i++ {
			look = with(look, fWear+i, byte(uint32(1)<<uint(k)>>uint(24-8*i)))
		}
		uassert.NotEqual(t, plain, draw(look), "thing worn "+itoa(int64(k)))
	}
	// each colour, on a gnome wearing what takes it
	for _, c := range []struct {
		field int
		on    string
	}{
		{fHatColour, classic}, {fBrim, classic}, {fHair, classic}, {fBody, classic},
		{fPatColour, with(classic, fPattern, 1)}, {fAccent, with(classic, fWear+1, 0x02)}, // a neckerchief (bit 17)
		{fPieceCol, with(classic, fPiece, 1)}, {fMatColour, with(classic, fMaterial, 1)},
		{fTrailCol, with(classic, fTrail, 1)}, {fPropColour, with(classic, fProp, 1)},
	} {
		uassert.NotEqual(t, draw(c.on), draw(with(c.on, c.field, 30)), "colour field "+itoa(int64(c.field)))
	}
}

// An earned gnome's traits are his kind: he is drawn as the game draws him
// (artEarned), whatever the rest of the string says.
func TestAnEarnedGnomeIsTheGames(t *testing.T) {
	for k := 1; k <= len(earnedKinds); k++ {
		uassert.Equal(t, draw(artEarned(k-1)), draw(earnedTraits(k)), earnedKinds[k-1])
		uassert.NotEqual(t, draw(classic), draw(earnedTraits(k)), earnedKinds[k-1])
	}
}

// A material is the body in its stead (its art starts with !): the plain
// body is not drawn under it.
func TestAMaterialStandsInForTheBody(t *testing.T) {
	body := artCore[strings.IndexByte(artCore, ':')+1 : strings.IndexByte(artCore, '|')]
	for k := 1; k < artMaterialsN; k++ {
		uassert.Equal(t, strings.Count(artMaterials(k), body), strings.Count(draw(with(classic, fMaterial, byte(k))), body), "material "+itoa(int64(k)))
	}
}

// samples are Genesis gnomes (data/gnomes.json): an earned one, one of each
// tier, the first Common of each archetype, the heaviest picture (Figurehead
// Fen), a pattern, and the materials drawn apart. Their SVGs are held by hash
// and size.
var samples = []struct {
	name, traits, tier, sha string
}{
	{"The Gnome King", earnedTraits(8), "earned", "776c980f91a2e66f"},
	{"Mortimer Greenthumb", "010102000101064aff02061000ff0000000000014a00ff010000ff00ff", "rare", "cfae2705d160ac9f"},
	{"Old Tock", "010103000101003dff00363600ff00000000ff00ff013c020f013d013d", "epic", "0c8d069f82e60de0"},
	{"The Miller", "0101040401011131ff01062600ff000000080000ff00ff080b130b45ff", "legendary", "58018d45340678e7"},
	{"Figurehead Fen", "0101030002040932ff06345100ff000000000100ff02330c0302330cff", "epic", "b0531507c25cc933"},
	{"Juniper Troutbridge", "0101010001020716ff01083000ff000200010700ff00ff00ff00ff00ff", "common", "ca5a9a4889c6d9ba"},
	{"Yvette Potting", "0101010001010651ff02152800ff000000084800ff00ff00ff00ff00ff", "common", "e6899478f5b3cd1d"},
	{"Yarrow Gunwale", "0101010002030800ff00333000ff001200002500ff00ff00ff00ff00ff", "common", "4a75cdf011e03268"},
	{"Perry Knotwell", "0101010002040900ff00080100ff000300000300ff00ff00ff00ff00ff", "common", "9b8862a45ba180d4"},
	{"Yarrow Varnish", "0101010003060a2cff07344e00ff000208002700ff00ff00ff00ff00ff", "common", "f2df2a26a356fcce"},
	{"Stan Sourdough", "0101010003050301ff05084e00ff000000013900ff00ff00ff00ff00ff", "common", "3c256e6eaf3ab158"},
	{"Hazel Crag", "0101010004080c33ff00162400ff000000080300ff00ff00ff00ff00ff", "common", "c80de590c586203d"},
	{"Nell Moguls", "0101010004070b29ff02352300ff001000022500ff00ff00ff00ff00ff", "common", "30611f1d35127f72"},
	{"Cosmo Lodestone", "01010100050a0d51ff05152800ff000200004800ff00ff00ff00ff00ff", "common", "636ec61382f3a644"},
	{"Dob Orewell", "0101010005090500ff02065000ff000200002900ff00ff00ff00ff00ff", "common", "90db18eec1db19a1"},
	{"Verity Charwell", "01010100060b0e31ff00062b00ff000200010000ff00ff00ff00ff00ff", "common", "045cc5c1039cba81"},
	{"Tuck Anvilby", "01010100060c0f27ff00064e00ff000900003c00ff00ff00ff00ff00ff", "common", "af4ae3c286582fb6"},
	{"Wick Glimmer", "01010100070e012dff05082300ff003000002900ff00ff00ff00ff00ff", "common", "27220aceb26799c9"},
	{"Wilf Rainwell", "01010100070d1029ff03152a00ff000200080300ff00ff00ff00ff00ff", "common", "4219c321f2e53d3f"},
	{"Orrin Hookline", "0101020001020716ff0515310307000000010700ff00ff010700ff00ff", "rare", "1c0194f4941b9368"},
	{"Neon Nettle", "0101030001010007ff04ff1c00ff00100000ff00ff0341044103410841", "epic", "619ea7ecb140a4af"},
	{"Lava Gnome", "01010402060c0043ff02432f00ff00000000ff00ff0a440642054443ff", "legendary", "b8fc21659ae2b738"},
	{"Crystal Gnome", "0101040105090023ff00233800ff00000000ff00ff093b0523043b4222", "legendary", "5a41cbb76c4a216e"},
}

// maxSVG bounds a portrait: the Genesis's and the earned are 1.9 to 5.6 KB.
const maxSVG = 6 * 1024

func TestPortraitGoldens(t *testing.T) {
	for _, s := range samples {
		tier := earnedTier
		if s.tier != "earned" {
			tier = tierAt(s.tier)
		}
		svg := drawGnome(gnome{tier: tier, name: s.name, traits: s.traits})
		sum := sha256.Sum256([]byte(svg))
		uassert.Equal(t, s.sha, hex.EncodeToString(sum[:8]), s.name)
		uassert.True(t, len(svg) <= maxSVG, s.name+": "+itoa(int64(len(svg)))+" bytes")
	}
}

func decodeDataURI(t *testing.T, uri string) string {
	b, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(uri, svgDataPrefix))
	urequire.NoError(t, err)
	return string(b)
}
