#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE
umask 077
BASE=afb4fb0b4d2c95e04658f04160d5fd16dfe9ff12
CAND=f77e07d0d608d51281b2d38653db79d663e9f4ac
D=$(mktemp -d /tmp/gafus-release-db.XXXXXX)
P=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
cleanup(){ pg_ctl -D "$D/pg" -m fast -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT
echo "synthetic scratch $D"
git archive "$BASE" ci-cd/bootstrap/prisma-fresh packages/prisma/migrations | tar -xf - -C "$D"
initdb -D "$D/pg" -A trust -U qarelease --no-instructions >"$D/init.log" 2>&1
pg_ctl -D "$D/pg" -l "$D/pg.log" -o "-h 127.0.0.1 -p $P -c timezone=UTC" -w start >/dev/null
export PGHOST=127.0.0.1 PGPORT="$P" PGUSER=qarelease
createdb qa_release_old
createdb qa_release_restored
export PGDATABASE=qa_release_old
Q=(psql -X -qAt -v ON_ERROR_STOP=1)
"${Q[@]}" -c 'SHOW server_version'
B="$D/ci-cd/bootstrap/prisma-fresh"
"${Q[@]}" -1 -f "$B/fresh-only-precondition.sql" -f "$B/fresh-only-bootstrap.candidate.sql" >"$D/baseline.log" 2>&1
LAST=$(python3 -c 'import json,sys;print(max(json.load(open(sys.argv[1]))["migrationsSha256"]))' "$B/inventory.review.json")
count=0
for f in "$D"/packages/prisma/migrations/*/migration.sql; do n=$(basename "$(dirname "$f")"); if [[ "$n" > "$LAST" ]]; then "${Q[@]}" -f "$f" >>"$D/baseline.log" 2>&1 || { echo "baseline failed $n"; tail -20 "$D/baseline.log"; exit 1; }; count=$((count+1)); fi; done
echo "baseline reviewed SQL + forward=$count (no Prisma journal fabricated)"
cat >"$D/old-writes.sql" <<'SQL'
INSERT INTO "User" (id,username,password,"updatedAt") VALUES ('qa-release','qa-release','synthetic',now());
INSERT INTO "DogWalkRecord" (id,"userId","clientId","startedAt","finishedAt","durationSeconds",steps,"estimatedMeters","timerMode","updatedAt") VALUES ('qa-walk','qa-release','walk-1',now(),now(),10,1,1,'stopwatch',now());
INSERT INTO "StepNotification" (id,"userId",day,"stepIndex","endTs",subscription,"updatedAt") VALUES ('qa-step','qa-release',1,1,1,'{}',now());
INSERT INTO "TransactionalMailAttempt" (id,"recipientCount") VALUES ('qa-mail',1);
INSERT INTO "TransactionalMailEvent" (id,"providerMessageId",type,"occurredAt") VALUES ('qa-event','qa-provider','synthetic',now());
INSERT INTO "MobileOtaTelemetryEvent" (id,"eventId","installationHash",platform,environment,channel,"runtimeVersion","nativeFingerprint",event) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','synthetic','ios','production','production','1.7.5','synthetic','LAUNCHED');
SQL
"${Q[@]}" -f "$D/old-writes.sql"
pg_dump -Fc -f "$D/pre.dump"
pg_restore --list "$D/pre.dump" > "$D/toc"
shasum -a 256 "$D/pre.dump"
for f in $(git diff --name-only "$BASE" "$CAND" -- packages/prisma/migrations); do
  echo "apply $(basename "$(dirname "$f")")"
  "${Q[@]}" -f "$f"
done
"${Q[@]}" <<'SQL'
UPDATE "DogWalkRecord" SET steps=2 WHERE id='qa-walk';
INSERT INTO "DogWalkTombstone" ("userId","clientId") VALUES ('qa-release','walk-2');
INSERT INTO "TransactionalMailAttempt" (id,"recipientCount") VALUES ('qa-mail-new',1);
INSERT INTO "StepNotification" (id,"userId",day,"stepIndex","endTs",subscription,"updatedAt") VALUES ('qa-step-new','qa-release',1,1,1,'{}',now());
DO $$ BEGIN
 IF (SELECT count(*) FROM "DogWalkChange" WHERE "userId"='qa-release') <> 2 THEN RAISE EXCEPTION 'walk trigger mismatch'; END IF;
 IF (SELECT count(*) FROM "TransactionalMailAttempt" WHERE category='general') <> 2 THEN RAISE EXCEPTION 'mail default mismatch'; END IF;
 IF (SELECT count(*) FROM "StepNotification" WHERE "consultationBookingId" IS NULL) < 2 THEN RAISE EXCEPTION 'legacy receipt mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "MobileOtaTelemetryEvent" WHERE event='LAUNCHED') THEN RAISE EXCEPTION 'legacy OTA missing'; END IF;
END $$;
SQL
echo OLD_SQL_SHAPES_PASS
pg_restore --exit-on-error --no-owner --no-privileges -d qa_release_restored "$D/pre.dump"
test "$(psql -X -qAt -d qa_release_restored -c 'SELECT steps FROM "DogWalkRecord" WHERE id='"'"'qa-walk'"'"'')" = 1
test "$(psql -X -qAt -d qa_release_restored -c "SELECT to_regclass('\"DogWalkChange\"') IS NULL")" = t
test "$(psql -X -qAt -d qa_release_restored -c 'SELECT count(*) FROM "TransactionalMailAttempt" WHERE id='"'"'qa-mail-new'"'"'')" = 0
echo SYNTHETIC_PRE_MIGRATION_RESTORE_PASS
