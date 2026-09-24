/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * The label filter pattern language — `docs/syntax.md`.
 *
 * **Parsed into a small IR, never compiled to a regex.** That is the spec's own recommendation
 * (§16) and it is the point: the public language stays small and deterministic, and no regex
 * engine's implementation details leak into it. Translating to a regex would also make every
 * reserved character a escaping problem twice over.
 *
 * Six reserved characters, and nothing else is special: `*` `|` `` ` `` `\` `[` `]`.
 *
 * **A backtick is an anchor and nothing else** (2026-09-22). It used to delimit character sets as
 * well, and that one overload produced every confusion this language has had: `` `in*`t` ``,
 * `` `123`bar ``, `` `123`` ``, `` `1`` ``, `` `0-9` `` read as a set, and the doubled tick at a
 * boundary. Sets moved to `[…]` and all of it went away with them — pairing, parity, the rule that a
 * set may not open a pattern, and an entire specification section.
 */

/** Tokens the matcher walks. `LIT` carries text, `SET` a predicate, `ANY` is `*`. */
const LIT = 'lit', ANY = 'any', SET = 'set';

/** A literal run of characters, folded for case at compile time when the pattern is insensitive. */
export interface LitToken { k: typeof LIT; v: string }
/** `*` — any run of characters, including none. */
export interface AnyToken { k: typeof ANY }
/** `[…]` — exactly one character, tested against the RAW label because a set never folds. */
export interface SetToken { k: typeof SET; test: (ch: string) => boolean }
/** A token the matcher walks. */
export type PatternToken = LitToken | AnyToken | SetToken;
/** `||…||` before it is desugared away. Never reaches the matcher or a caller. */
interface GroupToken { k: typeof GROUP; branches: PatternToken[][] }
/** What `tokenise` produces, before `expand` multiplies the groups out. */
type ParseToken = PatternToken | GroupToken;

/**
 * `GROUP` is the ONE token kind the matcher never sees: a group is desugared during parsing, so an
 * alternative holding a group of n branches becomes n alternatives sharing its anchors. The IR the
 * matcher walks is therefore exactly what it was before groups existed, and there is nothing new
 * that can recurse.
 */
const GROUP = 'group';

/** One alternative of a pattern, with its anchors. Groups are already desugared away. */
export interface CompiledAlternative {
  /** Anchored to the start of the label. */
  start: boolean;
  /** Anchored to the end of the label. */
  end: boolean;
  tokens: PatternToken[];
  /** Why this alternative could not be read, if it could not be. */
  error: string | null;
}

/** What one source alternative parses to, before its groups multiply it out. */
interface ParsedAlternative {
  start: boolean;
  end: boolean;
  seqs: PatternToken[][];
  error: string | null;
}

/** The parsed form, for a caller that wants to inspect or render a pattern. */
export interface ParsedPattern {
  /** `\c\` — literals are compared case-sensitively. Sets always are. */
  caseSensitive: boolean;
  /** `\-\` — the verdict is inverted. */
  negate: boolean;
  /** `\b\` — the match must begin and end on a word boundary. */
  boundary: boolean;
  alts: CompiledAlternative[];
  /** The pattern-level refusal, if the pattern could not be read. */
  error: string | null;
}

/**
 * The label under match, carried twice: folded for literals, raw for sets and boundaries — both as
 * code-point arrays, so `raw[i]` and `text[i]` are the same character.
 */
interface MatchContext {
  raw: string[];
  text: string[];
  boundary: boolean;
}

/**
 * A compiled matcher.
 *
 * **When `error` is a string the matcher returns `true` for every label**, so an unreadable pattern
 * hides nothing and the caller can show the reason. This holds under `\-\` as well: negation never
 * inverts a refusal.
 */
export interface LabelMatcher {
  (label: unknown): boolean;
  error: string | null;
}

/** Groups multiply, so an alternative is capped rather than allowed to explode on a keystroke. */
const MAX_SEQUENCES = 64;

/**
 * Every instruction `\…\` accepts: `c` case-sensitive, `-` not, `b` word boundary.
 *
 * **`\…\` at the start of a pattern is the instruction namespace**, and it is deliberately wider
 * than the three instructions that exist: a section of letters, digits and `-` is READ as an
 * instruction section and refused when it names nothing, rather than falling through to the escape
 * rules. That is what makes a future instruction addable without changing the meaning of any pattern
 * that works today — `\v2\foo` is already an error, so it is free to claim.
 *
 * It claims no more than that. `\.foo\.bar` and `\ a\ b` are literals and must stay literals, so
 * punctuation is NOT part of the namespace; an instruction that needs `=` or `,` claims it then, and
 * pays for it then. Ruled 2026-09-23.
 */
const INSTRUCTIONS = 'c-b';

/** What may appear in an instruction section — claimed whole, so an unknown one is a named error. */
const INSTRUCTION_SECTION = /^[A-Za-z0-9-]+$/;

/**
 * An option section at the start of an alternative, which is never what it looks like.
 *
 * **Options are global (§10): the prefix is read once, off the whole pattern, before it is split on
 * `|`.** So `apple|\-\pear` cannot mean *contains apple OR not pear*; the `\-\` is just an
 * escaped dash and a backslash, and it answers a different question while reading cleanly. Refused
 * since 2026-09-24, the same reason `` `a|b` `` is refused.
 *
 * Until 2026-09-23 this shape was wider: `apple|\c\pear` meant *contains `cpear`*. Restricting
 * escapes to non-alphanumerics closed every spelling whose option letters are LETTERS, leaving only
 * `-`, which is legally escapable. That left one rule for `c` and `b` and another for `-`, which is
 * the inconsistency this refusal removes, not the original misread.
 */
function leadingOptionSection(alt: string): string | null {
  if (!alt.startsWith('\\')) return null;
  const end = alt.indexOf('\\', 1);
  if (end <= 0) return null;
  const section = alt.slice(1, end);
  return INSTRUCTION_SECTION.test(section) ? section : null;
}

/** Letters and numbers in any script. Definition B of a word boundary rests on this and nothing else. */
const ALNUM = /[\p{L}\p{N}]/u;
const isAlnum = (ch: string | undefined): boolean => ch !== undefined && ALNUM.test(ch);

/**
 * A word boundary, **definition B** (ruled 2026-09-22): the edge of the label, or a neighbouring
 * character that is not a letter or a number.
 *
 * Regex's `\b` was the obvious choice and it is wrong for labels: it counts `_` as a word character,
 * so `app_data` would not match a whole-word `app` — and `_` separates words in a filename whatever
 * a regex thinks. The test looks only at the NEIGHBOURING character, never at the matched text, so
 * it stays decidable by reading one character.
 */
const startsAtBoundary = (raw: string[], at: number): boolean => at === 0 || !isAlnum(raw[at - 1]);
const endsAtBoundary = (raw: string[], at: number): boolean => at === raw.length || !isAlnum(raw[at]);

/**
 * **A backslash may escape anything except an ASCII letter or digit**, in a set body and in the
 * pattern body alike.
 *
 * Punctuation, symbols and every non-ASCII character — an accent, an emoji — are literals with or
 * without the backslash, so escaping them is harmless and allowed. A LETTER after a backslash is the
 * problem: `\n`, `\d`, `\w`, `\b` are classes to anyone who has met a regular expression, and would
 * quietly mean the letter here. Refusing them is the same ruling as refusing an unknown option, and a
 * whitelist of punctuation beats a blacklist of `d w s b n t` because the surface stays teachable.
 *
 * Ruled 2026-09-23: first as "only \\ \] \-", then widened the same day when unicode and emoji had to
 * be escapable too — which this states without carrying a list.
 */
const ESCAPABLE = /[^A-Za-z0-9]/;

/** The one refusal, shared by the pattern body and a set body. */
const ESCAPE_ERROR =
  'a letter or digit cannot be escaped — \\d, \\n and \\b mean a class in a regular expression and nothing here; drop the backslash, or use \\c\\ \\-\\ \\b\\ at the start for an option';

function setEscapeError(body: string): string | null {
  const cp = Array.from(body);
  for (let i = 0; i < cp.length; i++) {
    if (cp[i] !== '\\') continue;
    const next = cp[i + 1];
    if (next === undefined || !ESCAPABLE.test(next)) return ESCAPE_ERROR;
    i++;
  }
  return null;
}

/// A character-set body — `123`, `0-9`, `A-Za-z`, `0-9A-F` — as a membership test.
///
/// **Ranges are expanded by code point, and a trailing or leading `-` is a literal `-`.** `a-z` is
/// a range; `-z` and `a-` are the characters themselves, because there is no sensible range with a
/// missing end and refusing the pattern outright would be worse than the obvious reading.
///
/// An **escaped** `-` is always a literal too: `[a\-z]` is three characters, not a range. That is
/// the only way to ask for a literal dash between two others.
function charsetTest(body: string): (ch: string) => boolean {
  const atoms: Array<{ ch: string; escaped: boolean }> = [];
  // **Code points, not code units.** A set holding an emoji stored two half-surrogates here and then
  // never matched the whole character the matcher handed it — the other half of the 2026-09-23 astral
  // fix, and the half that made every emoji set answer false rather than merely wrong.
  const cp = Array.from(body);
  for (let i = 0; i < cp.length; i++) {
    if (cp[i] === '\\' && i + 1 < cp.length) { atoms.push({ ch: cp[i + 1], escaped: true }); i++; continue; }
    atoms.push({ ch: cp[i], escaped: false });
  }
  const ranges: Array<[number, number]> = [];
  const singles = new Set<string>();
  for (let i = 0; i < atoms.length; i++) {
    const dash = atoms[i + 1];
    const upper = atoms[i + 2];
    if (dash && !dash.escaped && dash.ch === '-' && upper) {
      // `ch` is always exactly one character here, so both code points exist.
      ranges.push([atoms[i].ch.codePointAt(0) as number, upper.ch.codePointAt(0) as number]);
      i += 2;
    } else {
      singles.add(atoms[i].ch);
    }
  }
  return (ch) => {
    if (singles.has(ch)) return true;
    const c = ch.codePointAt(0) as number;
    return ranges.some(([lo, hi]) => c >= lo && c <= hi);
  };
}

/**
 * Whether any run of unescaped `|` is three or more long.
 *
 * **This one rule is what makes `||` decidable**, and it does more work than it looks like. With
 * every run either one bar or two, `||` pairs left to right with nothing to guess — and an empty
 * group (`||||`) and an empty branch become unwritable, because neither can be spelled without a
 * run of three. Guessing which bars in `a|||b` open a group is how a filter silently answers a
 * different question.
 */
function hasBarRun(s: string): boolean {
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; run = 0; continue; }
    if (s[i] === '|') { run++; if (run > 2) return true; } else { run = 0; }
  }
  return false;
}

/**
 * Split on `|` at the top level, leaving the `|` inside a group alone.
 *
 * `||` toggles: it opens a group when we are outside one and closes it when we are inside. **That
 * is also why a group cannot nest** — the middle `||` of `||a||b||` closes rather than opens, so
 * what follows is a second group left hanging, reported here as unclosed.
 */
function splitAlternatives(s: string): { alts: string[]; unclosed: boolean } {
  const alts: string[] = [];
  let cur = '';
  let inGroup = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) { cur += ch + s[i + 1]; i++; continue; }
    if (ch === '|' && s[i + 1] === '|') { inGroup = !inGroup; cur += '||'; i++; continue; }
    if (ch === '|' && !inGroup) { alts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  alts.push(cur);
  return { alts, unclosed: inGroup };
}

/**
 * Split on `|` at the top level, then parse each alternative.
 *
 * **The option prefix is read before splitting**, because it applies to the whole pattern (§10) and
 * a `|` inside the option section would otherwise cut it in half.
 *
 * The returned `alts` are already desugared, so a pattern with groups reports more alternatives
 * than it was written with. `error` is the pattern-level refusal; per-alternative refusals stay on
 * the alternative, and `compileLabelFilter` surfaces whichever comes first.
 */
export function parsePattern(pattern: string): ParsedPattern {
  let rest = String(pattern);
  let caseSensitive = false;
  let negate = false;
  let boundary = false;

  // `\options\...` — only when a SECOND unescaped backslash exists. Without one, a leading `\` is
  // an ordinary escape (`\*foo`), not a malformed option section.
  let optionError: string | null = null;
  if (rest.startsWith('\\')) {
    const end = rest.indexOf('\\', 1);
    // **At least ONE option character, and only option characters.** `\*` is an escaped asterisk and
    // must not be read as an option named `*` — and `\\` is an escaped backslash (§9), NOT an empty
    // option section. Accepting the empty section was a bug reported 2026-09-22: `\\` stripped
    // itself to the empty pattern and matched EVERY label, where a lone `\` correctly matched labels
    // containing a backslash.
    if (end > 0 && INSTRUCTION_SECTION.test(rest.slice(1, end))) {
      const opts = rest.slice(1, end);
      // An option nobody implements must not be ignored. §10 keeps the namespace open, and until a
      // letter means something, silently dropping it would answer a question the pattern did not
      // ask — and `\d\foo` has a second reading (the literal `dfoo`) that makes guessing worse.
      const unknown = [...opts].filter((ch) => !INSTRUCTIONS.includes(ch));
      if (unknown.length) {
        optionError = `unknown instruction ${unknown.join('')} — the instructions are c (case-sensitive), - (not) and b (word boundary); a literal backslash is \\\\`;
      }
      caseSensitive = opts.includes('c');
      negate = opts.includes('-');
      boundary = opts.includes('b');
      rest = rest.slice(end + 1);
    }
  }

  const split = splitAlternatives(rest);
  const parsed = split.alts.map(parseAlternative);

  // **An option section that is not the prefix.** `rest` has already had the real prefix removed, so
  // anything still shaped like one is in the wrong place: a later alternative, or a second prefix
  // written after the first. Checked on the split alternatives so a `||…||` branch is covered too.
  const misplaced = split.alts.map(leadingOptionSection).find(Boolean) || null;

  let error: string | null = null;
  if (optionError) {
    error = optionError;
  } else if (misplaced) {
    error = `\\${misplaced}\\ applies to the whole pattern, so it cannot open an alternative — move it to the very start, before the first |`;
  } else if (hasBarRun(rest)) {
    error = 'three or more | in a row — | separates alternatives, || opens or closes a group, and a literal bar is \\|';
  } else if (split.unclosed) {
    error = 'unclosed || group — a group is ||…||, it does not nest, and a literal bar is \\|';
  } else {
    error = parsed.map((a) => a.error).find(Boolean) || null;
  }

  // **The trap that groups exist to replace.** `` `a|b` `` parses cleanly as "starts with a" OR
  // "ends with b", because an anchor belongs to the alternative it is written in — and it reads to
  // everyone as "exactly a or b", because the two anchors sit at the outer edges and look like
  // they wrap the alternation. Refused since 2026-09-22, naming the spelling that means what it
  // looks like. The shape is precise: the FIRST alternative anchored only at the start, the LAST
  // anchored only at the end. `` `a|`b ``, `` a`|b` `` and `` `a`|`b` `` are ordinary and untouched.
  if (!error && parsed.length > 1) {
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    if (first.start && !first.end && last.end && !last.start) {
      error = 'anchors bind to one alternative, not across | — `a|b` reads as "starts with a" OR "ends with b"; write `||a|b||` for exactly one of them';
    }
  }

  // **Negation with nothing to negate hides every row.** An empty pattern matches everything, so
  // inverted it matches nothing — the confident empty, arrived at from the other side. It is also
  // the state a pattern passes through while `\-\…` is being typed, so it is refused rather than
  // served. `\-\*` is left alone: it says hide everything, and it says it on purpose.
  if (!error && negate && parsed.every((a) => !a.start && !a.end && a.seqs.every((seq) => seq.length === 0))) {
    error = 'negation with no pattern would hide every row — give \\-\\ something to exclude';
  }

  const alts = parsed.flatMap((a) => a.seqs.map((tokens) => ({
    start: a.start,
    end: a.end,
    tokens,
    error: a.error,
  })));

  return { caseSensitive, negate, boundary, alts, error };
}

/** Whether the last character of `s` is an unescaped backtick — the end anchor. */
function endsWithAnchor(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '`' && i === s.length - 1) return true;
  }
  return false;
}

/**
 * One alternative: optional start anchor, tokens, optional end anchor.
 *
 * **Both anchors are stripped here, and a backtick anywhere else is an error.** Since sets moved to
 * `[…]` on 2026-09-22 there is nothing else a backtick can be, so this needs no pairing, no parity
 * and no lookahead: first character, last character, or a mistake. A literal backtick is `` \` ``.
 */
function parseAlternative(src: string): ParsedAlternative {
  let s = src;
  let start = false;
  let end = false;
  if (s.startsWith('`')) { start = true; s = s.slice(1); }
  if (endsWithAnchor(s)) { end = true; s = s.slice(0, -1); }
  const scan = tokenise(s);
  if (scan.error) return { start, end, seqs: [[]], error: scan.error };
  const grown = expand(scan.tokens);
  if (grown.error) return { start, end, seqs: [[]], error: grown.error };
  return { start, end, seqs: grown.seqs, error: null };
}

/** Index of the unescaped `ch` at or after `from`, or -1. */
function findUnescaped(s: string, from: number, ch: string): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === ch) return i;
  }
  return -1;
}

/** Index of the unescaped `||` closing a group opened at `from`, or -1. */
function findGroupClose(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '|' && s[i + 1] === '|') return i;
  }
  return -1;
}

/** Split a group body on its single `|` — it can hold no `||`, since the first one closed it. */
function splitBranches(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === '|') { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

function tokenise(s: string): { tokens: ParseToken[]; error: string | null } {
  const out: ParseToken[] = [];
  let lit = '';
  const flush = () => { if (lit) { out.push({ k: LIT, v: lit }); lit = ''; } };
  const refuse = (error: string) => { flush(); return { tokens: out, error }; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      if (!ESCAPABLE.test(s[i + 1])) return refuse(ESCAPE_ERROR);
      lit += s[i + 1];
      i++;
      continue;
    }
    if (ch === '*') { flush(); out.push({ k: ANY }); continue; }
    if (ch === '|' && s[i + 1] === '|') {
      const close = findGroupClose(s, i + 2);
      // Unreachable while `splitAlternatives` rejects an unclosed group first — kept because a
      // group with no branches would expand to NOTHING, and a pattern that silently matches
      // nothing is the one outcome this language refuses to produce.
      if (close === -1) return refuse('unclosed || group — a group is ||…||, and a literal bar is \\|');
      const body = s.slice(i + 2, close);
      const branches: PatternToken[][] = [];
      for (const branch of splitBranches(body)) {
        // Also unreachable: an empty group or an empty branch cannot be spelled without a run of
        // three bars, which `hasBarRun` has already refused.
        if (branch === '') return refuse('empty alternative inside a || group');
        const sub = tokenise(branch);
        if (sub.error) return refuse(sub.error);
        // **A branch cannot hold a group**: the first unescaped `||` after the opener CLOSES this
        // one, so `findGroupClose` has already bounded the body before any nested opener could be
        // read. That is what makes this cast sound rather than convenient.
        branches.push(sub.tokens as PatternToken[]);
      }
      flush();
      out.push({ k: GROUP, branches });
      i = close + 1;
      continue;
    }
    if (ch === '[') {
      const close = findUnescaped(s, i + 1, ']');
      if (close === -1) return refuse('unclosed [ — a set is […], and a literal bracket is \\[');
      const body = s.slice(i + 1, close);
      // **An empty set can never match, so it is refused rather than served.** A filter that hides
      // every row for an unstatable reason is the exact failure the error channel exists for.
      if (body === '') return refuse('empty set [] — a set needs characters, and a literal bracket is \\[');
      const badEscape = setEscapeError(body);
      if (badEscape) return refuse(badEscape);
      flush();
      out.push({ k: SET, test: charsetTest(body) });
      i = close;
      continue;
    }
    if (ch === ']') return refuse('unmatched ] — a set is […], and a literal bracket is \\]');
    // Anchors were taken off both ends already, so anything left is in the middle of the pattern.
    if (ch === '`') {
      return refuse('a backtick is an anchor and belongs at the very start or very end — a literal backtick is \\`');
    }
    lit += ch;
  }
  flush();
  return { tokens: out, error: null };
}

/**
 * Desugar groups: one token list in, one list per combination out.
 *
 * Doing it here rather than in the matcher is what keeps the matcher untouched by this feature —
 * and what makes the cost of a group visible at parse time, where it can be refused, instead of
 * per label at match time, where it cannot.
 */
function expand(tokens: ParseToken[]): { seqs: PatternToken[][]; error: string | null } {
  let seqs: PatternToken[][] = [[]];
  for (const t of tokens) {
    if (t.k !== GROUP) {
      seqs = seqs.map((seq) => seq.concat([t]));
      continue;
    }
    const next: PatternToken[][] = [];
    for (const seq of seqs) {
      for (const branch of t.branches) next.push(seq.concat(branch));
    }
    if (next.length > MAX_SEQUENCES) {
      return { seqs: [[]], error: `too many combinations — || groups multiply, and this is over ${MAX_SEQUENCES}; use separate filters` };
    }
    seqs = next;
  }
  return { seqs, error: null };
}

/**
 * Lower-case one character, but **only when doing so keeps its length**.
 *
 * Case folding is not length-preserving in general (`İ`.toLowerCase() is two code units), and this
 * matcher walks the folded text and the raw text at the SAME index — a literal reads the folded
 * one, a set and the boundary test read the raw one. One character that folded to two would slide
 * every index after it apart. The handful of such characters are left unfolded instead, which costs
 * a case-insensitive match nobody has asked for and keeps the two strings aligned for every label
 * that exists.
 */
function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  return lower.length === ch.length ? lower : ch;
}

function fold(s: string): string {
  let out = '';
  for (const ch of s) out += foldChar(ch);
  return out;
}

/**
 * A string as **code points**, which is the unit every index in this algorithm means.
 *
 * **JavaScript strings index by UTF-16 code unit, and that made this the one implementation that got
 * astral characters wrong.** A set consumed half of an emoji, so `x[😀]y` did not match `x😀y` while
 * Rust, Python, Go and PHP — which all index by code point — matched it. Worse than failing: the
 * unanchored scan sometimes found a half-surrogate and answered TRUE. Fixed 2026-09-23 by walking code
 * points here too, and the fixture now carries astral cases so no implementation can drift back.
 */
const codePoints = (s: string): string[] => Array.from(s);

/** A token as the matcher walks it: a literal is code points, so one index is one character. */
type RuntimeToken =
  | { k: typeof LIT; cp: string[] }
  | { k: typeof ANY }
  | { k: typeof SET; test: (ch: string) => boolean };

interface RuntimeAlternative {
  start: boolean;
  end: boolean;
  tokens: RuntimeToken[];
}

/**
 * Whether `tokens` match `ctx` starting at `at`, ending at the end if `mustEnd`.
 *
 * `ctx` carries the label twice: `text` folded for literals, `raw` as typed for sets and boundaries.
 *
 * **`failed` is not an optimisation, it is what keeps this from hanging the UI.** Backtracking over
 * `*` is exponential without it: measured 2026-09-22, `` *a*a*a*a*a*z `` against 80 `a`s took **25
 * seconds for ONE label** — and this runs per label per keystroke, so a pattern a person could
 * plausibly type froze the list. Whether `(ti, at)` can match is independent of how the walk
 * arrived there, so a failed pair is recorded and never re-walked, which makes the worst case
 * O(tokens × label) — the same 80-character case then measures under a millisecond.
 */
function matchAt(tokens: RuntimeToken[], ti: number, ctx: MatchContext, at: number, mustEnd: boolean, failed: Uint8Array, width: number): boolean {
  if (ti === tokens.length) {
    if (mustEnd) return at === ctx.text.length;
    // Under `\b\` the match must end on a boundary as well as begin on one; `matchAlternative`
    // handles the beginning, because that is where the scan chooses its start.
    return !ctx.boundary || endsAtBoundary(ctx.raw, at);
  }
  const key = ti * width + at;
  if (failed[key]) return false;
  const t = tokens[ti];
  let ok = false;
  if (t.k === LIT) {
    ok = startsWithAt(ctx.text, t.cp, at)
      && matchAt(tokens, ti + 1, ctx, at + t.cp.length, mustEnd, failed, width);
  } else if (t.k === SET) {
    // **A set is always case-sensitive, so it reads the raw label** — ruled 2026-09-22.
    ok = at < ctx.raw.length && t.test(ctx.raw[at])
      && matchAt(tokens, ti + 1, ctx, at + 1, mustEnd, failed, width);
  } else {
    // ANY — zero or more, shortest first.
    for (let j = at; j <= ctx.text.length; j++) {
      if (matchAt(tokens, ti + 1, ctx, j, mustEnd, failed, width)) { ok = true; break; }
    }
  }
  if (!ok) failed[key] = 1;
  return ok;
}

/** Whether `needle` sits in `text` at `at`, compared one code point at a time. */
function startsWithAt(text: string[], needle: string[], at: number): boolean {
  if (at + needle.length > text.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (text[at + i] !== needle[i]) return false;
  }
  return true;
}

function matchAlternative(alt: RuntimeAlternative, ctx: MatchContext): boolean {
  // One table per (alternative, label). The unanchored scan below shares it deliberately: a `(ti,
  // at)` pair that failed from one start position fails from every other one too.
  const width = ctx.text.length + 1;
  const failed = new Uint8Array(alt.tokens.length * width);
  if (alt.start) return matchAt(alt.tokens, 0, ctx, 0, alt.end, failed, width);
  // Unanchored: `foo` is conceptually `*foo*` (§14).
  for (let i = 0; i <= ctx.text.length; i++) {
    if (ctx.boundary && !startsAtBoundary(ctx.raw, i)) continue;
    if (matchAt(alt.tokens, 0, ctx, i, alt.end, failed, width)) return true;
  }
  return false;
}

/**
 * Compile a pattern once into `label => boolean`.
 *
 * **A literal folds; a set never does** — ruled 2026-09-22, and the asymmetry is not an
 * inconsistency. A literal has no other spelling,
 * so folding it is the only way `apple` can mean what everyone means by it. A set does have another
 * spelling: `[A-Za-z]` says *either case* explicitly, and `[Aa]` says it for one letter. So folding
 * a set DESTROYED the only thing a set is for — with it, `[A-Z]`, `[a-z]` and `[A-Za-z]` were three
 * ways to write one thing, and "starts with a capital" could only be asked by flipping the whole
 * pattern to `\c\`, which hardens every literal with it. Not folding loses nothing, because the
 * wider set is always writable.
 */
export function compileLabelFilter(pattern: string): LabelMatcher {
  const p = parsePattern(pattern);
  const error = p.error || p.alts.map((a) => a.error).find(Boolean) || null;
  // The runtime form: literals folded unless `\c\`, and every literal as code points so that one
  // index is one character — the same unit the raw label is walked in.
  const alts: RuntimeAlternative[] = p.alts.map((a) => ({
    start: a.start,
    end: a.end,
    tokens: a.tokens.map((t): RuntimeToken =>
      t.k === LIT ? { k: LIT, cp: codePoints(p.caseSensitive ? t.v : fold(t.v)) } : t),
  }));
  const match = ((label: unknown): boolean => {
    // **An unparseable pattern hides nothing, and `\-\` does not get to invert that.** Filtering on
    // a pattern we could not read would remove rows for a reason nobody can see — the confident
    // empty, at the one control whose job is to decide what you are shown. Negating it would turn
    // the safe answer into the worst one, hiding EVERY row over a typo.
    if (error) return true;
    const raw = codePoints(String(label == null ? '' : label));
    const ctx: MatchContext = {
      raw,
      text: p.caseSensitive ? raw : raw.map(foldChar),
      boundary: p.boundary,
    };
    const hit = alts.some((a) => matchAlternative(a, ctx));
    return p.negate ? !hit : hit;
  }) as LabelMatcher;
  match.error = error;
  return match;
}
