// The module path IS the repository path, which is what makes `go get` work at all — and the `/go`
// suffix is because the package sits in a subdirectory of a monorepo, as Go requires.
//
// Decided 2026-09-23: everything goes to github.com/code-evolve/label-filter. It was a bare
// `label-filter` before that, which was the honest spelling of "no repository has been chosen".
//
// **On the proxy as `v0.3.0` since 2026-10-13**, tagged `go/v0.3.0` -- a module in a subdirectory is
// versioned by a tag carrying that subdirectory as a prefix, so no other tag releases this one. The
// repository's four earlier tags were in a scheme Go cannot read, and for the hours between the push
// and the tag the proxy served this module at a PSEUDO-VERSION built from the commit hash: available,
// with no version string anyone would write down. That is the state this line now distinguishes.
//
// The tag is PERMANENT. The proxy caches a version on first fetch and will serve that tree forever;
// it cannot be moved or withdrawn, only superseded. `scripts/publish-github.sh` pushes version tags
// without --force for exactly this reason.
//
// The line below is read by site/build.mjs and is the ONLY thing that says whether this is published.
// It replaced an inference from this module path — "the path names a domain, so it must be on the
// proxy" — which was true of a bare path and became false the moment the path named the repository,
// and put "Published: yes" on the live documentation page for a module nobody had pushed.
// published: true
module github.com/code-evolve/label-filter/go

go 1.12
