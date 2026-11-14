#!/bin/bash
# Real loopback disposable PG18+Redis burst; Cloud.ru/Beget never invoked.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo A3_PRIORITY_WRONG_ROOT; exit 2; }
PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl psql python3 redis-server redis-cli; do command -v "$bin" >/dev/null || { echo "A3_PRIORITY_MISSING_$bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-a3-priority.XXXXXX)"
[[ "$DIR" == /tmp/gafus-a3-priority.* && ! -L "$DIR" ]] || exit 2
pg_started=0
redis_pid=""
cleanup() {
  result=$?; trap - EXIT
  if [[ -n "$redis_pid" ]]; then kill "$redis_pid" 2>/dev/null || true; wait "$redis_pid" 2>/dev/null || true; fi
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-a3-priority.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
  exit "$result"
}
trap cleanup EXIT
ports="$(python3 - <<'PY'
import socket
s=[socket.socket() for _ in range(2)]
for sock in s:sock.bind(('127.0.0.1',0))
print(' '.join(str(sock.getsockname()[1]) for sock in s))
for sock in s:sock.close()
PY
)"
read -r pgport redisport <<< "$ports"
initdb -D "$DIR/data" -A trust -U a3qa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/data" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $pgport -c timezone=UTC" -w start >/dev/null
pg_started=1
redis-server --bind 127.0.0.1 --port "$redisport" --protected-mode yes --save '' --appendonly no --dir "$DIR" > "$DIR/redis.log" 2>&1 &
redis_pid=$!
for step in $(seq 1 50); do
  if redis-cli -h 127.0.0.1 -p "$redisport" ping 2>/dev/null | grep -q PONG; then break; fi
  if [[ "$step" == 50 ]]; then echo A3_PRIORITY_REDIS_NOT_READY; exit 1; fi
  sleep 0.1
done
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL PGHOST PGPORT PGUSER PGDATABASE REDIS_URL
export PGHOST=127.0.0.1 PGPORT="$pgport" PGUSER=a3qa PGDATABASE=postgres
export DATABASE_URL="postgresql://a3qa@127.0.0.1:$pgport/postgres"
export REDIS_URL="redis://127.0.0.1:$redisport"
export GAFUS_A3_PRIORITY_ISOLATED_QA=1 NODE_ENV=test OTEL_SDK_DISABLED=true
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
pnpm --filter @gafus/worker exec vitest run --config vitest.a3-priority-isolated.config.ts --reporter=dot
printf 'A3_PRIORITY_REAL_PG_REDIS_BURST_PASS\n'
