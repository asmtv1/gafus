#!/usr/bin/env bash
# Safe, real-process acceptance on throwaway loopback PostgreSQL/Redis only.
# Every child creates/destroys its own isolated resources; do NOT pass shared DB URLs.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
RUN_ID="${1:-architecture-20261111}"
if [[ ! "$RUN_ID" =~ ^[a-z][a-z0-9-]{0,40}$ ]]; then
  echo "Invalid run id" >&2; exit 2
fi
OUT="$HOME/Library/Logs/gafus-refactor-regression/$RUN_ID"
mkdir -p "$OUT"
SUMMARY="$OUT/chaos-results.tsv"
: > "$SUMMARY"
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL
run() {
  local name="$1"; local script="$2"; local log="$OUT/chaos-$name.log"
  printf 'START %s %s\n' "$name" "$(date -u +%FT%TZ)"
  if bash "$script" > "$log" 2>&1; then
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
echo "ALL ISOLATED ARCHITECTURE CHAOS GATES PASS"
cat "$SUMMARY"
