/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

//! The label filter pattern language — `docs/syntax.md`.
//!
//! **Parsed into a small IR, never compiled to a regex.** The language stays small and
//! deterministic, and no regex engine's implementation details leak into it.
//!
//! Six reserved characters, and nothing else is special: `*` `|` `` ` `` `\` `[` `]`.
//!
//! This port mirrors the TypeScript implementation function for function, deliberately: the two are
//! meant to be readable side by side, and both are held to `conformance/cases.json`.

use std::collections::HashSet;

/// Groups multiply, so an alternative is capped rather than allowed to explode on a keystroke.
const MAX_SEQUENCES: usize = 64;

/// Every instruction `\…\` accepts: `c` case-sensitive, `-` not, `b` word boundary.
///
/// `\…\` is the instruction namespace: a section of letters, digits and `-` is read as one and
/// refused when it names nothing, which is what makes a future instruction addable without changing
/// any pattern that works. It claims no punctuation — `\.foo\.bar` is a literal and stays one.
const INSTRUCTIONS: &str = "c-b";

/// The only escapes a set body accepts: a backslash, a closing bracket, and a dash.
///
/// **Everything else inside a set is already a literal, so an escape there can only be a reader
/// expecting a regular expression** — and `[\n]` quietly meaning the letter `n` is the silent misread
/// this language refuses elsewhere. Ruled 2026-09-23.
const ESCAPE_ERROR: &str = "a letter or digit cannot be escaped — \\d, \\n and \\b mean a class in a regular expression and nothing here; drop the backslash, or use \\c\\ \\-\\ \\b\\ at the start for an option";

/// A backslash may escape anything except an ASCII letter or digit — see the TypeScript
/// implementation's note for the argument.
fn escapable(ch: char) -> bool {
    !ch.is_ascii_alphanumeric()
}

fn set_escape_error(body: &[char]) -> Option<String> {
    let mut i = 0;
    while i < body.len() {
        if body[i] == '\\' {
            match body.get(i + 1) {
                Some(next) if escapable(*next) => i += 2,
                _ => return Some(ESCAPE_ERROR.into()),
            }
            continue;
        }
        i += 1;
    }
    None
}

/// A set body — `123`, `0-9`, `A-Za-z` — as a membership test.
#[derive(Clone, Debug, Default)]
pub struct CharSet {
    singles: HashSet<char>,
    ranges: Vec<(u32, u32)>,
}

impl CharSet {
    /// **Ranges are expanded by code point, and a leading or trailing `-` is a literal `-`.** An
    /// escaped `-` is always a literal too: `[a\-z]` is three characters, not a range.
    fn parse(body: &[char]) -> CharSet {
        let mut atoms: Vec<(char, bool)> = Vec::new();
        let mut i = 0;
        while i < body.len() {
            if body[i] == '\\' && i + 1 < body.len() {
                atoms.push((body[i + 1], true));
                i += 2;
            } else {
                atoms.push((body[i], false));
                i += 1;
            }
        }
        let mut set = CharSet::default();
        let mut i = 0;
        while i < atoms.len() {
            let dash = atoms.get(i + 1);
            let upper = atoms.get(i + 2);
            match (dash, upper) {
                (Some(&('-', false)), Some(&(hi, _))) => {
                    set.ranges.push((atoms[i].0 as u32, hi as u32));
                    i += 3;
                }
                _ => {
                    set.singles.insert(atoms[i].0);
                    i += 1;
                }
            }
        }
        set
    }

    fn test(&self, ch: char) -> bool {
        if self.singles.contains(&ch) {
            return true;
        }
        let c = ch as u32;
        self.ranges.iter().any(|&(lo, hi)| c >= lo && c <= hi)
    }
}

#[derive(Clone, Debug)]
enum Token {
    Lit(Vec<char>),
    Any,
    Set(CharSet),
}

/// One alternative, with its anchors. Groups are desugared away before this exists.
#[derive(Clone, Debug)]
struct Alt {
    start: bool,
    end: bool,
    tokens: Vec<Token>,
}

/// A compiled matcher.
///
/// **When `error()` is `Some`, `matches()` answers `true` for every label**, so an unreadable
/// pattern hides nothing and the caller can show the reason. This holds under `\-\` as well:
/// negation never inverts a refusal.
#[derive(Clone, Debug)]
pub struct Matcher {
    error: Option<String>,
    case_sensitive: bool,
    negate: bool,
    boundary: bool,
    alts: Vec<Alt>,
}

/// Compile a pattern once into a matcher.
pub fn compile(pattern: &str) -> Matcher {
    Parser::new(pattern).parse()
}

impl Matcher {
    /// Why the pattern could not be read, if it could not be.
    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    pub fn matches(&self, label: &str) -> bool {
        // **An unparseable pattern hides nothing, and `\-\` does not get to invert that.**
        if self.error.is_some() {
            return true;
        }
        let raw: Vec<char> = label.chars().collect();
        let text: Vec<char> = if self.case_sensitive {
            raw.clone()
        } else {
            raw.iter().map(|&c| fold_char(c)).collect()
        };
        let ctx = MatchContext { raw: &raw, text: &text, boundary: self.boundary };
        let hit = self.alts.iter().any(|a| match_alternative(a, &ctx));
        if self.negate {
            !hit
        } else {
            hit
        }
    }
}

/// Lower-case one character, but **only when doing so keeps its length**.
///
/// Case folding is not length-preserving in general (`İ` lowercases to two characters), and the
/// matcher walks the folded text and the raw text at the SAME index — a literal reads the folded
/// one, a set and the boundary test read the raw one. One character that folded to two would slide
/// every index after it apart.
fn fold_char(ch: char) -> char {
    let mut it = ch.to_lowercase();
    match (it.next(), it.next()) {
        (Some(lower), None) => lower,
        _ => ch,
    }
}

struct MatchContext<'a> {
    raw: &'a [char],
    text: &'a [char],
    boundary: bool,
}

/// **Definition B** of a word boundary: the edge of the label, or a neighbouring character that is
/// not a letter or a number. Regex's own `\b` counts `_` as a word character, which is wrong for
/// labels — `app_data` has to match a whole-word `app`.
fn is_alnum(ch: char) -> bool {
    ch.is_alphanumeric()
}

fn starts_at_boundary(raw: &[char], at: usize) -> bool {
    at == 0 || !is_alnum(raw[at - 1])
}

fn ends_at_boundary(raw: &[char], at: usize) -> bool {
    at == raw.len() || !is_alnum(raw[at])
}

/// Whether `tokens` match starting at `at`, ending at the end if `must_end`.
///
/// **`failed` is not an optimisation, it is what keeps this from hanging the UI.** Backtracking over
/// `*` is exponential without it: `*a*a*a*a*a*z` against 80 `a`s took 25 seconds for ONE label in the
/// TypeScript implementation before this table was added, and this runs per label per keystroke.
fn match_at(
    tokens: &[Token],
    ti: usize,
    ctx: &MatchContext,
    at: usize,
    must_end: bool,
    failed: &mut [bool],
    width: usize,
) -> bool {
    if ti == tokens.len() {
        if must_end {
            return at == ctx.text.len();
        }
        return !ctx.boundary || ends_at_boundary(ctx.raw, at);
    }
    let key = ti * width + at;
    if failed[key] {
        return false;
    }
    let ok = match &tokens[ti] {
        Token::Lit(v) => {
            at + v.len() <= ctx.text.len()
                && ctx.text[at..at + v.len()] == v[..]
                && match_at(tokens, ti + 1, ctx, at + v.len(), must_end, failed, width)
        }
        // **A set is always case-sensitive, so it reads the raw label.**
        Token::Set(set) => {
            at < ctx.raw.len()
                && set.test(ctx.raw[at])
                && match_at(tokens, ti + 1, ctx, at + 1, must_end, failed, width)
        }
        // ANY — zero or more, shortest first.
        Token::Any => {
            let mut found = false;
            for j in at..=ctx.text.len() {
                if match_at(tokens, ti + 1, ctx, j, must_end, failed, width) {
                    found = true;
                    break;
                }
            }
            found
        }
    };
    if !ok {
        failed[key] = true;
    }
    ok
}

fn match_alternative(alt: &Alt, ctx: &MatchContext) -> bool {
    // One table per (alternative, label). The unanchored scan shares it deliberately: a `(ti, at)`
    // pair that failed from one start position fails from every other one too.
    let width = ctx.text.len() + 1;
    let mut failed = vec![false; alt.tokens.len() * width];
    if alt.start {
        return match_at(&alt.tokens, 0, ctx, 0, alt.end, &mut failed, width);
    }
    // Unanchored: `foo` is conceptually `*foo*`.
    for i in 0..=ctx.text.len() {
        if ctx.boundary && !starts_at_boundary(ctx.raw, i) {
            continue;
        }
        if match_at(&alt.tokens, 0, ctx, i, alt.end, &mut failed, width) {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

enum ParseToken {
    Plain(Token),
    Group(Vec<Vec<Token>>),
}

struct ParsedAlternative {
    start: bool,
    end: bool,
    seqs: Vec<Vec<Token>>,
    error: Option<String>,
}

struct Parser {
    chars: Vec<char>,
}

impl Parser {
    fn new(pattern: &str) -> Parser {
        Parser { chars: pattern.chars().collect() }
    }

    fn parse(self) -> Matcher {
        let mut rest: &[char] = &self.chars;
        let mut case_sensitive = false;
        let mut negate = false;
        let mut boundary = false;
        let mut option_error: Option<String> = None;

        // `\options\...` — only when a SECOND unescaped backslash exists, and only with at least one
        // option character. `\\` is an escaped backslash, NOT an empty option section: reading it as
        // one made `\\` match every label.
        if rest.first() == Some(&'\\') {
            if let Some(end) = rest[1..].iter().position(|&c| c == '\\').map(|i| i + 1) {
                let opts: Vec<char> = rest[1..end].to_vec();
                let is_section = !opts.is_empty()
                    && opts.iter().all(|c| c.is_ascii_alphanumeric() || *c == '-');
                if is_section {
                    let unknown: String =
                        opts.iter().filter(|c| !INSTRUCTIONS.contains(**c)).collect();
                    if !unknown.is_empty() {
                        option_error = Some(format!(
                            "unknown instruction {} — the instructions are c (case-sensitive), - (not) and b (word boundary); a literal backslash is \\\\",
                            unknown
                        ));
                    }
                    case_sensitive = opts.contains(&'c');
                    negate = opts.contains(&'-');
                    boundary = opts.contains(&'b');
                    rest = &rest[end + 1..];
                }
            }
        }

        let (alt_sources, unclosed) = split_alternatives(rest);
        let parsed: Vec<ParsedAlternative> =
            alt_sources.iter().map(|a| parse_alternative(a)).collect();

        // An option section that is NOT the prefix: `rest` already had the real one removed, so
        // anything still shaped like one sits in a later alternative or after a first prefix.
        let misplaced = alt_sources.iter().find_map(|a| leading_option_section(a));

        let mut error: Option<String>;
        if option_error.is_some() {
            error = option_error;
        } else if let Some(section) = misplaced {
            error = Some(format!(
                "\\{}\\ applies to the whole pattern, so it cannot open an alternative — move it to the very start, before the first |",
                section
            ));
        } else if has_bar_run(rest) {
            error = Some("three or more | in a row — | separates alternatives, || opens or closes a group, and a literal bar is \\|".into());
        } else if unclosed {
            error = Some("unclosed || group — a group is ||…||, it does not nest, and a literal bar is \\|".into());
        } else {
            error = parsed.iter().find_map(|a| a.error.clone());
        }

        // **The trap that groups exist to replace.** `` `a|b` `` reads to everyone as "exactly a or
        // b", and parses as "starts with a" OR "ends with b".
        if error.is_none() && parsed.len() > 1 {
            let first = &parsed[0];
            let last = &parsed[parsed.len() - 1];
            if first.start && !first.end && last.end && !last.start {
                error = Some("anchors bind to one alternative, not across | — `a|b` reads as \"starts with a\" OR \"ends with b\"; write `||a|b||` for exactly one of them".into());
            }
        }

        // **Negation with nothing to negate hides every row** — the confident empty, reached from
        // the other side, and the state `\-\…` passes through while it is being typed.
        if error.is_none()
            && negate
            && parsed
                .iter()
                .all(|a| !a.start && !a.end && a.seqs.iter().all(|s| s.is_empty()))
        {
            error = Some("negation with no pattern would hide every row — give \\-\\ something to exclude".into());
        }

        let mut alts = Vec::new();
        for a in &parsed {
            for seq in &a.seqs {
                alts.push(Alt { start: a.start, end: a.end, tokens: seq.clone() });
            }
        }

        // A literal folds; a set never does, so only the literals are lowered here.
        if !case_sensitive {
            for alt in alts.iter_mut() {
                for t in alt.tokens.iter_mut() {
                    if let Token::Lit(v) = t {
                        *v = v.iter().map(|&c| fold_char(c)).collect();
                    }
                }
            }
        }

        Matcher { error, case_sensitive, negate, boundary, alts }
    }
}

/// An option section at the start of an alternative, which is never what it looks like.
///
/// **Options are global: the prefix is read once, off the whole pattern, before it is split on
/// `|`.** So `apple|\-\pear` cannot mean *contains apple OR not pear*. Refused 2026-09-24, for the
/// same reason `` `a|b` `` is refused: it parses cleanly and answers a different question. See the
/// TypeScript implementation for why only `-` still reached this point.
fn leading_option_section(alt: &[char]) -> Option<String> {
    if alt.first() != Some(&'\\') {
        return None;
    }
    let end = alt[1..].iter().position(|&c| c == '\\').map(|i| i + 1)?;
    let section: Vec<char> = alt[1..end].to_vec();
    if section.is_empty() || !section.iter().all(|c| c.is_ascii_alphanumeric() || *c == '-') {
        return None;
    }
    Some(section.into_iter().collect())
}

/// Whether any run of unescaped `|` is three or more long. **This one rule is what makes `||`
/// decidable**, and it is also what makes an empty group and an empty branch unwritable.
fn has_bar_run(s: &[char]) -> bool {
    let mut run = 0;
    let mut i = 0;
    while i < s.len() {
        if s[i] == '\\' {
            i += 2;
            run = 0;
            continue;
        }
        if s[i] == '|' {
            run += 1;
            if run > 2 {
                return true;
            }
        } else {
            run = 0;
        }
        i += 1;
    }
    false
}

/// Split on `|` at the top level, leaving the `|` inside a group alone. `||` toggles, which is also
/// why a group cannot nest: the middle `||` of `||a||b||` closes rather than opens.
fn split_alternatives(s: &[char]) -> (Vec<Vec<char>>, bool) {
    let mut alts = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut in_group = false;
    let mut i = 0;
    while i < s.len() {
        let ch = s[i];
        if ch == '\\' && i + 1 < s.len() {
            cur.push(ch);
            cur.push(s[i + 1]);
            i += 2;
            continue;
        }
        if ch == '|' && s.get(i + 1) == Some(&'|') {
            in_group = !in_group;
            cur.push('|');
            cur.push('|');
            i += 2;
            continue;
        }
        if ch == '|' && !in_group {
            alts.push(std::mem::take(&mut cur));
            i += 1;
            continue;
        }
        cur.push(ch);
        i += 1;
    }
    alts.push(cur);
    (alts, in_group)
}

/// Whether the last character is an unescaped backtick — the end anchor.
fn ends_with_anchor(s: &[char]) -> bool {
    let mut i = 0;
    while i < s.len() {
        if s[i] == '\\' {
            i += 2;
            continue;
        }
        if s[i] == '`' && i == s.len() - 1 {
            return true;
        }
        i += 1;
    }
    false
}

/// One alternative: optional start anchor, tokens, optional end anchor.
///
/// **Both anchors are stripped here, and a backtick anywhere else is an error.** Since sets moved to
/// `[…]` there is nothing else a backtick can be, so this needs no pairing and no parity.
fn parse_alternative(src: &[char]) -> ParsedAlternative {
    let mut s = src;
    let mut start = false;
    let mut end = false;
    if s.first() == Some(&'`') {
        start = true;
        s = &s[1..];
    }
    if ends_with_anchor(s) {
        end = true;
        s = &s[..s.len() - 1];
    }
    match tokenise(s) {
        Err(error) => ParsedAlternative { start, end, seqs: vec![Vec::new()], error: Some(error) },
        Ok(tokens) => match expand(&tokens) {
            Err(error) => {
                ParsedAlternative { start, end, seqs: vec![Vec::new()], error: Some(error) }
            }
            Ok(seqs) => ParsedAlternative { start, end, seqs, error: None },
        },
    }
}

fn find_unescaped(s: &[char], from: usize, ch: char) -> Option<usize> {
    let mut i = from;
    while i < s.len() {
        if s[i] == '\\' {
            i += 2;
            continue;
        }
        if s[i] == ch {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn find_group_close(s: &[char], from: usize) -> Option<usize> {
    let mut i = from;
    while i < s.len() {
        if s[i] == '\\' {
            i += 2;
            continue;
        }
        if s[i] == '|' && s.get(i + 1) == Some(&'|') {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Split a group body on its single `|` — it can hold no `||`, since the first one closed it.
fn split_branches(s: &[char]) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut i = 0;
    while i < s.len() {
        if s[i] == '\\' && i + 1 < s.len() {
            cur.push(s[i]);
            cur.push(s[i + 1]);
            i += 2;
            continue;
        }
        if s[i] == '|' {
            out.push(std::mem::take(&mut cur));
            i += 1;
            continue;
        }
        cur.push(s[i]);
        i += 1;
    }
    out.push(cur);
    out
}

fn tokenise(s: &[char]) -> Result<Vec<ParseToken>, String> {
    let mut out: Vec<ParseToken> = Vec::new();
    let mut lit: Vec<char> = Vec::new();
    macro_rules! flush {
        () => {
            if !lit.is_empty() {
                out.push(ParseToken::Plain(Token::Lit(std::mem::take(&mut lit))));
            }
        };
    }
    let mut i = 0;
    while i < s.len() {
        let ch = s[i];
        if ch == '\\' && i + 1 < s.len() {
            if !escapable(s[i + 1]) {
                return Err(ESCAPE_ERROR.into());
            }
            lit.push(s[i + 1]);
            i += 2;
            continue;
        }
        if ch == '*' {
            flush!();
            out.push(ParseToken::Plain(Token::Any));
            i += 1;
            continue;
        }
        if ch == '|' && s.get(i + 1) == Some(&'|') {
            let close = match find_group_close(s, i + 2) {
                Some(c) => c,
                None => {
                    return Err(
                        "unclosed || group — a group is ||…||, and a literal bar is \\|".into()
                    )
                }
            };
            let body = &s[i + 2..close];
            let mut branches = Vec::new();
            for branch in split_branches(body) {
                if branch.is_empty() {
                    return Err("empty alternative inside a || group".into());
                }
                let sub = tokenise(&branch)?;
                // **A branch cannot hold a group**: the first unescaped `||` after the opener closes
                // this one, so the body was bounded before any nested opener could be read.
                let mut plain = Vec::new();
                for t in sub {
                    match t {
                        ParseToken::Plain(p) => plain.push(p),
                        ParseToken::Group(_) => {
                            return Err("a group cannot hold a group".into());
                        }
                    }
                }
                branches.push(plain);
            }
            flush!();
            out.push(ParseToken::Group(branches));
            i = close + 2;
            continue;
        }
        if ch == '[' {
            let close = match find_unescaped(s, i + 1, ']') {
                Some(c) => c,
                None => {
                    return Err("unclosed [ — a set is […], and a literal bracket is \\[".into())
                }
            };
            let body = &s[i + 1..close];
            // **An empty set can never match, so it is refused rather than served.**
            if body.is_empty() {
                return Err(
                    "empty set [] — a set needs characters, and a literal bracket is \\[".into()
                );
            }
            if let Some(e) = set_escape_error(body) {
                return Err(e);
            }
            flush!();
            out.push(ParseToken::Plain(Token::Set(CharSet::parse(body))));
            i = close + 1;
            continue;
        }
        if ch == ']' {
            return Err("unmatched ] — a set is […], and a literal bracket is \\]".into());
        }
        // Anchors were taken off both ends already, so anything left is in the middle.
        if ch == '`' {
            return Err("a backtick is an anchor and belongs at the very start or very end — a literal backtick is \\`".into());
        }
        lit.push(ch);
        i += 1;
    }
    flush!();
    Ok(out)
}

/// Desugar groups: one token list in, one list per combination out. Doing it at parse time keeps the
/// matcher untouched by the feature and makes the cost refusable before any label is seen.
fn expand(tokens: &[ParseToken]) -> Result<Vec<Vec<Token>>, String> {
    let mut seqs: Vec<Vec<Token>> = vec![Vec::new()];
    for t in tokens {
        match t {
            ParseToken::Plain(p) => {
                for seq in seqs.iter_mut() {
                    seq.push(p.clone());
                }
            }
            ParseToken::Group(branches) => {
                let mut next: Vec<Vec<Token>> = Vec::new();
                for seq in &seqs {
                    for branch in branches {
                        let mut copy = seq.clone();
                        copy.extend(branch.iter().cloned());
                        next.push(copy);
                    }
                }
                if next.len() > MAX_SEQUENCES {
                    return Err(format!(
                        "too many combinations — || groups multiply, and this is over {}; use separate filters",
                        MAX_SEQUENCES
                    ));
                }
                seqs = next;
            }
        }
    }
    Ok(seqs)
}
