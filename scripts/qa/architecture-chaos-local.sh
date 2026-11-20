#!/usr/bin/env bash
# Safe, real-process acceptance on throwaway loopback PostgreSQL/Redis only.
# Every child creates/destroys its own isolated resources; do NOT pass shared DB URLs.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
RUN_ID="${1:-architecture-20261111}"
if [[ ! "$RUN_ID" =~ ^[a-z][a-z0-9-]{0,40}$ ]]; then
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
SUMMARY="$OUT/chaos-results.tsv"
: > "$SUMMARY"
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL
run() {
  local name="$1"; local script="$2"; local log="$OUT/chaos-$name.log"
  printf 'START %s %s\n' "$name" "$(date -u +%FT%TZ)"
  if bash "$script" > "$log" 2>&1; then
    # Exit 0 is not evidence that the training test ran: an unset empty
    # array once caused Bash 3.2 to return 0 after aborting expansion.
    if [[ "$name" == training-atomic-pg ]] &&
       { ! grep -Fq 'trainingAtomic.realpg.test.ts' "$log" ||
         ! grep -Fq 'TRAINING_ATOMIC_REAL_PG_RUN_PASS' "$log"; }; then
      printf '%s\tFAIL missing-atomic-test-evidence\n' "$name" >> "$SUMMARY"
      echo "FAIL $name: Vitest receipt missing despite exit 0" >&2
      exit 2
    fi
    printf '%s\tPASS\n' "$name" >> "$SUMMARY"
    echo "PASS $name"
    tail -n 6 "$log"
  else
    local status=$?
    printf '%s\tFAIL exit=%s\n' "$name" "$status" >> "$SUMMARY"
    echo "FAIL $name exit $status; $log" >&2
    tail -n 75 "$log" >&2
    exit "$status"
  fi
}
run outbox-pg scripts/qa/chat2-outbox-isolated-pg.sh
run outbox-multiprocess scripts/qa/chat2-outbox-multiprocess-acceptance.sh
run cloudru-bullmq-synthetic scripts/qa/cloudru-bullmq-ack-isolated.sh
run phase-f-pg scripts/qa/architecture-phase-f-isolated-pg.sh
run backup-restore-pg scripts/qa/database-backup-restore-isolated-pg.sh
run training-atomic-pg scripts/qa/training-atomic-isolated-pg.sh
run subscription-payment-pg scripts/qa/payment-archqa-isolated-pg.sh
run ota-version-publication-pg scripts/qa/ota-version-publication-isolated-pg.sh
run feed-chronological-parity-pg scripts/qa/feed-chronological-isolated-pg.sh
run chat2-send-idempotency-pg scripts/qa/chat2-send-isolated-pg.sh
echo "ALL ISOLATED ARCHITECTURE CHAOS GATES PASS"
cat "$SUMMARY"
