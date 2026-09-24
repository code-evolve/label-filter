# label-filter

A small pattern language for filtering lists of objects **by their labels**.

Visit [Label Filter](https://www.code-evolve.com/products/label-filter), a Code-Evolve product, for
more information.

> **This is the TypeScript implementation and the reference one.** There are four others, Rust,
> Python, Go and PHP, and all five run `conformance/cases.json`. See the [project
> README](../README.md) and [`conformance/run-all.sh`](../conformance/run-all.sh).

A plain word is a case-insensitive *contains*, which is the whole point of the default: the common
search costs no syntax. Wildcards, anchors, character sets and alternation are there for when the
common search is not enough.

```js
import { compileLabelFilter } from 'label-filter'

const match = compileLabelFilter('invoice*|receipt*')
files.filter(match)
```

## Install

```shell
yarn add label-filter
npm install label-filter
```

**Published**: `label-filter@0.1.0` went to npm on 2026-09-24. **ESM only, no runtime dependencies,
TypeScript source with generated declarations**, `dist/index.js` and `dist/index.d.ts` come from
`npm run build`.

## Goals

Four goals, set out when the language was: **easy to learn, easy to type, easy to view, and complete
enough for most needs.** They are the tie-breaker for anything proposed later, so they are recorded,
with what serves each and what strains it: in [§1.1 Design goals](docs/syntax.md).

The short version: the default carries *easy to learn* and *easy to type*, because the common search
costs no syntax. The backtick used to carry the strain, start anchor, end anchor *and* set delimiter,
which is where every confusion in this language came from, until sets moved into `[…]` on 2026-09-22
and left it doing one job. Negation and whole-word matching arrived the same day.

## The language, in nine lines

| Pattern | Means |
|---|---|
| `apple` | contains, case-insensitive, the default |
| `apple*pie` | `*` is any run of characters, including none |
| `` `apple `` | anchored to the start |
| `` apple` `` | anchored to the end |
| `` `apple` `` | both, an exact match |
| `apple\|pear` | either alternative |
| `[abc]` | one character from a set, `[0-9]`, `[a-z]` |
| `` \c\`apple` `` | options prefix; `c` makes the pattern case-sensitive |
| `\*` | a backslash escapes a reserved character |

**Six characters are reserved and nothing else is special:** `*` `|` `` ` `` `\` `[` `]`.

## Sets, groups and options

```text
foo[123]bar      one character from 123: sets take ranges too: [0-9], [a-z], [A-Za-z], [0-9A-F]
`[123]bar        beside an anchor, with nothing special required
*.||md|txt||     ||…|| groups alternatives, so a shared part is written once, not once each
`||a|b||`        exactly a, or exactly b: an anchor reaches every branch of the group
\-\test          not: hide every label the pattern finds
\b\app          whole word: app, app-1, my app, app_data; not apple or snapple
\c-b\App        options compose
```

**A set is always case-sensitive, even in the default case-insensitive mode**, because a set is the
one construct that can say *either case* explicitly (`[A-Za-z]`) while nothing else could say
*this case only*. `\c\` governs literals.

**A backtick is an anchor and nothing else**: first character, last character, or a mistake. A group
does not nest, three or more `|` in a row is refused rather than guessed at, and `` `a|b` `` is
refused outright, an anchor binds to the alternative it is written in, so that spelling meant
*starts with `a`* OR *ends with `b`* while reading like *exactly `a` or `b`*.

**A word boundary is the edge of the label or a neighbouring character that is not a letter or a
number**, so `_` separates words, which regex's own `\b` gets wrong for filenames. And `\-\` is an
*exclusion* filter: `\-\a|b` is NOT (a OR b). *Apple but not test* needs two filters, by design.

The full specification is [`docs/syntax.md`](docs/syntax.md), whose two amendments carry the rulings
above.

## Two decisions worth knowing

**It is parsed into a small IR, never compiled to a regex.** That keeps the public language small and
deterministic, and stops a regex engine's implementation details leaking into it. Translating to a
regex would also make every reserved character an escaping problem twice over.

**An unparseable pattern hides nothing.** `compileLabelFilter` returns a matcher that matches
*everything* and carries the reason on `match.error`, rather than quietly returning an empty list.
Filtering on a pattern nobody could read would remove rows for a reason nobody can see, a confident
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

The sandbox imports the built `dist/index.js` (the package itself, not a copy) so `npm run sandbox`
builds first. A browser cannot run the TypeScript source, and a sandbox that exercised a *second* copy
of the language would agree with itself and prove nothing. Type a pattern and a list of labels and watch the split update live.

## Test

```sh
npm test                     # all three suites
npm run test:properties:deep # every pattern up to 6 characters: ~35s
```

Three suites, because they fail in different ways.

**`test/conformance.ts`, the specification is the test suite.** Every case is lifted from a
numbered section of `docs/syntax.md` and names that section when it fails, so a disagreement points
at the paragraph to re-read rather than at a line of code. It also feeds the parser partial input, a
lone backtick, a trailing backslash, an empty alternative, because a pattern being typed is
unfinished far more often than it is finished.

**`test/properties.ts`, what the specification cannot enumerate.** It walks *every* pattern up to a
given length over the reserved alphabet, fuzzes longer ones, and asserts the invariants that hold
whatever is typed: nothing throws, a refused pattern hides nothing, a verdict never depends on which
label was asked first. Then it checks thousands of generated patterns against an **independently
written** oracle, a regular expression, which is precisely what `src/index.ts` refuses to be, so the
two share no code and no reasoning. The asymmetry that a literal folds and a set does not is what
makes that comparison bite, since the oracle cannot just use the `i` flag.

**`test/performance.ts`, the budget is one keystroke, over a whole list.** A filter that is correct
and slow is still broken: before the matcher memoised failed positions, `` *a*a*a*a*a*z `` against an
80-character label took **25 seconds for one label**, and every conformance case passed throughout.
Ceilings are per label, and each one above the common ceiling is a cost written down rather than
absorbed.

All three take their configuration from the environment with **no defaults**, seed, case counts,
budgets, so a run is reproducible from its own command line and a budget is never implicit. The npm
scripts supply the values.

They run as TypeScript with no build and no test framework: `node test/conformance.ts` works because
Node strips the types itself. `npm run typecheck` is what actually checks them, and it is a separate
step for a reason, stripping types is not checking them, so a suite can pass while asserting against
an API that no longer exists.

## Status, one of five published

**`label-filter@0.1.0` is on npm as of 2026-09-24**, the first release out of this estate. The other
four implementations (Rust, Python, Go, PHP) are written and pass the same fixture, and each still
carries its registry's brake until its own first publish.

The manifest is **MIT**, **Steven Spungin**, and `github.com/code-evolve/label-filter`. The holder and
the licence were ruled on 2026-09-24 and the repository on 2026-09-23, none of them copied from a
sibling package, which Code-Evolve Governance forbids. Licence headers, `changelog.md`, `samples/`, the
`exports` map, `dry` and `prepack` all match the reference packages too; the deliberate differences (no
bundler, no CJS entry, no sourcemaps) are listed with their reasons in
[`docs/releasing.md`](docs/releasing.md), along with the checklist.

**The first publish is what fixed those identity fields, which is why there was never a placeholder
holding the name.** `label-filter` was free on npm from 2026-09-22 and publishing a stub to reserve it
would have decided the holder, the licence and the repository by default, at the moment nobody was
looking. Losing a name is recoverable; a manifest published with defaults is not.

## Who uses it

**Squid Desktop** is the first consumer, not the owner. It stages this module at build time so there
is exactly one copy of the language in existence. A desire for new syntax is a request here, never a
local edit there.

## Licensing

The code is **MIT**, copyright 2026 Steven Spungin. `docs/syntax.md`, which ships inside this package,
is the specification text and is **CC BY 4.0**: two licences for two kinds of thing, stated here because
a manifest can only name one.
