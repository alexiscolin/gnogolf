// Package jsonq quotes a string as JSON, so a name or a trait cannot break out
// of an answer. The quote, the backslash and every byte below 0x20 are escaped.
// A byte that is not UTF-8 is written as U+FFFD, as Go's encoding/json does.
// U+2028 and U+2029, line ends to JavaScript, are escaped. Plain ASCII goes out
// as it is, without a copy: a byte at a time costs gas. golf/v2 has its own
// copy, jstr (state.gno), which writes bytes from 0x80 as they are.
package jsonq

import "unicode/utf8"

// Quote is s as a JSON string, quotes included.
func Quote(s string) string {
	for i := 0; i < len(s); i++ {
		if c := s[i]; c == '"' || c == '\\' || c < 0x20 || c >= utf8.RuneSelf {
			return escape(s)
		}
	}
	return `"` + s + `"`
}

func escape(s string) string {
	const hex = "0123456789abcdef"
	b := make([]byte, 0, len(s)+2)
	b = append(b, '"')
	for i := 0; i < len(s); {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			b = append(b, '\\', c)
		case c < 0x20:
			b = append(b, '\\', 'u', '0', '0', hex[c>>4], hex[c&15])
		case c < utf8.RuneSelf:
			b = append(b, c)
		default:
			r, n := utf8.DecodeRuneInString(s[i:])
			switch {
			case r == utf8.RuneError && n == 1:
				b = append(b, "\ufffd"...)
			case r == '\u2028' || r == '\u2029':
				b = append(b, '\\', 'u', '2', '0', '2', hex[r&15])
			default:
				b = append(b, s[i:i+n]...)
			}
			i += n
			continue
		}
		i++
	}
	return string(append(b, '"'))
}
