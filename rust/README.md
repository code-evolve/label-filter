# label-filter

A small pattern language for filtering lists of objects **by their labels**. Parsed to an
intermediate representation and matched directly, never compiled to a regular expression, so a
half-typed pattern cannot panic and cannot backtrack.

Rust 1.70 or later. No dependencies, and none for the tests either.

```toml
[dependencies]
label-filter = "0.3"
```

```rust
use label_filter::compile;

let filter = compile("\\b\\app&*.pdf");

if let Some(reason) = filter.error() {
    // Show the reason beside the input. A refused pattern filters nothing out,
    // so the list the user is looking at stays exactly as it was.
    eprintln!("{reason}");
}

let kept: Vec<&str> = labels.iter().copied().filter(|l| filter.matches(l)).collect();
```

Two things that are deliberate, because they are what a filter box needs:

- **A pattern never panics.** Every input compiles; an unusable one reports `error()` and matches
  everything, which keeps the list visible while someone is still typing.
- **`compile()` once, `matches()` per row.** The pattern is parsed a single time.

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
backtick, `\`, `[` and `]`. The full specification is
[`docs/syntax.md`](https://github.com/code-evolve/label-filter/blob/master/docs/syntax.md).

## One language, five implementations, one fixture

This is the Rust port. The same language is implemented in TypeScript, Python, Go and PHP, and all
five run against the same file of cases, so they cannot disagree quietly.

```shell
cargo test     # 96 spec cases, 568 assertions
```

The fixture is `conformance/cases.json`, which ships with this crate: cases lifted from numbered
sections of the specification, patterns that must be **refused**, and fragments of junk that must not
panic.

## Where this crate is developed

The source of record is the `rust/` directory of
[code-evolve/label-filter](https://github.com/code-evolve/label-filter), which holds all five
implementations, the specification they share and the fixture they are all tested against. Issues and
pull requests belong there.

## Licence

MIT. See `LICENSE.txt`.
