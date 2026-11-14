#!/bin/bash
# Disposable local PG + actual admin Vite UI + Hono admin routes for Chrome QA.
# Run via job_start and stop with SIGTERM; never authenticates against prod.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo A3_BROWSER_WRONG_ROOT; exit 2; }
PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl psql python3 curl lsof; do command -v "$bin" >/dev/null || { echo "A3_BROWSER_MISSING_$bin"; exit 2; }; done
for port in 3001 5174; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN | grep -q LISTEN; then echo "A3_BROWSER_PORT_OCCUPIED:$port"; exit 2; fi
done
DIR="$(mktemp -d /tmp/gafus-a3-admin-browser.XXXXXX)"
[[ "$DIR" == /tmp/gafus-a3-admin-browser.* && ! -L "$DIR" ]] || exit 2
pg_started=0; api_pid=''; vite_pid=''
cleanup() {
  code=$?; trap - EXIT
  if [[ -n "$vite_pid" ]]; then kill "$vite_pid" 2>/dev/null || true; wait "$vite_pid" 2>/dev/null || true; fi
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-a3-admin-browser.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
  exit "$code"
}
trap cleanup EXIT INT TERM
port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
initdb -D "$DIR/data" -A trust -U a3qa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/data" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $port -c timezone=UTC" -w start >/dev/null
pg_started=1
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL PGHOST PGPORT PGUSER PGDATABASE
export PGHOST=127.0.0.1 PGPORT="$port" PGUSER=a3qa PGDATABASE=postgres
export DATABASE_URL="postgresql://a3qa@127.0.0.1:$port/postgres"
export GAFUS_A3_ADMIN_DLQ_ISOLATED_QA=1 GAFUS_A3_ADMIN_DLQ_BROWSER_QA=1 NODE_ENV=test
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "Chat2OutboxEvent" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL,
  "messageId" TEXT, "eventType" VARCHAR(40) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedUntil" TIMESTAMP(3)
);
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/packages/prisma/migrations/20261107054000_chat2_outbox_lease_fencing_dlq/migration.sql" >/dev/null
(cd apps/api && exec node --import tsx src/test/a3-admin-dlq-browser-server.ts) > "$DIR/api.log" 2>&1 & api_pid=$!
(cd apps/admin-panel && exec node ./node_modules/vite/bin/vite.js --config vite.config.mjs --host 127.0.0.1 --port 5174) > "$DIR/vite.log" 2>&1 & vite_pid=$!
for i in $(seq 1 70); do
  if curl -fsS --max-time 1 http://127.0.0.1:3001/api/v1/auth/me >/dev/null 2>&1 &&
     curl -fsS --max-time 1 http://127.0.0.1:5174/media >/dev/null 2>&1; then
    echo "A3_ADMIN_BROWSER_READY_LOCAL_3001_5174"
    echo "A3_ADMIN_BROWSER_PID_API=$api_pid PID_VITE=$vite_pid"
    # Runtime and isolated PG stay alive until the parent job is terminated.
    wait "$api_pid"; exit $?
  fi
  if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$vite_pid" 2>/dev/null; then
    echo A3_BROWSER_SERVER_DIED; tail -22 "$DIR/api.log"; tail -22 "$DIR/vite.log"; exit 1
  fi
  sleep 0.25
done
echo A3_BROWSER_STARTUP_TIMEOUT; tail -22 "$DIR/api.log"; tail -22 "$DIR/vite.log"; exit 1
