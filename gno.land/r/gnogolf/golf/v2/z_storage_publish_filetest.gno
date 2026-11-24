// PKGPATH: gno.land/r/test/storedpublish
package storedpublish

import (
	"encoding/hex"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	golf "gno.land/r/gnogolf/golf/v2"
)

// A hole is stored as its data, in store: golf keeps only its settings.
// z_storage_publish_filetest publishes one: 3,146 bytes for the data, its entry
// and its rows in the community and authors indexes. z_storage_play_filetest
// also plays two strokes: 1,145 more for the round under way, its shots and the
// wear, a row per cell played. The decoded hole, about 40 KB, is never kept.
func main(cur realm) {
	h := &course.Simple{W: 32, H: 16, World: "garden", Title: "Stored", Tee: physics.V(2, 8), Pin: physics.V(28, 8), Substeps: 14, CupRadius: 1.2,
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}}
	id := golf.PublishMine(cross(cur), "stored", hex.EncodeToString([]byte(course.Encode(h))), "")
	println(id)
}

// Storage:
// gno.land/r/gnogolf/golf/v2: 18
// gno.land/r/gnogolf/store: 3146
// gno.land/r/test/storedpublish: 0

// Output:
// g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/stored/v1
