// The module path IS the repository path, which is what makes `go get` work at all — and the `/go`
// suffix is because the package sits in a subdirectory of a monorepo, as Go requires.
//
// Decided 2026-09-23: everything goes to github.com/code-evolve/label-filter. It was a bare
// `label-filter` before that, which was the honest spelling of "no repository has been chosen".
//
// **Nothing is on the Go module proxy yet**: that happens when the repository is pushed and tagged,
// and npm publishes first (docs/releasing.md).
//
// The line below is read by site/build.mjs and is the ONLY thing that says whether this is published.
// It replaced an inference from this module path — "the path names a domain, so it must be on the
// proxy" — which was true of a bare path and became false the moment the path named the repository,
// and put "Published: yes" on the live documentation page for a module nobody had pushed.
// published: false
module github.com/code-evolve/label-filter/go

go 1.12
