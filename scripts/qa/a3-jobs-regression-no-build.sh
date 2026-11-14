#!/usr/bin/env bash
# Agent 3: current shared-tree source/test regression without a forced build.
# Full architecture-final-regression.sh MUST still run on a machine with disk reserve.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
RUN_ID="${1:-a3-jobs-no-build-nov12}"
[[ "$RUN_ID" =~ ^a3-jobs-[a-z0-9-]{1,24}$ ]] || { echo 'A3_NO_BUILD_BAD_RUN_ID' >&2; exit 2; }
OUT="$HOME/Library/Logs/gafus-refactor-regression/$RUN_ID"
mkdir -p "$OUT"
RESULTS="$OUT/results.tsv"
[[ ! -e "$RESULTS" ]] || { echo 'A3_NO_BUILD_EXISTING_RECEIPT' >&2; exit 2; }
printf 'build\tSKIP_LOW_DISK_NO_FORCED_COMPILE\n' > "$RESULTS"
failures=0
run_gate() {
  local name="$1" log free_kib status
  shift
  log="$OUT/$name.log"
  free_kib="$(df -k "$ROOT" | awk 'NR==2 { print $4 }')"
  # Emergency cut-off: never destroy the last 4 GiB with test caches/logs.
  if [[ "$free_kib" =~ ^[0-9]+$ ]] && (( free_kib < 4194304 )); then
    echo "A3_NO_BUILD_DISK_GUARD_STOP: free_kib=$free_kib" >&2
    printf '%s\tBLOCKED_LOW_DISK\n' "$name" >> "$RESULTS"
    exit 90
  fi
  printf 'START %s\n' "$name"
  if "$@" > "$log" 2>&1; then
    printf '%s\tPASS\n' "$name" >> "$RESULTS"
    echo "PASS $name"
  else
    status=$?
    printf '%s\tFAIL exit=%s\n' "$name" "$status" >> "$RESULTS"
    echo "FAIL $name exit=$status; log=$log" >&2
    tail -n 12 "$log" >&2
    failures=$((failures+1))
  fi
}
run_gate architecture pnpm check:core-boundaries
run_gate workspace-graph node scripts/check-workspace-graph.mjs
run_gate monitoring node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
run_gate runtime node --test ci-cd/scripts/release-graph.contract.test.mjs ci-cd/scripts/workspace-dependency-graph.contract.test.mjs
for pkg in core api worker trainer-ai-server course-progress-server identity-write-server media-server feed-server media-shared pets-server pets-shared questions-server questions-write-server questions-shared notifications-server consultation-server consultation-query-server consultation-shared subscription-finance-server subscription-payment-server subscription-shared consultation-write-server; do
  run_gate "test-$pkg" pnpm --filter "@gafus/$pkg" test
done
run_gate web node scripts/qa/web-vite-chunked-regression.mjs "--run-id=$RUN_ID"
for pkg in mobile trainer-panel admin-panel; do
  run_gate "test-$pkg" pnpm --filter "@gafus/$pkg" test
done
# Never invoke `pnpm typecheck` here: its Turbo graph builds packages even
# though the task is called typecheck. These direct checks are source-only.
for pkg in core api worker mobile trainer-panel admin-panel; do
  run_gate "type-$pkg" pnpm --filter "@gafus/$pkg" typecheck
done
run_gate whitespace git diff --check -- . ':!patches/react-native-compressor@1.16.0.patch'
printf 'A3_NO_BUILD_REGRESSION_GATES_DONE failures=%s; forced builds skipped for disk safety\n' "$failures"
cat "$RESULTS"
(( failures == 0 ))
