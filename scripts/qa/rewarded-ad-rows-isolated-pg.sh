#!/bin/bash
# Private disposable localhost PG18. No existing Postgres instance or remote host.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do
  command -v "$bin" >/dev/null || { echo "REWARDED_AD_ROWS_QA_BIN_MISSING:$bin"; exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-rewarded-ad-rows-pg.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
  if [ "$started" = 1 ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-rewarded-ad-rows-pg.* && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
umask 077
initdb -D "$DIR/pg" -A trust -U rewardedadqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U rewardedadqa gafus_rewarded_ad_rows_qa
export DATABASE_URL="postgresql://rewardedadqa@127.0.0.1:$PORT/gafus_rewarded_ad_rows_qa?schema=public"
export GAFUS_REWARDED_AD_ROWS_REAL_PG=enabled NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -65 "$DIR/schema.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
pnpm --filter @gafus/gafus-server exec vitest run src/rewardedAdRows.realpg.test.ts --maxWorkers=1
printf 'REWARDED_AD_ROWS_REAL_PG_PASS: owner isolation, callback replay, entitlement grant and rollback\n'
