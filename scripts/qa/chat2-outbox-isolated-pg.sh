#!/bin/bash
# Disposable PostgreSQL 18 acceptance: NEVER connects to DATABASE_URL or production.
set -euo pipefail
PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$(mktemp -d /tmp/gafus-archqa-chat2-outbox.XXXXXX)"
PORT="$(/usr/bin/python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
cleanup() {
  if [ -f "$DIR/data/postmaster.pid" ]; then
    pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$DIR"
}
trap cleanup EXIT
initdb -D "$DIR/data" -A trust -U archqa --no-instructions >/dev/null
pg_ctl -D "$DIR/data" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
# We explicitly discard any imported environment database connection.
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=archqa PGDATABASE=postgres
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "Chat2OutboxEvent" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT,
  "eventType" VARCHAR(40) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedUntil" TIMESTAMP(3)
);
CREATE TABLE "Chat2Message" ("id" TEXT PRIMARY KEY);
INSERT INTO "Chat2OutboxEvent" ("id","conversationId","eventType") VALUES ('event-lease','room','member.joined');
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/packages/prisma/migrations/20261107054000_chat2_outbox_lease_fencing_dlq/migration.sql" >/dev/null
# At-least-once claim: eight simultaneous worker claims must yield exactly one row.
CLAIM_SQL="UPDATE \"Chat2OutboxEvent\" SET \"claimToken\"=gen_random_uuid(),\"claimedUntil\"=CURRENT_TIMESTAMP+INTERVAL '30 seconds',\"attempts\"=\"attempts\"+1 WHERE \"id\"='event-lease' AND \"deliveredAt\" IS NULL AND \"deadLetteredAt\" IS NULL AND (\"claimedUntil\" IS NULL OR \"claimedUntil\"<CURRENT_TIMESTAMP) RETURNING \"claimToken\";"
for i in 1 2 3 4 5 6 7 8; do
  psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$CLAIM_SQL" > "$DIR/claim-$i" &
done
wait
claimed="$(grep -hE '^[0-9a-f]{8}-' "$DIR"/claim-* | wc -l | tr -d ' ')"
[ "$claimed" = 1 ] || { echo "FAIL: $claimed competing workers claimed one row"; exit 1; }
OLD_TOKEN="$(grep -hE '^[0-9a-f]{8}-' "$DIR"/claim-* | head -1)"
# Lease expiration allows takeover. The previous claimant MUST NOT ACK new state.
psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE \"Chat2OutboxEvent\" SET \"claimedUntil\"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE \"id\"='event-lease';" >/dev/null
NEW_TOKEN="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "$CLAIM_SQL" | grep -E '^[0-9a-f]{8}-' | head -1)"
[ "$NEW_TOKEN" != "$OLD_TOKEN" ] || { echo "FAIL: lease fencing token was reused"; exit 1; }
STALE="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "UPDATE \"Chat2OutboxEvent\" SET \"deliveredAt\"=CURRENT_TIMESTAMP WHERE \"id\"='event-lease' AND \"claimToken\"='$OLD_TOKEN' RETURNING \"id\";" | grep -c '^event-lease$' || true)"
[ "$STALE" = 0 ] || { echo "FAIL: stale worker overwrote state"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -c "UPDATE \"Chat2OutboxEvent\" SET \"deadLetteredAt\"=CURRENT_TIMESTAMP,\"claimedUntil\"=NULL,\"claimToken\"=NULL WHERE \"id\"='event-lease' AND \"claimToken\"='$NEW_TOKEN';" >/dev/null
NO_NEW="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "$CLAIM_SQL" | grep -c '^event-lease$' || true)"
[ "$NO_NEW" = 0 ] || { echo "FAIL: DLQ event was reclaimed"; exit 1; }
RETRY="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "UPDATE \"Chat2OutboxEvent\" SET \"deadLetteredAt\"=NULL,\"attempts\"=0,\"nextAttemptAt\"=CURRENT_TIMESTAMP WHERE \"id\"='event-lease' AND \"deliveredAt\" IS NULL AND \"deadLetteredAt\" IS NOT NULL AND \"claimedUntil\" IS NULL RETURNING \"id\";" | grep -c '^event-lease$' || true)"
[ "$RETRY" = 1 ] || { echo "FAIL: explicit DLQ retry did not reset state"; exit 1; }
# A durable outbox must roll back together with its business row.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO "Chat2Message" ("id") VALUES ('message-rollback');
INSERT INTO "Chat2OutboxEvent" ("id","conversationId","eventType") VALUES ('event-rollback','room','message.created');
ROLLBACK;
SQL
ROLLBACK_ROWS="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM \"Chat2Message\" WHERE \"id\"='message-rollback')+(SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='event-rollback');" | tr -d '\r\n')"
[ "$ROLLBACK_ROWS" = 0 ] || { echo "FAIL: transaction rollback left an outbox row"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO "Chat2Message" ("id") VALUES ('message-commit');
INSERT INTO "Chat2OutboxEvent" ("id","conversationId","eventType") VALUES ('event-commit','room','message.created');
COMMIT;
SQL
COMMIT_ROWS="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM \"Chat2Message\" WHERE \"id\"='message-commit')+(SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='event-commit');" | tr -d '\r\n')"
[ "$COMMIT_ROWS" = 2 ] || { echo "FAIL: transaction commit did not persist both rows"; exit 1; }
echo "PASS isolated PG18: expand migration, 8 competing claims, lease takeover, stale-owner fencing, DLQ retry, rollback, commit"
