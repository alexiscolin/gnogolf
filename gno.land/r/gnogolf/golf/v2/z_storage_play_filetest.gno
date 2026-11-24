// PKGPATH: gno.land/r/test/storedplay
package storedplay

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
	golf.Launch(cross(cur), id, 180, 1)
	golf.Launch(cross(cur), id, 90, 1)
}

// Storage:
// gno.land/r/gnogolf/golf/v2: 18
// gno.land/r/gnogolf/store: 4291
// gno.land/r/test/storedplay: 0

// Output:
// g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al/stored/v1

// Events:
// [
//   {
//     "type": "HolePublished",
//     "attrs": [
//       {
//         "key": "hole",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al/stored/v1"
//       },
//       {
//         "key": "slot",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al/stored"
//       },
//       {
//         "key": "sha",
//         "value": "c3f41cdb8a6b3f04f870dc9c17df158e8c65ae370c7839ea83795eb340dc7bd1"
//       },
//       {
//         "key": "by",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al"
//       },
//       {
//         "key": "official",
//         "value": "false"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/golf/v2"
//   },
//   {
//     "type": "Shot",
//     "attrs": [
//       {
//         "key": "hole",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al/stored/v1"
//       },
//       {
//         "key": "player",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al"
//       },
//       {
//         "key": "strokes",
//         "value": "1"
//       },
//       {
//         "key": "mode",
//         "value": "pro"
//       },
//       {
//         "key": "shot",
//         "value": "180.0000,1.0000,0"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/golf/v2"
//   },
//   {
//     "type": "Shot",
//     "attrs": [
//       {
//         "key": "hole",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al/stored/v1"
//       },
//       {
//         "key": "player",
//         "value": "g1tt6pk6p4qmd33w0wz9mehzlv3m0vc3nwj9c9al"
//       },
//       {
//         "key": "strokes",
//         "value": "2"
//       },
//       {
//         "key": "mode",
//         "value": "pro"
//       },
//       {
//         "key": "shot",
//         "value": "90.0000,1.0000,0"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/golf/v2"
//   }
// ]
