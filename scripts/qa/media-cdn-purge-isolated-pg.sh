#!/bin/bash
# Disposable real PostgreSQL, user and revision fixtures only; no production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl psql createdb python3; do
  command -v "$bin" >/dev/null || { echo "MEDIA_PURGE_QA_MISSING_TOOL"; exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-media-purge-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
  if [ "$started" = "1" ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true;fi
  if [[ "$DIR" == /tmp/gafus-media-purge-pg.* ]] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qacourse --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qacourse gafus_refactor_media_purge
export DATABASE_URL="postgresql://qacourse@127.0.0.1:$PORT/gafus_refactor_media_purge?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_MEDIA_PURGE_SQL_ISOLATED_TEST=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) ||
{ tail -60 "$DIR/schema.log";exit 1; }
(cd packages/worker && pnpm exec vitest run --config vitest.config.ts src/media-cdn-purge-worker.real-pg.test.ts --reporter=dot)
echo "MEDIA_CDN_PURGE_REAL_PG_PASS: two claims, durable checkpoint, stale lease, retry, confirmed fake ACK"
