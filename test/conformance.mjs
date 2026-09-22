/**
 * Runs the label filter against every example in `docs/syntax.md`.
 *
 * **The spec is the test suite.** Each case below is lifted from a numbered section, and the
 * section is named in the failure output, so a disagreement points at the paragraph to re-read
 * rather than at a line of code.
 *
 *   npm run test:conformance
 */
import { compileLabelFilter } from '../src/index.js';

/** `[section, pattern, shouldMatch[], shouldNotMatch[]]` */
const CASES = [
  ['§3 default contains, case-insensitive', 'apple',
    ['apple', 'Apple', 'APPLE', 'Green Apple', 'pineAPPLE'], ['banana']],

  ['§4 wildcard', 'apple*pie',
    ['applepie', 'apple pie', 'apple-and-pear-pie'], ['apple', 'pie', 'banana pie']],

  ['§5 start anchor', '`apple',
    ['apple', 'apple pie', 'apples'], ['green apple', 'pineapple']],

  ['§5 end anchor', 'apple`',
    ['apple', 'green apple', 'pineapple'], ['apple pie', 'apples']],

  ['§5 both anchors, case-insensitive', '`apple`',
    ['apple', 'Apple', 'APPLE'], ['apple pie', 'green apple']],

  ['§5 case-sensitive exact', '\\c\\`apple`',
    ['apple'], ['Apple', 'APPLE']],

  // **Sets moved to `[…]` on 2026-09-22.** Every case in §6 and §7 is re-spelt, and §7's whole
  // subject -- a set delimiter colliding with an anchor -- no longer exists.
  ['§6 set mid-pattern', 'foo[123]bar',
    ['foo1bar', 'foo2bar', 'foo3bar'], ['foo4bar', 'foobar', 'foo12bar']],

  ['§6 range: digit', 'x[0-9]y', ['x0y', 'x9y'], ['xay', 'xy']],
  ['§6 range: lowercase', 'x[a-z]y', ['xay', 'xzy'], ['x0y', 'xAy']],
  ['§6 range: letter', 'x[A-Za-z]y', ['xAy', 'xzy'], ['x0y']],
  ['§6 range: hex', 'x[0-9A-F]y', ['x0y', 'xFy'], ['xGy', 'xfy']],
  ['§6 an escaped dash is a literal, not a range', 'x[a\\-z]y',
    ['xay', 'x-y', 'xzy'], ['xby', 'xmy']],
  ['§6 a leading dash is a literal', 'x[-9]y', ['x-y', 'x9y'], ['x0y']],

  // §7 used to be four sections of doubled backticks. A set beside an anchor now needs nothing at
  // all -- this is the whole of what replaced it.
  ['§7 set + start anchor', '`[123]bar', ['1bar4', '2bar5', '3bar6'], ['x1bar4', '11bar4']],
  ['§7 set + end anchor', 'bar[456]`', ['1bar4', 'bar5', 'xbar6'], ['bar7', 'bar4x']],
  ['§7 set + both anchors', '`[123]bar[456]`',
    ['1bar4', '1bar5', '1bar6', '2bar4', '3bar6'],
    ['x1bar4', '1bar4x', '11bar4', '1bar44']],

  ['§8 OR contains', 'apple|banana',
    ['apple', 'Banana Bread', 'green apple'], ['cherry']],

  ['§8 OR of start anchors', '`apple|`banana',
    ['apple pie', 'banana bread'], ['green apple', 'a banana']],

  ['§8 OR of end anchors', 'apple`|banana`',
    ['green apple', 'a banana'], ['apple pie', 'banana bread']],

  ['§9 literal asterisk', 'version\\*2', ['version*2'], ['version2', 'versionX2']],
  ['§9 literal pipe', 'foo\\|bar', ['foo|bar'], ['foo', 'bar']],
  ['§9 literal backtick', 'foo\\`bar', ['foo`bar'], ['foobar']],
  ['§9 literal backslash', 'foo\\\\bar', ['foo\\bar'], ['foobar']],
  ['§9 literal brackets', 'a\\[b\\]c', ['a[b]c', 'xa[b]cy'], ['abc', 'a[bc']],

  // **Steven, 2026-09-22: "\\ matches everything but should match anything with a backslash."**
  // It was read as an option prefix with an EMPTY option section, which stripped itself and left the
  // empty pattern. A lone `\` was right all along, so the two spellings disagreed and the wrong one
  // was the confident match-all.
  ['§9 a pattern that is only an escaped backslash', '\\\\',
    ['a\\b', 'C:\\Users', '\\'], ['ab', 'foo']],
  ['§9 a lone backslash reads the same way', '\\', ['a\\b'], ['ab']],
  ['§9 an escaped backslash opening a pattern', '\\\\foo',
    ['\\foo', 'x\\foo'], ['foo', 'dfoo']],

  ['§10 case-sensitive contains', '\\c\\apple', ['apple', 'green apple'], ['Apple', 'APPLE']],
  ['§10 case-sensitive start', '\\c\\`apple', ['apple pie'], ['Apple pie']],
  ['§10 case-sensitive end', '\\c\\apple`', ['green apple'], ['green Apple']],
  ['§10 an option prefix is still read when it is really there', '\\c\\`apple`', ['apple'], ['Apple']],
  ['§10 an escaped backslash is not an option prefix', '\\\\c\\\\',
    ['a\\c\\b'], ['ac', 'c', 'apple']],

  ['§14 unanchored is *foo*', 'foo', ['xfooy', 'foo'], ['fo o']],

  // **§15 as originally written is valid again.** It read `` `123`bar `` as a set followed by `bar`,
  // which the 2026-09-21 ruling had to refuse because a backtick could not open a set. In the
  // bracket spelling the original meaning is simply what it says.
  ['§15 unanchored set, restored', '[123]bar', ['1bar4', 'x2bar5'], ['xbar', 'bar']],

  // The 2026-09-21 rulings were about a backtick that had to serve as both anchor and set delimiter.
  // The spellings survive, re-spelt; what has gone is the mechanism that made them hard.
  ['ruling: anchor then set, no end anchor', '`in*[y]',
    ['inky', 'in-a-y', 'iny', 'inkyy'], ['in', 'inka', 'xinky']],
  ['ruling: the same with a set at the end of the scan', '`in*[t]',
    ['inst', 'int'], ['ins', 'xint']],

  // **Amendment 2026-09-22 -- `||` groups.** Steven: *"my thought is || becomes a parenthesis."*
  // A group is one token inside an alternative; the anchors belong to the alternative and so reach
  // every branch, which is the whole point of the change.
  ['group: under both anchors', '`||apple|pear||`',
    ['apple', 'pear', 'Apple'], ['apple pie', 'pineapple', 'pears']],

  ['group: after a wildcard', '*.||md|txt||',
    ['notes.txt', 'README.md'], ['notes.text', 'package.json']],

  ['group: shared prefix under a start anchor', '`||src|test||/',
    ['src/index.js', 'test/conformance.mjs'], ['x/src/a', 'srctest/']],

  ['group: holding a set, both anchors', '`IMG_04||2|3||[0-9]`',
    ['IMG_0421', 'IMG_0430'], ['IMG_0441', 'IMG_04212']],

  ['group: a set opens a branch', '||[12]x|zz||',
    ['1x', '2x', 'zz', 'a1x'], ['3x', 'x']],

  ['group: two groups multiply out', '||a|b||-||x|y||',
    ['a-x', 'b-y', 'zzb-xzz'], ['a-z', 'c-x']],

  // **Steven, 2026-09-22: "sets should always be case sensitive, yes?"** Yes. A literal still folds,
  // so one pattern shows both halves of the rule at once: the set refuses a lowercase D while the
  // literal `ocker` matches `OCKER`.
  ['a set is case-sensitive, a literal is not', '`[A-Z]ocker',
    ['Dockerfile', 'DOCKERFILE', 'Docker'], ['dockerfile', 'docker-compose.yml']],
  ['both cases are had by asking for both', 'x[A-Za-z]y',
    ['xAy', 'xay', 'xZy'], ['x0y']],
  ['\\c\\ governs literals only, so a digit set is unaffected by it', '\\c\\Foo[0-9]',
    ['Foo1'], ['foo1', 'Fooa']],

  // **Amendment 2026-09-22 (second) -- `\-\` negates and `\b\` bounds.**
  ['\\-\\ hides what the pattern finds', '\\-\\test',
    ['src/index.js', 'README.md'], ['test/a.mjs', 'my TEST file']],
  ['\\-\\ over alternatives is NOT (a OR b)', '\\-\\test|spec',
    ['src/index.js'], ['test/a.mjs', 'a.spec.ts']],
  ['\\-\\* hides everything, and says so on purpose', '\\-\\*',
    [], ['', 'anything']],

  // **Definition B**: a boundary is the edge of the label, or a neighbouring character that is not a
  // letter or a number. `_` therefore separates words, which regex's own `\b` gets wrong for labels.
  ['\\b\\ whole word', '\\b\\app',
    ['app', 'app-1', 'my app', 'app.md', 'app_data', 'an app.'], ['apple', 'snapple', 'MyAppCard']],
  ['\\b\\ leaves a camelCase hump alone, as definition B says', '\\b\\app',
    ['app/x'], ['MyAppCard.vue']],
  ['\\b\\ with a set', '\\b\\[0-9]', ['a-1', '1', 'x 2 y'], ['a1', '12']],
  ['\\b\\ with an anchor is just the anchor at that end', '\\b\\`app',
    ['app', 'app-1'], ['apple', 'my app']],
  ['\\b\\ and \\-\\ compose', '\\-b\\app',
    ['apple', 'snapple'], ['app', 'my app']],
];

/** Patterns that must be REFUSED rather than guessed at. `[why, pattern]` */
const ERRORS = [
  // **One rule now refuses all of these**: a backtick is an anchor, so it belongs at the very start
  // or the very end and nowhere else. Before sets moved to `[…]` each of them needed its own ruling
  // -- pairing from the left, the empty set, the set that could not open a pattern.
  ['a backtick in the body', 'a`b'],
  ['§15 in its old spelling, now that a backtick cannot open a set', '`123`bar'],
  ['the old set-opening spelling', 'foo`123`'],
  ['`123`` -- three ticks, two of them in the middle', '`123``'],
  ['`123`* -- a tick that is neither first nor last', '`123`*'],
  ['`1`` -- the shape Steven reported on 2026-09-22', '`1``'],

  ['an empty set', '[]'],
  ['a set opened and never closed', 'foo[123'],
  ['a closing bracket with nothing open', 'foo]bar'],

  ['`a|b` -- anchors do not wrap alternatives', '`a|b`'],
  ['`a|b|c` -- the same trap with three alternatives', '`a|b|c`'],
  ['an unclosed group', 'a||b'],
  ['groups do not nest -- the middle || closes, the last one is left open', '||a||b||'],
  ['three bars in a row are never a guess', 'a|||b'],
  ['an anchor cannot go inside a group', '||a`|b||'],
  ['a group whose branch is itself unreadable', '||a[b|c||'],

  // §10 keeps the option namespace open. Until a letter means something, dropping it silently would
  // answer a question the pattern did not ask -- and `\d\foo` has a second reading, the literal
  // `dfoo`, which makes guessing between them worse than refusing.
  ['an unknown option is refused, not ignored', '\\d\\foo'],
  ['an unknown option among known ones', '\\cz\\foo'],

  // Negation with nothing to negate matches nothing at all -- the confident empty, reached from the
  // other side, and the state `\-\…` passes through while it is being typed.
  ['negation with no pattern', '\\-\\'],
  ['negation over nothing but empty alternatives', '\\-\\|'],
  // **And negation must never invert a refusal.** The harness above asserts every refused pattern
  // still matches, which under `\-\` is the whole point: a typo that hid every row would be the
  // worst outcome this language can produce, reached from the one direction nobody watches.
  ['negation over an unreadable pattern', '\\-\\a`b'],
];

let failures = 0;
let checks = 0;

for (const [section, pattern, yes, no] of CASES) {
  let match;
  try {
    match = compileLabelFilter(pattern);
  } catch (e) {
    console.error(`  ${section}: pattern ${JSON.stringify(pattern)} threw — ${e.message}`);
    failures++;
    continue;
  }
  if (match.error) {
    console.error(`  ${section}: ${JSON.stringify(pattern)} was refused — ${match.error}`);
    failures++;
    continue;
  }
  for (const label of yes) {
    checks++;
    if (!match(label)) {
      console.error(`  ${section}: ${JSON.stringify(pattern)} should match ${JSON.stringify(label)}`);
      failures++;
    }
  }
  for (const label of no) {
    checks++;
    if (match(label)) {
      console.error(`  ${section}: ${JSON.stringify(pattern)} should NOT match ${JSON.stringify(label)}`);
      failures++;
    }
  }
}

for (const [why, pattern] of ERRORS) {
  checks++;
  const m = compileLabelFilter(pattern);
  if (!m.error) {
    console.error(`  ${why}: ${JSON.stringify(pattern)} should be REFUSED, not parsed`);
    failures++;
  }
  // A refused pattern must hide nothing — the caller shows the reason instead. This holds under
  // `\-\` too: negation never gets to invert the safe answer into hiding every row.
  checks++;
  if (!m('anything at all')) {
    console.error(`  ${why}: a refused pattern must not filter rows out`);
    failures++;
  }
}

// A pattern must never throw, whatever is typed — this runs on every keystroke.
for (const junk of ['`', '``', '\\', '\\\\', '|', '||', '`|`', '\\c\\', '[a-]', '[-z]', '*', '**',
  '|||', 'a||', '||||', '||a', '`||`', '||||||', '||\\|||', '[', ']', '[[]', '[]]', '\\-\\', '\\b\\',
  '\\-b\\', '\\-c\\[', '`[`', '[`]']) {
  checks++;
  try {
    compileLabelFilter(junk)('anything');
  } catch (e) {
    console.error(`  partial input ${JSON.stringify(junk)} threw — ${e.message}`);
    failures++;
  }
}

if (failures) {
  console.error(`label-filter-check FAILED: ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`ok — ${CASES.length} spec cases, ${checks} assertions, no pattern throws`);
