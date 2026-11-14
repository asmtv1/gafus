#!/bin/bash
# Real, disposable loopback PostgreSQL; no production, no public S3.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[ "$PWD" = "$ROOT" ] || exit 2
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for x in initdb pg_ctl psql createdb python3; do command -v "$x" >/dev/null || { echo "MISSING_TOOL_$x";exit 2; }; done
DIR="$(mktemp -d /tmp/gafus-question-legacy-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
  if [ "$started" = "1" ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true;fi
  if [ -d "$DIR" ] && [ ! -L "$DIR" ] && [[ "$DIR" == /tmp/gafus-question-legacy-pg.* ]];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qlegacyqa --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qlegacyqa gafus_refactor_legacy_outbox
# Validate the *actual additive migration SQL* on a separate disposable database,
# rather than only trusting Prisma db push (which synthesizes DDL).
createdb -h 127.0.0.1 -p "$PORT" -U qlegacyqa gafus_refactor_legacy_migration_probe
psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U qlegacyqa   -d gafus_refactor_legacy_migration_probe   -f "$ROOT/packages/prisma/migrations/20261107152500_question_legacy_photo_deletion_outbox/migration.sql"   > "$DIR/migration.log" 2>&1 ||
  { echo "LEGACY_DELETE_MIGRATION_SQL_FAILED";tail -35 "$DIR/migration.log";exit 1; }
columns="$(psql -At -h 127.0.0.1 -p "$PORT" -U qlegacyqa   -d gafus_refactor_legacy_migration_probe   -c "SELECT count(*) FROM information_schema.columns WHERE table_name='QuestionLegacyPhotoDeletion'")"
[ "$columns" = "11" ] || { echo "LEGACY_DELETE_MIGRATION_COLUMNS_INCOMPLETE";exit 1; }
export DATABASE_URL="postgresql://qlegacyqa@127.0.0.1:$PORT/gafus_refactor_legacy_outbox?schema=public"
export GAFUS_LOCAL_ISOLATED_API=1 QUESTIONS_LEGACY_DELETE_ISOLATED_TEST=1 NODE_ENV=test
(
 cd packages/prisma
 pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1 ||
 { echo "LEGACY_DELETE_SCHEMA_PUSH_FAILED";tail -35 "$DIR/schema.log";exit 1; }
)
(
 cd packages/questions-server
 pnpm exec vitest run --config vitest.config.ts src/photos.deletion-outbox.real-pg.test.ts --reporter=dot
)
echo "QUESTIONS_LEGACY_REAL_PG_OUTBOX_PASS: migration SQL, rollback, atomic commit, competing claims, stale lease replay, foreign deny"
