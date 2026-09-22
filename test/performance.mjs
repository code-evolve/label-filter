/**
 * The budget this language actually has to live inside: **one keystroke, over a whole list.**
 *
 * This is a separate suite because it asserts something the other two cannot. A filter that is
 * correct and slow is still broken — measured 2026-09-22, before the matcher memoised failed
 * positions, `` *a*a*a*a*a*z `` against an 80-character label took **25 seconds for a single label**,
 * and that pattern is one a person could reasonably type. Nothing in the conformance suite noticed,
 * because every case in it was correct.
 *
 *   npm run test:performance
 *
 * Configuration comes from the environment with **no defaults**:
 *
 *   LABEL_FILTER_PERF_LABELS           how many labels stand in for the list being filtered
 *   LABEL_FILTER_PERF_BUDGET_US_LABEL  the ceiling per label, in microseconds
 *
 * The ceiling is **per label** rather than per run, because the list size is configurable and a
 * per-run ceiling would silently loosen as the list grew.
 *
 * The budgets are deliberately loose — this suite is here to catch a return to exponential
 * behaviour, not to police a few milliseconds. Every case prints its measurement, so a regression
 * that stays under the ceiling is still visible in the output.
 */
import { compileLabelFilter } from '../src/index.js';

function required(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    throw new Error(`${name} must be set — this suite takes no defaults, so a budget is never implicit`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

const LABELS = required('LABEL_FILTER_PERF_LABELS');
const BUDGET_US = required('LABEL_FILTER_PERF_BUDGET_US_LABEL');

/** A list shaped like the ones this filters: paths, dates, camel case, and a few long names. */
function makeLabels(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = i % 5;
    if (k === 0) out.push(`src/features/phase/components/PhaseCard${i}.vue`);
    else if (k === 1) out.push(`invoice-2026-${String((i % 12) + 1).padStart(2, '0')}-${i}.pdf`);
    else if (k === 2) out.push(`IMG_${String(i).padStart(4, '0')}.HEIC`);
    else if (k === 3) out.push(`${'a'.repeat(40 + (i % 60))}-${i}`);
    else out.push(`Notes ${i} — draft (v${i % 9}).md`);
  }
  return out;
}

const labels = makeLabels(LABELS);
let failures = 0;

/**
 * `[why, pattern, allowance]` — `allowance` multiplies the per-label ceiling, and **every value
 * above 1 is a measured cost this language accepts on purpose**, written down rather than absorbed
 * into one loose global number.
 *
 * The first four are the shapes that were exponential before the matcher memoised: a wildcard
 * followed by a literal that mostly matches, repeated, against long runs of the same character.
 * The rest are ordinary patterns, measured so an everyday regression shows up too.
 */
const CASES = [
  ['wildcards over a long repeated label', '*a*a*a*a*a*z', 1],
  ['more wildcards than anyone would type', '*a*a*a*a*a*a*a*a*a*a*z', 1],
  ['wildcards with a set between them', '*a*[a-c]*a*[a-c]*z', 1],
  ['wildcards under both anchors', '`*a*a*a*a*a*z`', 1],
  ['a group multiplied out', '||src|test|docs||/*.||vue|ts|js|md||', 1],
  // **The worst case the cap permits, and it is the cap's own cost.** Six groups of two is 64
  // alternatives, each scanned unanchored over labels up to 100 characters. Measured 2026-09-22 at
  // ~240µs/label — a 2000-row list is about half a second, which is over a keystroke. Nobody writes
  // this pattern, and the alternative was refusing groups a fifth this size; if a hard keystroke
  // guarantee on long lists is ever wanted, lower MAX_SEQUENCES rather than loosening this line.
  ['the largest group this language allows', `*${Array(6).fill('||a|b||').join('x')}`, 8],
  ['many alternatives', 'invoice*|receipt*|IMG_*|Notes*|src/*|test/*|docs/*|*.pdf', 1],
  ['an anchored exact match', '`src/features/phase/components/PhaseCard1.vue`', 1],
  ['the everyday case: one word', 'phase', 1],
  ['a set at the end', '[0-9]`', 1],
  ['case-sensitive with a set', '\\c\\`[A-Z]*[0-9]`', 1],
  // The two options added 2026-09-22. `\b\` filters start positions before the walk begins, so it
  // should cost less than the same pattern without one, never more; `\-\` is a single inversion
  // at the very end, and must not turn into per-label work.
  ['a bounded whole word', '\\b\\phase', 1],
  ['a bounded whole word, negated', '\\-b\\phase', 1],
];

console.log(`filtering ${labels.length} labels per pattern, ceiling ${BUDGET_US}µs per label\n`);

for (const [why, pattern, allowance] of CASES) {
  const match = compileLabelFilter(pattern);
  if (match.error) {
    console.error(`  ${why}: ${JSON.stringify(pattern)} was refused — ${match.error}`);
    failures++;
    continue;
  }
  // One warm pass, then the measured one: this measures steady-state filtering, which is what a
  // keystroke does, not first-call JIT.
  labels.filter(match);
  const started = performance.now();
  const hits = labels.filter(match).length;
  const ms = performance.now() - started;
  const perLabel = (ms * 1000) / labels.length;
  const ceiling = BUDGET_US * allowance;
  const note = allowance === 1 ? '' : `  (${allowance}× ceiling, declared)`;
  console.log(`  ${ms.toFixed(1).padStart(7)}ms  ${perLabel.toFixed(1).padStart(6)}µs/label  ${String(hits).padStart(5)} hits   ${why}${note}`);
  if (perLabel > ceiling) {
    console.error(`    OVER BUDGET: ${JSON.stringify(pattern)} took ${perLabel.toFixed(1)}µs/label against a ${ceiling}µs ceiling`);
    failures++;
  }
}

// **Compiling is not free either, and it happens on every keystroke.** A pattern is recompiled as
// each character arrives, so the parse has to be cheap on its own.
{
  const started = performance.now();
  for (let i = 0; i < 2000; i++) compileLabelFilter('||invoice|receipt||-2026-0[0-9]*.||pdf|md||');
  const ms = performance.now() - started;
  const each = (ms / 2000) * 1000;
  console.log(`\n  ${ms.toFixed(1)}ms to compile a group-and-set pattern 2000 times (${each.toFixed(1)}µs each)`);
  if (each > BUDGET_US) {
    console.error(`    OVER BUDGET: compiling took ${each.toFixed(1)}µs against a ${BUDGET_US}µs ceiling`);
    failures++;
  }
}

if (failures) {
  console.error(`\nlabel-filter performance FAILED: ${failures} case(s)`);
  process.exit(1);
}
console.log(`\nok — ${CASES.length} patterns filtered ${labels.length} labels each, all inside their declared ceiling`);
