#!/bin/bash
# Real Hono API + Prisma + disposable local PostgreSQL; no production resources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo A3_ADMIN_DLQ_WRONG_ROOT; exit 2; }
PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl psql python3; do command -v "$bin" >/dev/null || { echo "A3_ADMIN_DLQ_MISSING_$bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-a3-admin-dlq.XXXXXX)"
[[ "$DIR" == /tmp/gafus-a3-admin-dlq.* && ! -L "$DIR" ]] || exit 2
started=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$started" == 1 ]]; then pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-a3-admin-dlq.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
  exit "$result"
}
trap cleanup EXIT
port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
initdb -D "$DIR/data" -A trust -U a3qa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/data" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $port -c timezone=UTC" -w start >/dev/null
started=1
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL PGHOST PGPORT PGUSER PGDATABASE
export PGHOST=127.0.0.1 PGPORT="$port" PGUSER=a3qa PGDATABASE=postgres
export DATABASE_URL="postgresql://a3qa@127.0.0.1:$port/postgres"
export GAFUS_A3_ADMIN_DLQ_ISOLATED_QA=1 NODE_ENV=test
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
pnpm --filter @gafus/api exec vitest run --config vitest.a3-admin-dlq-isolated.config.ts --reporter=dot
printf 'A3_ADMIN_DLQ_REAL_PG_HONO_CAS_PASS\n'
