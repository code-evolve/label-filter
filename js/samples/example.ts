/**
 * Run it:  node samples/example.mjs
 *
 * The sandbox (`npm run sandbox`) is the interactive version of this file. Both import the real
 * `src/index.js` rather than a copy, so what they show is what the package does.
 */
import { compileLabelFilter } from '../src/index.ts'

const labels = [
  'invoice-2026-01.pdf', 'invoice-2026-02.pdf', 'receipt-2026-01.pdf',
  'IMG_0421.HEIC', 'IMG_0422.HEIC', 'notes.txt', 'README.md',
  'src/index.js', 'test/conformance.mjs', '[WIP] roadmap.md',
  'app', 'apple', 'app_data',
]

const show = (pattern) => {
  const match = compileLabelFilter(pattern)
  if (match.error) {
    // An unreadable pattern matches EVERYTHING and carries the reason. Surface it; never present
    // the result as a filtered list.
    console.log(`${pattern.padEnd(28)} refused — ${match.error}`)
    return
  }
  console.log(`${pattern.padEnd(28)} ${labels.filter(match).join(', ')}`)
}

show('invoice')                       // contains, case-insensitive — the default
show('*.pdf')                         // a wildcard
show('`IMG_')                         // starts with
show('.md`')                          // ends with
show('invoice*|receipt*')             // either alternative
show('*.||md|txt||')                  // a group: the shared part written once
show('IMG_042[12]')                   // a set: exactly one character from it
show('`[A-Z]')                        // sets are always case-sensitive
show('\\b\\app')                      // whole word: app, app_data — not apple
show('\\-\\.pdf')                     // not: everything that is not a PDF
show('\\[WIP\\]')                     // a literal bracket, escaped
show('`a|b`')                         // refused, and it says why
