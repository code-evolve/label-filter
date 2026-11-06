<?php
/**
 * Runs the PHP implementation against conformance/cases.json — the same fixture the TypeScript,
 * Rust, Python and Go implementations run.
 *
 *   php php/tests/conformance.php
 *
 * **The fixture is RESOLVED, not assumed.** This file runs from two layouts: here, under `php/` in the
 * repository that holds all five implementations, and at the root of the PHP distribution repository
 * that Packagist reads, where `php/` IS the root. One hard-coded path would work in one of them and
 * read above the checkout in the other, so both candidates are named and a missing fixture is refused
 * by name rather than arriving as a null decode.
 */

declare(strict_types=1);

require __DIR__ . '/../src/LabelFilter.php';

use CodeEvolve\LabelFilter\LabelFilter;

$fixturePath = null;
foreach (['/../../conformance/cases.json', '/../conformance/cases.json'] as $candidate) {
    if (is_file(__DIR__ . $candidate)) { $fixturePath = __DIR__ . $candidate; break; }
}
if ($fixturePath === null) {
    fwrite(STDERR, "conformance/cases.json not found beside this checkout; looked in "
        . __DIR__ . "/../../conformance/ and " . __DIR__ . "/../conformance/\n");
    exit(1);
}

$fixture = json_decode(file_get_contents($fixturePath), true);
$failures = [];
$checks = 0;

foreach ($fixture['cases'] as $case) {
    $m = LabelFilter::compile($case['pattern']);
    if ($m->error !== null) {
        $failures[] = "{$case['section']}: '{$case['pattern']}' was refused — {$m->error}";
        continue;
    }
    foreach ($case['match'] as $label) {
        $checks++;
        if (!$m->matches($label)) {
            $failures[] = "{$case['section']}: '{$case['pattern']}' should match '{$label}'";
        }
    }
    foreach ($case['noMatch'] as $label) {
        $checks++;
        if ($m->matches($label)) {
            $failures[] = "{$case['section']}: '{$case['pattern']}' should NOT match '{$label}'";
        }
    }
}

foreach ($fixture['errors'] as $err) {
    $m = LabelFilter::compile($err['pattern']);
    $checks++;
    if ($m->error === null) {
        $failures[] = "{$err['why']}: '{$err['pattern']}' should be REFUSED, not parsed";
    }
    // A refused pattern must hide nothing — the caller shows the reason instead.
    $checks++;
    if (!$m->matches('anything at all')) {
        $failures[] = "{$err['why']}: a refused pattern must not filter rows out";
    }
}

// A pattern must never throw, whatever is typed — this runs on every keystroke.
foreach ($fixture['junk'] as $junk) {
    $checks++;
    try {
        LabelFilter::compile($junk)->matches('anything');
    } catch (\Throwable $e) {
        $failures[] = "partial input '{$junk}' threw — " . $e->getMessage();
    }
}

if ($failures) {
    foreach (array_slice($failures, 0, 25) as $f) { fwrite(STDERR, "  $f\n"); }
    fwrite(STDERR, 'label-filter conformance FAILED: ' . count($failures) . " of {$checks}\n");
    exit(1);
}
echo 'ok: ' . count($fixture['cases']) . " spec cases, {$checks} assertions, no pattern throws\n";
