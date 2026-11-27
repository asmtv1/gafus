#!/bin/bash
# Real separate Node worker processes + actual disposable PG/Redis + fake loopback broker.
# A PostgreSQL trigger injects a crash-after-REMOTE-ACK-before-DB-commit window,
# without modifying the production worker or contacting production services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[ "$PWD" = "$ROOT" ] || exit 2
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for tool in psql initdb pg_ctl createdb redis-server python3; do command -v "$tool" >/dev/null || exit 2; done
DIR="$(mktemp -d /tmp/gafus-archqa-outbox-multiprocess.XXXXXX)"
umask 077
pg_started=0
redis_pid='' broker_pid='' child_pid=''
cleanup() {
  if [ -n "$child_pid" ]; then kill -9 "$child_pid" 2>/dev/null || true; fi
  if [ -n "$broker_pid" ]; then kill "$broker_pid" 2>/dev/null || true; fi
  if [ -n "$redis_pid" ]; then kill "$redis_pid" 2>/dev/null || true; fi
  if [ "$pg_started" = 1 ]; then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  if [ -n "$child_pid" ]; then wait "$child_pid" 2>/dev/null || true; fi
  if [ -n "$broker_pid" ]; then wait "$broker_pid" 2>/dev/null || true; fi
  if [ -n "$redis_pid" ]; then wait "$redis_pid" 2>/dev/null || true; fi
  rm -rf -- "$DIR"
}
trap cleanup EXIT INT TERM
port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]);s.close()'
}
PG_PORT="$(port)"
REDIS_PORT="$(port)"
BROKER_PORT="$(port)"
SECRET="$(openssl rand -hex 32)"
unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL
initdb -D "$DIR/pg" -U archqa -A trust --no-instructions > "$DIR/initdb.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PG_PORT -c timezone=UTC" -w start >/dev/null
pg_started=1
createdb -h 127.0.0.1 -p "$PG_PORT" -U archqa archqa_outbox_multiprocess
export PGDATABASE=archqa_outbox_multiprocess
export DATABASE_URL="postgresql://archqa@127.0.0.1:$PG_PORT/archqa_outbox_multiprocess"
export REDIS_URL="redis://127.0.0.1:$REDIS_PORT"
export CHAT2_CENTRIFUGO_HTTP_API="http://127.0.0.1:$BROKER_PORT/api/publish"
export CHAT2_CENTRIFUGO_API_KEY="$SECRET"
export NODE_ENV=test GAFUS_OUTBOX_MULTIPROCESS_ONLY=1
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --protected-mode yes \
  --save '' --appendonly no > "$DIR/redis.log" 2>&1 &
redis_pid=$!
python3 -u scripts/qa/chat2-outbox-multiprocess-broker.py "$BROKER_PORT" "$DIR/events.jsonl" "$SECRET" > "$DIR/broker.log" 2>&1 &
broker_pid=$!
(cd packages/prisma && ./node_modules/.bin/prisma db push --skip-generate > "$DIR/prisma.log" 2>&1) || {
  echo "FAIL: disposable Prisma schema"; tail -25 "$DIR/prisma.log"; exit 1;
}
psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U archqa <<'SQL'
INSERT INTO "Chat2Conversation" ("id","kind","updatedAt") VALUES ('archqa-room','GROUP',NOW());
INSERT INTO "Chat2OutboxEvent" ("id","conversationId","eventType","nextAttemptAt")
VALUES ('archqa-concurrent','archqa-room','member.joined', TIMESTAMP '2020-01-01 00:00:00');
SQL
count_events() {
  python3 - "$DIR/events.jsonl" "$1" <<'PY'
from pathlib import Path
import sys,json
p=Path(sys.argv[1]); identity=sys.argv[2]
if not p.exists():
 print(0)
else:
 print(sum(json.loads(line)["eventId"]==identity for line in p.open()))
PY
}
verify_events() {
  python3 - "$DIR/events.jsonl" "$1" "$2" "$3" <<'PY'
from pathlib import Path
import sys,json
p=Path(sys.argv[1])
identity=sys.argv[2]
expected_count=int(sys.argv[3])
expected_effects=int(sys.argv[4])
data=[] if not p.exists() else [json.loads(line) for line in p.open()]
matches=[event for event in data if event["eventId"]==identity]
assert len(matches)==expected_count,(len(matches),expected_count)
assert sum(event["newEffect"] for event in matches)==expected_effects, matches
PY
}
dbval() {
  psql -X -q -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U archqa -c "$1" | tr -d '\n'
}
for i in $(seq 1 30); do
  if curl -fsS --max-time 1 -o /dev/null -X POST -H "X-API-Key: $SECRET" \
     -d '{}' "${CHAT2_CENTRIFUGO_HTTP_API%/publish}/info" && redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1; then break; fi
  sleep 0.2
done
# Gate both real child processes together; not one in-process Promise.all.
start_child() {
  node --import tsx scripts/qa/chat2-outbox-multiprocess-child.ts > "$1" 2>&1 &
  child_pid=$!
}
start_child "$DIR/child-a.log"
first=$child_pid
start_child "$DIR/child-b.log"
second=$child_pid
wait "$first" || { echo "FAIL: Worker A"; tail -10 "$DIR/child-a.log"; exit 1; }
wait "$second" || { echo "FAIL: Worker B"; tail -10 "$DIR/child-b.log"; exit 1; }
child_pid=''
echo "Child A:"; tail -8 "$DIR/child-a.log"
echo "Child B:"; tail -8 "$DIR/child-b.log"
echo "Outbox DB rows:"; psql -X -q -A -t -h 127.0.0.1 -p "$PG_PORT" -U archqa -c 'SELECT id, attempts, "lastErrorCode", "deliveredAt" IS NOT NULL FROM "Chat2OutboxEvent";'
echo "Fake broker calls: $(count_events archqa-concurrent)"
verify_events archqa-concurrent 1 1
[ "$(dbval 'SELECT count(*) FROM "Chat2OutboxEvent" WHERE "id"='\''archqa-concurrent'\'' AND "deliveredAt" IS NOT NULL AND attempts=1;')" = 1 ] || { echo "FAIL: concurrent DB delivery"; exit 1; }
echo "PASS: two independent Worker processes -> one remote publish, one DB delivery"
# Deterministic external ACK followed by a stuck DB ACK transition. Force kill
# only after PostgreSQL confirms pg_sleep in the AFTER-publish update.
psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U archqa <<'SQL'
INSERT INTO "Chat2OutboxEvent" ("id","conversationId","eventType","nextAttemptAt")
VALUES ('archqa-crash','archqa-room','member.joined', TIMESTAMP '2020-01-01 00:00:00');
CREATE FUNCTION archqa_hold_ack() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" = 'archqa-crash' AND NEW."deliveredAt" IS NOT NULL AND OLD."deliveredAt" IS NULL THEN
    PERFORM pg_sleep(25);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER archqa_hold_ack_before_update
BEFORE UPDATE ON "Chat2OutboxEvent" FOR EACH ROW EXECUTE FUNCTION archqa_hold_ack();
SQL
start_child "$DIR/child-crash.log"
crash_pid=$child_pid
entered=0
ack_backend_pid=""
for i in $(seq 1 90); do
  ack_backend_pid="$(dbval "SELECT pid FROM pg_stat_activity WHERE datname='archqa_outbox_multiprocess' AND wait_event='PgSleep' AND usename='archqa';")"
  if [ "$(count_events archqa-crash)" = 1 ] && [[ "$ack_backend_pid" =~ ^[0-9]+$ ]]; then
    entered=1; break
  fi
  if ! kill -0 "$crash_pid" 2>/dev/null; then
    echo "FAIL: first crash worker exited prematurely"; tail -18 "$DIR/child-crash.log"; exit 1;
  fi
  sleep 0.2
done
[ "$entered" = 1 ] || { echo "FAIL: no external ACK/blocked DB commit window"; tail -20 "$DIR/child-crash.log"; exit 1; }
kill -9 "$crash_pid" 2>/dev/null || true
wait "$crash_pid" 2>/dev/null || true
child_pid=''
# PostgreSQL can continue the in-flight statement after a client SIGKILL.
# Abort only the exact sleeping ACK session in this owned disposable database;
# otherwise DDL can wait for it to complete and the fault is nondeterministic.
dbval "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid=$ack_backend_pid AND datname='archqa_outbox_multiprocess' AND usename='archqa' AND wait_event='PgSleep';" >/dev/null
for i in $(seq 1 40); do
  [ "$(dbval "SELECT count(*) FROM pg_stat_activity WHERE pid=$ack_backend_pid AND datname='archqa_outbox_multiprocess';")" = 0 ] && break
  sleep 0.1
done
[ "$(dbval "SELECT count(*) FROM pg_stat_activity WHERE pid=$ack_backend_pid AND datname='archqa_outbox_multiprocess';")" = 0 ] || { echo "FAIL: ACK backend still active"; exit 1; }
verify_events archqa-crash 1 1
[ "$(dbval 'SELECT count(*) FROM "Chat2OutboxEvent" WHERE "id"='\''archqa-crash'\'' AND "deliveredAt" IS NULL AND "claimToken" IS NOT NULL;')" = 1 ] || {
  echo "FAIL: kill did not roll back PostgreSQL ACK"; exit 1;
}
psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U archqa <<'SQL'
DROP TRIGGER archqa_hold_ack_before_update ON "Chat2OutboxEvent";
DROP FUNCTION archqa_hold_ack();
UPDATE "Chat2OutboxEvent" SET "claimedUntil" = TIMESTAMP '2020-01-01 00:00:00' WHERE "id" = 'archqa-crash';
SQL
start_child "$DIR/child-recovery.log"
recovery_pid=$child_pid
wait "$recovery_pid" || { echo "FAIL: recovery Worker"; tail -15 "$DIR/child-recovery.log"; exit 1; }
child_pid=''
echo "Recovery worker: $(tail -3 "$DIR/child-recovery.log" | tr '\n' ' ')"
verify_events archqa-crash 2 1
[ "$(dbval 'SELECT count(*) FROM "Chat2OutboxEvent" WHERE "id"='\''archqa-crash'\'' AND "deliveredAt" IS NOT NULL AND attempts=2;')" = 1 ] || {
  echo "FAIL: recovered persisted delivery"; dbval "SELECT id, attempts, COALESCE(\"lastErrorCode\",'none'), \"deliveredAt\" IS NOT NULL, \"deadLetteredAt\" IS NOT NULL FROM \"Chat2OutboxEvent\" WHERE id='archqa-crash';"; exit 1;
}
echo "PASS: real killed process AFTER broker ACK and BEFORE DB commit; same eventId replay, one idempotent consumer effect"
