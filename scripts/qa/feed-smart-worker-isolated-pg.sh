#!/bin/bash
# Disposable PostgreSQL 18 with the real Smart Feed SQL acceptance program.
# Run compiled Worker CLI: tsx's test resolver can shadow ESM package exports.
# The CLI deliberately rolls back its entire synthetic transaction.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for tool in initdb pg_ctl createdb psql python3; do command -v "$tool" >/dev/null || { echo "SMART_SQL_QA_TOOL_MISSING:$tool"; exit 2; }; done
compiled=packages/worker/dist/worker/tools/smart-feed-sql-smoke.js
[ -f "$compiled" ] || { echo 'SMART_SQL_QA_COMPILED_WORKER_MISSING: rebuild @gafus/worker'; exit 2; }
DIR="$(mktemp -d /tmp/gafus-smart-worker-pg.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup() {
  if [ "$started" = 1 ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-smart-worker-pg.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
umask 077
initdb -D "$DIR/pg" -A trust -U smartworkerqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U smartworkerqa gafus_smart_test
export DATABASE_URL="postgresql://smartworkerqa@127.0.0.1:$PORT/gafus_smart_test?schema=public"
export FEED_SMART_TEST_DATABASE_URL="$DATABASE_URL" FEED_SMART_TEST_CONFIRM=YES NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -65 "$DIR/schema.log"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U smartworkerqa -d gafus_smart_test -f packages/prisma/scripts/fresh-db-extras.sql > "$DIR/extras.log" 2>&1 || { tail -65 "$DIR/extras.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
node "$compiled"
echo SMART_FEED_COMPILED_WORKER_REAL_PG_PASS_transaction_rollback_and_owner_filtered_ranking
