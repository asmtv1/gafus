#!/bin/bash
# Isolated PostgreSQL 18 regression of Core ranked-feed read port and server SQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do
  command -v "$bin" >/dev/null || { echo "FEED_RANKED_QA_BIN_MISSING:$bin"; exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-feed-ranked-rows-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup() {
  if [ "$started" = "1" ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-feed-ranked-rows-pg.* ]] && [ ! -L "$DIR" ]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U feedrankedqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U feedrankedqa feed_test
export DATABASE_URL="postgresql://feedrankedqa@127.0.0.1:$PORT/feed_test?schema=public"
export FEED_TEST_DATABASE_URL="$DATABASE_URL"
export NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -65 "$DIR/schema.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
# The source file also contains unrelated legacy photo/HLS scenarios that no
# longer match V2 media schemas; this is intentionally the *ranked-read* gate.
pnpm --filter @gafus/core exec vitest run src/services/feed/feed.integration.test.ts --maxWorkers=1 \
  -t 'orders the full feed by newest, reactions or visible comments with paginated cursors|returns an author badge role only for administrator and trainer posts'
printf 'FEED_RANKED_PG_PASS: ranked owner visibility, cursor ordering, reactions and visible comments\n'
