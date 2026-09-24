# Releasing

**`label-filter@0.1.0` went to npm on 2026-09-24.** The other four are not published, and this document
is what the next release follows.

**Five packages, one of them published.** Everything below is ready for the other four; each still
holds its own registry's brake, and the brake comes off one package at a time.

| Implementation | Would publish to | State |
|---|---|---|
| `js/` | npm, `label-filter` | **published 2026-09-24, `0.1.0`** |
| `rust/` | crates.io, `label-filter` | manifest complete, `publish = false` |
| `python/` | PyPI, `label-filter` | manifest complete, never built |
| `go/` | pkg.go.dev, by module path | `github.com/code-evolve/label-filter/go`; nothing on the proxy until the repository is pushed and tagged |
| `php/` | Packagist, `code-evolve/label-filter` | manifest complete, never submitted |

**Each carries the same brake for the same reason** (below): the first publish is what fixes the
identity fields, and five registries means five chances to fix them by accident. Publish `js/` first,
it is the reference implementation and the one with the consumer, and let the others follow the
names it settles.

The rest of this document is about the npm package, which is furthest along.

## Shape, and where it came from

The product scaffolding follows two reference packages in `ct/ct-shared/src/lib`, **`code-extend`**
and **`action-manager`**: settled 2026-09-22. What was copied:

| From the references | Here |
|---|---|
| `license: MIT`, `author: TwelveTone LLC` | **not copied.** Ruled 2026-09-24: MIT, **Steven Spungin** |
| no `repository` field | `github.com/code-evolve/label-filter`, ruled 2026-09-23 |
| `LICENSE.txt` + `license-checker-config.json` + `license-ignore` | same, with `src` and `test` stamped and `**/*.md` excluded |
| licence header block in every source and test file | same, `build:lic` regenerates it |
| `exports` map with `types` / `import` / `default`, plus `./package.json` | same |
| `files` allow-list, `keywords` including `code-evolve` | same, plus `docs/syntax.md`, the specification ships with the parser |
| `changelog.md`, `samples/`, `dry`, `prepack` | same |

**Four deliberate differences.** The source is TypeScript as of 2026-09-23, so the shape now matches
the references closely; what remains differs on purpose:

1. **`tsc`, not `vite` + `vite-plugin-dts`.** The library is one module with no dependencies, so there
   is nothing to bundle and nothing to externalise, the references need a bundler because they have
   both. `tsc -p tsconfig.build.json` emits `dist/index.js` and `dist/index.d.ts`, and `build` then
   runs `build:lic` to stamp them, in the same order the references use.
2. **No CJS entry.** The references ship `dist/index.umd.cjs` for `require()`. This package is
   ESM-only, which its consumers are.
3. **No sourcemaps.** The references ship them because a bundled build mangles every identifier; `tsc`
   output keeps names and structure, so a consumer's stack trace already points at readable code.
4. **npm, not yarn.** The references are pinned to yarn 4 inside the `ct` monorepo; this package
   stands alone with three devDependencies, so `package-lock.json` is committed instead and
   `packageManager` is omitted rather than claiming a manager nothing here enforces.

And one addition: **`changelog.md` is in `files`.** Neither reference lists it, and `npm pack
--dry-run` confirms npm does not add it on its own, so theirs do not ship one. A language package
should: a consumer reading a refused pattern wants to know which release refused it.

**`strict` is on**, where both references leave TypeScript's default off. It found four real gaps
during the conversion, two unchecked `codePointAt` results, an optional that was never optional, and
one cast that needed stating, and the runtime assertion guarding that cast is still in the property
suite, because a cast is exactly what a type system stops watching.

`build:lic` **has been run**, as part of `build`: it stamps `dist/` on every build and reported the
existing `src` and `test` headers as already correct, which confirms the ones written by hand before
the tool was installed.

## Before publishing

0. **`conformance/run-all.sh`**, every implementation against the shared fixture. A port that
   disagrees is a release blocker for all five, not for one: they are the same language.
1. **`npm test`**: three suites, and `npm run test:properties:deep` for the long sweep (~15s).
   Then **`npm run typecheck`**, which is not part of `test` and is the only thing that checks the
   types the tests run with.
2. **`npm run dry`**, runs the suites and `npm pack --dry-run`. Check the file list: `src`, `test`,
   `samples`, `docs/syntax.md`, plus the README, changelog and licence npm adds itself.
3. **Check the tag.** Groove Desktop groups these products by the `code-evolve/published` tag, and
   this phase carries **`code-evolve/staged`** instead, because it is not published. Tags are flat
   strings, so the two do not group together, switching it at publish time is one command, recorded
   in the report of 2026-09-23.
4. **Republish the two pages** with `site/publish.sh`, so they carry the licence line and a current
   verification date in one edit. Both are live already; the product page and the documentation page
   are the brand surface and state the licence and the holder as of 2026-09-24.
5. ~~Decide the `repository` field.~~ **Done 2026-09-23**: `github.com/code-evolve/label-filter`, one
   repository for all five implementations. The holder and licence followed on 2026-09-24: MIT,
   copyright Steven Spungin.
6. ~~Remove `"private": true`.~~ **Done for 0.1.0**, in its own commit so the brake coming off is
   visible in the history. A later version does not need it again; a NEW package does.

## The name, and why there is no placeholder holding it

`label-filter` was free on npm as of 2026-09-22 (verified: a `404` from the registry). Anyone can take
it before the first release, and the obvious protection (publishing a stub) is the wrong move:

**The first publish is what fixes `author`, `license` and `repository`.** A stub decides them by
default, at the moment nobody is looking, which is the mechanism that already produced several
unchosen identities across this estate. **Losing the name is recoverable** (`labelfilter` is free, and
a scope always is). **A manifest published with defaults is not**, because nobody notices it and
everybody inherits it.

All three are now decided, and none of them by a sibling package: **Steven Spungin** holds the
copyright, the licence is **MIT**, and the repository is `github.com/code-evolve/label-filter`. Ruled
2026-09-24 and 2026-09-23 respectively, after Code-Evolve Governance made inferring any of them from a
sibling a violation.

So: if anyone, person or phase, says *"the name is decided, go secure it"*, **come back and ask**
rather than publishing. Securing the name and deciding the identity are the same act.
