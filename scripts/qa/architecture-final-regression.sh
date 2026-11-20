#!/usr/bin/env bash
# Repeatable, offline-safe local validation. No production, cloud execution or mutations.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
RUN_ID="${1:-architecture-20261111}"
# Keep the same limit as web-vite-chunked-regression.mjs: 33 characters.
# Reject incompatible IDs before spending minutes on build/API tests.
if [[ ! "$RUN_ID" =~ ^[a-z][a-z0-9-]{0,32}$ ]]; then
  echo "Invalid run id" >&2; exit 2
fi
OUT_ROOT="$HOME/Library/Logs/gafus-refactor-regression"
if [[ -n "${GAFUS_LEGACY_QA_OUTPUT_ROOT:-}" ]]; then
  case "$GAFUS_LEGACY_QA_OUTPUT_ROOT" in
    "$PWD"/.qa/testing/*/legacy) OUT_ROOT="$GAFUS_LEGACY_QA_OUTPUT_ROOT" ;;
    *) echo "Invalid test-system legacy output directory" >&2; exit 2 ;;
  esac
fi
OUT="$OUT_ROOT/$RUN_ID"
mkdir -p "$OUT"
summary="$OUT/results.tsv"
: > "$summary"
run_gate() {
  local label="$1"; shift
  local log="$OUT/$label.log"
  printf 'START %s %s\n' "$label" "$(date -u +%FT%TZ)"
  if "$@" > "$log" 2>&1; then
    printf '%s\tPASS\n' "$label" >> "$summary"
    printf 'PASS %s\n' "$label"
    tail -n 3 "$log"
  else
    local status=$?
    printf '%s\tFAIL exit=%s\n' "$label" "$status" >> "$summary"
    echo "FAILED $label exit $status, log $log" >&2
    tail -n 90 "$log" >&2
    exit "$status"
  fi
}
run_gate architecture pnpm check:core-boundaries
run_gate workspace-graph node scripts/check-workspace-graph.mjs
run_gate monitoring node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
run_gate build pnpm exec turbo run build --filter=@gafus/api... --filter=@gafus/worker... --filter=@gafus/web-vite... --force
run_gate runtime node --test ci-cd/scripts/release-graph.contract.test.mjs ci-cd/scripts/workspace-dependency-graph.contract.test.mjs
for pkg in core api worker trainer-ai-server course-progress-server identity-write-server media-server feed-server media-shared pets-server pets-shared questions-server questions-write-server questions-shared notifications-server consultation-server consultation-query-server consultation-shared subscription-finance-server subscription-payment-server subscription-shared consultation-write-server; do
  run_gate "test-$pkg" pnpm --filter "@gafus/$pkg" test
done
run_gate web node scripts/qa/web-vite-chunked-regression.mjs "--run-id=$RUN_ID"
for pkg in mobile trainer-panel admin-panel; do
  run_gate "test-$pkg" pnpm --filter "@gafus/$pkg" test
done
run_gate types pnpm typecheck
# The pre-existing native compressor patch contains intentional whitespace
# in a patch hunk. Do not rewrite that unrelated release artifact here.
run_gate whitespace git diff --check -- . ':!patches/react-native-compressor@1.16.0.patch'
echo "ALL ARCHITECTURE LOCAL REGRESSION GATES PASS"
cat "$summary"
