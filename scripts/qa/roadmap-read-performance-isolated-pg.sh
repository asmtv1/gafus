#!/usr/bin/env bash
# Synthetic projection benchmark, owned loopback PostgreSQL only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do
  command -v "$bin" >/dev/null || { echo "ROADMAP_READ_QA_MISSING_TOOL:$bin"; exit 2; }
done
umask 077
DIR="$(mktemp -d /tmp/gafus-roadmap-read-pg.XXXXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
  if [[ "$started" == 1 ]]; then pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1 || true; fi
  if [[ "$DIR" == /tmp/gafus-roadmap-read-pg.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qaread --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qaread gafus_roadmap_read_qa
unset DIRECT_URL SHADOW_DATABASE_URL REDIS_URL
export DATABASE_URL="postgresql://qaread@127.0.0.1:$PORT/gafus_roadmap_read_qa?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_DB_QUERY_METRICS=true
export GAFUS_ROADMAP_READ_PG_DIR="$DIR/pg" GAFUS_ROADMAP_READ_PG_PORT="$PORT"
# Projection benchmark only: no migration-dependent write/trigger claim.
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1) || { tail -60 "$DIR/schema.log"; exit 1; }
(cd apps/api && pnpm exec tsx scripts/qa/roadmap-read-performance.smoke.ts)
