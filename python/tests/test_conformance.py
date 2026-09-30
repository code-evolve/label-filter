"""
Runs the Python implementation against ``conformance/cases.json`` — the same fixture the TypeScript,
Rust and Go implementations run.

    python3 -m unittest discover -s python/tests
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from label_filter import compile_label_filter  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "..", "..", "conformance", "cases.json")


class Conformance(unittest.TestCase):
    def test_conformance(self):
        with open(FIXTURE, encoding="utf-8") as f:
            fixture = json.load(f)

        failures = []
        checks = 0

        for case in fixture["cases"]:
            section, pattern = case["section"], case["pattern"]
            match = compile_label_filter(pattern)
            if match.error:
                failures.append(f"{section}: {pattern!r} was refused — {match.error}")
                continue
            for label in case["match"]:
                checks += 1
                if not match(label):
                    failures.append(f"{section}: {pattern!r} should match {label!r}")
            for label in case["noMatch"]:
                checks += 1
                if match(label):
                    failures.append(f"{section}: {pattern!r} should NOT match {label!r}")

        for err in fixture["errors"]:
            why, pattern = err["why"], err["pattern"]
            m = compile_label_filter(pattern)
            checks += 1
            if not m.error:
                failures.append(f"{why}: {pattern!r} should be REFUSED, not parsed")
            # A refused pattern must hide nothing — the caller shows the reason instead.
            checks += 1
            if not m("anything at all"):
                failures.append(f"{why}: a refused pattern must not filter rows out")

        # A pattern must never raise, whatever is typed — this runs on every keystroke.
        for junk in fixture["junk"]:
            checks += 1
            try:
                compile_label_filter(junk)("anything")
            except Exception as e:  # noqa: BLE001
                failures.append(f"partial input {junk!r} raised — {e}")

        if failures:
            self.fail(
                f"label-filter conformance FAILED: {len(failures)} of {checks}\n  "
                + "\n  ".join(failures[:25])
            )
        print(f"ok: {len(fixture['cases'])} spec cases, {checks} assertions, no pattern raises")


if __name__ == "__main__":
    unittest.main()
