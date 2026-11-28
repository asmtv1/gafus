#!/usr/bin/env bash
# Fresh local database and Redis only. No existing services or accounts.
set -Eeuo pipefail
if [[ "${GAFUS_STAGE9_CLEAN_ENV:-}" != 1 ]]; then
  exec env -i HOME="$HOME" PATH="$PATH" GAFUS_STAGE9_CLEAN_ENV=1 bash "$0"
fi
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
export LC_ALL=C LANG=C TZ=UTC
for cmd in initdb pg_ctl createdb redis-server redis-cli python3 pnpm; do command -v "$cmd" >/dev/null; done
DIR="$(mktemp -d /tmp/gafus-offline-stage9.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
REDIS_PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
DB_NAME="$(python3 -c 'import secrets;print("stage9_offline_"+secrets.token_hex(6))')"
pg_started=0
redis_started=0
cleanup() {
  if [[ "$redis_started" == 1 && -f "$DIR/redis.pid" ]]; then kill "$(cat "$DIR/redis.pid")" 2>/dev/null || true; fi
  if [[ "$pg_started" == 1 || -f "$DIR/pg/postmaster.pid" ]]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-offline-stage9.* && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
initdb -D "$DIR/pg" -A trust -U qaoffline --no-instructions --no-sync >"$DIR/init.log" 2>&1 || { tail -50 "$DIR/init.log"; exit 1; }
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT -k $DIR -c shared_buffers=16MB -c max_connections=20" -w -t 120 start >/dev/null || { tail -60 "$DIR/pg.log"; exit 1; }
pg_started=1
createdb -h 127.0.0.1 -p "$PORT" -U qaoffline "$DB_NAME"
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --save '' --appendonly no --dir "$DIR" --daemonize yes --pidfile "$DIR/redis.pid" --logfile "$DIR/redis.log"
redis_started=1
redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping | grep -qx PONG
export DATABASE_URL="postgresql://qaoffline@127.0.0.1:$PORT/$DB_NAME?schema=public"
export REDIS_URL="redis://127.0.0.1:$REDIS_PORT" NODE_ENV=test
export GAFUS_STAGE9_DB="$DB_NAME" GAFUS_STAGE9_PORT="$PORT" GAFUS_STAGE9_DIR="$DIR"
unset DIRECT_URL SHADOW_DATABASE_URL
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1) || { tail -60 "$DIR/schema.log"; exit 1; }
echo "STAGE9_ISOLATED_DB=$DB_NAME PORT=$PORT REDIS_PORT=$REDIS_PORT"
(cd apps/api && pnpm exec vitest run --config vitest.stage9.realpg.config.ts --maxWorkers=1)
echo STAGE9_OFFLINE_REAL_PG_PASS
