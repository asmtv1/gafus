#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for tool in initdb pg_ctl createdb psql pg_dump pg_restore python3;do command -v "$tool" >/dev/null || { echo MISSING_LOCAL_PG_TOOL;exit 2; };done
DIR="$(mktemp -d /tmp/gafus-backup-restore-qa.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
 if [ "$started" = 1 ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true;fi
 if [[ "$DIR" == /tmp/gafus-backup-restore-qa.* ]] && [ -d "$DIR" ] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
umask 077
initdb -D "$DIR/pg" -A trust -U qarestore --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qarestore gafus_restore_original
createdb -h 127.0.0.1 -p "$PORT" -U qarestore gafus_restore_target
export DATABASE_URL="postgresql://qarestore@127.0.0.1:$PORT/gafus_restore_original?schema=public"
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) || { tail -55 "$DIR/schema.log";exit 1; }
PSQL=(psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U qarestore)
"${PSQL[@]}" -d gafus_restore_original -c 'INSERT INTO "CourseContentRevision" ("id","revision") VALUES (1,7);'
"${PSQL[@]}" -d gafus_restore_original -c "INSERT INTO \"QuestionLegacyPhotoDeletion\" (\"id\",\"ownerId\",\"locator\",\"status\",\"updatedAt\") VALUES ('qa-1','synthetic-owner','questions/synthetic-owner/synthetic.jpg','PENDING',now());"
pg_dump -Fc -h 127.0.0.1 -p "$PORT" -U qarestore -d gafus_restore_original -f "$DIR/backup.dump"
test -s "$DIR/backup.dump"
pg_restore --list "$DIR/backup.dump" > "$DIR/toc"
grep -q QuestionLegacyPhotoDeletion "$DIR/toc"
grep -q CourseContentRevision "$DIR/toc"
"${PSQL[@]}" -d gafus_restore_original -c 'UPDATE "CourseContentRevision" SET "revision"=10 WHERE "id"=1;'
"${PSQL[@]}" -d gafus_restore_original -c "UPDATE \"QuestionLegacyPhotoDeletion\" SET \"status\"='FAILED' WHERE \"id\"='qa-1';"
pg_restore --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -p "$PORT" -U qarestore -d gafus_restore_target "$DIR/backup.dump" >"$DIR/restore.log" 2>&1 || { tail -90 "$DIR/restore.log";exit 1; }
original=$("${PSQL[@]}" -d gafus_restore_original -c 'SELECT "revision" FROM "CourseContentRevision" WHERE "id"=1')
restored=$("${PSQL[@]}" -d gafus_restore_target -c 'SELECT "revision" FROM "CourseContentRevision" WHERE "id"=1')
state=$("${PSQL[@]}" -d gafus_restore_target -c "SELECT \"status\" FROM \"QuestionLegacyPhotoDeletion\" WHERE \"id\"='qa-1'")
constraint=$("${PSQL[@]}" -d gafus_restore_target -c "SELECT count(*) FROM pg_constraint WHERE conrelid='\"QuestionLegacyPhotoDeletion\"'::regclass AND contype='p'")
[ "$original" = 10 ] && [ "$restored" = 7 ] && [ "$state" = PENDING ] && [ "$constraint" = 1 ] || { echo BACKUP_RESTORE_QA_DATA_MISMATCH;exit 1; }
echo BACKUP_RESTORE_LOCAL_PG_PASS_full_schema_synthetic_outbox_snapshot_unique_constraint
