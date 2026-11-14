#!/bin/bash
# One-shot end-to-end real Chrome via existing McpGo MCP proxy; disposable PG/Hono/Vite.
# No new browser profile or Chromium. Never reaches production/staging.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo A3_BROWSER_QA_WRONG_ROOT; exit 2; }
RUN_ID="${1:-a3-jobs-dlq-browser-nov12}"
[[ "$RUN_ID" =~ ^a3-jobs-[a-z0-9-]{1,28}$ ]] || { echo A3_BROWSER_QA_BAD_ID; exit 2; }
OUT="$HOME/Library/Logs/gafus-refactor-regression/$RUN_ID"
mkdir -p "$OUT"
[[ ! -e "$OUT/browser-results.log" ]] || { echo A3_BROWSER_QA_ALREADY_RECORDED; exit 2; }
stack_pid=''
cleanup() {
  result=$?;trap - EXIT
  if [[ -n "$stack_pid" ]]; then kill "$stack_pid" 2>/dev/null || true; wait "$stack_pid" 2>/dev/null || true; fi
  # Must not leave a synthetic auth-bypass Hono or Vite server listening.
  for step in 1 2 3 4 5 6 7 8 9 10; do
    if ! lsof -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN &&
       ! lsof -nP -iTCP:5174 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then break; fi
    sleep 0.2
  done
  if lsof -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN ||
     lsof -nP -iTCP:5174 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo A3_BROWSER_QA_CLEANUP_PORTS_OPEN >&2
    result=1
  else
    echo A3_BROWSER_QA_LOCAL_PORTS_CLOSED
  fi
  exit "$result"
}
trap cleanup EXIT
bash scripts/qa/a3-admin-dlq-browser-isolated.sh > "$OUT/browser-servers.log" 2>&1 &
stack_pid=$!
ready=0
for step in $(seq 1 75); do
  if curl -fsS --max-time 1 http://127.0.0.1:3001/api/v1/auth/me >/dev/null 2>&1 &&
     curl -fsS --max-time 1 http://127.0.0.1:5174/media >/dev/null 2>&1; then ready=1;break;fi
  if ! kill -0 "$stack_pid" 2>/dev/null; then echo A3_BROWSER_QA_START_FAILED;tail -18 "$OUT/browser-servers.log";exit 1;fi
  sleep 0.25
done
[[ "$ready" == 1 ]] || { echo A3_BROWSER_QA_START_TIMEOUT;tail -18 "$OUT/browser-servers.log";exit 1; }
node scripts/qa/a3-admin-dlq-browser-check.mjs | tee "$OUT/browser-results.log"
grep -q 'A3_CHROME_QA_TAB_CLOSED_PASS' "$OUT/browser-results.log" || { echo A3_BROWSER_QA_CLOSE_UNCONFIRMED; exit 1; }
echo A3_BROWSER_REAL_CHROME_HONO_PG_ACCEPTANCE_PASS
