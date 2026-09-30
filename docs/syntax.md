# Label Filter Pattern Syntax

## Handoff Specification

### 1. Purpose

Provide a minimal pattern syntax for filtering lists of objects by their labels.

The syntax is intentionally simpler than regular expressions. It is designed for common label-search operations such as:

* contains
* starts with
* ends with
* exact match
* wildcard matching
* character-set matching
* OR matching
* case-sensitivity options
* literal use of reserved characters

---

## 1.1 Design goals

The language was set four goals: **easy to learn, easy to type, easy to view, and complete enough for
most needs.**

**These four are the tie-breaker for every future proposal.** A syntax that serves one of them at
another's expense is not obviously an improvement, and this section is where that argument gets
settled. Each goal is recorded with what serves it and what strains it, because a goal with no
recorded cost cannot be used to decide anything.

### Easy to learn

**Served by the default.** A plain word is a case-insensitive *contains*, so the most common search
costs no syntax at all and nothing has to be learned before the language is useful. Six reserved
characters; no parentheses beyond the one flat group, no quantifiers, no lookahead, no capture, no
flags. The whole language fits in a table of a dozen lines.

**It is strained by any character that means two things.** A rule a parser can apply but a person
cannot apply at a glance costs this goal outright, however defensible it is on every other count. That
is the test a proposal has to pass: not *can this be specified*, but *can it be read*.

### Easy to type

**Served by** the zero-syntax default, one-character anchors, and one-character wildcards. Nothing
common requires a modifier key except `*` and `|`.

**Strained by the backtick's position on a keyboard.** It is a dead key on several European layouts
(needing a following space), two or three taps deep on phone keyboards, and in some hosts it opens
code formatting instead of typing. That falls on the second most common operation in the language
after *contains*. Nothing in the syntax can fix it; a host that embeds this filter can, with a
control that inserts the anchors.

**And by the cost of a group.** `*.||md|txt||` is longer than `*.md|*.txt`. A group pays for itself
only when the shared part is long, which is exactly when it is worth having, so this is a fair trade
rather than a defect, but it means a group is not the shorter spelling, only the one that does not
repeat itself.

### Easy to view

**Served by** short patterns, no escaping thicket in the common case, and alternatives that read
left to right with no precedence to remember beyond the table in §11.

**It is strained by runs of the same delimiter.** `` `#[0-9a-f][0-9a-f][0-9a-f]` `` is dense, and
a set spelling where the opening and closing characters looked alike would be a picket fence the eye
cannot count. Every delimiter in this language says which end it is, and that is deliberate.

### Complete enough for most needs

**Served:** contains, starts, ends, exact, wildcard, one-of-characters, ranges, alternation,
grouping, case control, escapes. Between them these answer the large majority of list filtering.

**Negation and word boundaries are covered** by `\-\` and `\b\`, neither of which costs a reserved
character: the option section is already the place for anything that governs the whole pattern.

What remains, in order of how often it would actually be missed:

* **repetition**, `[0-9]` four times over is how a four-digit year is written
* **include-except**, `\-\` is an exclusion filter, so *apple but not test* still needs two
  filters, or an AND this language deliberately does not have

**Deliberately out of scope**, and not gaps: numeric or date comparison, field-scoped terms
(`name:foo`), fuzzy or ranked matching, and anything requiring a regex engine's machinery. A label
filter that grew those would stop being learnable in an afternoon, which is the first goal.

---

## 2. Reserved Characters

Six characters have special meaning:

```text
*   |   `   \   [   ]
```

All other characters are treated as ordinary literal characters.

- `*` is a wildcard (§4).
- `|` separates alternatives, and `||` opens and closes a group (§8).
- `` ` `` is an anchor, and nothing else: the first character of an alternative, the last, or an error
  (§5).
- `\` escapes a reserved character, and a `\…\` section at the very start of a pattern carries its
  options (§9, §10).
- `[` and `]` delimit a character set (§6).

---

## 3. Default Matching

**A pattern with no anchors or wildcards performs a case-insensitive substring/contains match.**

```text
apple
```

matches:

```text
apple
Apple
APPLE
Green Apple
pineAPPLE
```

Case sensitivity can be explicitly changed with an option.

---

## 4. Wildcard

The asterisk `*` matches zero or more arbitrary characters.

```text
apple*pie
```

matches:

```text
applepie
apple pie
apple-and-pear-pie
```

but not:

```text
apple
pie
banana pie
```

Wildcards may appear anywhere in a pattern.

---

## 5. Anchors

A backtick `` ` `` at the beginning or end of a pattern acts as an anchor.

### Start anchor

```text
`apple
```

means:

> the label must start with `apple`.

Matches:

```text
apple
apple pie
apples
```

Does not match:

```text
green apple
pineapple
```

### End anchor

```text
apple`
```

means:

> the label must end with `apple`.

Matches:

```text
apple
green apple
pineapple
```

Does not match:

```text
apple pie
apples
```

### Both anchors

```text
`apple`
```

means:

> the label must equal `apple` exactly.

Because matching is case-insensitive by default, this also matches `Apple`, `APPLE`, etc.

Case-sensitive exact matching is:

```text
\c\`apple`
```

---

## 6. Character Sets

A pair of brackets defines a **single-character set**.

```text
[123]
```

matches exactly one character from `1`, `2`, `3`. So:

```text
foo[123]bar
```

matches `foo1bar`, `foo2bar` and `foo3bar`.

A character set always consumes **exactly one character**.

### Character ranges

A set may contain ranges:

```text
[0-9]        one digit
[a-z]        one lowercase letter
[A-Za-z]     one ASCII letter
[0-9A-F]     one hexadecimal character
```

### A set is always case-sensitive

**In both modes**, including the default case-insensitive one. A set is the one construct that can say
*either case* explicitly, by writing `[A-Za-z]`, while nothing else could say *this case only*. If a set
folded with case, `[A-Z]`, `[a-z]` and `[A-Za-z]` would be three spellings of one thing, and there would
be no way to ask for one case without hardening every literal in the pattern.

A **literal** still folds: `apple` matches `APPLE` by default, and `\c\` (§10) turns that off. `\c\`
governs literals only.

### Refusals and escapes inside a set

- **An empty set `[]` is refused.** It could never match, and a pattern that silently matches nothing is
  the outcome this language exists to avoid.
- **An unclosed `[` and an unmatched `]` are refused**, naming the escape that writes a literal one.
- **A literal bracket is `\[` or `\]`.**
- **An escaped dash is a literal dash:** `[a\-z]` is the three characters `a`, `-`, `z`, where `[a-z]`
  is a range. A leading or trailing dash is a literal without escaping.

---

## 7. Sets Beside Anchors

**A set needs nothing special next to an anchor.** A backtick is an anchor and a bracket delimits a set,
so the two cannot be confused and there is no doubling, no counting and no lookahead:

```text
`[123]bar        starts with one of 1, 2, 3, then bar
bar[456]`        bar, then one of 4, 5, 6, at the end
`[123]bar[456]`  both
foo[123]bar      anywhere in the pattern, including the very start
```

This section exists because it once did not hold. While a single character both delimited sets and
anchored the pattern, every one of these spellings was ambiguous and needed a rule to resolve it. The
rule is now that there is no ambiguity.

## 8. OR Operator

The vertical bar `|` separates alternative patterns.

```text
apple|banana
```

matches a label if it contains either:

```text
apple
```

or:

```text
banana
```

Examples:

```text
`apple|`banana
```

means:

> starts with `apple` OR starts with `banana`.

```text
apple`|banana`
```

means:

> ends with `apple` OR ends with `banana`.

Each `|`-separated alternative is evaluated independently.

### `||…||` groups alternatives

A group lets a shared part be written once instead of once per alternative:

```text
*.||md|txt||     the same as *.md|*.txt
`||a|b||`        exactly a, or exactly b
```

An anchor outside a group reaches every branch of it, which is the reading that plain alternation
cannot give.

**Rules.**

- **A group does not nest.** A `||` inside a group is an error, not a second level.
- **Three or more `|` in a row is refused** rather than guessed at. This one rule is what keeps `||`
  decidable, and it is also what makes an empty group and an empty branch unwritable.
- **An unclosed group is refused**, naming the spelling of a literal bar.
- **A literal bar is `\|`.**
- A group is expanded into plain alternatives before matching, so nothing downstream has to know it was
  written as one. The expansion is bounded: a pattern whose groups multiply out past 64 alternatives is
  refused, with the count named, rather than expanded.

### `` `a|b` `` is refused

An anchor binds to the alternative it is written in, so `` `a|b` `` means *starts with `a`* OR *ends with
`b`*. It reads to everyone as *exactly `a` or exactly `b`*, because the two anchors sit at the outer
edges and look like they wrap the alternation.

It parses cleanly and answers a different question, which is the one failure this language refuses to
allow. Write `` `||a|b||` `` for the reading it looks like.

### Precedence, stated once

There is no operator precedence to learn, because there are no operators competing for it:

1. The option section, if present, is read once from the very start of the pattern (§10).
2. `||…||` groups expand into alternatives.
3. The pattern splits on the remaining `|`.
4. Each alternative is matched independently: its anchors, wildcards, sets and literals apply to it and
   to nothing else.

There are no parentheses and no boolean operators beyond alternation. In particular there is no AND: a
pattern cannot say *apple but not test*. A host that wants that offers two filter boxes, one to include
and one to exclude, each taking one pattern.

---

## 9. Escaping

The backslash `\` removes the special meaning of the following character when used within the pattern.

```text
\*
```

matches a literal `*`.

```text
\|
```

matches a literal `|`.

```text
\`
```

matches a literal backtick.

```text
\\
```

matches a literal backslash.

Examples:

```text
version\*2
```

matches:

```text
version*2
```

```text
foo\|bar
```

matches:

```text
foo|bar
```

```text
foo\`bar
```

matches:

```text
foo`bar
```

An escaped character does not participate in pattern syntax.

### What may be escaped, and what may not

**A backslash may escape any character that is not an ASCII letter or digit.** So `\*`, `\|`, `` \` ``,
`\\`, `\[`, `\]`, `\.`, `\-`, `\ `, and equally `\é`, `\«` and `\🙂`: punctuation, spaces, unicode and
emoji are all escapable, and escaping a character that was never special simply yields that character.

**Escaping a letter or a digit is refused.** `\d`, `\n`, `\w` and `\s` mean a character class in a
regular expression and mean nothing here, so reading `\n` as the letter `n` would quietly give a pattern
a second meaning. The refusal names the option syntax, because `\c` is almost always a mistyped `\c\`.

This holds in the pattern body and inside a set body alike.

**A trailing lone backslash** is what a pattern looks like while it is being typed, so it is a literal
backslash rather than an error.

---

## 10. Pattern Options

Options are introduced by a leading backslash and terminated by a second backslash.

General form:

```text
\options\pattern
```

The second `\` marks the end of the option section. Everything following it is parsed as the normal pattern syntax.

**The section is read once, from the start of the whole pattern, before the pattern is split on `|`.**
So an option applies to every alternative, and a section written at the start of an alternative is
refused rather than read as an option or as the literals it is made of; see *An option section cannot
open an alternative* below.

### Case sensitivity

Matching is **case-insensitive by default**.

The `c` option enables case-sensitive matching:

```text
\c\apple
```

means:

> case-sensitive, contains `apple`.

Without the option:

```text
apple
```

means:

> case-insensitive, contains `apple`.

Options apply to the entire pattern.

### Options with anchors

```text
\c\`apple
```

means:

> case-sensitive, starts with `apple`.

```text
\c\apple`
```

means:

> case-sensitive, ends with `apple`.

```text
\c\`apple`
```

means:

> case-sensitive, exactly `apple`.

### Options with character sets

```text
\c\`[A-Z]foo
```

means:

> case-sensitive, starts with one uppercase letter, followed by `foo`.

The option prefix ends at the second backslash; everything after it uses the normal pattern syntax. A set
is case-sensitive with or without `\c\` (§6); the option governs literals.

### `-`, not

`\-\pattern` inverts the verdict: every label the pattern would have shown is hidden, and every other
label is kept.

```text
\-\test        every label that does not contain test
\-\a|b         NOT (contains a OR contains b)
```

- **Negation never inverts a refusal.** A pattern that cannot be read still matches everything, so it
  hides nothing. Inverting that would hide *every* label over a typo, which is the worst outcome this
  language can produce and the one direction nobody watches.
- **`\-\` with nothing after it is refused.** An empty pattern matches everything, so negated it matches
  nothing, and it is also the state `\-\…` passes through while it is being typed. `\-\*` is allowed: it
  says *hide everything*, and says it deliberately.

**Its limit, stated plainly:** this is an *exclusion*, not *include-except*. `\-\a|b` is a hide-list.
*Apple, but not test* needs AND, which this language does not have (§8).

### `b`, word boundary

`\b\app` matches `app`, `app-1`, `my app`, `app.md`, `app_data` and `an app.`; it does not match
`apple`, `snapple` or `MyAppCard`.

> **A boundary is the edge of the label, or a neighbouring character that is not a letter or a number**
> (`\p{L}` / `\p{N}`, so it holds in any script).

The test looks only at the **neighbouring** character, never at the matched text, so it stays decidable
by reading one character. The requirement applies to the **whole match extent**, just before the first
matched character and just after the last, not around every token, so `\b\app*pie` is one run from `app`
to `pie`. At a label edge it is satisfied trivially, so `` \b\`app `` is just the anchor.

**It is not a regular expression's `\b`**, which counts `_` as a word character: that would refuse
`app_data` for a whole-word `app`, and `_` separates words in a filename whatever a regex thinks.

### The options, and the namespace

| Option | Means |
|---|---|
| `c` | case-sensitive literals; a set is case-sensitive regardless |
| `-` | not: invert the verdict |
| `b` | word boundary |

They compose in any order: `\c-\`, `\-b\`, `\c-b\`.

**`\…\` is an instruction namespace.** A section may hold letters, digits and `-`, and the namespace
claims no punctuation: `\.foo\.bar` is two escaped dots around literals and stays that way, so an
instruction that one day needs `=` or `,` claims that character then and pays for it then.

- **An unknown instruction is refused**, not ignored. `\d\foo` once silently meant `foo`; it now names
  the instructions that exist. This is what makes adding one safe: `\b\app` was an error before `b`
  existed, never a pattern that quietly meant `bapp`.
- **The section needs at least one character.** `\\` is an escaped backslash (§9), not an empty section.
  Read as one, it stripped itself and left the empty pattern, which matched every label.

### An option section cannot open an alternative

The section is read once, from the start of the whole pattern, before it is split on `|` (§8). So a
section written at the start of a later alternative was never an option:

```text
\-\apple|pear     NOT (contains apple OR contains pear)
apple|\-\pear     refused
```

The second spelling reads as *apple, or not pear* and could never have meant it. It is refused for every
instruction character, and the refusal names the section and says to move it to the very start. This
covers a `||…||` branch, and a second section written after a real one.

---

## 11. Summary of Syntax

| Pattern | Meaning |
|---|---|
| `apple` | case-insensitive, contains `apple` |
| `apple*pie` | `apple`, then anything, then `pie` |
| `` `apple `` | starts with `apple` |
| `` apple` `` | ends with `apple` |
| `` `apple` `` | exactly `apple` |
| `[123]` | one character from `1`, `2`, `3` |
| `[0-9]` | one digit; also `[a-z]`, `[A-Za-z]`, `[0-9A-F]` |
| `foo[123]bar` | `foo`, one character from `123`, then `bar` |
| `` `[123]bar `` | starts with one character from `123`, then `bar` |
| `` bar[456]` `` | `bar`, one character from `456`, at the end |
| `` `[123]bar[456]` `` | an exact full-label pattern |
| `apple\|banana` | contains `apple` OR contains `banana` |
| `*.\|\|md\|txt\|\|` | `*.md` OR `*.txt`: a group writes the shared part once |
| `` `\|\|a\|b\|\|` `` | exactly `a` OR exactly `b` |
| `\c\apple` | case-sensitive, contains `apple` |
| `` \c\`apple `` | case-sensitive, starts with `apple` |
| `\-\apple` | every label that does NOT contain `apple` |
| `\b\app` | `app` as a whole word |
| `\c-\App` | options compose: case-sensitive AND negated, so every label without `App` |
| `\*` | a literal `*`; likewise `\|`, `` \` ``, `\\`, `\[`, `\]` |

---

## 12. Design Principles

### Minimal syntax

The language deliberately has only four reserved characters:

```text
* | ` \
```

There are no:

* parentheses
* lookahead/lookbehind
* capture groups
* regex flags
* boolean keywords
* general regex operators

### Useful default

The most common operation, searching for a label containing some text, requires no special syntax:

```text
engine
```

### Case-insensitive by default

Labels are matched case-insensitively unless the pattern explicitly begins with:

```text
\c\
```

### Progressive specificity

The syntax starts with simple contains matching and adds specificity only when required:

```text
engine
engine*part
`engine
engine`
`engine`
[0-9]engine
```

### No regex semantics

The pattern language is not intended to be a simplified regular-expression language.

Only the explicitly defined operators have special meaning.

---

## 13. Parsing Model

A pattern is read in one pass, in this order:

1. **The option section**, if the pattern begins with `\` and a second unescaped `\` follows with at
   least one instruction character between them (§10). It is read once, off the whole pattern.
2. **`||…||` groups** expand into plain alternatives (§8).
3. **Unescaped `|`** separates the remaining alternatives.
4. **Each alternative** is tokenised independently.

```text
pattern
  → [option-section] alternatives

option-section
  → "\" instruction-character+ "\"

alternatives
  → alternative ("|" alternative)*

alternative
  → [start-anchor] token* [end-anchor]

token
  → literal
  | wildcard
  | character-set

character-set
  → "[" set-body "]"

start-anchor, end-anchor
  → "`"
```

**A backtick is an anchor by position, not by context**: the first character of an alternative, the last
character, or an error. There is no pairing to track, no parity to count and no lookahead. That is the
whole benefit of writing a set as `[…]`, and it is why §7 has nothing left to resolve.

Escaped characters are always literals, and a set body is scanned to its closing `]` with only `\\`,
`\]` and `\-` meaningful inside it (§6).

---

## 14. Matching Model

Each alternative independently produces a match result.

The overall pattern matches if:

```text
ANY alternative matches the label
```

An unanchored pattern searches anywhere within the label.

For example:

```text
foo
```

is conceptually equivalent to:

```text
*foo*
```

A leading backtick constrains the match to the beginning of the label.

A trailing backtick constrains the match to the end of the label.

A character set:

```text
[123]
```

always consumes exactly one character.

### One index is one character

**A position in a label is a code point, not a UTF-16 code unit.** So `` `🙂 `` is one character at the
start, `[🙂]` is a set of one character, and `*` consumes whole characters rather than halves of them.
An implementation whose string type indexes by code unit must convert before matching, or an emoji
counts as two and every anchor and set near one is off by one.

Case folding is applied per character and must preserve length, so a folded label and a raw label stay
index-aligned. Where a language's own case conversion would change the length of a string, the
character is left as it is rather than folded.

### A pattern that cannot be read matches everything

An unreadable pattern **matches every label** and carries the reason alongside the result. It does not
match nothing.

A filter is the one control whose whole job is to decide what its reader is shown, so a pattern nobody
could read must not remove rows for a reason nobody can see. Matching everything is visibly wrong and
hides nothing; a confident empty list is invisibly wrong. The reason is reported so that a host can
show it, and a host must also treat it as *do not act on this pattern*.

Negation does not invert this (§10).

---

## 15. Examples

Given:

```text
[
  "Apple",
  "Apple Pie",
  "Green Apple",
  "Pineapple",
  "Banana",
  "Banana Bread",
  "1bar4",
  "2bar5",
  "3bar6",
  "x1bar4"
]
```

### Default contains

```text
apple
```

matches:

```text
Apple
Apple Pie
Green Apple
Pineapple
```

because matching is case-insensitive by default.

### Case-sensitive

```text
\c\apple
```

matches lowercase `apple` but not uppercase `Apple`.

### Starts with

```text
`Apple
```

matches:

```text
Apple
Apple Pie
```

### Ends with

```text
Apple`
```

matches:

```text
Apple
Green Apple
Pineapple
```

### Exact

```text
`Apple`
```

matches `Apple`, plus case variants under the default case-insensitive mode.

### Character set

```text
[123]bar
```

matches:

```text
1bar4
2bar5
3bar6
```

because the default behavior is contains.

### Character set + start anchor

```text
`[123]bar
```

matches:

```text
1bar4
2bar5
3bar6
```

but not:

```text
x1bar4
```

### Character set + both anchors

```text
`[123]bar[456]`
```

matches:

```text
1bar4
2bar5
3bar6
```

but not:

```text
x1bar4
1bar4x
```

### Case-sensitive character-set pattern

```text
\c\`[A-Z]foo
```

means:

> case-sensitive, starts with one uppercase letter, followed by `foo`.

### OR

```text
Apple|Banana
```

matches labels containing either term.

---

## 16. Implementation Recommendation

The matcher should parse the pattern into a small internal representation rather than treating the syntax itself as regex.

For example:

```text
\c\`[123]bar[456]`
```

could become conceptually:

```text
OPTIONS:
    CASE_SENSITIVE

PATTERN:
    START
    CHARSET("123")
    LITERAL("bar")
    CHARSET("456")
    END
```

while:

```text
foo*bar|[123]baz
```

could become:

```text
[
    LITERAL("foo")
    ANY
    LITERAL("bar")
]

OR

[
    CHARSET("123")
    LITERAL("baz")
]
```

This keeps the public language small and deterministic and prevents implementation details of a regex engine from becoming part of the label-filter specification.

---

## Licensing of this document

**This specification text is licensed CC BY 4.0.** Copyright 2026 Steven Spungin.

The implementations are **MIT**, which is a different licence for a different thing: the package's
`license` field names MIT because that is what the code is, and this document travels inside the same
tarball under the licence above. Specification text is CC BY 4.0, and a
package carrying both says so rather than letting the manifest speak for the prose.
