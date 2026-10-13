#!/usr/bin/env bash
# Run every implementation against conformance/cases.json.
#
# **This is the thing that makes five implementations one language.** Each suite reads the same
# fixture and prints the same line; if one of them drifts, it says so here rather than in a consumer.
#
#   conformance/run-all.sh
set -u
cd "$(dirname "$0")/.."

declare -a NAMES=() RESULTS=()

# **"Could not run" is a third verdict, not a failure.** A missing toolchain made the suite's pipeline
# exit non-zero, which was recorded as FAILED and was indistinguishable from a real disagreement. A
# generated page then told readers that Rust and Go were broken, on a machine where cargo and go were
# simply not on PATH. Caught by Code-Evolve Website on 2026-10-02, before it published.
#
# So the toolchain is probed first, and its absence is reported as SKIPPED with the reason. Three
# states, three names: ok, FAILED, SKIPPED.
run() {
  local name="$1" tool="$2"; shift 2
  if ! command -v "$tool" >/dev/null 2>&1; then
    NAMES+=("$name"); RESULTS+=("SKIPPED ($tool is not on PATH)")
    return
  fi
  local out
  if out=$("$@" 2>&1); then
    local line
    line=$(echo "$out" | grep -E '^ok:' | tail -1)
    # A suite that exits 0 and prints no ok: line has not passed; it has told us nothing.
    if [ -z "$line" ]; then
      NAMES+=("$name"); RESULTS+=("SKIPPED (ran but printed no result)")
    else
      NAMES+=("$name"); RESULTS+=("$line")
    fi
  else
    NAMES+=("$name"); RESULTS+=("FAILED
$out")
  fi
}

run "TypeScript" node   node js/test/conformance.ts
run "Rust      " cargo  bash -c 'cd rust && cargo test --quiet -- --nocapture 2>&1 | grep "^ok:"'
run "Python    " python3 python3 python/tests/test_conformance.py
run "Go        " go     bash -c 'cd go && go test -v ./... 2>&1 | sed -n "s/.*: \(ok:.*\)/\1/p"'
run "PHP       " php    php php/tests/conformance.php

status=0
skipped=0
echo
for i in "${!NAMES[@]}"; do
  line="${RESULTS[$i]}"
  printf '  %s  %s\n' "${NAMES[$i]}" "$line"
  case "$line" in
    FAILED*)  status=1 ;;
    SKIPPED*) skipped=1 ;;
    '')       status=1 ;;
  esac
done
echo
# **Disagreement and absence exit differently**, so a caller can tell them apart without parsing prose.
# 1 means an implementation disagrees with the fixture. 3 means one could not be asked.
if [ "$status" -ne 0 ]; then
  echo "at least one implementation disagrees with conformance/cases.json"
  exit 1
fi
if [ "$skipped" -ne 0 ]; then
  echo "NOT a verdict: at least one implementation could not be run, so this says nothing about it"
  exit 3
fi
echo "all implementations agree with conformance/cases.json"
