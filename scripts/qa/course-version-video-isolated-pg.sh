#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb psql python3;do
 command -v "$bin" >/dev/null || { echo "COURSE_VERSION_VIDEO_QA_TOOL_MISSING:$bin";exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-course-version-video-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
 if [ "$started" = 1 ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1||true;fi
 if [[ "$DIR" == /tmp/gafus-course-version-video-pg.* ]] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qacourse --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT -c TimeZone=Pacific/Auckland" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qacourse gafus_refactor_course_version_video
export DATABASE_URL="postgresql://qacourse@127.0.0.1:$PORT/gafus_refactor_course_version_video?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_COURSE_VIDEO_REAL_PG=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1)||{ tail -n 60 "$DIR/schema.log";exit 1; }
# Prisma db push does not install SQL triggers. Install the exact deployed
# production trigger function and trigger, without re-running the ADD COLUMN
# from the migration (db push already created Course.version).
python3 - "$DIR/version-trigger.sql" <<'PY'
from pathlib import Path
import sys
s=Path('packages/prisma/migrations/20261022153000_course_version_global_trigger/migration.sql').read_text()
start=s.index('CREATE FUNCTION "gafus_course_increment_version"()')
end=s.index('COMMIT;',start)
Path(sys.argv[1]).write_text(s[start:end])
PY
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U qacourse -d gafus_refactor_course_version_video -f "$DIR/version-trigger.sql" > "$DIR/trigger.log" 2>&1||{ tail -n 50 "$DIR/trigger.log";exit 1; }
pnpm exec tsx scripts/qa/course-version-video-isolated-pg.smoke.ts
