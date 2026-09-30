// Runs the Go implementation against conformance/cases.json — the same fixture the TypeScript, Rust
// and Python implementations run.
//
//	go test ./...
package labelfilter

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"testing"
)

type fixture struct {
	Cases []struct {
		Section string   `json:"section"`
		Pattern string   `json:"pattern"`
		Match   []string `json:"match"`
		NoMatch []string `json:"noMatch"`
	} `json:"cases"`
	Errors []struct {
		Why     string `json:"why"`
		Pattern string `json:"pattern"`
	} `json:"errors"`
	Junk []string `json:"junk"`
}

func TestConformance(t *testing.T) {
	raw, err := ioutil.ReadFile(filepath.Join("..", "conformance", "cases.json"))
	if err != nil {
		t.Fatalf("conformance/cases.json is readable: %v", err)
	}
	var f fixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("conformance/cases.json parses: %v", err)
	}

	checks := 0
	for _, c := range f.Cases {
		m := Compile(c.Pattern)
		if m.Error != "" {
			t.Errorf("%s: %q was refused — %s", c.Section, c.Pattern, m.Error)
			continue
		}
		for _, label := range c.Match {
			checks++
			if !m.Matches(label) {
				t.Errorf("%s: %q should match %q", c.Section, c.Pattern, label)
			}
		}
		for _, label := range c.NoMatch {
			checks++
			if m.Matches(label) {
				t.Errorf("%s: %q should NOT match %q", c.Section, c.Pattern, label)
			}
		}
	}

	for _, e := range f.Errors {
		m := Compile(e.Pattern)
		checks++
		if m.Error == "" {
			t.Errorf("%s: %q should be REFUSED, not parsed", e.Why, e.Pattern)
		}
		// A refused pattern must hide nothing — the caller shows the reason instead.
		checks++
		if !m.Matches("anything at all") {
			t.Errorf("%s: a refused pattern must not filter rows out", e.Why)
		}
	}

	// A pattern must never panic, whatever is typed — this runs on every keystroke.
	for _, junk := range f.Junk {
		checks++
		Compile(junk).Matches("anything")
	}

	t.Logf("ok: %d spec cases, %d assertions, no pattern panics", len(f.Cases), checks)
}
