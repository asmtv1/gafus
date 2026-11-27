#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if [[ "${ROADMAP_BASELINE_CLEAN_ENV:-}" != 1 ]]; then
  exec env -i HOME="$HOME" PATH="$PATH" ROADMAP_BASELINE_CLEAN_ENV=1 bash "$0" "$@"
fi
export LC_ALL=C LANG=C TZ=UTC PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
REPORT="${1:?absolute output JSON path required}"
[[ "$REPORT" == /* && ! -e "$REPORT" ]] || exit 2
for b in initdb pg_ctl createdb psql python3 pnpm; do command -v "$b" >/dev/null; done
umask 077
DIR="$(mktemp -d /tmp/gafus-roadmap-read-pg.XXXXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
generated=0
cleanup(){
  if [[ -f "$DIR/pg/postmaster.pid" ]]; then pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1 || true; fi
  if [[ "$generated" == 1 ]]; then rm -f "$ROOT/apps/api/scripts/qa/roadmap-historical-catalog.generated.ts" "$ROOT/apps/api/scripts/qa/roadmap-historical-slices.generated.ts"; fi
  if [[ "$DIR" == /tmp/gafus-roadmap-read-pg.* && -d "$DIR" && ! -L "$DIR" ]]; then rm -rf -- "$DIR"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for f in apps/api/scripts/qa/roadmap-historical-{catalog,slices}.generated.ts; do [[ ! -e "$f" ]] || exit 2; done
generated=1
python3 scripts/qa/roadmap-baseline-source-slices.py
initdb -D "$DIR/pg" -A trust -U qaread --no-instructions --no-sync >"$DIR/init.log" 2>&1 || { tail -40 "$DIR/init.log"; exit 1; }
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT -k $DIR -c timezone=UTC -c shared_buffers=32MB -c max_connections=30 -c shared_preload_libraries=pg_stat_statements" -w -t 120 start >/dev/null || { tail -50 "$DIR/pg.log"; exit 1; }
createdb -h 127.0.0.1 -p "$PORT" -U qaread gafus_roadmap_read_qa
export DATABASE_URL="postgresql://qaread@127.0.0.1:$PORT/gafus_roadmap_read_qa?schema=public&connection_limit=8"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_DB_QUERY_METRICS=true
export GAFUS_ROADMAP_READ_PG_DIR="$DIR/pg" GAFUS_ROADMAP_READ_PG_PORT="$PORT" GAFUS_BASELINE_REPORT_PATH="$REPORT"
export GAFUS_BASELINE_CANDIDATE_SHA="$(git rev-parse HEAD)"
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1) || { tail -60 "$DIR/schema.log"; exit 1; }
PSQL=(psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U qaread -d gafus_roadmap_read_qa)
"${PSQL[@]}" -c 'CREATE EXTENSION pg_stat_statements; DROP TABLE "DogWalkChange";'
"${PSQL[@]}" -f packages/prisma/migrations/20261126220000_dog_walk_changes/migration.sql
echo "ISOLATED_PORT=$PORT CANDIDATE=$GAFUS_BASELINE_CANDIDATE_SHA"
(cd apps/api && pnpm exec tsx scripts/qa/roadmap-baseline-slices.smoke.ts)
echo ROADMAP_BASELINE_SOURCE_SLICES_PASS
