# 0.2.1

Documentation and code style only. **No behaviour change**: every pattern means exactly what it meant
in 0.2.0.

- docs: the README rewritten to describe the package, its install and its API, and to stop carrying
  statements that go out of date
- docs: two links in the README pointed at files that are not in the published package; both now point
  at the repository
- docs: **the specification is rewritten as one document.** Its rules had accumulated as a base text
  plus six dated amendments, four of which superseded parts of the base, so the current behaviour was
  only correct if you read all 1,600 lines in order. Every rule now lives in the section it belongs to,
  the section numbers are unchanged, and the document is a third shorter
- style: no trailing semicolons, single quotes, across the source and the tests

# 0.2.0

**Breaking: an option section cannot open an alternative.**

- breaking: `apple|\-\pear` is now **refused**. An option prefix is read once, from the start of the
  whole pattern, before it is split on `|`, so a `\-\` written inside a later alternative was never an
  option; it was read as the characters it is made of. The refusal names the option and where it
  belongs. This also covers a `||…||` branch, and a second prefix written after a real one
- breaking: this holds for every option character. `apple|\c\pear` and `a|\b\c` were already refused;
  `-` was the one spelling that still parsed, so the rule was previously different depending on which
  option you wrote
- **to migrate:** put the option at the very start, before the first `|`. For a literal dash, write it
  plainly: `a|--` needs no escape and always worked

# 0.1.1

Documentation corrections. No code change.

# 0.1.0

First release. A small pattern language for filtering lists of objects by their labels: a plain word is
a case-insensitive *contains*, and wildcards, anchors, character sets and alternation are there for when
that is not enough.

- feat: **character sets are `[…]`**: `[0-9]`, `[a-z]`, `[A-Za-z]`, `[0-9A-F]`. A set is always
  case-sensitive, in both modes, because it is the one construct that can say *either case* explicitly.
  A literal still folds, and `\c\` governs literals
- feat: **a backtick is an anchor and nothing else**: the first character, the last character, or an
  error. `` `apple `` starts with, `` apple` `` ends with, `` `apple` `` is exact
- feat: **`||…||` groups alternatives**: `*.||md|txt||` writes the shared part once. A group does not
  nest, and an anchor reaches every branch: `` `||a|b||` `` is exactly `a` or exactly `b`
- feat: **`\-\` excludes** and **`\b\` matches whole words.** A word boundary is the edge of the label
  or a neighbouring character that is not a letter or a number, so `_` separates words, which a regular
  expression's own `\b` gets wrong for filenames
- feat: **`label-filter/sticky`** for a live filter box. `createStickyFilter()` keeps the last pattern
  that could be read and reports `stale`, so a half-typed `[0-9]` does not flash every row and narrow
  again. `canAct()` answers the other half of the contract: an error means *show the reason* and it
  equally means *do not act*
- feat: an unreadable pattern **matches everything** and carries the reason on `match.error`, rather
  than returning an empty list. A filter that hid rows for a reason nobody could see would be worse
  than one that hid nothing
- feat: **`` `a|b` `` is refused.** An anchor binds to the alternative it is written in, so that
  spelling meant *starts with `a`* OR *ends with `b`* while reading like *exactly `a` or `b`*. Write
  `` `||a|b||` `` for the reading it looks like
- fix: **`\\` matched every label** instead of matching labels containing a backslash
- fix: **an unknown option is refused rather than ignored.** `\d\foo` silently meant `foo`
- fix: **matching was exponential in the number of wildcards.** `*a*a*a*a*a*z` against an 80-character
  label took 25 seconds for a single label, on a filter that runs per keystroke over a whole list. The
  same case is now under a millisecond
- build: TypeScript source, ESM only, no runtime dependencies. `dist/index.js` and `dist/index.d.ts`
  are generated, and the source ships so you can read what the matcher does
