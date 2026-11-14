#!/bin/bash
# Genuine isolated PostgreSQL 18 regression for mixed 1.7.2/1.7.3 Chat2
# lease/DLQ compatibility. No production credentials or network dependencies.
set -Eeuo pipefail
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Resolve by repository contents, not a developer-specific home directory.
[[ -f "$ROOT/packages/prisma/schema.prisma" &&
   -f "$ROOT/packages/prisma/migrations/20261112173000_chat2_outbox_mixed_version_dlq_guard/migration.sql" &&
   -f "$ROOT/packages/prisma/migrations/20261112174500_chat2_outbox_legacy_claim_token_cleanup/migration.sql" ]] || { echo "MIXED_COMPAT_SOURCE_GUARD_FAILED"; exit 21; }
for bin in initdb pg_ctl createdb psql;do command -v "$bin" >/dev/null;done
WORK="$(mktemp -d /tmp/gafus-chat2-mixed-guard-XXXXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
STARTED=0
cleanup(){ if [[ "$STARTED" == 1 ]];then pg_ctl -D "$WORK/postgres" -m immediate stop >/dev/null 2>&1 || :;fi; if [[ "$WORK" == /tmp/gafus-chat2-mixed-guard-* && -d "$WORK" && ! -L "$WORK" ]];then rm -rf -- "$WORK";fi; }
trap cleanup EXIT INT TERM
initdb -D "$WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust -U compatqa --no-instructions >/dev/null
pg_ctl -D "$WORK/postgres" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -l "$WORK/postgres.log" -w start >/dev/null
STARTED=1
createdb -h 127.0.0.1 -p "$PORT" -U compatqa mixedqa
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U compatqa -d mixedqa -X -qAt -v ON_ERROR_STOP=1)
"${PSQL[@]}" <<'SQL'
CREATE TABLE "Chat2OutboxEvent"(
  "id" TEXT PRIMARY KEY,
  "deliveredAt" TIMESTAMP(3),
  "deadLetteredAt" TIMESTAMP(3),
  "claimedUntil" TIMESTAMP(3),
  "claimToken" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL
"${PSQL[@]}" -f "$ROOT/packages/prisma/migrations/20261112173000_chat2_outbox_mixed_version_dlq_guard/migration.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/packages/prisma/migrations/20261112174500_chat2_outbox_legacy_claim_token_cleanup/migration.sql" >/dev/null
"${PSQL[@]}" <<'SQL'
-- Old Worker SELECT ignores deadLetteredAt but must see no due DLQ rows.
INSERT INTO "Chat2OutboxEvent"("id","deadLetteredAt","nextAttemptAt")
 VALUES ('dlq', now(), now()-INTERVAL '1 minute');
DO $$ BEGIN
 IF (SELECT EXTRACT(YEAR FROM "nextAttemptAt") FROM "Chat2OutboxEvent" WHERE "id"='dlq')<>9999
 THEN RAISE EXCEPTION 'LEGACY_DLQ_NEXT_ATTEMPT_NOT_QUARANTINED'; END IF;
END $$;
-- Exact old UPDATE claim, without deadLetteredAt or nextAttemptAt predicates.
DO $$ DECLARE n INTEGER; BEGIN
 UPDATE "Chat2OutboxEvent" SET "claimedUntil"=now()+INTERVAL '30 seconds',"attempts"="attempts"+1
 WHERE "id"='dlq' AND "deliveredAt" IS NULL AND ("claimedUntil" IS NULL OR "claimedUntil" < now());
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'LEGACY_CLAIM_REANIMATED_DLQ'; END IF;
END $$;
-- Admin CAS resets the state, exactly once; the old Worker can now pick it.
UPDATE "Chat2OutboxEvent" SET "deadLetteredAt"=NULL,"nextAttemptAt"=now(),"attempts"=0
 WHERE "id"='dlq' AND "deadLetteredAt" IS NOT NULL AND "claimedUntil" IS NULL;
DO $$ DECLARE n INTEGER; BEGIN
 UPDATE "Chat2OutboxEvent" SET "deadLetteredAt"=NULL,"attempts"=0
 WHERE "id"='dlq' AND "deadLetteredAt" IS NOT NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'DOUBLE_ADMIN_REPLAY'; END IF;
END $$;
UPDATE "Chat2OutboxEvent" SET "claimedUntil"=now()+INTERVAL '30 seconds',"attempts"="attempts"+1
 WHERE "id"='dlq' AND "deadLetteredAt" IS NULL;
UPDATE "Chat2OutboxEvent" SET "claimToken"=gen_random_uuid() WHERE "id"='dlq';
UPDATE "Chat2OutboxEvent" SET "claimedUntil"=NULL,"deliveredAt"=now() WHERE "id"='dlq';
DO $$ BEGIN
 IF (SELECT "claimToken" IS NOT NULL FROM "Chat2OutboxEvent" WHERE "id"='dlq')
 THEN RAISE EXCEPTION 'OLD_WORKER_LEFT_STALE_TOKEN_AFTER_ACK'; END IF;
END $$;
-- Old failed attempt releases a lease; stale token must also clear.
INSERT INTO "Chat2OutboxEvent"("id","claimedUntil","claimToken")
 VALUES ('retry', now()+INTERVAL '30 seconds',gen_random_uuid());
UPDATE "Chat2OutboxEvent" SET "claimedUntil"=NULL,"nextAttemptAt"=now()+INTERVAL '15 seconds' WHERE "id"='retry';
DO $$ BEGIN
 IF (SELECT "claimToken" IS NOT NULL FROM "Chat2OutboxEvent" WHERE "id"='retry')
 THEN RAISE EXCEPTION 'OLD_WORKER_LEFT_STALE_TOKEN_AFTER_RETRY'; END IF;
END $$;
SQL
echo 'MIXED_VERSION_DLQ_GUARD_REAL_PG18_PASS: legacy select+stale claim blocked, admin CAS replay, post-ACK/retry token cleanup'
