// PKGPATH: gno.land/r/test/storedfinish
package storedfinish

import (
	"encoding/hex"
	"testing"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/gnogolf/physics/build"
	"gno.land/p/nt/testutils/v0"
	golf "gno.land/r/gnogolf/golf/v2"
)

// What a finish stores, and who pays for it: a version keeps its rounds,
// bests and board as rows of indexes every version shares, made when golf
// is deployed, so its first finisher pays for their own rows only, as every
// later one does, and not for trees of its own. Publishing this hole and two
// unnamed one-stroke finishes store the total below: each finish its best,
// with the shots that set it (about 50 bytes, for Ghost), its standing, and
// not its round, which is not kept once holed. The two finishes store 1,625
// bytes with the wear they leave.
func main(cur realm) {
	h := &course.Simple{W: 32, H: 16, World: "garden", Title: "Finished", Strokes: 3,
		Tee: physics.V(2, 8), Pin: physics.V(4, 8), Substeps: 14, CupRadius: 1.2, Shelter: 0.01,
		Course: &physics.Field{Walls: build.Box(physics.V(0, 0), physics.V(32, 16)), Friction: 0.8, Bounce: 0.9, Radius: 0.5}}
	id := golf.PublishMine(cross(cur), "finished", hex.EncodeToString([]byte(course.Encode(h))), "")
	for _, name := range []string{"first", "second"} {
		testing.SetRealm(testing.NewUserRealm(testutils.TestAddress(name)))
		println(golf.PlayRoundAt(cross(cur), id, "0,1", golf.Period()))
	}
}

// Output:
// holed in 1 strokes
// holed in 1 strokes

// Storage:
// gno.land/r/gnogolf/golf/v2: 18
// gno.land/r/gnogolf/store: 4771
// gno.land/r/sys/users: 0
// gno.land/r/test/storedfinish: 0

// Events:
// [
//   {
//     "type": "HolePublished",
//     "attrs": [
//       {
//         "key": "hole",
//         "value": "g15pa2s0tlwxzleu7qy3yel74se90a4ycay0ud4c/finished/v1"
//       },
//       {
//         "key": "slot",
//         "value": "g15pa2s0tlwxzleu7qy3yel74se90a4ycay0ud4c/finished"
//       },
//       {
//         "key": "sha",
//         "value": "6a820ba05a6cab8eeb1d32366474aaaffcf36709fe0a903ed39756929b7e1a21"
//       },
//       {
//         "key": "by",
//         "value": "g15pa2s0tlwxzleu7qy3yel74se90a4ycay0ud4c"
//       },
//       {
//         "key": "official",
//         "value": "false"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/golf/v2"
//   },
//   {
//     "type": "Holed",
//     "attrs": [
//       {
//         "key": "hole",
//         "value": "g15pa2s0tlwxzleu7qy3yel74se90a4ycay0ud4c/finished/v1"
//       },
//       {
//         "key": "player",
//         "value": "g1ve5hyum5ta047h6lta047h6lta047h6lw8hsel"
//       },
//       {
//         "key": "strokes",
//         "value": "1"
//       },
//       {
//         "key": "mode",
//         "value": "assisted"
//       },
//       {
//         "key": "shots",
//         "value": "0.0000,1.0000,0"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/golf/v2"
//   },
//   {
//     "type": "Holed",
//     "attrs": [
//       {
//         "key": "hole",
//         "value": "g15pa2s0tlwxzleu7qy3yel74se90a4ycay0ud4c/finished/v1"
//       },
//       {
//         "key": "player",
//         "value": "g1wdjkxmmwv3047h6lta047h6lta047h6lcfz24y"
//       },
//       {
//         "key": "strokes",
//         "value": "1"
//       },
//       {
//         "key": "mode",
//         "value": "assisted"
//       },
//       {
//         "key": "shots",
//         "value": "0.0000,1.0000,0"
//       }
//     ],
//     "pkg_path": "gno.land/r/gnogolf/golf/v2"
//   }
// ]
