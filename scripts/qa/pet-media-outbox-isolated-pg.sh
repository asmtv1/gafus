#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)";cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3;do command -v "$bin" >/dev/null || { echo "PET_MEDIA_QA_TOOL_MISSING:$bin";exit 2; };done
DIR="$(mktemp -d /tmp/gafus-pet-media-n-pg.XXXXXX)";umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
 if [ "$started" = 1 ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1||true;fi
 if [[ "$DIR" == /tmp/gafus-pet-media-n-pg.* ]] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qapetmedia --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT -c TimeZone=Pacific/Auckland" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qapetmedia gafus_refactor_pet_media_n
export DATABASE_URL="postgresql://qapetmedia@127.0.0.1:$PORT/gafus_refactor_pet_media_n?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_PET_MEDIA_N_REAL_PG=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -n 55 "$DIR/schema.log";exit 1; }
pnpm exec tsx scripts/qa/pet-media-outbox-isolated-pg.smoke.ts
