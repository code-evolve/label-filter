/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * Properties that must hold for EVERY pattern, not only the ones the spec spells out.
 *
 * `conformance.mjs` asserts what the specification says. This file asserts what the specification
 * cannot enumerate: that no input hangs or throws, that a refused pattern hides nothing whatever was
 * typed, and — the part with the most teeth — that the matcher agrees with an **independently
 * written** implementation of the same semantics over thousands of generated patterns.
 *
 *   npm run test:properties
 *
 * Configuration is taken from the environment with **no defaults**, so a run is always reproducible
 * from its own command line:
 *
 *   LABEL_FILTER_SEED                 the PRNG seed; a failure prints it back
 *   LABEL_FILTER_FUZZ_CASES           generated patterns per property
 *   LABEL_FILTER_EXHAUSTIVE_LENGTH    every pattern up to this length over the reserved alphabet
 */
import { compileLabelFilter, parsePattern } from '../src/index.ts';

function required(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    throw new Error(`${name} must be set — this suite takes no defaults, so that a run is reproducible`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

const SEED = required('LABEL_FILTER_SEED');
const FUZZ_CASES = required('LABEL_FILTER_FUZZ_CASES');
const EXHAUSTIVE_LENGTH = required('LABEL_FILTER_EXHAUSTIVE_LENGTH');

/** mulberry32 — small, seeded, and identical on every platform, so a failure reproduces. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
let checks = 0;
const fail = (what: string, detail?: string) => {
  failures++;
  if (failures <= 40) console.error(`  ${what}${detail ? ` — ${detail}` : ''}`);
};
const check = (ok, what, detail) => { checks++; if (!ok) fail(what, detail); };

/**
 * Labels chosen to be awkward: every reserved character, both cases, a length-changing fold (`İ`),
 * an astral character, and the empty string — which is a label a filter really does see.
 */
const CORPUS = [
  '', 'a', 'A', 'ab', 'aB', 'apple', 'Apple', 'APPLE', 'pineapple', 'apple pie',
  'a`b', 'a|b', 'a*b', 'a\\b', 'C:\\Users\\steven', '``', '||', '\\\\',
  '0', '9', 'v10-draft.md', 'IMG_0421.HEIC', '#0f172a', '#FFF',
  'src/index.js', 'test/a.mjs', 'İstanbul', 'naïve', '😀x', 'x😀',
  ' leading', 'trailing ', 'a'.repeat(64),
];

// ---------------------------------------------------------------------------------------------
// 1. Whatever is typed: no throw, and a refusal hides nothing.
// ---------------------------------------------------------------------------------------------

function mustBeharmless(pattern, where) {
  let m;
  try {
    m = compileLabelFilter(pattern);
  } catch (e) {
    fail(`${where}: compile threw`, `${JSON.stringify(pattern)} — ${(e as Error).message}`);
    checks++;
    return;
  }
  for (const label of CORPUS) {
    checks++;
    let r;
    try {
      r = m(label);
    } catch (e) {
      fail(`${where}: match threw`, `${JSON.stringify(pattern)} on ${JSON.stringify(label)} — ${(e as Error).message}`);
      continue;
    }
    // **The invariant the whole error channel exists for.** A pattern nobody could read must leave
    // every row visible; hiding rows for an unstatable reason is the one outcome this language
    // refuses to produce.
    if (m.error && r !== true) {
      fail(`${where}: a refused pattern hid a row`, `${JSON.stringify(pattern)} rejected ${JSON.stringify(label)}: ${m.error}`);
    }
  }
  // Compiling twice must agree — the error string included, since callers show it.
  const again = compileLabelFilter(pattern);
  check(again.error === m.error, `${where}: recompile disagreed`, JSON.stringify(pattern));
  for (const label of CORPUS) {
    check(again(label) === m(label), `${where}: recompile changed a verdict`, `${JSON.stringify(pattern)} / ${JSON.stringify(label)}`);
  }
  // **A matcher must not remember the previous label.** The matcher memoises failed positions per
  // call; a table that leaked across calls would make a verdict depend on what was asked before it.
  const forwards = CORPUS.map((l) => m(l));
  const backwards = [...CORPUS].reverse().map((l) => m(l)).reverse();
  check(forwards.every((v, i) => v === backwards[i]), `${where}: verdicts depended on call order`, JSON.stringify(pattern));
}

// Every pattern over the reserved alphabet up to the configured length. This is where the parser's
// own edge rules live — anchors, pairing, bar runs — and it is small enough to enumerate.
const RESERVED_ALPHABET = ['a', 'A', '1', '`', '*', '|', '\\', '-', '[', ']'];
let exhaustive = 0;
function enumerate(prefix, depth) {
  if (depth === 0) return;
  for (const ch of RESERVED_ALPHABET) {
    const p = prefix + ch;
    exhaustive++;
    mustBeharmless(p, 'exhaustive');
    enumerate(p, depth - 1);
  }
}
enumerate('', EXHAUSTIVE_LENGTH);

// Longer random junk over the same alphabet plus ordinary characters, for the shapes too long to
// enumerate.
const JUNK_ALPHABET = [...RESERVED_ALPHABET, 'b', 'z', '0', 'c', '.', ' ', '😀'];
{
  const rnd = rng(SEED);
  for (let i = 0; i < FUZZ_CASES; i++) {
    const len = 1 + Math.floor(rnd() * 12);
    let p = '';
    for (let j = 0; j < len; j++) p += JUNK_ALPHABET[Math.floor(rnd() * JUNK_ALPHABET.length)];
    mustBeharmless(p, 'junk');
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Differential: an independently written implementation of the same semantics.
// ---------------------------------------------------------------------------------------------
//
// The oracle is a regular expression — which is exactly what `src/index.js` refuses to be, so the
// two share no code and no reasoning. The asymmetry the language now has makes this a real test
// rather than a tautology: **a literal folds and a set does not**, so the oracle cannot simply use
// the `i` flag. It folds each literal character by hand and leaves every set class strict.

const LITERAL_CHARS = [...'aAbB1_-. ()[]+$^{}?xZ'];
const SET_ATOMS = ['a', 'b', 'A', 'B', '0', '1', 'z', 'a-c', 'A-C', '0-9', 'x-z'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One literal character as a case-insensitive regex atom, or a strict one under `\c\`. */
function literalAtom(ch, caseSensitive) {
  if (caseSensitive) return escapeRe(ch);
  const lo = ch.toLowerCase();
  const up = ch.toUpperCase();
  if (lo === up || lo.length !== ch.length || up.length !== ch.length) return escapeRe(ch);
  return `[${escapeRe(lo)}${escapeRe(up)}]`;
}

/** One piece of a generated pattern: a literal run, a wildcard, or a set body. */
type GeneratedPart = { kind: 'lit'; v: string } | { kind: 'any' } | { kind: 'set'; body: string };

function generateSimple(rnd) {
  const parts: GeneratedPart[] = [];
  const count = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const roll = rnd();
    if (roll < 0.45) {
      let v = '';
      const n = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) v += LITERAL_CHARS[Math.floor(rnd() * LITERAL_CHARS.length)];
      parts.push({ kind: 'lit', v });
    } else if (roll < 0.7) {
      parts.push({ kind: 'any' });
    } else {
      let body = '';
      const n = 1 + Math.floor(rnd() * 2);
      for (let j = 0; j < n; j++) body += SET_ATOMS[Math.floor(rnd() * SET_ATOMS.length)];
      parts.push({ kind: 'set', body });
    }
  }
  const start = rnd() < 0.45;
  const end = rnd() < 0.45;
  const caseSensitive = rnd() < 0.3;
  // A set opening a pattern needed a fixup here until 2026-09-22, when sets moved to `[…]` and a
  // backtick became an anchor and nothing else. Nothing to arrange any more: `[0-9]x` is legal.
  return { parts, start, end, caseSensitive };
}

function render(shape) {
  return (shape.caseSensitive ? '\\c\\' : '') + renderBody(shape);
}

/** The pattern without its option prefix — `\c\` is global (§10), so composition needs it apart. */
function renderBody({ parts, start, end }) {
  let out = '';
  if (start) out += '`';
  for (const part of parts) {
    if (part.kind === 'lit') out += part.v.replace(/[*|`\\[\]]/g, (c) => `\\${c}`);
    else if (part.kind === 'any') out += '*';
    else out += `[${part.body}]`;
  }
  if (end) out += '`';
  return out;
}

function oracle({ parts, start, end, caseSensitive }) {
  let body = '';
  for (const part of parts) {
    if (part.kind === 'lit') body += [...part.v].map((c) => literalAtom(c, caseSensitive)).join('');
    else if (part.kind === 'any') body += '[\\s\\S]*';
    else body += `[${part.body}]`;
  }
  return new RegExp(`${start ? '^' : ''}${body}${end ? '$' : ''}`);
}

/** Labels that should HIT, plus mutations of them that probe the edges of each rule. */
function targetedLabels(shape, rnd) {
  const pick = (s) => s[Math.floor(rnd() * s.length)];
  const fromSet = (body: string) => {
    const chars: string[] = [];
    for (let i = 0; i < body.length; i++) {
      if (body[i + 1] === '-' && i + 2 < body.length) {
        const lo = body.codePointAt(i) as number;
        const hi = body.codePointAt(i + 2) as number;
        for (let c = lo; c <= hi; c++) chars.push(String.fromCodePoint(c));
        i += 2;
      } else chars.push(body[i]);
    }
    return pick(chars);
  };
  let hit = '';
  for (const part of shape.parts as GeneratedPart[]) {
    if (part.kind === 'lit') hit += [...part.v].map((c) => (rnd() < 0.3 ? c.toUpperCase() : c)).join('');
    else if (part.kind === 'any') hit += pick(['', 'q', 'QQ', 'a-b', '😀']);
    else hit += fromSet(part.body);
  }
  const out: string[] = [hit];
  if (!shape.start) out.push(pick(['x', 'aa', '😀']) + hit);
  if (!shape.end) out.push(hit + pick(['x', 'zz', '😀']));
  if (hit.length) {
    out.push(hit.slice(1));
    out.push(hit.slice(0, -1));
    out.push([...hit].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join(''));
  }
  return out;
}

{
  const rnd = rng(SEED + 1);
  for (let i = 0; i < FUZZ_CASES; i++) {
    const shape = generateSimple(rnd);
    const pattern = render(shape);
    const m = compileLabelFilter(pattern);
    // The generator only builds legal patterns, so a refusal here is a finding in its own right.
    if (m.error) {
      fail('generator produced a pattern the parser refused', `${JSON.stringify(pattern)} — ${m.error}`);
      checks++;
      continue;
    }
    const re = oracle(shape);
    for (const label of [...CORPUS, ...targetedLabels(shape, rnd)]) {
      checks++;
      const mine = m(label);
      const theirs = re.test(label);
      if (mine !== theirs) {
        fail('disagreed with the oracle', `${JSON.stringify(pattern)} on ${JSON.stringify(label)}: matcher ${mine}, regex ${theirs} (${re})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Structural laws — the ones a reader relies on when composing a pattern.
// ---------------------------------------------------------------------------------------------

const agreeOn = (a, b, labels) => labels.every((l) => a(l) === b(l));

{
  const rnd = rng(SEED + 2);
  for (let i = 0; i < FUZZ_CASES; i++) {
    const leftShape = generateSimple(rnd);
    const rightShape = generateSimple(rnd);
    const left = render(leftShape);
    const right = render(rightShape);
    const l = compileLabelFilter(left);
    const r = compileLabelFilter(right);

    // **Alternation is a plain OR over independently evaluated alternatives** (§8) — except for the
    // one shape refused since 2026-09-22, where the outer anchors look like they wrap the whole
    // thing. When it IS refused, that is the law being enforced, not broken.
    //
    // The law is stated on pattern BODIES, because an option prefix is global (§10): `A|\c\B` is
    // not `A` OR `\c\B`, it is `A` OR the literal that `\c\B` spells. Writing the law over whole
    // patterns is how this suite first failed, and the law was wrong, not the parser.
    const leftBody = renderBody(leftShape);
    const rightBody = renderBody(rightShape);
    const both = compileLabelFilter(`${leftBody}|${rightBody}`);
    const bodyL = compileLabelFilter(leftBody);
    const bodyR = compileLabelFilter(rightBody);
    if (!both.error && !bodyL.error && !bodyR.error) {
      checks++;
      if (!CORPUS.every((s) => both(s) === (bodyL(s) || bodyR(s)))) {
        fail('alternation was not an OR', `${JSON.stringify(leftBody)} | ${JSON.stringify(rightBody)}`);
      }
    }

    // **And the option prefix reaches every alternative.** `\c\A|B` must equal `\c\A` OR `\c\B`,
    // which is what "applies to the whole pattern" means when there is more than one alternative.
    const prefixed = compileLabelFilter(`\\c\\${leftBody}|${rightBody}`);
    const strictL = compileLabelFilter(`\\c\\${leftBody}`);
    const strictR = compileLabelFilter(`\\c\\${rightBody}`);
    if (!prefixed.error && !strictL.error && !strictR.error) {
      checks++;
      if (!CORPUS.every((s) => prefixed(s) === (strictL(s) || strictR(s)))) {
        fail('an option prefix did not reach every alternative', `\\c\\${leftBody}|${rightBody}`);
      }
    }

    // **A group is exactly its expansion.** `X||p|q||Y` must equal `XpY|XqY`, which is the claim
    // that makes desugaring at parse time safe.
    const head = 'a';
    const tail = rnd() < 0.5 ? 'z' : '';
    const grouped = compileLabelFilter(`${head}||b|1||${tail}`);
    const spelt = compileLabelFilter(`${head}b${tail}|${head}1${tail}`);
    checks++;
    if (grouped.error || spelt.error || !agreeOn(grouped, spelt, CORPUS)) {
      fail('a group did not equal its expansion', `${head}||b|1||${tail} — ${grouped.error || spelt.error || 'verdicts differ'}`);
    }

    // `**` is `*`: a run of wildcards cannot mean more than one of them.
    if (left.includes('*')) {
      const doubled = compileLabelFilter(left.replace('*', '**'));
      checks++;
      if (doubled.error || !agreeOn(doubled, l, CORPUS)) {
        fail('** differed from *', `${JSON.stringify(left)} — ${doubled.error || 'verdicts differ'}`);
      }
    }
  }
}

{
  // **Escaping round-trips.** Whatever a label contains, escaping every reserved character must
  // produce a pattern that finds it — and anchored, case-sensitively, finds only it.
  const rnd = rng(SEED + 3);
  const RAW = [...'ab*|`\\-AB1 .[]😀'];
  for (let i = 0; i < FUZZ_CASES; i++) {
    const len = 1 + Math.floor(rnd() * 8);
    let label = '';
    for (let j = 0; j < len; j++) label += RAW[Math.floor(rnd() * RAW.length)];
    const escaped = label.replace(/[*|`\\[\]]/g, (c) => `\\${c}`);

    const contains = compileLabelFilter(escaped);
    checks++;
    if (contains.error || !contains(label) || !contains(`x${label}y`)) {
      fail('an escaped label did not find itself', `${JSON.stringify(label)} → ${JSON.stringify(escaped)} — ${contains.error || 'no match'}`);
    }

    const exact = compileLabelFilter(`\\c\\\`${escaped}\``);
    checks++;
    if (exact.error || !exact(label) || exact(`${label}x`) || exact(`x${label}`)) {
      fail('an escaped label was not exactly itself under anchors', `${JSON.stringify(label)} — ${exact.error || 'boundary leaked'}`);
    }
  }
}

{
  // **The four anchor spellings against the plainest possible oracle**: JavaScript's own string
  // methods, on literal-only patterns, where there is nothing to interpret.
  const rnd = rng(SEED + 4);
  const PLAIN = [...'abAB01 .'];
  for (let i = 0; i < FUZZ_CASES; i++) {
    const len = 1 + Math.floor(rnd() * 4);
    let f = '';
    for (let j = 0; j < len; j++) f += PLAIN[Math.floor(rnd() * PLAIN.length)];
    const lower = f.toLowerCase();
    const forms: Array<[string, (s: string) => boolean]> = [
      [f, (s) => s.toLowerCase().includes(lower)],
      [`\`${f}`, (s) => s.toLowerCase().startsWith(lower)],
      [`${f}\``, (s) => s.toLowerCase().endsWith(lower)],
      [`\`${f}\``, (s) => s.toLowerCase() === lower],
    ];
    for (const [pattern, expected] of forms) {
      const m = compileLabelFilter(pattern);
      for (const label of [...CORPUS, f, f.toUpperCase(), `x${f}`, `${f}x`]) {
        checks++;
        if (m.error || m(label) !== expected(label)) {
          fail('an anchor disagreed with String.prototype', `${JSON.stringify(pattern)} on ${JSON.stringify(label)} — ${m.error || `got ${m(label)}`}`);
        }
      }
    }
  }
}

{
  // **`\c\` governs literals only** (2026-09-22). A pattern made of nothing but sets and wildcards
  // must therefore be indifferent to it.
  const setOnly = ['[a-c]', '[a-c][0-9]', '`[A-C]*[0-9]', '*[ABC]*'];
  for (const p of setOnly) {
    const plain = compileLabelFilter(p);
    const strict = compileLabelFilter(`\\c\\${p}`);
    checks++;
    if (plain.error || strict.error || !agreeOn(plain, strict, CORPUS)) {
      fail('\\c\\ changed a pattern that holds no literals', `${JSON.stringify(p)} — ${plain.error || strict.error || 'verdicts differ'}`);
    }
  }

  // And the converse: a set never folds, whatever the mode.
  const setCases: Array<[string, string[], string[]]> = [
    ['`[A-Z]', ['Apple'], ['apple']],
    ['[a-z]`', ['xa'], ['xA']],
    ['x[0-9A-F]y', ['x0y', 'xFy'], ['xfy']],
  ];
  for (const [p, yes, no] of setCases) {
    const m = compileLabelFilter(p);
    for (const label of yes) { checks++; if (!m(label)) fail('a set refused a label it holds', `${p} / ${label}`); }
    for (const label of no) { checks++; if (m(label)) fail('a set folded with case', `${p} / ${label}`); }
  }
}

{
  // **The parse is data, and callers read it** (`parsePattern` is exported). Its shape must hold:
  // every alternative carries tokens, and a group has already been desugared away.
  for (const p of ['a', '`a`', '||a|b||', 'a|b', '[0-9]', '\\c\\a', '\\-b\\a']) {
    const parsed = parsePattern(p);
    checks++;
    if (!Array.isArray(parsed.alts) || parsed.alts.some((a) => !Array.isArray(a.tokens))) {
      fail('parsePattern returned a shape callers cannot read', JSON.stringify(p));
    }
    checks++;
    // **The type now says this cannot happen, and the check stays anyway.** `PatternToken` excludes
    // the group node, so tsc calls the comparison unreachable — but `tokenise` reaches the same
    // conclusion through a CAST (a branch cannot hold a group, by construction), and a cast is
    // exactly the thing a runtime assertion should outlive. Widened here rather than deleted.
    if (parsed.alts.some((a) => a.tokens.some((t) => (t as { k: string }).k === 'group'))) {
      fail('a group survived into the IR', JSON.stringify(p));
    }
  }
  checks++;
  if (parsePattern('||a|b||x||c|d||').alts.length !== 4) {
    fail('two groups did not multiply out to four alternatives');
  }
}

{
  // **`\-\` inverts the verdict and nothing else** (2026-09-22). Stated over generated patterns
  // rather than examples, because an inversion that was subtly *not* the complement would be
  // invisible in any one case.
  const rnd = rng(SEED + 5);
  for (let i = 0; i < FUZZ_CASES; i++) {
    const shape = generateSimple(rnd);
    const body = renderBody(shape);
    const plain = compileLabelFilter(body);
    const not = compileLabelFilter(`\\-\\${body}`);
    if (plain.error || not.error) continue;
    for (const label of CORPUS) {
      checks++;
      if (not(label) === plain(label)) {
        fail('negation did not invert', `${JSON.stringify(body)} on ${JSON.stringify(label)}`);
      }
    }
  }
}

{
  // **The boundary, definition B, against a hand-written scan.** A literal-only pattern under `\b\`
  // matches when the label contains it with a non-alphanumeric character (or nothing) on each side.
  // The scan below is written straight from that sentence and shares nothing with the matcher.
  const alnum = /[\p{L}\p{N}]/u;
  const wholeWord = (label, needle) => {
    const hay = label.toLowerCase();
    const pin = needle.toLowerCase();
    for (let i = 0; (i = hay.indexOf(pin, i)) !== -1; i++) {
      const before = i === 0 || !alnum.test(label[i - 1]);
      const after = i + pin.length === label.length || !alnum.test(label[i + pin.length]);
      if (before && after) return true;
    }
    return false;
  };
  const rnd = rng(SEED + 6);
  const PLAIN = [...'abAB01_-. /'];
  const WORDY = ['app', 'apple', 'app-1', 'my app', 'app_data', 'an app.', 'snapple', 'MyAppCard',
    'a.b.c', '1-2', 'x_y_z', '', 'app/x', '.app', 'app.', '😀app😀'];
  for (let i = 0; i < FUZZ_CASES; i++) {
    const len = 1 + Math.floor(rnd() * 4);
    let needle = '';
    for (let j = 0; j < len; j++) needle += PLAIN[Math.floor(rnd() * PLAIN.length)];
    const escaped = needle.replace(/[*|`\\[\]]/g, (c) => `\\${c}`);
    const m = compileLabelFilter(`\\b\\${escaped}`);
    if (m.error) { fail('a literal pattern under \\b\\ was refused', `${JSON.stringify(needle)} — ${m.error}`); checks++; continue; }
    for (const label of [...WORDY, ...CORPUS]) {
      checks++;
      if (m(label) !== wholeWord(label, needle)) {
        fail('the boundary disagreed with a hand-written scan', `${JSON.stringify(needle)} on ${JSON.stringify(label)}: matcher ${m(label)}`);
      }
    }
  }
}

console.log(`exhaustive: every pattern up to ${EXHAUSTIVE_LENGTH} chars over ${RESERVED_ALPHABET.length} reserved characters (${exhaustive} patterns)`);
if (failures) {
  console.error(`label-filter properties FAILED: ${failures} of ${checks} (seed ${SEED})`);
  process.exit(1);
}
console.log(`ok: ${checks} property assertions, seed ${SEED}, ${FUZZ_CASES} generated cases per property`);
