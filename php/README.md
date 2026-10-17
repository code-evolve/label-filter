# label-filter (PHP)

A small pattern language for filtering lists of objects **by their labels**. Parsed to an
intermediate representation and matched directly, never compiled to a regular expression, so a
half-typed pattern cannot throw and cannot backtrack.

PHP 7.4 or later. No dependencies, and none for the tests either.

```shell
composer require code-evolve/label-filter
```

```php
use CodeEvolve\LabelFilter\LabelFilter;

$filter = LabelFilter::compile('\b\app&*.pdf');

if ($filter->error !== null) {
    // Show the reason beside the input. A refused pattern filters nothing out,
    // so the list the user is looking at stays exactly as it was.
    echo $filter->error;
}

$kept = array_filter($labels, fn ($label) => $filter->matches($label));
```

Two things that are deliberate, because they are what a filter box needs:

- **A pattern never throws.** Every input compiles; an unusable one sets `error` and matches
  everything, which keeps the list visible while someone is still typing.
- **`compile()` once, `matches()` per row.** The pattern is parsed a single time.

## The language, in seven lines

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

The specification is `docs/syntax.md`, which ships with this package and is also readable at
[code-evolve/label-filter](https://github.com/code-evolve/label-filter/blob/master/docs/syntax.md).
Seven characters are reserved and are written with a backslash to mean themselves:
`*`, `|`, `&`, a backtick, `\`, `[` and `]`.

## One language, five implementations, one fixture

This is the PHP port. The same language is implemented in TypeScript, Rust, Python and Go, and all
five run against the same file of cases, so they cannot disagree quietly.

```shell
php tests/conformance.php     # from this package: 96 spec cases, 568 assertions
```

The fixture is `conformance/cases.json`: cases lifted from numbered sections of the specification,
patterns that must be **refused**, and fragments of junk that must not crash anything.

## Where this package is developed

The source of record is the `php/` directory of
[code-evolve/label-filter](https://github.com/code-evolve/label-filter), which holds all five
implementations, the specification they share and the fixture they are all tested against. Issues
and pull requests belong there.

The repository Packagist reads is generated from that directory, file for file, and carries nothing
of its own.

## Licence

MIT. See `LICENSE.txt`.
