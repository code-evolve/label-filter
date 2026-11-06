# label-filter

A small pattern language for filtering lists of objects **by their labels**. Parsed to an
intermediate representation and matched directly, never compiled to a regular expression, so a
half-typed pattern cannot raise and cannot backtrack.

Python 3.9 or later. No dependencies, and none for the tests either.

```shell
pip install label-filter
```

```python
from label_filter import compile_label_filter

matches = compile_label_filter(r"\b\app&*.pdf")

if matches.error:
    # Show the reason beside the input. A refused pattern filters nothing out,
    # so the list the user is looking at stays exactly as it was.
    print(matches.error)

kept = [label for label in labels if matches(label)]
```

The compiled matcher is **callable**, so it drops straight into `filter()` or a comprehension.

Two things that are deliberate, because they are what a filter box needs:

- **A pattern never raises.** Every input compiles; an unusable one sets `error` and matches
  everything, which keeps the list visible while someone is still typing.
- **Compile once, call per row.** The pattern is parsed a single time.

## The language, in eight lines

```
apple                 contains, case-insensitive: the default
apple*pie             * is any run of characters
`apple  apple`        anchored to the start / to the end
[0-9].pdf             one character from a set: [a-z], [A-Za-z], [0-9A-F]
*.||md|txt||          a group, so a shared part is written once
\b\app                whole word: app, app-1, my app, app_data: not apple
\-\test               not: hide every label the pattern finds
a&b                   and: every item must match
```

Seven characters are reserved and are written with a backslash to mean themselves: `*`, `|`, `&`, a
backtick, `\`, `[` and `]`. **Use a raw string** for any pattern holding one, as above. The full
specification is
[`docs/syntax.md`](https://github.com/code-evolve/label-filter/blob/master/docs/syntax.md).

A trailing `&` or `|` is ignored, so `apple&` and `apple|` mean `apple` while the next item is being
typed. An escaped `\&` or `\|` at the end is a literal and is kept.

## One language, five implementations, one fixture

This is the Python port. The same language is implemented in TypeScript, Rust, Go and PHP, and all
five run against the same file of cases, so they cannot disagree quietly.

```shell
python3 tests/test_conformance.py     # 96 spec cases, 568 assertions
```

The fixture is `conformance/cases.json`: cases lifted from numbered sections of the specification,
patterns that must be **refused**, and fragments of junk that must not raise.

## Where this package is developed

The source of record is the `python/` directory of
[code-evolve/label-filter](https://github.com/code-evolve/label-filter), which holds all five
implementations, the specification they share and the fixture they are all tested against. Issues and
pull requests belong there.

## Licence

MIT. See `LICENSE.txt`.
