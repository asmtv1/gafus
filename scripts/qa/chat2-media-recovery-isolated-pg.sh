#!/bin/bash
# Disposable PostgreSQL and real Prisma groupBy: NO production dependencies.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ "$PWD" = "$ROOT" ] || { echo "run from repo root"; exit 2; }
DIR="$(mktemp -d /tmp/gafus-archqa-media-recovery.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
cleanup() {
  if [ -f "$DIR/pg/postmaster.pid" ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  rm -rf -- "$DIR"
}
trap cleanup EXIT
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL
initdb -D "$DIR/pg" -A trust -U archqa --no-instructions > "$DIR/pg-init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
createdb -h 127.0.0.1 -p "$PORT" -U archqa archqa_chat2_media
export DATABASE_URL="postgresql://archqa@127.0.0.1:$PORT/archqa_chat2_media"
export NODE_ENV=test GAFUS_MEDIA_RECOVERY_ISOLATED_ACCEPTANCE=1
(cd packages/prisma && ./node_modules/.bin/prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || {
  echo "ISOLATED_SCHEMA_PUSH_FAILED"; tail -12 "$DIR/schema.log"; exit 1;
}
(cd packages/worker && ./node_modules/.bin/vitest run --config vitest.config.ts src/chat2-media-recovery.real-pg.archqa.test.ts --reporter=dot)
echo "PASS: real isolated PostgreSQL video recovery: stale 720-only, 360 complete, expired lease, retry bounds, active leases"
