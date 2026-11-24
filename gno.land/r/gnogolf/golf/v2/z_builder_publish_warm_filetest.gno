// PKGPATH: gno.land/r/test/builderpublishv2warm
package builderpublishv2warm

import (
	golf "gno.land/r/gnogolf/golf/v2"
)

// The Builder's publish numbers: web/lib/builder/publish.ts fits its storage
// deposit and gas on the z_builder_publish_* filetests, and its test reads
// their Storage and Gas. Each publishes the same warm-up first, a plain 32×16
// lane titled "Warm", so its own publish is its numbers less
// z_builder_publish_warm_filetest's. The data is course.Encode's hex, as a
// transaction sends it: the Gas is PublishMine's work alone.
//
// This one: the warm-up alone: its data, its entry and its rows in the
// community's and the authors' indexes.

const (
	warm = "47473120001000030e000667617264656e0000000000000000045761726d000000000000004000000000000020400000000000003c400000000000002040333333333333f33f00000000000000009a9999999999e93fcdccccccccccec3f000000000000e03f01000004000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000404000000000000000000000000000004040000000000080404000000000008040400000000000004040000000000000000000000000000040400000000000003040000000000000304000000000000031400000000000003140000000000000404000000000000030400000000000000000000000000000304000000000000040400000000000804040000000000080404000000000000000000000000000003040000000000000000000000000000000000000000000003040000000000000314000000000000031400000000000"
)

func main(cur realm) {
	println(golf.PublishMine(cross(cur), "warm", warm, ""))
}

// Output:
// g1qaa0qex6m5gtf56hpelkq3zk8gvz88l5vtuhkv/warm/v1

// Storage:
// gno.land/r/gnogolf/golf/v2: 18
// gno.land/r/gnogolf/store: 3126
// gno.land/r/test/builderpublishv2warm: 0

// Gas:
// 18781484
