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

Steven, 2026-09-22, verbatim:

> my goals were easy to learn, easy to type, easy to view, and complete enough for most needs

**These four are the tie-breaker for every future proposal.** A syntax that serves one of them at
another's expense is not obviously an improvement, and this section is where that argument gets
settled. Each goal is recorded with what serves it and what strains it, because a goal with no
recorded cost cannot be used to decide anything.

### Easy to learn

**Served by the default.** A plain word is a case-insensitive *contains*, so the most common search
costs no syntax at all and nothing has to be learned before the language is useful. Four reserved
characters; no parentheses beyond the one flat group, no quantifiers, no lookahead, no capture, no
flags. The whole language fits in a table of a dozen lines.

**It was strained by the backtick doing three jobs**, start anchor, end anchor, and set delimiter,
disambiguated by position and parity. That was the one genuinely hard corner, and it was not
speculative: on 2026-09-21 and 2026-09-22 it produced six separate confusions, in the implementation
*and in this document*.

| What was written | What it was thought to mean | What it means |
|---|---|---|
| `` `in*`t` `` | an unpaired backtick, or a set of `in*` | anchor, `in`, any, set of `t` |
| `` `123`bar `` | §15's own example: a set then `bar` | refused, a set cannot open with a bare backtick |
| `` `123`` `` | starts with one of `123` | `123` then an empty set, refused |
| `` `1`` `` | ends with one of `1` | `1` then an empty set, refused |
| `` `0-9` `` | a digit | the exact text `0-9` |
| ``` ``A-Z` ``` | a typo | anchor, then a set |

The rule that resolved all six, *backticks pair from the left, and only a backtick still unpaired at
the very end is an end anchor*, was a **parser** rule that a person cannot apply at a glance.

**Fixed at the root on 2026-09-22**, while the package was still unpublished: sets moved to `[…]`, a
backtick became an anchor and nothing else, and the table above became history. See the second
amendment of that date. This is what a goal is for, the overload was defensible on every other
count, and *easy to learn* is what decided it.

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

**It was strained by runs of backticks.** `` `#`0-9a-f``0-9a-f``0-9a-f`` `` was correct, useful, and
a picket fence; the eye cannot count backticks, which was the same overload the learnability goal
paid for, showing up as a reading cost. The same pattern is now `` `#[0-9a-f][0-9a-f][0-9a-f]` ``,
still dense, but every delimiter says which end it is. The doubling in `||…||` never had the problem,
being visually distinct from a single bar, and that is the shape the bracket fix followed.

### Complete enough for most needs

**Served:** contains, starts, ends, exact, wildcard, one-of-characters, ranges, alternation,
grouping, case control, escapes. Between them these answer the large majority of list filtering.

**Negation and word boundaries were the two gaps, and both closed on 2026-09-22**, `\-\` and
`\b\`, neither of which cost a reserved character, because the option prefix was already the place
for something that governs the whole pattern.

What remains, in order of how often it would actually be missed:

* **repetition**, `[0-9]` four times over is how a four-digit year is written
* **include-except**, `\-\` is an exclusion filter, so *apple but not test* still needs two
  filters, or an AND this language deliberately does not have

**Deliberately out of scope**, and not gaps: numeric or date comparison, field-scoped terms
(`name:foo`), fuzzy or ranked matching, and anything requiring a regex engine's machinery. A label
filter that grew those would stop being learnable in an afternoon, which is the first goal.

---

## 2. Reserved Characters

> **Superseded 2026-09-22, there are now six.** `[` and `]` were added when sets moved into
> brackets; see *Amendment, 2026-09-22 (second)*.

Only four characters have special meaning:

```text
*   |   `   \
```

All other characters are treated as ordinary literal characters.

The backslash `\` is used for escaping and for introducing pattern options.

The backtick `` ` `` is used for anchors and character sets.

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

> **Superseded 2026-09-22, a set is `[…]`.** Every example below holds with the brackets substituted
> for the backticks; see *Amendment, 2026-09-22 (second)*.

A pair of backticks defines a **single-character set**.

```text
`123`
```

matches exactly one character from:

```text
1
2
3
```

Examples:

```text
foo`123`bar
```

matches:

```text
foo1bar
foo2bar
foo3bar
```

A character set always consumes **exactly one character**.

### Character ranges

Character sets may contain ranges:

```text
`0-9`
```

→ one digit

```text
`a-z`
```

→ one lowercase letter

```text
`A-Za-z`
```

→ one ASCII letter

```text
`0-9A-F`
```

→ one hexadecimal character

---

## 7. Character Sets at Boundaries

> **Deleted 2026-09-22.** This section exists only because one character delimited sets *and*
> anchored the pattern. Sets moved to `[…]`, so there is no collision left to resolve and nothing
> here to apply: `` `[123]bar `` and `` bar[456]` `` need no doubling. Kept as the record of what the
> overload cost.

A character set uses backticks, while a boundary anchor also uses a backtick.

When a character set is immediately adjacent to a boundary, the anchor and character-set delimiter become adjacent.

Therefore, **two backticks appear together**.

### Start

```text
``123`bar
```

means:

> start of label, followed by one character from `123`, followed by `bar`.

The syntax consists of:

```text
`       start anchor
`123`   character set
```

### End

```text
bar`456``
```

means:

> `bar`, followed by one character from `456`, ending at the end of the label.

The syntax consists of:

```text
`456`   character set
`       end anchor
```

### Both

```text
``123`bar`456``
```

means:

> the entire label must consist of one character from `123`, followed by `bar`, followed by one character from `456`.

Matches:

```text
1bar4
1bar5
1bar6
2bar4
2bar5
2bar6
3bar4
3bar5
3bar6
```

Does not match:

```text
x1bar4
1bar4x
11bar4
1bar44
```

---

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

There are no parentheses or additional boolean operators.

---

## 9. Escaping

> **Extended 2026-09-22.** `\[` and `\]` join the escapes; the reserved set is now six characters.

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
refused rather than read as an option or as the literals it is made of. See the amendment of
2026-09-24.

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
\c\``A-Z`foo
```

means:

> case-sensitive, starts with one uppercase letter, followed by `foo`.

The option prefix ends at the second backslash; everything after it uses the normal pattern syntax.

### Future options

The option namespace is intentionally extensible.

For example, future options could be added without changing the pattern grammar:

```text
\d\pattern
```

or:

```text
\cd\pattern
```

if additional matching behaviors are needed.

---

## 11. Summary of Syntax

> **Re-spelt 2026-09-22.** Rows using a backtick as a set delimiter are superseded by the bracket
> spelling; the table in *Amendment, 2026-09-22 (second)* is the current one.

| Pattern           | Meaning                                          |                              |
| ----------------- | ------------------------------------------------ | ---------------------------- |
| `apple`           | case-insensitive, contains `apple`               |                              |
| `apple*pie`       | `apple`, followed by anything, followed by `pie` |                              |
| `` `apple ``      | starts with `apple`                              |                              |
| `` apple` ``      | ends with `apple`                                |                              |
| `` `apple` ``     | exactly `apple`                                  |                              |
| `` `123` ``       | one character from `123`                         |                              |
| ``foo`123`bar``   | `foo`, one character from `123`, then `bar`      |                              |
| ` `123`bar ``     | starts with one character from `123`, then `bar` |                              |
| `` bar`456`` ``   | `bar`, one character from `456`, then ends       |                              |
| ` `123`bar`456` ` | exact full-label pattern                         |                              |
| `apple            | banana`                                          | contains `apple` OR `banana` |
| `\c\apple`        | case-sensitive, contains `apple`                 |                              |
| ``\c\`apple``     | case-sensitive, starts with `apple`              |                              |
| `\*`              | literal `*`                                      |                              |
| `\|`              | literal `                                        | `                            |
| `` \` ``          | literal backtick                                 |                              |
| `\\`              | literal `\`                                      |                              |

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
`0-9`engine
```

### No regex semantics

The pattern language is not intended to be a simplified regular-expression language.

Only the explicitly defined operators have special meaning.

---

## 13. Parsing Model

> **Superseded 2026-09-22.** The backtick grammar below, a boundary tick distinguished from a set
> delimiter by position and context, is exactly what the bracket spelling removed. See the second
> amendment of that date.

A pattern is first checked for an optional option prefix.

If the pattern begins with `\`, the parser reads the option section until the next unescaped `\`.

Conceptually:

```text
pattern
  → [option-prefix] alternatives

option-prefix
  → "\" options "\"

alternatives
  → alternative ("|" alternative)*

alternative
  → optional start-anchor
    token*
    optional end-anchor

token
  → literal
  | wildcard
  | character-set

character-set
  → "`" character-set-body "`"
```

After the option prefix is removed, the remainder is parsed normally.

Unescaped `|` characters separate alternatives.

Each alternative consists of:

* optional start anchor `` ` ``
* literal characters
* wildcard tokens `*`
* character-set tokens `` `...` ``
* optional end anchor `` ` ``

Escaped characters are always treated as literals.

When a character set occurs immediately at a boundary, the adjacent anchor and character-set delimiter produce the required double-backtick sequence.

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
`123`
```

always consumes exactly one character.

The matcher must distinguish a boundary backtick from the backticks delimiting a character set based on position and parsing context.

---

## 15. Examples

> **Re-spelt 2026-09-22.** Set examples below use the old backtick delimiter; the migration table in
> the second amendment of that date converts them.

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
`123`bar
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
``123`bar
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
``123`bar`456``
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
\c\``A-Z`foo
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

> **Partly superseded 2026-09-22.** The IR advice stands and is what `src/index.js` does. The
> pseudo-code for distinguishing a boundary backtick from a set delimiter no longer applies.

The matcher should parse the pattern into a small internal representation rather than treating the syntax itself as regex.

For example:

```text
\c\``123`bar`456``
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
foo*bar|`123`baz
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

## Amendment, 2026-09-21

**The specification above is unchanged and is kept as written.** This section records a ruling that
resolves a contradiction between two of its sections, and it is the authority where they disagree.

### The contradiction

§7 introduces the double backtick so that an anchored character set is distinguishable from a bare
one. That mechanism only works if a **lone** boundary backtick is an anchor.

§15 gives `` `123`bar `` as a character set followed by `bar`, matched anywhere. That requires a
**lone leading backtick to open a set**.

Both cannot hold for the same spelling. The first implementation followed §15, and the reading it
produced for a pattern nobody had considered was indefensible:

```text
`in*`t`
```

was parsed as *one character from `i`, `n`, `*`, followed by `t`, at the end of the label*, because
the leading backtick opened a set whose closing backtick was not the last character. Reported by
Steven: *"its confused about if the set is `in*` or `t`."*

### The ruling

> The first tick should always be read as an anchor, and if it is part of a set, must be preceded by
> `` ` `` or `*`.

And on the same pattern:

> The first is an anchor, the next must be a set.

So `` `in*`y` `` is **start anchor**, `in`, any, then a **set** holding `y`, with no end anchor,
because the set consumed the last two backticks. The order of operations is the whole of it:
**backticks pair into sets from the left, and only a backtick still unpaired at the very end is an
end anchor.** Taking the trailing backtick as an anchor *first* is what made this look like three
ticks that could not pair.

### What each spelling means

| Pattern | Reads as |
|---|---|
| `` `apple `` | starts with `apple` |
| `` apple` `` | ends with `apple` |
| `` `apple` `` | exactly `apple`, two anchors |
| `` `123` `` | exactly `123`, two anchors, **not** a set |
| `` `in*`y` `` | starts with `in`, any, then one of `y` |
| ``` ``123`bar ``` | starts with one of `123`, then `bar` |
| `` *`123`bar `` | one of `123` then `bar`, anywhere |
| `` foo`123`bar `` | `foo`, one of `123`, `bar` |
| `` bar`456`` `` | `bar`, one of `456`, at the end |

**A set at the very start must be preceded by `` ` `` or `*`**, ``` ``123` ``` or `` *`123` ``,
because its opening backtick would otherwise be the first character, which the ruling reads as an
anchor. At the end there is no such difficulty: `` bar`456`` `` works, since the set's opening
backtick has `bar` before it.

### Syntax errors

Steven, on two of his own examples: *"`` `123`` `` and `` `123`* `` are syntax errors, yes?"* Yes.
Both would need a set to open at position 0 with nothing before it.

- `` `123`` ``, the anchor takes the first backtick, leaving the trailing pair to form an **empty
  set**, which can never match. Refused, because a pattern that silently matches nothing is worse
  than one that says why.
- `` `123`* ``, the anchor takes the first backtick and the next has no close.

**A backtick left unpaired anywhere but the very end is an error, not a literal.** A literal
backtick is `` \` `` (§9). Guessing at a half-written set is how a filter silently answers a
different question.

**A refused pattern hides nothing.** The filter shows the reason and leaves every row visible,
removing rows on a pattern that could not be read would have the one control whose job is deciding
what you see deciding it for a reason nobody can inspect.

### Consequence for §15

`` `123`bar `` is no longer valid as written. For the same meaning it is `` *`123`bar ``, or, if the
start anchor was intended, ``` ``123`bar ```.

---

## Amendment, 2026-09-22

**Groups.** `||…||` groups alternatives, and `` `a|b` `` is now refused. §8 and §12 are amended
below; everything else above stands.

### The precedence problem

Alternation is split off **before** anchors are read (§8: *"each `|`-separated alternative is
evaluated independently"*), so an anchor belongs to the alternative it is written in. That makes:

```text
`a|b`
```

mean *starts with `a`* **OR** *ends with `b`*, while it reads to almost everyone as *exactly `a` or
`b`*, because the anchors sit at the two outer edges and look like they wrap the alternation.

Reported by Steven 2026-09-22: *"there is one precedence issue, its obvious: `` `a|b` ``"*. It parsed
cleanly and answered a different question, which is the same failure as the `` `in*`t` `` bug of the
day before, and worse here, because nothing about the result says a different question was asked.

### The ruling: `||` is a group

> **my thought is `||` becomes a parenthesis**, `` `||a|b||` ``

So:

```text
`||a|b||`
```

is *exactly `a`* or *exactly `b`*. Inside the group, single `|` separates the branches; the anchors
belong to the enclosing alternative and apply to every branch.

**No fifth reserved character is introduced.** Doubling a delimiter where it would otherwise be
ambiguous is already this language's own idiom, §7 does exactly that with `` `` ``. And the spelling
`||` took over was never a feature: an empty alternative silently matched **every** label, so
`a||b` used to hide nothing and say nothing. It is now an error, which is strictly better.

Parentheses were the obvious alternative and are the wrong one: a literal `(` is common in real
labels (`Screenshot (2).png`), a literal `||` is vanishingly rare, so `()` would have taxed every
ordinary label to serve a rare pattern.

### What it buys beyond the anchor case

A shared part no longer has to be repeated once per alternative:

```text
*.||jpg|png|heic||        was  *.jpg|*.png|*.heic
`||src|test||/            was  `src/|`test/
`IMG_04||2|3||`0-9``      had no short spelling at all
```

The repetition was not just verbose; editing the shared part meant editing every copy of it.

### Rules

* **A group does not nest.** Inside a group, `||` **closes** it, so `||a||b||` is not a nested group
  but a closed group, `b`, and a second group left open. It is refused as unclosed.
* **Three or more `|` in a row is an error, never a guess.** This is what keeps `||` pairing
  decidable left to right, and it is also what makes an empty group (`||||`) and an empty branch
  unwritable, they cannot be spelled without a run of three.
* **An unclosed group is an error**, so a half-typed `a||` hides nothing and says why, the same
  channel as an unpaired backtick.
* **Two groups cannot touch.** `||a|b||||c|d||` is a run of four bars and is refused; put a character
  between them (`||a|b||-||c|d||`) or use separate alternatives. This falls out of the run rule
  rather than being a rule of its own.
* **An anchor cannot go inside a group.** Anchors bind to the whole alternative; `` ||a`|b|| `` is
  refused.
* **A set may open a branch directly**, `` ||`12`x|y|| ``. The rule of 2026-09-21 is that a set may
  not open with a backtick that has nothing before it; the group's `||` is something before it, and
  it is not a backtick, so there is nothing to confuse.
* **A literal `||` is `\|\|`**, unchanged by any of this.

### `` `a|b` `` is refused

Now that the intended meaning has a spelling, the misread spelling is an error naming it:

> anchors bind to one alternative, not across `|`, write `` `||a|b||` `` for exactly one of them

**This costs one thing and it is worth naming:** *starts with `a` OR ends with `b`* was only
expressible as `` `a|b` ``, and is now not expressible at all. That is an exotic want; being quietly
wrong about a common one is not a fair price for it. A refusal hides nothing, every row stays
visible with the reason attached, so this error costs a reader nothing but a re-read.

The refused shape is precise: **two or more alternatives, where the first carries a start anchor and
no end anchor, and the last carries an end anchor and no start anchor.** `` `a|`b `` and
`` a`|b` `` are ordinary and still valid, and so is `` `a`|`b` ``, where each alternative anchors
itself.

### Amendment to §12

§12 says *"There are no parentheses"*. It now reads: there is **one** grouping construct, `||…||`,
which does not nest, does not capture, and has no backreferences. The principle §12 is defending is
the absence of regex-shaped machinery, and a flat, non-capturing group is not that.

### Precedence, stated once

1. the option prefix `\…\`, applies to the whole pattern
2. `|` at the top level, separates alternatives
3. anchors, at the edges of the alternative they are written in
4. `||…||`, one token within an alternative; its `|` separates branches, nothing else
5. sets, `*`, literals

### Implementation note

A group is **desugared at parse time**: an alternative holding a group of *n* branches becomes *n*
alternatives sharing its anchors. The IR therefore never carries a group node, the matcher is
unchanged, and there is nothing new that can recurse. Groups multiply, so an alternative is capped at
**64** expansions and refused above it.

### Table

| Pattern | Reads as |
|---|---|
| `` `||a|b||` `` | exactly `a`, or exactly `b` |
| `` *.||md|txt|| `` | `.md` or `.txt`, anywhere |
| `` `||src|test||/ `` | starts with `src/` or `test/` |
| `` ||`12`x|y|| `` | one of `1`,`2` then `x`, or `y`, a set opening a branch |
| `` `a|b` `` | **refused**, anchors do not wrap alternatives |
| `a||b` | **refused**, unclosed group (it used to match everything) |
| `` ||a||b|| `` | **refused**, groups do not nest |
| `a\|\|b` | the literal text `a||b` |

### Clarification to the 2026-09-21 amendment

That amendment ends: *"At the end there is no such difficulty: `` bar`456`` `` works, since the set's
opening backtick has `bar` before it."* The example is right and the generalisation is not, and the
generalisation is what got copied into the sandbox and the README.

Steven, 2026-09-22: *"`` `1`` `` is invalid"*, and it is, for the reason the rest of the ruling
gives. **Count the backticks from the left.** `` bar`456`` `` opens with `bar`, so its first backtick
opens a set. `` `1`` `` opens with a backtick, which is therefore the start anchor, leaving a pair at
the end that is an empty set, refused, as `` `123`` `` already was.

So a set at the **end** is safe only when the pattern does not open with an anchor. Under a start
anchor it needs three backticks after it, not two:

| Want | Write |
|---|---|
| ends with one of `1` | `` *`1`` `` |
| starts with one of `1` | ``` ``1` ``` |
| starts with `1`, ends with one of `2` | `` `1`2`` `` |
| exactly `1` | `` `1` `` |

### The option prefix needs at least one letter

Steven, 2026-09-22: *"`\\` matches everything but should match anything with a backslash."*

`\\` was being read as an option prefix with an **empty** option section, which stripped both
characters and left the empty pattern, matching every label. §9 says `\\` is a literal backslash, and
a **lone** `\` already parsed that way, so the two spellings of one thing disagreed and the wrong one
was a confident match-all.

**An option section must hold at least one letter.** `\\` and `\\foo` are escapes; `\c\foo` is an
option prefix. An empty option section was never useful anyway: omitting it says the same thing.

**And an unknown option is refused rather than ignored.** §10 deliberately leaves the namespace open
for `\d\` and `\cd\`; until one of them exists, `\d\foo` is an error naming the only option there is.
Dropping it silently would answer a question the pattern did not ask, and `\d\foo` has a second
reading (the literal `dfoo`) which makes guessing between the two worse than refusing either.

| Pattern | Reads as |
|---|---|
| `\\` | a literal backslash; on its own, labels containing one |
| `\` | the same |
| `\\foo` | the literal `\foo` |
| `\\c\\` | the literal `\c\` |
| `\c\foo` | case-sensitive, contains `foo` |
| `\d\foo` | **refused**, unknown option |

### Sets are always case-sensitive

Steven, 2026-09-22: *"sets should always be case sensitive, yes?"*, yes. This amends §6 and §10.

A **literal** folds with case, as it always has: `apple` matches `APPLE` by default, and `\c\` turns
that off. A **set** never folds, in either mode:

```text
``A-Z`ocker      matches Dockerfile and DOCKERFILE, not dockerfile
x`a-z`y          matches xay, NOT xAy
x`A-Za-z`y       matches both, because it says both
```

**The asymmetry is the point, not an inconsistency.** A literal has no other spelling, so folding it
is the only way `apple` can mean what everyone means by it. A set has another spelling: `` `A-Za-z` ``
asks for either case explicitly, and `` `Aa` `` does it for one letter. Folding therefore *destroyed*
what a set is for, `` `A-Z` ``, `` `a-z` `` and `` `A-Za-z` `` were three spellings of one thing, and
*starts with a capital* could only be asked by flipping the whole pattern to `\c\`, which hardens
every literal along with it. Not folding loses nothing: the wider set is always available.

Consequently **`\c\` now governs literals only.** §10's example `` \c\``A-Z`foo `` still means what
it says; the `\c\` in it now bears on `foo` alone.

Implementation note: the matcher walks the folded label and the raw label at the same index, a
literal reads the folded one, a set reads the raw one, so the fold is applied per character and
**skips the characters whose lower case is longer than they are** (`İ`), which would otherwise slide
the two strings apart and have a set test the wrong character.


---

## Amendment, 2026-09-22 (second)

**Sets move to `[` and `]`, `\-\` negates, and `\b\` matches whole words.** Steven:

> lets use `[` and `]` for sets, implement it, and also the negation, and boundary using B

This is a breaking change, taken deliberately while it was free: at the time the package was
unpublished and `private: true`, the name was unclaimed, and the one consumer staged the module at
build time. Version 0.1.0 followed on 2026-09-24, so this was the last such change that cost nothing.

### A backtick is an anchor, and nothing else

The backtick used to delimit sets as well as anchor the pattern, and **that single overload produced
every confusion this language has had.** With sets in brackets the rule fits in one line:

> A backtick is the start anchor as the first character of an alternative, the end anchor as the
> last, and an error anywhere else. A literal backtick is `` \` ``.

No pairing, no parity, no lookahead, no counting from the left. What that deletes:

| Gone | Was |
|---|---|
| **§7 entirely** | the doubled backtick at a boundary, `` ``123`bar `` |
| the 2026-09-21 pairing ruling | *backticks pair from the left; only a trailing unpaired one is an end anchor* |
| its 2026-09-22 clarification | why `` `1`` `` was refused where `` bar`456`` `` was not |
| "a set may not open a pattern" | the rule that `` `123` `` needed `` ` `` or `*` in front of it |

Those sections are kept as the record. **They describe a mechanism that no longer exists.**

Every spelling they refused is still refused, now by the one rule above rather than by three:
`` a`b ``, `` `123`bar ``, `` `123`` ``, `` `123`* ``, `` `1`` ``.

### Sets

```text
[123]            one character from 1, 2, 3
[0-9] [a-z]      ranges, as before
[A-Za-z] [0-9A-F]
foo[123]bar      anywhere in the pattern: including the very start
`[123]bar        beside an anchor, with nothing special required
bar[456]`
`[123]bar[456]`
```

* **An empty set `[]` is refused**, it could never match, and a pattern that silently matches
  nothing is the outcome this language exists to avoid.
* **An unclosed `[` and an unmatched `]` are refused**, naming the escape.
* **A literal bracket is `\[` or `\]`.**
* **An escaped dash is a literal dash:** `[a\-z]` is three characters, `[a-z]` is a range. A leading
  or trailing dash is still a literal, as §6 says.
* A set is still **case-sensitive always**, and still consumes **exactly one character**.

**§15 is restored.** It read `` `123`bar `` as a set followed by `bar`, which the 2026-09-21 ruling
had to refuse. `[123]bar` is that original meaning, spelled unambiguously.

**What it cost:** two more reserved characters, so six in total, `*` `|` `` ` `` `\` `[` `]`.
Measured before deciding: of **2,388 distinct filenames** across this estate, **zero** contain `[`,
`]`, `` ` ``, `*`, `|` or `{`. That sample is source code; names like `[WIP] draft.md` live in
document folders it did not reach, so the tax is small rather than provably nil.

### `\-\`, not

`\-\pattern` inverts the verdict: every label the pattern would have shown is hidden, and every
other label is kept. It composes (`\c-\`, `\-b\`) and `-` was chosen because it is what
everything from a search engine to a package manager already means by *exclude*, it needs no shift
key, and unlike `` ` `` it is a real key on every keyboard layout. The option section admits it as
the first non-letter.

Two rulings come with it:

* **Negation never inverts a refusal.** A pattern that cannot be read still matches everything, so it
  hides nothing. Inverting that would hide **every** row over a typo, the worst outcome this
  language can produce, reached from the one direction nobody watches.
* **`\-\` with nothing after it is refused.** An empty pattern matches everything, so negated it
  matches nothing; it is also the state `\-\…` passes through while it is being typed. `\-\*` is
  allowed: it says *hide everything*, and it says it on purpose.

**Its limit, stated plainly:** this is an *exclusion* filter, not *include-except*. `\-\a|b` is
NOT (a OR b), which is a hide-list. *Apple, but not test* needs AND, which this language does not
have and should not get, precedence would cost the first goal outright. A host that wants it should
offer two boxes, include and exclude, each taking one pattern.

### `\b\`, word boundary, definition B

`\b\app` matches `app`, `app-1`, `my app`, `app.md`, `app_data` and `an app.`; it does not match
`apple`, `snapple` or `MyAppCard`.

> **A boundary is the edge of the label, or a neighbouring character that is not a letter or a
> number** (`\p{L}` / `\p{N}`, so it holds in any script).

The test looks only at the **neighbouring** character, never at the matched text, so it stays
decidable by reading one character. The requirement applies to the **whole match extent**, just
before the first matched character and just after the last, not around every token, so
`\b\app*pie` is one word-run from `app` to `pie`. At a label edge it is satisfied trivially, so
`` \b\`app `` is just the anchor at that end.

**Why not regex's `\b`:** it counts `_` as a word character, so `app_data` would *not* match a
whole-word `app`, and `_` separates words in a filename whatever a regex thinks. Definition B was
chosen over that, and over a third option that also broke on camelCase humps (`MyAppCard`), which
remains addable later because B is a subset of it.

**What it replaces:** whole-word `app` without this option is four alternatives,
`` `app[-_. ]|[-_. ]app[-_. ]|[-_. ]app`|`app` ``, and the first attempt at writing that by hand,
during this very session, silently omitted `my app` and `the app`.

### Options, current

| Option | Means |
|---|---|
| `c` | case-sensitive literals (sets are always case-sensitive) |
| `-` | not, invert the verdict |
| `b` | word boundary, definition B |

Unknown options are still refused rather than ignored, which is what made these two safe to add:
`\b\app` was an error yesterday, not something that silently meant `bapp`.

### Migration

Replace `` `body` `` with `[body]` where it was a set, and drop the doubling at boundaries:

| Old | New |
|---|---|
| `` foo`123`bar `` | `foo[123]bar` |
| ``` ``123`bar ``` | `` `[123]bar `` |
| `` bar`456`` `` | `` bar[456]` `` |
| ``` ``123`bar`456`` ``` | `` `[123]bar[456]` `` |
| `` *`0-9`.pdf `` | `[0-9].pdf`, the leading `*` is no longer needed |

---

## Considered and declined, 2026-09-22

**A flag to un-reserve `[`, `]` and possibly `|`.** Proposed and declined the same day, recorded here
so it is not re-litigated from scratch. Steven: *"add a flag that allows [ and ] and possibly |
without escaping; discuss first"*, and after the discussion, *"Skip"*.

### What was proposed

An option letter (`\l\`) that made `[` and `]` ordinary characters, so a label like
`[WIP] roadmap.md` could be filtered by typing `[WIP]` instead of `\[WIP\]`. Two reaches were on the
table:

* **L1**, sets off, everything else intact, so `[WIP]|[DRAFT]` still alternates.
* **L2**, sets, alternation and groups all off: plain text with `*` and anchors, three reserved
  characters instead of six.

### Why not

**The tax it removes is already small.** Measured across this estate: of **2,388 distinct
filenames**, zero contain `[`, `]`, `` ` ``, `*`, `|` or `{`. The escape is two characters in a
pattern typed occasionally. (That sample is source code; see the reopening condition below.)

**And it would introduce a new kind of confusion.** Every other option (`c`, `-`, `b`) changes what
*matching* means. This one changes what *parsing* means, so the same pattern would read two ways
depending on a prefix, and *"why does `[WIP]` find nothing?"* becomes a question the language invites.
The cheaper answer is a hint in the host on an empty result, *"`[WIP]` is a character set here"*,
which changes no behaviour and so is not a guess.

`|` was the weaker half of the ask in any case: it is **illegal in Windows filenames** and rare in
titles, so `\|` covers it.

### What was never an option

**Deciding it automatically.** `[WIP]` *is* a well-formed set (one character from `W`, `I`, `P`) so
`[WIP] roadmap` is a legal pattern with a different meaning, and nothing distinguishes the two
intents. A heuristic on *unclosed* brackets is worse: `[abc` would be literal while `[abc]` is a set,
so one more keystroke would silently reinterpret everything before it.

### Two alternatives rejected with it

* **Doubled set delimiters**, `[[0-9]]`, leaving a single `[` always literal. It follows the `||`
  precedent and needs no flag, but it reintroduces delimiter counting (`[[a]b]]`), which is exactly
  what moving sets into brackets deleted, and it makes `[abc]` silently literal for a reader who
  expected a set, with no error to notice. A flag fails safer: forget it and you get a set that
  matches nothing, which is visible.
* **Quoting a run**, `"[WIP]"`. More expressive, since a literal chunk and a set could coexist, but
  it reserves another character that labels genuinely contain and brings its own escaping problem.

### What would reopen it

Evidence that bracketed tags are a **convention** in the label space actually being filtered, rather
than an occasional character. The estate measurement above is source code; document, download and
media names are where `[WIP]`, `[2026]` and `IMG[1]` live, and they were not in reach when this was
decided. If that evidence arrives, **L1 is the variant to build**, the use case that wants literal
brackets wants alternation in the next keystroke.

---

## Amendment, 2026-09-23

**Escapes, and one index is one character.** Two rulings, both of which also state what the earlier
sections left unsaid.

### A backslash may escape anything except an ASCII letter or digit

This holds in the pattern body and inside a set body alike, and it replaces the shorter rule ruled
earlier the same day (`\\`, `\]` and `\-` only, inside a set).

```text
x[\.]y      the literal x.y: punctuation is escapable
[\😀]       one emoji: every non-ASCII character is escapable
x\éy        the literal xéy
a\ b        the literal "a b"
[a\-z]      a, - and z: an escaped dash is not a range
[a\]b]      a, ] and b: an escaped bracket does not close the set
[\\]        one backslash

foo\d       REFUSED
[\n]        REFUSED
\bapp\b     REFUSED
\cfoo       REFUSED
```

**Punctuation, symbols and non-ASCII characters are literals with or without the backslash**, so
escaping them is harmless and permitted, which is what makes a pattern for a character nobody can
type reliably writable at all.

**A letter or digit after a backslash is refused**, because `\n`, `\d`, `\w` and `\b` are classes to
any reader who has met a regular expression, and would quietly mean the letter here. The most valuable
refusal is `\bapp\b` (the regex idiom for a whole word) which would otherwise match the literal
`bappb`. `\b\app` is the option that means it. This is the same ruling as refusing an unknown option,
applied one level down.

### One index is one character

**Every implementation walks code points**, in the pattern, in the label and in a set body.

This was not stated before because it had never been asked, and the answer differed: JavaScript strings
index by UTF-16 code unit, so `[😀]` held two half-surrogates and `x[😀]y` did not match `x😀y`, while
the Rust, Python, Go and PHP implementations, which index by code point, matched it. Five
implementations agreed about a question none of them had been asked.

A consequence worth stating: **a set holds characters, not code units**, so `[😀🎉]` is a set of two
members, and `*` spans whole characters.

The case-folding guard already in force follows from the same rule, a character is folded **only when
its lower case is one character**, because the folded text and the raw text are walked at the same
index, and `İ` would otherwise slide them apart.

### `\…\` is the instruction namespace

The section between a leading backslash and the next one is an **instruction section**. It holds
letters, digits and `-`, it is read as instructions whatever it contains, and **an instruction that
names nothing is refused**:

```text
\c\apple      case-sensitive
\-b\app       not, and whole-word: instructions compose in any order
\v2\foo       REFUSED: unknown instruction v2
\2\foo        REFUSED: unknown instruction 2
```

**This is a reservation, and the point of making it is that it costs nothing today.** Every spelling
it claims is already an error (an escaped letter or digit) so no pattern that works can change
meaning when an instruction is added later. That is the same mechanism that let `\-\` and `\b\` be
added a day after unknown options were first refused.

**It claims no punctuation, deliberately.** `\.foo\.bar` and `\ a\ b` are escaped literals and must
stay literals, so an instruction that one day needs `=` or `,` claims that character then, and pays
for it then. The three instructions are `c`, `-` and `b`; §10 calls them options, which is the older
word for the same thing.


---

## Amendment, 2026-09-24

**An option section cannot open an alternative.** Steven:

> ok refuse

Options are global. §10 says the section is read from the start of the pattern, and §13 splits on `|`
only after it has been removed, so a section written anywhere else is not an option at all. Until now
it was whatever its characters happened to mean:

```text
apple|\-\pear      <- reads as "contains apple, or not pear". Refused since 2026-09-24
\-\apple|pear      <- what that spelling means: NOT (contains apple OR contains pear)
```

**The rule.** After the option prefix has been read, no alternative may begin with `\`, one or more
characters from the instruction alphabet, `\`. The refusal names the section and where it belongs:
*"`\-\` applies to the whole pattern, so it cannot open an alternative, move it to the very start,
before the first `|`."* It applies to a `||…||` branch too, because a branch becomes an alternative
before this is checked.

### Why this was worth a breaking change and the earlier form was not

This is the same family as `` `a|b` ``: a spelling that parses cleanly, reads as one thing and means
another. What makes it worth its own ruling is not the misread, which had already shrunk, but an
inconsistency left behind when it shrank.

The 2026-09-23 rule that a backslash may not escape a letter or digit closed every spelling whose
option characters are letters. `apple|\c\pear` was refused from that day, and so was `a|\b\c`. What
survived was `-`, which is legally escapable, so the language refused an option section in a later
alternative when it was spelled with `c` or `b` and accepted it when spelled with `-`. **One rule per
option letter is not a rule anybody can hold in their head**, and four ports each had to encode
whichever answer was chosen.

### What it costs

Almost nothing, because **a dash needs no escape outside a set**. Everything the refusal rejects has a
shorter spelling that was always available:

```text
a|--          <- contains a, or contains two dashes. Unaffected, and always was
a|\-\-       <- refused now, and was never the way to write the line above
```

The cost is paid once, by this specification, in exchange for one sentence covering all three
instructions. Recorded as a breaking change in `changelog.md`; the fixture grew three cases and five
refusals, and all five implementations were changed together.

---

## Licensing of this document

**This specification text is licensed CC BY 4.0.** Copyright 2026 Steven Spungin.

The implementations are **MIT**, which is a different licence for a different thing: the package's
`license` field names MIT because that is what the code is, and this document travels inside the same
tarball under the licence above. Per Code-Evolve Governance, specification text is CC BY 4.0, and a
package carrying both says so rather than letting the manifest speak for the prose.
