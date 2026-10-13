//! Runs the Rust implementation against `conformance/cases.json` — the same fixture the TypeScript,
//! Python and Go implementations run.
//!
//! **The JSON reader below is deliberate.** Pulling in serde for a test would make this crate's
//! dependency graph non-empty for the sake of reading one file, and the fixture is the only thing
//! these four implementations are allowed to share.
//!
//!   cargo test

use std::collections::HashMap;

use label_filter::compile;

#[derive(Debug, Clone)]
enum Json {
    Str(String),
    Arr(Vec<Json>),
    Obj(HashMap<String, Json>),
    Other,
}

impl Json {
    fn s(&self) -> &str {
        match self {
            Json::Str(s) => s,
            _ => panic!("expected a string"),
        }
    }
    fn a(&self) -> &[Json] {
        match self {
            Json::Arr(v) => v,
            _ => panic!("expected an array"),
        }
    }
    fn get(&self, k: &str) -> &Json {
        match self {
            Json::Obj(m) => m.get(k).unwrap_or_else(|| panic!("missing key {k}")),
            _ => panic!("expected an object"),
        }
    }
}

struct Reader {
    c: Vec<char>,
    i: usize,
}

impl Reader {
    fn ws(&mut self) {
        while self.i < self.c.len() && self.c[self.i].is_whitespace() {
            self.i += 1;
        }
    }
    fn value(&mut self) -> Json {
        self.ws();
        match self.c[self.i] {
            '"' => Json::Str(self.string()),
            '[' => {
                self.i += 1;
                let mut out = Vec::new();
                loop {
                    self.ws();
                    if self.c[self.i] == ']' {
                        self.i += 1;
                        return Json::Arr(out);
                    }
                    out.push(self.value());
                    self.ws();
                    if self.c[self.i] == ',' {
                        self.i += 1;
                    }
                }
            }
            '{' => {
                self.i += 1;
                let mut out = HashMap::new();
                loop {
                    self.ws();
                    if self.c[self.i] == '}' {
                        self.i += 1;
                        return Json::Obj(out);
                    }
                    let k = self.string();
                    self.ws();
                    self.i += 1; // ':'
                    out.insert(k, self.value());
                    self.ws();
                    if self.c[self.i] == ',' {
                        self.i += 1;
                    }
                }
            }
            _ => {
                while self.i < self.c.len() && !",]}".contains(self.c[self.i]) {
                    self.i += 1;
                }
                Json::Other
            }
        }
    }
    fn string(&mut self) -> String {
        self.ws();
        assert_eq!(self.c[self.i], '"');
        self.i += 1;
        let mut out = String::new();
        while self.c[self.i] != '"' {
            if self.c[self.i] == '\\' {
                self.i += 1;
                let e = self.c[self.i];
                self.i += 1;
                out.push(match e {
                    'n' => '\n',
                    't' => '\t',
                    'r' => '\r',
                    'b' => '\u{8}',
                    'f' => '\u{c}',
                    'u' => {
                        let hex: String = self.c[self.i..self.i + 4].iter().collect();
                        self.i += 4;
                        char::from_u32(u32::from_str_radix(&hex, 16).expect("hex")).expect("char")
                    }
                    other => other,
                });
                continue;
            }
            out.push(self.c[self.i]);
            self.i += 1;
        }
        self.i += 1;
        out
    }
}

#[test]
fn conformance() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/cases.json");
    let text = std::fs::read_to_string(path).expect("conformance/cases.json is readable");
    let fixture = Reader { c: text.chars().collect(), i: 0 }.value();

    let mut failures: Vec<String> = Vec::new();
    let mut checks = 0usize;

    let cases = fixture.get("cases").a();
    for case in cases {
        let section = case.get("section").s();
        let pattern = case.get("pattern").s();
        let m = compile(pattern);
        if let Some(e) = m.error() {
            failures.push(format!("{section}: {pattern:?} was refused — {e}"));
            continue;
        }
        for label in case.get("match").a() {
            checks += 1;
            if !m.matches(label.s()) {
                failures.push(format!("{section}: {pattern:?} should match {:?}", label.s()));
            }
        }
        for label in case.get("noMatch").a() {
            checks += 1;
            if m.matches(label.s()) {
                failures.push(format!("{section}: {pattern:?} should NOT match {:?}", label.s()));
            }
        }
    }

    for err in fixture.get("errors").a() {
        let why = err.get("why").s();
        let pattern = err.get("pattern").s();
        let m = compile(pattern);
        checks += 1;
        if m.error().is_none() {
            failures.push(format!("{why}: {pattern:?} should be REFUSED, not parsed"));
        }
        // A refused pattern must hide nothing — the caller shows the reason instead.
        checks += 1;
        if !m.matches("anything at all") {
            failures.push(format!("{why}: a refused pattern must not filter rows out"));
        }
    }

    // A pattern must never panic, whatever is typed — this runs on every keystroke.
    for junk in fixture.get("junk").a() {
        checks += 1;
        let _ = compile(junk.s()).matches("anything");
    }

    if !failures.is_empty() {
        for f in &failures {
            eprintln!("  {f}");
        }
        panic!("label-filter conformance FAILED: {} of {}", failures.len(), checks);
    }
    println!("ok: {} spec cases, {} assertions, no pattern panics", cases.len(), checks);
}
