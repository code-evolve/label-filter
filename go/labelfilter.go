/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Package labelfilter implements the label filter pattern language — see docs/syntax.md.
//
// Parsed into a small IR, never compiled to a regexp. The language stays small and deterministic,
// and no regexp engine's implementation details leak into it.
//
// Six reserved characters, and nothing else is special: * | ` \ [ ]
//
// This port mirrors the TypeScript implementation function for function, deliberately: they are
// meant to be readable side by side, and all four implementations are held to
// conformance/cases.json.
package labelfilter

import (
	"fmt"
	"strings"
	"unicode"
)

// maxSequences caps an alternative: groups multiply, and a pattern must not explode on a keystroke.
const maxSequences = 64

// instructions is every instruction \…\ accepts: c case-sensitive, - not, b word boundary.
//
// \…\ is the instruction namespace: a section of letters, digits and - is read as one and refused
// when it names nothing, which is what makes a future instruction addable without changing any
// pattern that works. It claims no punctuation — \.foo\.bar is a literal and stays one.
const instructions = "c-b"

const (
	kindLit = iota
	kindAny
	kindSet
	kindGroup
)

// setEscapable lists the only escapes a set body accepts: a backslash, a closing bracket, a dash.
//
// Everything else inside a set is already a literal, so an escape there can only be a reader
// expecting a regular expression — and [\n] quietly meaning the letter n is the silent misread this
// language refuses elsewhere. Ruled 2026-09-23.
const escapeError = "a letter or digit cannot be escaped — \\d, \\n and \\b mean a class in a regular expression and nothing here; drop the backslash, or use \\c\\ \\-\\ \\b\\ at the start for an option"

// escapable reports whether a backslash may escape this character: anything except an ASCII letter
// or digit.
func escapable(r rune) bool {
	return !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'))
}

func setEscapeError(body []rune) string {
	for i := 0; i < len(body); {
		if body[i] != '\\' {
			i++
			continue
		}
		if i+1 >= len(body) || !escapable(body[i+1]) {
			return escapeError
		}
		i += 2
	}
	return ""
}

type charSet struct {
	singles map[rune]bool
	ranges  [][2]rune
}

// parseCharSet reads a set body — 123, 0-9, A-Za-z — into a membership test.
//
// Ranges are expanded by code point, and a leading or trailing - is a literal. An escaped - is
// always a literal too: [a\-z] is three characters, not a range.
func parseCharSet(body []rune) *charSet {
	type atom struct {
		ch      rune
		escaped bool
	}
	atoms := []atom{}
	for i := 0; i < len(body); {
		if body[i] == '\\' && i+1 < len(body) {
			atoms = append(atoms, atom{body[i+1], true})
			i += 2
			continue
		}
		atoms = append(atoms, atom{body[i], false})
		i++
	}
	set := &charSet{singles: map[rune]bool{}}
	for i := 0; i < len(atoms); {
		if i+2 < len(atoms) && !atoms[i+1].escaped && atoms[i+1].ch == '-' {
			set.ranges = append(set.ranges, [2]rune{atoms[i].ch, atoms[i+2].ch})
			i += 3
			continue
		}
		set.singles[atoms[i].ch] = true
		i++
	}
	return set
}

func (s *charSet) test(ch rune) bool {
	if s.singles[ch] {
		return true
	}
	for _, r := range s.ranges {
		if ch >= r[0] && ch <= r[1] {
			return true
		}
	}
	return false
}

type token struct {
	kind int
	lit  []rune
	set  *charSet
	// branches is set only while parsing, on a group token, and never survives expansion.
	branches [][]token
}

type alt struct {
	start  bool
	end    bool
	tokens []token
}

// Matcher is a compiled pattern.
//
// When Error is non-empty, Matches answers true for every label, so an unreadable pattern hides
// nothing and the caller can show the reason. This holds under \-\ as well: negation never inverts
// a refusal.
type Matcher struct {
	Error         string
	caseSensitive bool
	negate        bool
	boundary      bool
	alts          []alt
}

// Compile parses a pattern once into a Matcher.
func Compile(pattern string) *Matcher {
	rest := []rune(pattern)
	m := &Matcher{}
	optionError := ""

	// \options\... — only when a SECOND unescaped backslash exists, and only with at least one
	// option character. \\ is an escaped backslash, NOT an empty option section: reading it as one
	// made \\ match every label.
	if len(rest) > 0 && rest[0] == '\\' {
		end := -1
		for i := 1; i < len(rest); i++ {
			if rest[i] == '\\' {
				end = i
				break
			}
		}
		if end > 0 {
			opts := rest[1:end]
			ok := len(opts) > 0
			for _, c := range opts {
				if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-') {
					ok = false
				}
			}
			if ok {
				unknown := ""
				for _, c := range opts {
					if !strings.ContainsRune(instructions, c) {
						unknown += string(c)
					}
				}
				if unknown != "" {
					optionError = fmt.Sprintf("unknown instruction %s — the instructions are c (case-sensitive), - (not) and b (word boundary); a literal backslash is \\\\", unknown)
				}
				m.caseSensitive = strings.ContainsRune(string(opts), 'c')
				m.negate = strings.ContainsRune(string(opts), '-')
				m.boundary = strings.ContainsRune(string(opts), 'b')
				rest = rest[end+1:]
			}
		}
	}

	sources, unclosed := splitAlternatives(rest)
	parsed := make([]parsedAlternative, 0, len(sources))
	for _, src := range sources {
		parsed = append(parsed, parseAlternative(src))
	}

	// An option section that is NOT the prefix: rest already had the real one removed, so anything
	// still shaped like one sits in a later alternative or after a first prefix.
	misplaced := ""
	for _, src := range sources {
		if found := leadingOptionSection(src); found != "" {
			misplaced = found
			break
		}
	}

	switch {
	case optionError != "":
		m.Error = optionError
	case misplaced != "":
		m.Error = fmt.Sprintf("\\%s\\ applies to the whole pattern, so it cannot open an alternative — move it to the very start, before the first |", misplaced)
	case hasBarRun(rest):
		m.Error = "three or more | in a row — | separates alternatives, || opens or closes a group, and a literal bar is \\|"
	case unclosed:
		m.Error = "unclosed || group — a group is ||…||, it does not nest, and a literal bar is \\|"
	default:
		for _, p := range parsed {
			if p.err != "" {
				m.Error = p.err
				break
			}
		}
	}

	// The trap that groups exist to replace: `a|b` reads to everyone as "exactly a or b", and
	// parses as "starts with a" OR "ends with b".
	if m.Error == "" && len(parsed) > 1 {
		first, last := parsed[0], parsed[len(parsed)-1]
		if first.start && !first.end && last.end && !last.start {
			m.Error = "anchors bind to one alternative, not across | — `a|b` reads as \"starts with a\" OR \"ends with b\"; write `||a|b||` for exactly one of them"
		}
	}

	// Negation with nothing to negate hides every row — the confident empty, reached from the other
	// side, and the state \-\… passes through while it is being typed.
	if m.Error == "" && m.negate {
		empty := true
		for _, p := range parsed {
			if p.start || p.end {
				empty = false
				break
			}
			for _, seq := range p.seqs {
				if len(seq) > 0 {
					empty = false
				}
			}
		}
		if empty {
			m.Error = "negation with no pattern would hide every row — give \\-\\ something to exclude"
		}
	}

	for _, p := range parsed {
		for _, seq := range p.seqs {
			tokens := seq
			// A literal folds; a set never does, so only the literals are lowered here.
			if !m.caseSensitive {
				folded := make([]token, len(seq))
				for i, t := range seq {
					if t.kind == kindLit {
						t.lit = foldRunes(t.lit)
					}
					folded[i] = t
				}
				tokens = folded
			}
			m.alts = append(m.alts, alt{start: p.start, end: p.end, tokens: tokens})
		}
	}
	return m
}

// Matches answers whether one label passes the filter.
func (m *Matcher) Matches(label string) bool {
	// An unparseable pattern hides nothing, and \-\ does not get to invert that.
	if m.Error != "" {
		return true
	}
	raw := []rune(label)
	text := raw
	if !m.caseSensitive {
		text = foldRunes(raw)
	}
	hit := false
	for i := range m.alts {
		if matchAlternative(&m.alts[i], raw, text, m.boundary) {
			hit = true
			break
		}
	}
	if m.negate {
		return !hit
	}
	return hit
}

// foldRune lower-cases one rune, but only when doing so keeps its length.
//
// Case folding is not length-preserving in general (İ lowercases to two characters), and the matcher
// walks the folded text and the raw text at the SAME index — a literal reads the folded one, a set
// and the boundary test read the raw one. Go's unicode.ToLower would quietly give the one-rune
// answer where the other implementations keep the original, so the length check is what keeps the
// four ports identical rather than nearly so.
func foldRune(r rune) rune {
	lower := strings.ToLower(string(r))
	if len([]rune(lower)) == 1 {
		return []rune(lower)[0]
	}
	return r
}

func foldRunes(in []rune) []rune {
	out := make([]rune, len(in))
	for i, r := range in {
		out[i] = foldRune(r)
	}
	return out
}

// Definition B of a word boundary: the edge of the label, or a neighbouring character that is not a
// letter or a number. A regexp's own \b counts _ as a word character, which is wrong for labels.
func isAlnum(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

func startsAtBoundary(raw []rune, at int) bool { return at == 0 || !isAlnum(raw[at-1]) }
func endsAtBoundary(raw []rune, at int) bool   { return at == len(raw) || !isAlnum(raw[at]) }

// matchAt reports whether tokens match starting at `at`, ending at the end if mustEnd.
//
// The failed table is not an optimisation, it is what keeps this from hanging the UI: backtracking
// over * is exponential without it.
func matchAt(tokens []token, ti int, raw, text []rune, boundary bool, at int, mustEnd bool, failed []bool, width int) bool {
	if ti == len(tokens) {
		if mustEnd {
			return at == len(text)
		}
		return !boundary || endsAtBoundary(raw, at)
	}
	key := ti*width + at
	if failed[key] {
		return false
	}
	ok := false
	t := tokens[ti]
	switch t.kind {
	case kindLit:
		if at+len(t.lit) <= len(text) && string(text[at:at+len(t.lit)]) == string(t.lit) {
			ok = matchAt(tokens, ti+1, raw, text, boundary, at+len(t.lit), mustEnd, failed, width)
		}
	case kindSet:
		// A set is always case-sensitive, so it reads the raw label.
		if at < len(raw) && t.set.test(raw[at]) {
			ok = matchAt(tokens, ti+1, raw, text, boundary, at+1, mustEnd, failed, width)
		}
	default: // kindAny — zero or more, shortest first.
		for j := at; j <= len(text); j++ {
			if matchAt(tokens, ti+1, raw, text, boundary, j, mustEnd, failed, width) {
				ok = true
				break
			}
		}
	}
	if !ok {
		failed[key] = true
	}
	return ok
}

func matchAlternative(a *alt, raw, text []rune, boundary bool) bool {
	width := len(text) + 1
	failed := make([]bool, len(a.tokens)*width)
	if a.start {
		return matchAt(a.tokens, 0, raw, text, boundary, 0, a.end, failed, width)
	}
	// Unanchored: foo is conceptually *foo*.
	for i := 0; i <= len(text); i++ {
		if boundary && !startsAtBoundary(raw, i) {
			continue
		}
		if matchAt(a.tokens, 0, raw, text, boundary, i, a.end, failed, width) {
			return true
		}
	}
	return false
}

type parsedAlternative struct {
	start bool
	end   bool
	seqs  [][]token
	err   string
}

// leadingOptionSection returns an option section written at the start of an alternative, which is
// never what it looks like. Options are global: the prefix is read once, off the whole pattern,
// before it is split on |, so apple|\-\pear cannot mean "contains apple OR not pear". Refused
// 2026-09-24 for the same reason `a|b` is refused: it parses cleanly and answers a different
// question. See the TypeScript implementation for why only - still reached this point.
func leadingOptionSection(alt []rune) string {
	if len(alt) == 0 || alt[0] != '\\' {
		return ""
	}
	end := -1
	for i := 1; i < len(alt); i++ {
		if alt[i] == '\\' {
			end = i
			break
		}
	}
	if end <= 0 {
		return ""
	}
	section := alt[1:end]
	if len(section) == 0 {
		return ""
	}
	for _, c := range section {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-') {
			return ""
		}
	}
	return string(section)
}

// hasBarRun reports a run of three or more unescaped bars. This one rule is what makes || decidable,
// and it is also what makes an empty group and an empty branch unwritable.
func hasBarRun(s []rune) bool {
	run := 0
	for i := 0; i < len(s); {
		if s[i] == '\\' {
			i += 2
			run = 0
			continue
		}
		if s[i] == '|' {
			run++
			if run > 2 {
				return true
			}
		} else {
			run = 0
		}
		i++
	}
	return false
}

// splitAlternatives splits on | at the top level, leaving the | inside a group alone. || toggles,
// which is also why a group cannot nest.
func splitAlternatives(s []rune) ([][]rune, bool) {
	out := [][]rune{}
	cur := []rune{}
	inGroup := false
	for i := 0; i < len(s); {
		ch := s[i]
		if ch == '\\' && i+1 < len(s) {
			cur = append(cur, ch, s[i+1])
			i += 2
			continue
		}
		if ch == '|' && i+1 < len(s) && s[i+1] == '|' {
			inGroup = !inGroup
			cur = append(cur, '|', '|')
			i += 2
			continue
		}
		if ch == '|' && !inGroup {
			out = append(out, cur)
			cur = []rune{}
			i++
			continue
		}
		cur = append(cur, ch)
		i++
	}
	out = append(out, cur)
	return out, inGroup
}

// endsWithAnchor reports whether the last character is an unescaped backtick — the end anchor.
func endsWithAnchor(s []rune) bool {
	for i := 0; i < len(s); {
		if s[i] == '\\' {
			i += 2
			continue
		}
		if s[i] == '`' && i == len(s)-1 {
			return true
		}
		i++
	}
	return false
}

// parseAlternative strips both anchors; a backtick anywhere else is an error. Since sets moved to
// […] there is nothing else a backtick can be, so this needs no pairing and no parity.
func parseAlternative(src []rune) parsedAlternative {
	s := src
	start, end := false, false
	if len(s) > 0 && s[0] == '`' {
		start = true
		s = s[1:]
	}
	if endsWithAnchor(s) {
		end = true
		s = s[:len(s)-1]
	}
	tokens, err := tokenise(s)
	if err != "" {
		return parsedAlternative{start, end, [][]token{{}}, err}
	}
	seqs, err := expand(tokens)
	if err != "" {
		return parsedAlternative{start, end, [][]token{{}}, err}
	}
	return parsedAlternative{start, end, seqs, ""}
}

func findUnescaped(s []rune, from int, ch rune) int {
	for i := from; i < len(s); {
		if s[i] == '\\' {
			i += 2
			continue
		}
		if s[i] == ch {
			return i
		}
		i++
	}
	return -1
}

func findGroupClose(s []rune, from int) int {
	for i := from; i < len(s); {
		if s[i] == '\\' {
			i += 2
			continue
		}
		if s[i] == '|' && i+1 < len(s) && s[i+1] == '|' {
			return i
		}
		i++
	}
	return -1
}

// splitBranches splits a group body on its single | — it can hold no ||, since the first one closed it.
func splitBranches(s []rune) [][]rune {
	out := [][]rune{}
	cur := []rune{}
	for i := 0; i < len(s); {
		if s[i] == '\\' && i+1 < len(s) {
			cur = append(cur, s[i], s[i+1])
			i += 2
			continue
		}
		if s[i] == '|' {
			out = append(out, cur)
			cur = []rune{}
			i++
			continue
		}
		cur = append(cur, s[i])
		i++
	}
	out = append(out, cur)
	return out
}

func tokenise(s []rune) ([]token, string) {
	out := []token{}
	lit := []rune{}
	flush := func() {
		if len(lit) > 0 {
			out = append(out, token{kind: kindLit, lit: lit})
			lit = []rune{}
		}
	}
	for i := 0; i < len(s); {
		ch := s[i]
		if ch == '\\' && i+1 < len(s) {
			if !escapable(s[i+1]) {
				return out, escapeError
			}
			lit = append(lit, s[i+1])
			i += 2
			continue
		}
		if ch == '*' {
			flush()
			out = append(out, token{kind: kindAny})
			i++
			continue
		}
		if ch == '|' && i+1 < len(s) && s[i+1] == '|' {
			close := findGroupClose(s, i+2)
			if close == -1 {
				return out, "unclosed || group — a group is ||…||, and a literal bar is \\|"
			}
			branches := [][]token{}
			for _, branch := range splitBranches(s[i+2 : close]) {
				if len(branch) == 0 {
					return out, "empty alternative inside a || group"
				}
				sub, err := tokenise(branch)
				if err != "" {
					return out, err
				}
				// A branch cannot hold a group: the first unescaped || after the opener closes this
				// one, so the body was bounded before any nested opener could be read.
				branches = append(branches, sub)
			}
			flush()
			out = append(out, token{kind: kindGroup, branches: branches})
			i = close + 2
			continue
		}
		if ch == '[' {
			close := findUnescaped(s, i+1, ']')
			if close == -1 {
				return out, "unclosed [ — a set is […], and a literal bracket is \\["
			}
			body := s[i+1 : close]
			// An empty set can never match, so it is refused rather than served.
			if len(body) == 0 {
				return out, "empty set [] — a set needs characters, and a literal bracket is \\["
			}
			if e := setEscapeError(body); e != "" {
				return out, e
			}
			flush()
			out = append(out, token{kind: kindSet, set: parseCharSet(body)})
			i = close + 1
			continue
		}
		if ch == ']' {
			return out, "unmatched ] — a set is […], and a literal bracket is \\]"
		}
		// Anchors were taken off both ends already, so anything left is in the middle.
		if ch == '`' {
			return out, "a backtick is an anchor and belongs at the very start or very end — a literal backtick is \\`"
		}
		lit = append(lit, ch)
		i++
	}
	flush()
	return out, ""
}

// expand desugars groups: one token list in, one list per combination out. Doing it at parse time
// keeps the matcher untouched by the feature and makes the cost refusable before any label is seen.
func expand(tokens []token) ([][]token, string) {
	seqs := [][]token{{}}
	for _, t := range tokens {
		if t.kind != kindGroup {
			for i := range seqs {
				seqs[i] = append(seqs[i], t)
			}
			continue
		}
		next := [][]token{}
		for _, seq := range seqs {
			for _, branch := range t.branches {
				combined := make([]token, 0, len(seq)+len(branch))
				combined = append(combined, seq...)
				combined = append(combined, branch...)
				next = append(next, combined)
			}
		}
		if len(next) > maxSequences {
			return nil, fmt.Sprintf("too many combinations — || groups multiply, and this is over %d; use separate filters", maxSequences)
		}
		seqs = next
	}
	return seqs, ""
}
