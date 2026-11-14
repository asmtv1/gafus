#!/usr/bin/env bash
# Agent 3: reproducible, locally isolated media/outbox acceptance.
# No production, Cloud.ru real Jobs, or Beget live edge requests.
# Each child launches its own disposable local dependencies and cleans them up.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"
RUN_ID="${1:-a3-jobs-media-isolated}"
if [[ ! "$RUN_ID" =~ ^a3-jobs-[a-z0-9-]{1,24}$ ]]; then
  echo 'A3_MEDIA_INVALID_RUN_ID' >&2
  exit 2
fi
if [[ "$(git rev-parse --show-toplevel)" != "$ROOT" ]]; then
  echo 'A3_MEDIA_WRONG_REPO' >&2
  exit 2
fi
OUT="$HOME/Library/Logs/gafus-refactor-regression/$RUN_ID"
mkdir -p "$OUT"
SUMMARY="$OUT/results.tsv"
if [[ -e "$SUMMARY" ]]; then
  echo 'A3_MEDIA_RUN_ID_ALREADY_USED' >&2
  exit 2
fi
: > "$SUMMARY"
run_gate() {
  local name="$1"
  shift
  local log="$OUT/$name.log"
  printf 'START %s\n' "$name"
  if "$@" > "$log" 2>&1; then
    printf '%s\tPASS\n' "$name" >> "$SUMMARY"
    printf 'PASS %s\n' "$name"
    tail -n 2 "$log"
  else
    local rc=$?
    printf '%s\tFAIL exit=%s\n' "$name" "$rc" >> "$SUMMARY"
    printf 'FAIL %s exit=%s; log=%s\n' "$name" "$rc" "$log" >&2
    tail -n 30 "$log" >&2
    exit "$rc"
  fi
}
# Canonical-root-only safety guards on Chat2 and MinIO fixture are intentional.
run_gate chat2-http-websocket zsh scripts/qa/chat2-full-isolated-acceptance.sh
run_gate cdn-hono-minio zsh scripts/qa/cdn-full-isolated-actor-access.sh
run_gate chat2-360-recovery bash scripts/qa/chat2-media-recovery-isolated-pg.sh
run_gate media-deletion-outbox bash scripts/qa/media-deletion-outbox-isolated-pg.sh
run_gate media-cdn-purge bash scripts/qa/media-cdn-purge-isolated-pg.sh
run_gate account-cleanup bash scripts/qa/account-cleanup-snapshot-isolated-pg.sh
run_gate pet-media-outbox bash scripts/qa/pet-media-outbox-isolated-pg.sh
run_gate admin-dlq-real-pg bash scripts/qa/a3-admin-dlq-isolated-acceptance.sh
run_gate media-priority-burst bash scripts/qa/a3-media-priority-isolated.sh
run_gate admin-dlq-mounted pnpm --filter @gafus/admin-panel exec vitest run src/admin-live/ChatOutboxPanel.mounted.test.tsx --reporter=dot
for package in gallery-server gallery-storage feed-server media-server chat-server worker; do
  run_gate "unit-$package" pnpm --filter "@gafus/$package" test
done
printf 'A3_MEDIA_LOCAL_ISOLATED_PASS: %s gates, separate disposable PostgreSQL/Redis/MinIO processes; real Cloud.ru/Beget edge pending\n' "$(wc -l < "$SUMMARY" | tr -d ' ')"
cat "$SUMMARY"
