# label-filter

A small pattern language for filtering lists of objects **by their labels**.

A plain word is a case-insensitive *contains*, which is the whole point of the default: the common
search costs no syntax. Wildcards, anchors, character sets and alternation are there for when the
common search is not enough.

```js
import { compileLabelFilter } from 'label-filter'

const match = compileLabelFilter('invoice*|receipt*')
files.filter(match)
```

## Goals

Steven, 2026-09-22, verbatim: *"my goals were easy to learn, easy to type, easy to view, and complete
enough for most needs."* They are the tie-breaker for anything proposed later, so they are recorded —
with what serves each and what strains it — in [§1.1 Design goals](docs/syntax.md).

The short version: the default carries *easy to learn* and *easy to type*, because the common search
costs no syntax. The backtick used to carry the strain — start anchor, end anchor *and* set delimiter,
which is where every confusion in this language came from — until sets moved into `[…]` on 2026-09-22
and left it doing one job. Negation and whole-word matching arrived the same day.

## The language, in nine lines

| Pattern | Means |
|---|---|
| `apple` | contains, case-insensitive — the default |
| `apple*pie` | `*` is any run of characters, including none |
| `` `apple `` | anchored to the start |
| `` apple` `` | anchored to the end |
| `` `apple` `` | both — an exact match |
| `apple\|pear` | either alternative |
| `[abc]` | one character from a set — `[0-9]`, `[a-z]` |
| `` \c\`apple` `` | options prefix; `c` makes the pattern case-sensitive |
| `\*` | a backslash escapes a reserved character |

**Six characters are reserved and nothing else is special:** `*` `|` `` ` `` `\` `[` `]`.

## Sets, groups and options

```text
foo[123]bar      one character from 123 — sets take ranges too: [0-9], [a-z], [A-Za-z], [0-9A-F]
`[123]bar        beside an anchor, with nothing special required
*.||md|txt||     ||…|| groups alternatives, so a shared part is written once, not once each
`||a|b||`        exactly a, or exactly b — an anchor reaches every branch of the group
\-\test          not — hide every label the pattern finds
\b\app          whole word — app, app-1, my app, app_data; not apple or snapple
\c-b\App        options compose
```

**A set is always case-sensitive, even in the default case-insensitive mode**, because a set is the
one construct that can say *either case* explicitly — `[A-Za-z]` — while nothing else could say
*this case only*. `\c\` governs literals.

**A backtick is an anchor and nothing else**: first character, last character, or a mistake. A group
does not nest, three or more `|` in a row is refused rather than guessed at, and `` `a|b` `` is
refused outright — an anchor binds to the alternative it is written in, so that spelling meant
*starts with `a`* OR *ends with `b`* while reading like *exactly `a` or `b`*.

**A word boundary is the edge of the label or a neighbouring character that is not a letter or a
number**, so `_` separates words — which regex's own `\b` gets wrong for filenames. And `\-\` is an
*exclusion* filter: `\-\a|b` is NOT (a OR b). *Apple but not test* needs two filters, by design.

The full specification is [`docs/syntax.md`](docs/syntax.md), whose two amendments carry the rulings
above.

## Two decisions worth knowing

**It is parsed into a small IR, never compiled to a regex.** That keeps the public language small and
deterministic, and stops a regex engine's implementation details leaking into it. Translating to a
regex would also make every reserved character an escaping problem twice over.

**An unparseable pattern hides nothing.** `compileLabelFilter` returns a matcher that matches
*everything* and carries the reason on `match.error`, rather than quietly returning an empty list.
Filtering on a pattern nobody could read would remove rows for a reason nobody can see — a confident
empty, at the one control whose whole job is to decide what you are shown. The caller surfaces
`match.error`; it never has to guess.

## API

- `compileLabelFilter(pattern)` → `match(label) => boolean`, with `match.error` set to a string when
  the pattern could not be read.
- `parsePattern(pattern)` → the parsed form, if you want to inspect or render it.

## Try it

```sh
npm run sandbox      # then open the URL it prints
```

The sandbox imports the real `src/index.js`, not a copy — what you try there is what the package
does. Type a pattern and a list of labels and watch the split update live.

## Test

```sh
npm test                     # all three suites
npm run test:properties:deep # every pattern up to 6 characters — ~35s
```

Three suites, because they fail in different ways.

**`test/conformance.mjs` — the specification is the test suite.** Every case is lifted from a
numbered section of `docs/syntax.md` and names that section when it fails, so a disagreement points
at the paragraph to re-read rather than at a line of code. It also feeds the parser partial input — a
lone backtick, a trailing backslash, an empty alternative — because a pattern being typed is
unfinished far more often than it is finished.

**`test/properties.mjs` — what the specification cannot enumerate.** It walks *every* pattern up to a
given length over the reserved alphabet, fuzzes longer ones, and asserts the invariants that hold
whatever is typed: nothing throws, a refused pattern hides nothing, a verdict never depends on which
label was asked first. Then it checks thousands of generated patterns against an **independently
written** oracle — a regular expression, which is precisely what `src/index.js` refuses to be, so the
two share no code and no reasoning. The asymmetry that a literal folds and a set does not is what
makes that comparison bite, since the oracle cannot just use the `i` flag.

**`test/performance.mjs` — the budget is one keystroke, over a whole list.** A filter that is correct
and slow is still broken: before the matcher memoised failed positions, `` *a*a*a*a*a*z `` against an
80-character label took **25 seconds for one label**, and every conformance case passed throughout.
Ceilings are per label, and each one above the common ceiling is a cost written down rather than
absorbed.

All three take their configuration from the environment with **no defaults** — seed, case counts,
budgets — so a run is reproducible from its own command line and a budget is never implicit. The npm
scripts supply the values.

## Status — not published, on purpose

This package is **`"private": true`** and carries **no `license`, `author` or `repository` field**.
That is deliberate and mechanical: `npm publish` refuses a private package, so the name cannot be
claimed by an accidental placeholder release.

Publishing a stub to hold the name would be the obvious protective move and it is the wrong one. The
first publish is what fixes `author`, `license` and `repository` — the three things not yet decided —
so a placeholder would settle all three by default, at the moment nobody is looking. Losing the name
is recoverable; a manifest published with defaults is not, because nobody notices it and everybody
inherits it.

Those three fields, and the first real release, are decided elsewhere. Until then the package is
consumed locally.

## Who uses it

**Squid Desktop** is the first consumer, not the owner. It stages this module at build time so there
is exactly one copy of the language in existence. A desire for new syntax is a request here, never a
local edit there.
