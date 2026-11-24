package weblink

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// The same cases as golf/v2's own copy of the rule (owner.gno validURL).
func TestALinkIsHTTPSAndPlain(t *testing.T) {
	for _, bad := range []string{"", "http://example.org/", "https://", "https://x.org/?a=1", "https://x.org/#top", "https://x.org/a b",
		"https://x.org/)[x](y", "javascript:alert(1)", "https://" + strings.Repeat("x", 100)} {
		uassert.False(t, Valid(bad), bad)
	}
	for _, good := range []string{"https://gnogolf.xyz/", "https://golf.example.org/play/", "https://x.org/a-b_c.d~e%20/:8"} {
		uassert.True(t, Valid(good), good)
	}
	uassert.True(t, Valid("https://"+strings.Repeat("x", MaxLen-len("https://"))), "at the limit")
}
