#!/bin/bash
# Disposable PostgreSQL 18 and exact synthetic DB on 127.0.0.1; never remote.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do command -v "$bin" >/dev/null || { echo "REWARDED_ACCESS_PG_TOOL_MISSING:$bin"; exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-rewarded-reads-pg.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
 if [ "$started" = 1 ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
 if [[ "$DIR" == /tmp/gafus-rewarded-reads-pg.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
umask 077
initdb -D "$DIR/pg" -A trust -U rewardedqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U rewardedqa gafus_rewarded_reads_qa
export DATABASE_URL="postgresql://rewardedqa@127.0.0.1:$PORT/gafus_rewarded_reads_qa?schema=public"
export GAFUS_REWARDED_ACCESS_REAL_PG=enabled NODE_ENV=test
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -65 "$DIR/schema.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
pnpm --filter @gafus/entitlements-server exec vitest run src/rewardedAccessReads.realpg.test.ts --maxWorkers=1
echo REWARDED_ACCESS_READS_REAL_PG_PASS: exact owner course physical step private ACL daily publication grant expiry notification isolation
