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
run() {
  local name="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    NAMES+=("$name"); RESULTS+=("$(echo "$out" | grep -E '^ok:' | tail -1)")
  else
    NAMES+=("$name"); RESULTS+=("FAILED
$out")
  fi
}

run "TypeScript" node js/test/conformance.ts
run "Rust      " bash -c 'cd rust && cargo test --quiet -- --nocapture 2>&1 | grep "^ok:"'
run "Python    " python3 python/tests/test_conformance.py
run "Go        " bash -c 'cd go && go test -v ./... 2>&1 | sed -n "s/.*: \(ok:.*\)/\1/p"'
run "PHP       " php php/tests/conformance.php

status=0
echo
for i in "${!NAMES[@]}"; do
  line="${RESULTS[$i]}"
  printf '  %s  %s\n' "${NAMES[$i]}" "$line"
  case "$line" in FAILED*) status=1 ;; '') status=1 ;; esac
done
echo
if [ "$status" -ne 0 ]; then
  echo "at least one implementation disagrees with conformance/cases.json"
  exit 1
fi
echo "all implementations agree with conformance/cases.json"
