#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)";cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3;do command -v "$bin" >/dev/null || { echo "VET_VISIT_QA_TOOL_MISSING:$bin";exit 2; };done
DIR="$(mktemp -d /tmp/gafus-vet-visit-o-pg.XXXXXX)";umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
 if [ "$started" = 1 ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1||true;fi
 if [[ "$DIR" == /tmp/gafus-vet-visit-o-pg.* ]] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qavet --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT -c TimeZone=Pacific/Auckland" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qavet gafus_vet_visits_test
export DATABASE_URL="postgresql://qavet@127.0.0.1:$PORT/gafus_vet_visits_test?schema=public"
export VET_VISIT_TEST_DATABASE_URL="$DATABASE_URL"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_VET_VISIT_REAL_PG=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -n 55 "$DIR/schema.log";exit 1; }
# The existing integration suite is explicitly gated by VET_VISIT_TEST_DATABASE_URL;
# ensure it truly runs and no test-only default skip can mask a regression.
pnpm --filter @gafus/core exec vitest run src/services/pets/petVetVisit.integration.test.ts --maxWorkers=1
pnpm exec tsx scripts/qa/vet-visit-detail-port-real-pg.smoke.ts
