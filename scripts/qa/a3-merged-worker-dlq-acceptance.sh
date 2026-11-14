#!/usr/bin/env bash
# Agent 3, merged-branch acceptance: Worker / Chat2 outbox / ADMIN DLQ only.
# No production, remote Cloud.ru, Beget, staging or personal browser access.
# Child integration tests use disposable loopback PostgreSQL/Redis and clean up.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
if [[ "$(git rev-parse --show-toplevel)" != "$ROOT" ]]; then
  echo 'A3_MERGED_WRONG_REPOSITORY' >&2; exit 2
fi
if [[ "${1:-}" == '--plan' ]]; then
  cat <<'PLAN'
Offline, destructive only to each test's disposable loopback resources:
01 core-prisma-boundary
02 worker-typecheck
03 worker-outbox-units (includes A2 tracing/metrics/retry contracts)
04 chat2-outbox-real-pg (lease/fencing/CAS)
05 chat2-outbox-multiprocess (broker ACK before DB commit)
06 bullmq-unknown-ack-real-redis
07 admin-dlq-api-contract
08 admin-dlq-real-hono-pg
09 admin-dlq-mounted-ui
10 media-priority-real-pg-redis
Run: bash scripts/qa/a3-merged-worker-dlq-acceptance.sh a3-merged-<unique-run-id>
Receipts: ~/Library/Logs/gafus-refactor-regression/<run-id>/{results.tsv,source.sha256,*.log}
No Chrome, Cloud.ru, Beget, production or shared database access.
PLAN
  exit 0
fi
RUN_ID="${1:-}"
if [[ ! "$RUN_ID" =~ ^a3-merged-[a-z0-9-]{1,24}$ ]]; then
  echo 'A3_MERGED_RUN_ID_REQUIRED: a3-merged-<unique-run-id>' >&2; exit 2
fi
for bin in git pnpm python3 psql pg_ctl initdb redis-server redis-cli; do
  if ! command -v "$bin" >/dev/null; then echo "A3_MERGED_MISSING_TOOL:$bin" >&2; exit 2; fi
done
# Do not inherit provider credentials or shared database URLs from a user shell.
# Fixture launchers explicitly override these with ephemeral test-local endpoints.
while IFS='=' read -r key _; do
  case "$key" in
    CLOUDRU_*|BEGET_*|AWS_*|S3_*|GAFUS_STAGING_*|GAFUS_STAGE_*|CENTRIFUGO_*|CHAT2_CENTRIFUGO_*)
      unset "$key" ;;
  esac
done < <(env)
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL REDIS_URL PGHOST PGPORT PGUSER PGDATABASE PGOPTIONS PGPASSWORD
unset CHAT2_PUBLIC_WS_URL CHAT2_CENTRIFUGO_HTTP_API JWT_SECRET JWT_REFRESH_SECRET
export DATABASE_URL='postgresql://a3qa@127.0.0.1:1/a3qa_no_shared_db'
export REDIS_URL='redis://127.0.0.1:1'
export NODE_ENV=test
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
OUT="$HOME/Library/Logs/gafus-refactor-regression/$RUN_ID"
if [[ -e "$OUT" ]]; then echo 'A3_MERGED_RUN_RECEIPT_EXISTS' >&2; exit 2; fi
mkdir -p "$OUT"
SUMMARY="$OUT/results.tsv"
: > "$SUMMARY"
{
  printf 'head=%s\n' "$(git rev-parse HEAD)"
  printf 'branch=%s\n' "$(git branch --show-current)"
  printf 'workingTreeChanges=%s\n' "$(git status --porcelain=v1 -uall | wc -l | tr -d ' ')"
  printf 'stagedPaths=%s\n' "$(git diff --cached --name-only | wc -l | tr -d ' ')"
  printf 'dateUTC=%s\n' "$(date -u +%FT%TZ)"
} > "$OUT/source.txt"
# Always fingerprint the actual merged candidate, never assume old A3 hashes.
shasum -a 256 \
  packages/worker/src/chat2-outbox-worker.ts \
  packages/worker/src/chat2-outbox-tracing.ts \
  packages/worker/src/chat2-outbox-metrics.ts \
  packages/worker/src/reliable-job-policy.ts \
  packages/worker/src/cloudru-trigger-error-policy.ts \
  packages/prisma/schema.prisma \
  packages/prisma/src/chat2OutboxDiagnostics.ts \
  apps/api/src/routes/v1/admin-media.ts \
  apps/admin-panel/src/admin-live/ChatOutboxPanel.tsx > "$OUT/source.sha256"
failures=0
run_gate() {
  local name="$1"; shift
  local log="$OUT/$name.log"
  printf 'START %s\n' "$name"
  if "$@" > "$log" 2>&1; then
    printf '%s\tPASS\n' "$name" >> "$SUMMARY"
    printf 'PASS %s\n' "$name"
  else
    local rc=$?
    printf '%s\tFAIL exit=%s\n' "$name" "$rc" >> "$SUMMARY"
    printf 'A3_MERGED_FAIL: %s, exit=%s, log=%s\n' "$name" "$rc" "$log" >&2
    tail -n 12 "$log" >&2
    failures=$((failures+1))
  fi
}
run_gate core-prisma-boundary pnpm check:core-boundaries
run_gate worker-typecheck pnpm --filter @gafus/worker typecheck
run_gate worker-outbox-units pnpm --filter @gafus/worker exec vitest run \
  src/cloudru-trigger-error-policy.test.ts \
  src/feed-processing-trigger-worker.test.ts \
  src/chat2-media-processing-trigger-worker.test.ts \
  src/chat2-outbox-metrics.test.ts \
  src/chat2-outbox-tracing.test.ts \
  src/chat2-outbox-reliability.test.ts \
  src/reliable-job-policy.test.ts --reporter=dot
run_gate chat2-outbox-real-pg bash scripts/qa/chat2-outbox-isolated-pg.sh
run_gate chat2-outbox-multiprocess bash scripts/qa/chat2-outbox-multiprocess-acceptance.sh
run_gate bullmq-unknown-ack-real-redis bash scripts/qa/cloudru-bullmq-ack-isolated.sh
run_gate admin-dlq-api-contract pnpm --filter @gafus/api exec vitest run \
  src/routes/v1/admin-media-dlq.test.ts --reporter=dot
run_gate admin-dlq-real-hono-pg bash scripts/qa/a3-admin-dlq-isolated-acceptance.sh
run_gate admin-dlq-mounted-ui pnpm --filter @gafus/admin-panel exec vitest run \
  src/admin-live/ChatOutboxPanel.mounted.test.tsx --reporter=dot
run_gate media-priority-real-pg-redis bash scripts/qa/a3-media-priority-isolated.sh
cat "$SUMMARY"
if (( failures == 0 )); then
  printf 'A3_MERGED_WORKER_DLQ_ACCEPTANCE_PASS 10/10; real external Cloud.ru/Beget/browser not tested\n'
else
  printf 'A3_MERGED_WORKER_DLQ_ACCEPTANCE_FAIL failed_gates=%s/10; see individual logs and integration owners\n' "$failures" >&2
  exit 1
fi
