package jsonq

import (
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// As golf/v2's jstr does. Plain text, accents included, goes out as it is.
func TestAStringCannotBreakOutOfItsJSON(t *testing.T) {
	uassert.Equal(t, `"a\"b\\c\u000a\u0001\u001f"`, Quote("a\"b\\c\n\x01\x1f"))
	uassert.Equal(t, `"Pip Seedwell é ~"`, Quote("Pip Seedwell é ~"))
	uassert.Equal(t, `""`, Quote(""))
}

// A stray continuation, a truncated rune, a surrogate or an overlong form.
// U+2028 and U+2029, line ends to JavaScript, are escaped.
func TestInvalidUTF8GoesOutAsTheReplacementRune(t *testing.T) {
	uassert.Equal(t, "\"Pip \ufffd\ufffd\\\"bad\"", Quote("Pip \xff\xfe\"bad"))
	uassert.Equal(t, "\"a\ufffd\"", Quote("a\xc3"))
	uassert.Equal(t, "\"\ufffd\ufffd\ufffd\"", Quote("\xed\xa0\x80"))
	uassert.Equal(t, "\"\ufffd\ufffd\"", Quote("\xc0\xaf"))
	uassert.Equal(t, `"a\u2028b\u2029c"`, Quote("a\u2028b\u2029c"))
	uassert.Equal(t, "\"Zoë \u202e\"", Quote("Zoë \u202e"))
}
