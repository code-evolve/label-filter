# label-filter

A small pattern language for filtering lists of objects **by their labels**, in five languages, held
to one specification by one test fixture.

A plain word is a case-insensitive *contains*, which is the whole point of the default: the common
search costs no syntax. Wildcards, anchors, character sets, alternation, grouping, whole-word matching
and exclusion are there for when it is not enough.

```
apple                 contains, case-insensitive: the default
apple*pie             * is any run of characters
`apple  apple`        anchored to the start / to the end
[0-9].pdf             one character from a set: [a-z], [A-Za-z], [0-9A-F]
*.||md|txt||          a group, so a shared part is written once
\b\app                whole word: app, app-1, my app, app_data: not apple
\-\test               not: hide every label the pattern finds
```

The full specification is [`docs/syntax.md`](docs/syntax.md); its §1.1 records the four goals every
change is argued against.

## One language, five implementations

| | Package | Runs the fixture with |
|---|---|---|
| **TypeScript** | [`js/`](js), npm, ESM, no runtime dependencies | `node js/test/conformance.ts` |
| **Rust** | [`rust/`](rust), no dependencies, none for tests either | `cd rust && cargo test` |
| **Python** | [`python/`](python), ≥3.9, standard library only | `python3 python/tests/test_conformance.py` |
| **Go** | [`go/`](go), standard library only | `cd go && go test ./...` |
| **PHP** | [`php/`](php), ≥7.4, standard library only | `php php/tests/conformance.php` |

```shell
conformance/run-all.sh     # every implementation, same fixture, one summary
```

**The point is not five ports. It is that they cannot disagree quietly.**
[`conformance/cases.json`](conformance/cases.json) holds 53 cases lifted from numbered sections of the
specification, 21 patterns that must be *refused*, and 29 fragments of junk that must not crash
anything, 292 assertions. Every implementation runs that same file, and each prints the same line:

```
  TypeScript  ok: 53 spec cases, 292 assertions, no pattern throws
  Rust        ok: 53 spec cases, 292 assertions, no pattern panics
  Python      ok: 53 spec cases, 292 assertions, no pattern raises
  Go          ok: 53 spec cases, 292 assertions, no pattern panics
  PHP         ok: 53 spec cases, 292 assertions, no pattern throws
```

The fixture is the authority. A port is a translation of `js/src/index.ts`, function for function, so
the six files read side by side, and a port that drifts fails here rather than in somebody's list.

## Two promises that survive every port

**It is parsed into a small IR, never compiled to a regex.** That keeps the public language small and
deterministic, and stops a regex engine's behaviour leaking into what a pattern means. In the PHP and
Python ports (where a regex is right there in the standard library) it is the most load-bearing line
in the file.

**An unreadable pattern hides nothing.** It matches *everything* and carries the reason, rather than
returning a confident empty list from the one control whose job is deciding what you are shown. This
holds under `\-\` too: negation never inverts a refusal.

## Beyond conformance

The TypeScript implementation carries two suites the ports do not, because they test the language
rather than an implementation of it:

* **`js/test/properties.ts`**, every pattern up to a given length over the reserved alphabet, plus
  generated patterns checked against an **independently written** oracle (a regular expression, which
  is precisely what the implementation refuses to be). 43 M assertions across four seeds.
* **`js/test/performance.ts`**, per-label ceilings, because a filter that is correct and slow is
  still broken. Before the matcher memoised failed positions, `*a*a*a*a*a*z` against an 80-character
  label took **25 seconds for one label**.

Both live with the reference implementation on purpose. A port that passes the fixture is conformant;
the fixture is what the ports owe, and the properties are what the language owes itself.

## Try it

```shell
cd js && npm run sandbox      # then open the URL it prints
```

The sandbox serves the built package and has presets for every construct, including the ones that are
refused. **It does not flicker**: while a pattern is half-typed the list holds its previous answer and
captions it, rather than flashing every row and narrowing again, `[0-9]` is unreadable at four of its
five prefixes, and the language answers each of those with *match everything*, which is right for a
filter and wrong for a list that repaints per keystroke.

That policy ships as [`label-filter/sticky`](js/src/sticky.ts) (`createStickyFilter()`) and it is
**deliberately not in the ports**: `conformance/cases.json` defines what a pattern *means*, in five
languages; this decides what a text box *does* between two meanings, and the ports have no text box.

## The site pages are generated

`/products/label-filter` and `/resources/label-filter` on code-evolve.com are built from this
repository, because they are used to watch progress and a stale progress view is worse than none:

```shell
site/build.mjs        # render from the manifests, the fixture and a live test run
site/publish.sh       # build, check, upload with a backup, then verify the served page
```

The implementation table, every version in it, the conformance counts, which suites passed and on what
date, and the publish state of each package are all derived. Editing the server directly is reverted
by the next build.

## Status

**Not published anywhere yet, on purpose**, see [`docs/releasing.md`](docs/releasing.md), which
carries the checklist and the reason there is no placeholder holding the npm name.

**Java is the next port.** The rule for when one is worth adding: a port lands when a consumer needs
it, not when a language is popular, five implementations already mean one language change is five
edits.
