#!/bin/bash
# Disposable PostgreSQL and exact isolated test database. No remote access.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do command -v "$bin" >/dev/null || { echo "SMART_FEED_PG_TOOL_MISSING:$bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-smart-stats-pg.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
 if [ "$started" = 1 ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
 if [[ "$DIR" == /tmp/gafus-smart-stats-pg.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
umask 077
initdb -D "$DIR/pg" -A trust -U qasmartfeed --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qasmartfeed gafus_smart_stats_qa
export DATABASE_URL="postgresql://qasmartfeed@127.0.0.1:$PORT/gafus_smart_stats_qa?schema=public"
export GAFUS_SMART_FEED_REAL_PG=enabled NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -50 "$DIR/schema.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
pnpm --filter @gafus/feed-server exec vitest run src/smartStats.realpg.test.ts --maxWorkers=1
printf 'SMART_FEED_POSTGRES_SQL_PASS: bounded ids, aggregate freshness, self-reaction exclusion, hidden comments and injection-safe query\n'
