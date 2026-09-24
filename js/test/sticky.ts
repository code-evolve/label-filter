/*
Copyright 2026 Steven Spungin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * The no-flicker filter box policy — `src/sticky.ts`.
 *
 * Not part of `conformance/cases.json`: that fixture defines what a pattern means, in five languages.
 * This is what a text box does between two meanings, so it is tested here and nowhere else.
 *
 *   npm run test:sticky
 */
import { createStickyFilter } from '../src/sticky.ts';

let failures = 0;
let checks = 0;
const check = (ok: boolean, what: string) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  ${what}`);
  }
};

const LABELS = ['app', 'apple', 'app_data', 'IMG_0421.HEIC', 'notes.txt'];
const hits = (m: (l: string) => boolean) => LABELS.filter(m).join(',');

{
  // **The keystroke path is the whole point**: typing `[0-9]` passes through four unreadable states,
  // and the list must not flash its full contents at any of them.
  const filter = createStickyFilter();
  filter.update('app');
  const settled = hits(filter.current().match);
  check(settled === 'app,apple,app_data', `a readable pattern filters: got ${settled}`);

  const typing = ['app[', 'app[0', 'app[0-', 'app[0-9'];
  for (const partial of typing) {
    const s = filter.update(partial);
    check(s.error !== null, `${JSON.stringify(partial)} should be unreadable`);
    check(s.stale, `${JSON.stringify(partial)} should be marked stale`);
    check(hits(s.match) === settled, `${JSON.stringify(partial)} must keep the previous result`);
    check(!filter.canAct(), `${JSON.stringify(partial)} must not be acted on`);
  }

  const done = filter.update('app[0-9]');
  check(done.error === null && !done.stale, 'the completed pattern is fresh again');
  check(hits(done.match) === '', 'app[0-9] matches none of these labels');
  check(filter.canAct(), 'a readable, fresh pattern may be acted on');
}

{
  // Before anything has been readable there is nothing to hold, and the language's own answer is the
  // only honest one: keep every row.
  const filter = createStickyFilter();
  const first = filter.update('`');
  check(first.error === null || first.stale === false, 'no previous answer means nothing is stale');
  check(hits(filter.update('a`b').match) === LABELS.join(','), 'with no previous answer, keep every row');
  check(!filter.canAct(), 'an unreadable pattern is never actionable');
}

{
  // `reset()` is for when the list changes underneath the box, not when the pattern does.
  const filter = createStickyFilter();
  filter.update('app');
  filter.update('app[');
  check(filter.current().stale, 'stale before reset');
  filter.reset();
  check(!filter.current().stale && filter.current().error === null, 'reset clears the held answer');
  check(hits(filter.current().match) === LABELS.join(','), 'reset keeps every row');
}

if (failures) {
  console.error(`sticky filter FAILED: ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`ok: ${checks} sticky-filter assertions, no flicker`);
