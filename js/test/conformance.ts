/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * Runs the JavaScript implementation against `conformance/cases.json`.
 *
 * **The fixture is shared and this file is one of its four runners.** Every case in it is lifted from
 * a numbered section of `docs/syntax.md`, and every implementation — TypeScript, Rust, Python, Go —
 * runs the same JSON. A port cannot drift from the language by accident; it can only fail this suite.
 *
 * The cases used to live here as TypeScript tables. They moved out on 2026-09-23, when the second
 * implementation made "the spec is the test suite" a claim that had to hold across languages rather
 * than inside one.
 *
 *   npm run test:conformance
 */
import { readFileSync } from 'node:fs';
import { compileLabelFilter } from '../src/index.ts';

interface Fixture {
  cases: Array<{ section: string; pattern: string; match: string[]; noMatch: string[] }>;
  errors: Array<{ why: string; pattern: string }>;
  junk: string[];
}

const fixture: Fixture = JSON.parse(
  readFileSync(new URL('../../conformance/cases.json', import.meta.url), 'utf8'),
);

let failures = 0;
let checks = 0;

for (const { section, pattern, match: yes, noMatch: no } of fixture.cases) {
  let match;
  try {
    match = compileLabelFilter(pattern);
  } catch (e) {
    console.error(`  ${section}: pattern ${JSON.stringify(pattern)} threw — ${(e as Error).message}`);
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

for (const { why, pattern } of fixture.errors) {
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
for (const junk of fixture.junk) {
  checks++;
  try {
    compileLabelFilter(junk)('anything');
  } catch (e) {
    console.error(`  partial input ${JSON.stringify(junk)} threw — ${(e as Error).message}`);
    failures++;
  }
}

if (failures) {
  console.error(`label-filter-check FAILED: ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`ok: ${fixture.cases.length} spec cases, ${checks} assertions, no pattern throws`);
