#!/bin/bash
# Isolated PostgreSQL 18 regression of Feed persistence: posts, moderation, media, wallet rewards and ranked reads.
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
# Run all 19 integration scenarios by default, including V2 media and real
# same-transaction GAFUS wallet adapter. A regex override supports focused QA.
TEST_PATTERN="${FEED_RANKED_TEST_PATTERN:-.*}"
pnpm --filter @gafus/core exec vitest run src/services/feed/feed.integration.test.ts --maxWorkers=1 \
  -t "$TEST_PATTERN"
printf 'FEED_RANKED_PG_PASS: ranked owner visibility, cursor ordering, reactions and visible comments\n'
