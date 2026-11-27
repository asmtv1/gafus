#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
export LC_ALL=C LANG=C
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do command -v "$bin" >/dev/null || { echo "FEED_QA_TOOL_MISSING $bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-feed-parity-pg.XXXXXX)"; umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
DB_NAME="$(python3 -c 'import secrets;print("feed_parity_"+secrets.token_hex(6))')"
started=0
cleanup(){ if [[ "$started" == 1 ]]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi; if [[ "$DIR" == /tmp/gafus-feed-parity-pg.* && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi; }
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qafeed --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT -k $DIR -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all" -w start >/dev/null || { cat "$DIR/server.log" >&2; exit 1; }
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qafeed "$DB_NAME"
unset DIRECT_URL SHADOW_DATABASE_URL
export DATABASE_URL="postgresql://qafeed@127.0.0.1:$PORT/$DB_NAME?schema=public"
export GAFUS_FEED_QA=1 GAFUS_FEED_QA_DB_NAME="$DB_NAME" NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1) || { tail -55 "$DIR/schema.log"; exit 1; }
report_path="${GAFUS_TEST_REPORT_PATH:-}"
if [[ -n "$report_path" ]]; then
  [[ "$report_path" == /* ]] || { echo 'Report path must be absolute'; exit 2; }
  pnpm --filter @gafus/feed-server exec vitest run --config vitest.realpg.config.ts --reporter=json --outputFile="$report_path"
else
  pnpm --filter @gafus/feed-server exec vitest run --config vitest.realpg.config.ts
fi
