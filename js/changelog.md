# 0.1.0

First release-shaped version. Extracted from Squid Desktop, where the language, its specification and
its conformance check had lived as three files; Squid Desktop is now the first **consumer**, not the
owner. Not yet published: see `docs/releasing.md`.

- breaking: **a character set is `[…]`, not `` `…` ``.** The backtick delimited sets *and* anchored the
  pattern, and that one overload caused every confusion this language has had. It is now an anchor
  only: first character, last character, or a mistake. This deleted §7 of the specification entirely,
  the backtick-pairing ruling, and the rule that a set could not open a pattern, and restored §15,
  whose original `[123]bar` reading had to be refused under the old spelling
- breaking: **a set is always case-sensitive**, in both modes. Folding it made `[A-Z]`, `[a-z]` and
  `[A-Za-z]` three spellings of one thing, and left no way to ask for one case without hardening every
  literal with `\c\`. A literal still folds, and `\c\` now governs literals only
- breaking: **`` `a|b` `` is refused.** An anchor binds to the alternative it is written in, so that
  spelling meant *starts with a* OR *ends with b* while reading like *exactly a or b*
- feat: **`||…||` groups alternatives** (`*.||md|txt||`) so a shared part is written once instead of
  once per alternative. A group does not nest, and three or more `|` in a row is refused rather than
  guessed at, which is what keeps `||` decidable
- feat: **`\-\` negates** the whole pattern, and **`\b\` matches whole words**, where a boundary is the
  edge of the label or a neighbouring character that is not a letter or a number, so `_` separates
  words, which regex's own `\b` gets wrong for filenames
- fix: **a pattern of `\\` matched every label.** It was read as an option prefix with an *empty*
  option section, which stripped itself and left the empty pattern; a lone `\` was correct throughout,
  so the two spellings of one thing disagreed and the wrong one was the confident match-all. An option
  section now needs at least one option character
- fix: **an unknown option is refused rather than ignored.** `\d\foo` silently meant `foo`; it now
  names the options that exist. This is what made `\-\` and `\b\` safe to add without changing the
  meaning of any pattern that already worked
- fix: **matching was exponential in the number of wildcards.** `*a*a*a*a*a*z` against an
  80-character label took 25 seconds, for ONE label, on a filter that runs per keystroke over a whole
  list. Failed `(token, position)` pairs are now recorded per label, making the worst case
  O(tokens × label); the same case measures under a millisecond
- test: **three suites instead of one.** `conformance` is still the specification's own examples;
  `properties` walks every pattern up to a given length over the reserved alphabet and checks
  thousands of generated ones against an independently written oracle; `performance` holds per-label
  ceilings, because a filter that is correct and slow is still broken. 43 million assertions pass
  across four seeds
- docs: the specification carries its design goals, four amendments and one declined proposal, so a
  future change argues against the goals rather than against taste
- feat: **`label-filter/sticky`, the filter box does not flicker.** `createStickyFilter()` keeps the
  last pattern that could be read and reports `stale`, so a half-typed `[0-9]` does not flash every row
  and narrow again, four of that pattern's five prefixes are unreadable. It also answers the other
  half of the contract, which is easy to miss: `error` means *show the reason*, and it equally means
  *do not act*, `canAct()` is that check made once rather than remembered five times. A separate
  entry point on purpose: this is host policy, not the language, and the four ports do not have it
- fix: the sandbox's dev server no longer dies on a malformed request path. `new URL('//', base)`
  throws, and one stray probe ended the whole server with an unhandled `ERR_INVALID_URL`; found by a
  smoke test that asked for `//` by accident
- build: **the package moved to `js/`** and the conformance cases moved out to
  `conformance/cases.json`, when Rust, Python, Go and PHP implementations joined it. This suite now
  *reads* that fixture rather than holding it, so the five implementations cannot drift apart
  quietly, `conformance/run-all.sh` runs all of them and prints one summary
- docs: a sandbox (`npm run sandbox`) that imports the built `dist/index.js`, the package itself,
  not a copy, with presets for every construct, including the ones that are refused
- build: **the source is TypeScript**, emitted by `tsc` to `dist/` with declarations, `strict` on. The
  tests, the sample and the sandbox server are TypeScript too and run with no build step and no test
  framework, because Node strips the types; `npm run typecheck` checks them, which is a separate thing
  from running them. No runtime dependencies
