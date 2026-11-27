#!/usr/bin/env bash
# A2 2x real Hono API + 2x actual Chat2 Worker dispatch, fresh PG/Redis/Centrifugo.
# All listeners are loopback; no cloud credentials, no shared DB, no prod, no gafus1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb psql pg_dump pg_restore redis-server redis-cli curl python3; do
  command -v "$bin" >/dev/null || { echo "A2_MISSING_PRIVATE_INFRA:$bin"; exit 2; }
done
for port in 56241 56242 56243 56244 56245 56246 56247 56248; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN | grep -q LISTEN; then
    echo "A2_PRIVATE_PORT_BUSY:$port"; exit 2
  fi
done
BROKER="$ROOT/.local-pg-scratch/chat2-bin/centrifugo"
if [[ ! -x "$BROKER" ]]; then BROKER="$ROOT/../gafus-refactor/.local-pg-scratch/chat2-bin/centrifugo"; fi
[[ -x "$BROKER" && ! -L "$BROKER" ]] || { echo A2_LOCAL_BROKER_BINARY_UNAVAILABLE; exit 2; }
for cli in apps/api/node_modules/.bin/tsx packages/worker/node_modules/.bin/tsx packages/prisma/node_modules/.bin/prisma; do
  [[ -x "$cli" ]] || { echo "A2_LOCAL_WORKSPACE_CLI_UNAVAILABLE:$cli"; exit 2; }
done
umask 077
# Archive previous receipts and start with fresh paths for the new run.
A2_HISTORY="artifacts/a2-obs-history/$(date -u +%Y%m%dT%H%M%SZ)-$$"
for previous in \
  artifacts/a2-obs-real-baseline artifacts/a2-obs-real-candidate \
  artifacts/a2-obs-real-multi-summary.json artifacts/a2-obs-real-otlp-query.json \
  artifacts/a2-obs-real-service-restore.json artifacts/a2-obs-worker-metric-restart.json; do
  [[ -e "$previous" ]] || continue
  [[ ! -L "$previous" && "$previous" == artifacts/a2-obs-* ]] || {
    echo A2_ARTIFACT_ARCHIVE_UNSAFE_SOURCE; exit 2
  }
  mkdir -p "$A2_HISTORY"
  mv -- "$previous" "$A2_HISTORY/$(basename "$previous")"
done
WORK="$(mktemp -d /tmp/gafus-a2-obs-real-multi.XXXXXX)"
pg_started=0; pg_data=''; redis_pid=''; broker_pid=''; trace_pid=''; child_pids=()
cleanup(){
  set +e
  for pid in "${child_pids[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done
  [[ -n "$broker_pid" ]] && kill "$broker_pid" 2>/dev/null
  [[ -n "$trace_pid" ]] && kill "$trace_pid" 2>/dev/null
  [[ -n "$redis_pid" ]] && kill "$redis_pid" 2>/dev/null
  sleep 1
  # tsx CLI forks one Node child: the subshell PID alone cannot stop it.
  # Kill ONLY listeners on this fixture's reserved ports whose command line
  # also names our specific test launcher and isolated worktree.
  for port in 56244 56245 56246 56247; do
    owned_pid="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null | head -1)"
    [[ -z "$owned_pid" ]] && continue
    owned_command="$(ps -p "$owned_pid" -o command= 2>/dev/null)"
    if printf '%s' "$owned_command" | grep -Fq "$ROOT/" &&
       printf '%s' "$owned_command" | grep -Fq 'src/a2-observability-private-'; then
      kill "$owned_pid" 2>/dev/null || true
    fi
  done
  for pid in "${child_pids[@]:-}"; do [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true; done
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$pg_data" -m immediate stop >/dev/null 2>&1; fi
  if [[ "$WORK" == /tmp/gafus-a2-obs-real-multi.* && -d "$WORK" && ! -L "$WORK" ]]; then
    rm -rf -- "$WORK"
  fi
}
trap cleanup EXIT INT TERM
mkdir "$WORK/sock"
pg_data="$WORK/pg"
initdb -D "$pg_data" -A trust -U a2obs --no-instructions > "$WORK/pg-init.log" 2>&1
pg_ctl -D "$pg_data" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 56241 -k $WORK/sock -c max_connections=60 -c timezone=UTC" -w start >/dev/null
pg_started=1
createdb -h 127.0.0.1 -p 56241 -U a2obs gafus_a2_observability
PG_DATA_ACTUAL="$(psql -X -qAt -h 127.0.0.1 -p 56241 -U a2obs -d gafus_a2_observability -c 'show data_directory')"
[[ "$PG_DATA_ACTUAL" == "$pg_data" ]] || { echo A2_PG_STORAGE_ISOLATION_FAILED; exit 2; }
[[ "$(psql -X -qAt -h 127.0.0.1 -p 56241 -U a2obs -d gafus_a2_observability -c 'show timezone')" == UTC ]] || { echo A2_PG_MUST_USE_UTC_FOR_PRISMA_TIMESTAMP; exit 2; }
redis-server --bind 127.0.0.1 --port 56242 --save '' --appendonly no --protected-mode yes > "$WORK/redis.log" 2>&1 & redis_pid=$!
for i in {1..35}; do redis-cli -h 127.0.0.1 -p 56242 ping 2>/dev/null | grep -qx PONG && break; sleep .25; done
redis-cli -h 127.0.0.1 -p 56242 ping | grep -qx PONG
python3 - "$WORK/centrifugo.json" <<'JSON'
import json,sys
from pathlib import Path
config=json.loads(Path('infra/chat2/centrifugo.json').read_text())
config['engine']['redis']['address']='redis://127.0.0.1:56242'
config['health']={'enabled':True}
Path(sys.argv[1]).write_text(json.dumps(config))
JSON
export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
export CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
export CENTRIFUGO_VAR_CHAT2_PROXY_SHARED_SECRET="$(openssl rand -hex 32)"
"$BROKER" -c "$WORK/centrifugo.json" --http_server.address 127.0.0.1 --http_server.port 56243 > "$WORK/broker.log" 2>&1 & broker_pid=$!
for i in {1..35}; do curl -sf --max-time 1 http://127.0.0.1:56243/health >/dev/null 2>&1 && break; sleep .25; done
curl -sf --max-time 1 http://127.0.0.1:56243/health >/dev/null || { echo A2_LOCAL_CENTRIFUGO_FAILED; tail -12 "$WORK/broker.log" | cut -c1-170; exit 1; }
export DATABASE_URL='postgresql://a2obs@127.0.0.1:56241/gafus_a2_observability?schema=public'
export REDIS_URL='redis://127.0.0.1:56242'
(cd packages/prisma && ./node_modules/.bin/prisma db push --skip-generate > "$WORK/schema-push.log" 2>&1) || {
  echo A2_PRIVATE_SCHEMA_PUSH_FAILED; tail -8 "$WORK/schema-push.log" | cut -c1-160; exit 1;
}
PSQL=(psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 56241 -U a2obs -d gafus_a2_observability)
"${PSQL[@]}" -c "INSERT INTO \"Chat2Conversation\" (\"id\",\"kind\",\"visibility\",\"name\",\"createdAt\",\"updatedAt\") VALUES ('a2-obs-room','GROUP','PRIVATE','a2-obs-synthetic',now(),now())"
# An explicitly approved real-provider mode may use only synthetic QA
# source/target/archive buckets with independently scoped profiles.
A2_OBS_OTA_ORIGIN="https://ota-restore.invalid/source-ota"
if [[ -n "${A2_EXTERNAL_DRILL_CONFIG:-}" ]]; then
  [[ "${A2_EXTERNAL_DRILL_APPROVED:-}" == synthetic-isolated-provider ]] || { echo A2_EXTERNAL_DRILL_NOT_APPROVED; exit 2; }
  A2_OBS_OTA_ORIGIN="$(node --input-type=module - "$A2_EXTERNAL_DRILL_CONFIG" <<'DRILL_ORIGIN'
import {readFileSync,lstatSync,realpathSync} from "node:fs";
import {validateRealDrillConfig} from "./scripts/qa/observability-external-archive-config.mjs";
const file=process.argv[2], st=lstatSync(file);
if(!file.startsWith("/") || realpathSync(file)!==file || !st.isFile() || st.mode&0o077)throw Error("QA_EXTERNAL_PRIVATE_CONFIG_REQUIRED");
console.log(validateRealDrillConfig(JSON.parse(readFileSync(file,"utf8"))).otaOrigin);
DRILL_ORIGIN
)"
fi
export A2_OBS_KEY="$(openssl rand -hex 32)"
export A2_OBS_BROKER_URL='http://127.0.0.1:56243/api/publish'
env -i PATH="$PATH" HOME="$HOME" GAFUS_A2_OBS_ISOLATED=1 \
  A2_OBS_TRACE_PORT=56248 A2_OBS_TRACE_DIR="$WORK" A2_OBS_KEY="$A2_OBS_KEY" \
  node scripts/qa/observability-local-trace-sink.mjs > "$WORK/otlp-receiver.log" 2>&1 & trace_pid=$!
for i in {1..35}; do curl -sf --max-time 1 http://127.0.0.1:56248/health >/dev/null 2>&1 && break; sleep .25; done
curl -sf --max-time 1 http://127.0.0.1:56248/health >/dev/null || { echo A2_LOCAL_OTLP_RECEIVER_FAILED; tail -6 "$WORK/otlp-receiver.log"; exit 1; }
launch_a2_api(){
  local port="$1" label="${2:-initial}"
  (
    cd apps/api
    env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development API_HOST=127.0.0.1 \
      A2_OBS_API_PORT="$port" GAFUS_A2_OBS_ISOLATED=1 \
      A2_OBS_WORK_DIR="$WORK" A2_OBS_OTA_ORIGIN="$A2_OBS_OTA_ORIGIN" MOBILE_OTA_DELIVERY_ENV=preview \
      CHAT2_MOBILE_IOS_MIN_VERSION=1.7.5 CHAT2_MOBILE_ANDROID_MIN_VERSION=1.7.5 \
      DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" \
      API_METRICS_KEY="$A2_OBS_KEY" \
      GALLERY_ENABLED=false FEED_ENABLED=false CLOUDRU_MEDIA_JOBS_ENABLED=false \
      CDN_HEALTH_MONITOR_ENABLED=false CHAT2_API_ENABLED=enabled CHAT2_WORKER_ENABLED=disabled \
      CHAT2_MAIL_ENABLED=disabled GAFUS_DB_QUERY_METRICS=true \
      OTEL_TRACES_SAMPLER_ARG=1 OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:56248/v1/traces \
      JWT_SECRET="$A2_OBS_KEY" JWT_REFRESH_SECRET="$A2_OBS_KEY" \
      ./node_modules/.bin/tsx src/a2-observability-private-server.ts
  ) > "$WORK/api-$port-$label.log" 2>&1 & child_pids+=("$!")
}
for port in 56244 56245; do launch_a2_api "$port"; done
launch_a2_worker(){
  local port="$1" label="${2:-initial}"
  (
    cd packages/worker
    env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development \
      A2_OBS_WORKER_PORT="$port" GAFUS_A2_OBS_ISOLATED=1 \
      DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" \
      API_METRICS_KEY="$A2_OBS_KEY" CHAT2_WORKER_ENABLED=enabled \
      CHAT2_CENTRIFUGO_HTTP_API="$A2_OBS_BROKER_URL" \
      CHAT2_CENTRIFUGO_API_KEY="$CENTRIFUGO_HTTP_API_KEY" \
      CHAT2_CENTRIFUGO_TOKEN_SECRET="$CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY" \
      GALLERY_ENABLED=false FEED_ENABLED=false CLOUDRU_MEDIA_JOBS_ENABLED=false \
      CDN_HEALTH_MONITOR_ENABLED=false CHAT2_MAIL_ENABLED=disabled GAFUS_DB_QUERY_METRICS=true \
      OTEL_TRACES_SAMPLER_ARG=1 OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:56248/v1/traces \
      ./node_modules/.bin/tsx src/a2-observability-private-worker.ts
  ) > "$WORK/worker-$port-$label.log" 2>&1 & child_pids+=("$!")
}
for port in 56246 56247; do launch_a2_worker "$port"; done
ready_count=0
for i in {1..90}; do
  ready_count=0
  for port in 56244 56245 56246 56247; do
    if curl -sf --max-time 1 "http://127.0.0.1:$port/ready" >/dev/null 2>&1; then ready_count=$((ready_count+1)); fi
  done
  [[ "$ready_count" == 4 ]] && break
  for pid in "${child_pids[@]:-}"; do
    [[ -z "$pid" ]] && continue
    kill -0 "$pid" 2>/dev/null || { echo A2_REAL_SERVICE_EXITED; for f in "$WORK"/api-*log "$WORK"/worker-*log; do echo "$f"; tail -6 "$f" | cut -c1-170; done; exit 1; }
  done
  sleep .5
done
[[ "$ready_count" == 4 ]] || { echo "A2_PRIVATE_READINESS_FAILED:$ready_count"; for f in "$WORK"/api-*log "$WORK"/worker-*log; do tail -5 "$f" | cut -c1-170; done; exit 1; }
echo A2_TWO_REAL_APIS_TWO_REAL_CHAT2_WORKERS_PG_REDIS_CENTRIFUGO_READY
# Metrics must fail closed and export true Prisma pool wait only after valid key.
[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:56244/internal/metrics)" == 404 ]]
curl -sf --max-time 3 -H "Authorization: Bearer $A2_OBS_KEY" http://127.0.0.1:56244/internal/metrics | grep -q 'db_pool_wait_metrics_fresh 1'
for port in 56246 56247; do
  curl -sf --max-time 3 -H "Authorization: Bearer $A2_OBS_KEY" "http://127.0.0.1:$port/metrics" | grep -q 'job_attempts_total'
done
# Protected synthetic operation enters the real Hono tracing middleware, Prisma
# outbox, fenced two-worker race and real authenticated Centrifugo publish.
receipt="$WORK/operation.json"
curl -sf --max-time 5 -X POST -H "Authorization: Bearer $A2_OBS_KEY" \
  http://127.0.0.1:56244/__a2_obs_enqueue > "$receipt"
event_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["eventId"])' "$receipt")"
operation_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["operationId"])' "$receipt")"
for i in {1..70}; do
  ack="$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='$event_id' AND \"deliveredAt\" IS NOT NULL")"
  [[ "$ack" == 1 ]] && break
  sleep .3
done
[[ "$ack" == 1 ]] || { echo A2_REAL_WORKER_OUTBOX_NOT_DELIVERED; for f in "$WORK"/worker-*log; do tail -9 "$f" | cut -c1-160; done; exit 1; }
callback="$WORK/callback.json"
curl -sf --max-time 5 -X POST -H "Authorization: Bearer $A2_OBS_KEY" \
  -H "X-A2-Event-Id: $event_id" http://127.0.0.1:56245/__a2_obs_callback > "$callback"
python3 - "$receipt" "$callback" <<'CHECK'
import json,sys
first=json.load(open(sys.argv[1])); callback=json.load(open(sys.argv[2]))
assert first['operationId']==callback['operationId']
assert first['traceId']!=callback['traceId']
assert first['operationId'] and callback['requestId']
print('A2_REAL_HTTP_TO_SQL_OUTBOX_TO_TWO_WORKERS_TO_BROKER_AND_NEW_TRACE_CALLBACK_PASS')
CHECK
otlp_receipt="$WORK/otlp-matched.json"
for i in {1..50}; do
  curl -sf --max-time 3 -H "Authorization: Bearer $A2_OBS_KEY" \
    "http://127.0.0.1:56248/search?operationId=$operation_id" > "$otlp_receipt" || true
  if python3 - "$otlp_receipt" <<'OTLP_READY' 2>/dev/null
import json,sys
s={x['name'] for x in json.load(open(sys.argv[1]))['spans']}
required={'chat2.synthetic.outbox.enqueue','chat2.outbox.dispatch','chat2.outbox.publish',
          'chat2.outbox.ack','chat2.synthetic.callback.reconcile'}
sys.exit(0 if required<=s else 1)
OTLP_READY
  then break; fi
  sleep .4
done
python3 - "$otlp_receipt" "$receipt" "$callback" 'artifacts/a2-obs-real-otlp-query.json' <<'VERIFY_LOCAL_OTLP'
import json,sys,datetime
payload,first,callback=[json.load(open(f)) for f in sys.argv[1:4]]
spans=payload['spans']; names={s['name'] for s in spans}
expected={'chat2.synthetic.outbox.enqueue','chat2.outbox.dispatch','chat2.outbox.publish',
          'chat2.outbox.ack','chat2.synthetic.callback.reconcile'}
assert expected<=names,(expected-names,names)
assert all(s['operationId']==first['operationId']==callback['operationId'] for s in spans)
assert any(s.get('sourceTraceId')==first['traceId'] and s['name']=='chat2.outbox.dispatch' for s in spans)
assert any(s['traceId']==callback['traceId'] and s['name']=='chat2.synthetic.callback.reconcile' for s in spans)
assert first['traceId']!=callback['traceId']
record={'runPrefix':'a2-obs-','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'isolated searchable OTLP HTTP JSON sink, NOT deployed tracing backend',
 'spanCount':len(spans),'stages':sorted(expected),'samePersistedOperationDifferentTraces':True,
 'HTTPToApplicationOutboxWorkerBrokerSyntheticCallback':'PASS',
 'realCloudJobAndDeployedSearch':'PENDING'}
with open(sys.argv[4],'w') as f:json.dump(record,f,indent=2);f.write('\n')
print('A2_REAL_OTLP_SEARCH_CORRELATION_PASS',len(spans))
VERIFY_LOCAL_OTLP
for window in 1 2 3; do
  node scripts/qa/observability-multi-instance.mjs \
    --target=http://127.0.0.1:56244/ready --target=http://127.0.0.1:56245/ready \
    --warmup=2 --duration=12 --rate=30 --concurrency=28 --burst=3 \
    --out="artifacts/a2-obs-real-baseline/window-$window" > "$WORK/baseline-$window.log"
done
echo A2_REAL_TWO_API_STEADY_AND_BURST_BASELINE_PASS
# The outage is an actual stop of the disposable PostgreSQL service. Existing
# API instances and Worker pollers stay running; no shared connection is harmed.
pg_ctl -D "$pg_data" -m fast -w stop >/dev/null
pg_started=0
for port in 56244 56245; do
  code="$(curl -s --max-time 7 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/ready" || true)"
  [[ "$code" == 503 ]] || { echo "A2_DB_DOWN_READINESS_UNEXPECTED:$port/$code"; exit 1; }
done
pg_ctl -D "$pg_data" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 56241 -k $WORK/sock -c max_connections=60 -c timezone=UTC" -w start >/dev/null
pg_started=1
for i in {1..60}; do
  good=0
  for port in 56244 56245 56246 56247; do
    curl -sf --max-time 2 "http://127.0.0.1:$port/ready" >/dev/null 2>&1 && good=$((good+1))
  done
  [[ "$good" == 4 ]] && break
  sleep .3
done
[[ "$good" == 4 ]] || { echo A2_DATABASE_RECOVERY_FAILED; exit 1; }
echo A2_REAL_PG_OUTAGE_ALL_API_AND_WORKERS_RECOVERED
# A Redis outage must make both API readiness probes fail. Restoring the same
# disposable private Redis and broker does not require an app/worker restart.
kill "$redis_pid"; wait "$redis_pid" 2>/dev/null || true; redis_pid=''
for port in 56244 56245; do
  code="$(curl -s --max-time 7 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/ready" || true)"
  [[ "$code" == 503 ]] || { echo "A2_REDIS_DOWN_READINESS_UNEXPECTED:$port/$code"; exit 1; }
done
redis-server --bind 127.0.0.1 --port 56242 --save '' --appendonly no --protected-mode yes > "$WORK/redis-restarted.log" 2>&1 & redis_pid=$!
for i in {1..60}; do
  good=0
  for port in 56244 56245 56246 56247; do
    curl -sf --max-time 2 "http://127.0.0.1:$port/ready" >/dev/null 2>&1 && good=$((good+1))
  done
  [[ "$good" == 4 ]] && break
  sleep .5
done
[[ "$good" == 4 ]] || { echo A2_REDIS_RECOVERY_FAILED; exit 1; }
echo A2_REAL_REDIS_OUTAGE_ALL_API_AND_WORKERS_RECOVERED
# Full-service local restore, on a *new* PG data directory, with both real APIs
# and Worker loops restarted on a fresh snapshot. RTO ends after the real
# authenticated user scenario and its external ACK, not just readiness.
now_ms(){ python3 -c 'import time;print(int(time.time()*1000))'; }
run_restore_user(){
  GAFUS_A2_OBS_ISOLATED=1 A2_OBS_WORK_DIR="$WORK" A2_OBS_KEY="$A2_OBS_KEY" \
    node scripts/qa/observability-restore-user-scenario.mjs "$1"
}
run_restore_user seed
user_seed_op="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["operationId"])' "$WORK/restore-user-seed.json")"
[[ "$user_seed_op" =~ ^[a-f0-9-]{36}$ ]]
for i in {1..90}; do
  user_seed_ack="$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"operationId\"='$user_seed_op' AND \"deliveredAt\" IS NOT NULL")"
  [[ "$user_seed_ack" == 1 ]] && break
  sleep .3
done
[[ "$user_seed_ack" == 1 ]] || { echo A2_PRE_BACKUP_USER_OUTBOX_NOT_ACKED; exit 1; }
last_receipt="$WORK/last-restored-operation.json"
curl -sf --max-time 5 -X POST -H "Authorization: Bearer $A2_OBS_KEY" \
  http://127.0.0.1:56244/__a2_obs_enqueue > "$last_receipt"
restored_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["eventId"])' "$last_receipt")"
last_ack_ms="$(now_ms)"
"${PSQL[@]}" -c "INSERT INTO \"Chat2OutboxEvent\" (\"id\",\"conversationId\",\"eventType\",\"operationId\",\"nextAttemptAt\") VALUES ('a2-obs-preserved-pending','a2-obs-room','room.updated','a2-obs-preserved-operation',now()+interval '15 minutes')"
"${PSQL[@]}" -c "INSERT INTO \"Chat2OutboxEvent\" (\"id\",\"conversationId\",\"eventType\",\"operationId\",\"deadLetteredAt\") VALUES ('a2-obs-preserved-dlq','a2-obs-room','room.updated','a2-obs-preserved-dlq-op',now())"
pg_dump -Fc -h 127.0.0.1 -p 56241 -U a2obs -d gafus_a2_observability -f "$WORK/backup.dump"
test -s "$WORK/backup.dump"
pg_restore --list "$WORK/backup.dump" > "$WORK/backup-toc.txt"
grep -q Chat2OutboxEvent "$WORK/backup-toc.txt"
GAFUS_A2_OBS_ISOLATED=1 node scripts/qa/observability-external-archive.mjs capture "$WORK"
late_receipt="$WORK/post-backup-operation.json"
curl -sf --max-time 5 -X POST -H "Authorization: Bearer $A2_OBS_KEY" \
  http://127.0.0.1:56245/__a2_obs_enqueue > "$late_receipt"
lost_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["eventId"])' "$late_receipt")"
late_ack_ms="$(now_ms)"
[[ "$late_ack_ms" -ge "$last_ack_ms" ]]
# Immediate stop approximates a crash; old data directory remains isolated under
# WORK and is never reused by the restarted service. Restore only from dump.
recovery_start_ms="$(now_ms)"
for port in 56244 56245 56246 56247; do
  pid="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null | head -1)"
  [[ -n "$pid" ]] || { echo "A2_RECOVERY_SERVICE_PID_MISSING:$port"; exit 1; }
  owned_command="$(ps -p "$pid" -o command=)"
  [[ "$owned_command" == *"$ROOT/"* && "$owned_command" == *src/a2-observability-private-* ]] ||
    { echo "A2_RECOVERY_UNOWNED_PROCESS:$port"; exit 1; }
  kill -TERM "$pid"
done
for i in {1..60}; do
  listeners=0
  for port in 56244 56245 56246 56247; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then listeners=$((listeners+1)); fi
  done
  [[ "$listeners" == 0 ]] && break
  sleep .2
done
[[ "$listeners" == 0 ]] || { echo A2_RECOVERY_OLD_SERVICES_STILL_RUNNING; exit 1; }
# Reap launch-owned wrappers; don't retain old PIDs after restart.
for pid in "${child_pids[@]:-}"; do
  [[ -n "$pid" ]] || continue
  if kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid" 2>/dev/null || true; fi
  wait "$pid" 2>/dev/null || true
done
child_pids=()
pg_ctl -D "$pg_data" -m immediate -w stop >/dev/null
pg_started=0
pg_data="$WORK/pg-recovered"
initdb -D "$pg_data" -A trust -U a2obs --no-instructions > "$WORK/recovery-init.log" 2>&1
pg_ctl -D "$pg_data" -l "$WORK/recovered-pg.log" -o "-h 127.0.0.1 -p 56241 -k $WORK/sock -c max_connections=60 -c timezone=UTC" -w start >/dev/null
pg_started=1
createdb -h 127.0.0.1 -p 56241 -U a2obs gafus_a2_observability
GAFUS_A2_OBS_ISOLATED=1 node scripts/qa/observability-external-archive.mjs restore "$WORK"
pg_restore --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -p 56241 -U a2obs \
  -d gafus_a2_observability "$WORK/restored-external.dump" > "$WORK/recovery-restore.log" 2>&1 || {
  echo A2_RESTORE_SCHEMA_OR_DATA_FAILED; tail -12 "$WORK/recovery-restore.log" | cut -c1-130; exit 1;
}
new_data="$("${PSQL[@]}" -c 'show data_directory')"
[[ "$new_data" == "$WORK/pg-recovered" ]] || { echo A2_RECOVERY_WRONG_POSTGRES_DIR; exit 1; }
for port in 56244 56245; do launch_a2_api "$port" recovered; done
for port in 56246 56247; do launch_a2_worker "$port" recovered; done
[[ "$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='$restored_id'")" == 1 ]]
[[ "$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='$lost_id'")" == 0 ]]
[[ "$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='a2-obs-preserved-dlq' AND \"deadLetteredAt\" IS NOT NULL")" == 1 ]]
[[ "$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='a2-obs-preserved-pending' AND \"deliveredAt\" IS NULL")" == 1 ]]
for i in {1..90}; do
  restored_ready=0
  for port in 56244 56245 56246 56247; do
    curl -sf --max-time 2 "http://127.0.0.1:$port/ready" >/dev/null 2>&1 && restored_ready=$((restored_ready+1))
  done
  [[ "$restored_ready" == 4 ]] && break
  sleep .3
done
[[ "$restored_ready" == 4 ]] || { echo A2_POST_RESTORE_REAL_SERVICE_NOT_READY; exit 1; }
recovery_ready_ms="$(now_ms)"
# Release one restored *pending* outbox job and verify actual Worker ACK.
"${PSQL[@]}" -c "UPDATE \"Chat2OutboxEvent\" SET \"nextAttemptAt\"=now() WHERE \"id\"='a2-obs-preserved-pending'"
for i in {1..90}; do
  resumed="$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='a2-obs-preserved-pending' AND \"deliveredAt\" IS NOT NULL")"
  [[ "$resumed" == 1 ]] && break
  sleep .3
done
[[ "$resumed" == 1 ]] || {
  echo A2_RESTORED_PENDING_WORKER_DID_NOT_DRAIN
  "${PSQL[@]}" -c 'SELECT "id", "attempts", "lastErrorCode", ("claimedUntil" IS NOT NULL), ("deliveredAt" IS NOT NULL), "nextAttemptAt" FROM "Chat2OutboxEvent" WHERE "id"=$$a2-obs-preserved-pending$$' || true
  for port in 56246 56247; do
    echo "A2_WORKER_STATUS:$port"
    curl -s --max-time 3 -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$port/ready" || true
    curl -sf --max-time 3 -H "Authorization: Bearer $A2_OBS_KEY" "http://127.0.0.1:$port/metrics" | grep -E '(gafus_chat2_outbox_pending|job_attempts_total)' | tail -8 || true
  done
  for f in "$WORK"/worker-*log; do echo "A2_DEBUG:$(basename "$f")"; tail -12 "$f" | cut -c1-170; done
  exit 1
}
drain_complete_ms="$(now_ms)"
run_restore_user verify
user_op="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["operationId"])' "$WORK/restore-user-verify.json")"
[[ "$user_op" =~ ^[a-f0-9-]{36}$ ]]
for i in {1..90}; do
  user_ack="$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"operationId\"='$user_op' AND \"deliveredAt\" IS NOT NULL")"
  [[ "$user_ack" == 1 ]] && break
  sleep .3
done
[[ "$user_ack" == 1 ]] || { echo A2_POST_RESTORE_USER_OUTBOX_NOT_ACKED; exit 1; }
user_complete_ms="$(now_ms)"
for i in {1..50}; do
  curl -sf --max-time 3 -H "Authorization: Bearer $A2_OBS_KEY" \
    "http://127.0.0.1:56248/search?operationId=$user_op" > "$WORK/restore-user-otlp.json" || true
  if python3 - "$WORK/restore-user-otlp.json" "$WORK/restore-user-verify.json" <<'TRACE_USER' 2>/dev/null
import json,sys
spans=json.load(open(sys.argv[1]))['spans']; user=json.load(open(sys.argv[2]))
names={s['name'] for s in spans}
assert {'chat2.message.create.transaction','chat2.outbox.dispatch','chat2.outbox.publish','chat2.outbox.ack'}<=names
assert all(s['operationId']==user['operationId'] for s in spans)
http=next(s for s in spans if s.get('clientPlatform')=='ios' and s.get('clientVersion')=='1.7.6' and s.get('clientBuild')=='900001' and s.get('otaRevision')==1)
assert http['traceId']==user['traceId']
dispatch=next(s for s in spans if s['name']=='chat2.outbox.dispatch')
assert dispatch['sourceTraceId']==user['traceId']
assert dispatch['queueWaitMs']>=0 and dispatch['eventAgeMs']>=dispatch['queueWaitMs']
TRACE_USER
  then user_trace_pass=1; break; fi
  sleep .4
done
[[ "${user_trace_pass:-0}" == 1 ]] || { echo A2_REAL_USER_TRACE_CHAIN_MISSING; exit 1; }
export A2_EXTERNAL_ARCHIVE_RECEIPT="$WORK/external-archive/restore-receipt.json"
export A2_RESTORE_RTO_MS="$((user_complete_ms-recovery_start_ms))"
export A2_RESTORE_READINESS_MS="$((recovery_ready_ms-recovery_start_ms))"
export A2_RESTORE_USER_RECEIPT="$WORK/restore-user-verify.json"
export A2_RESTORE_RPO_GAP_MS="$((late_ack_ms-last_ack_ms))"
export A2_RESTORE_DRAIN_MS="$((drain_complete_ms-recovery_ready_ms))"
python3 - 'artifacts/a2-obs-real-service-restore.json' <<'RESTORE_RECEIPT'
import json,sys,os,datetime
r={'runPrefix':'a2-obs-','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'disposable PG crash -> encrypted external archive (storageMode in receipt) -> independent PG cluster and restored objects -> fresh 2 API + 2 Chat2 Worker -> authenticated user operation and ACK; synthetic media and X.509 signed preview OTA',
 'externalArchive':json.load(open(os.environ['A2_EXTERNAL_ARCHIVE_RECEIPT'])),
 'fullServiceRtoMs':int(os.environ['A2_RESTORE_RTO_MS']),
 'serviceReadinessMs':int(os.environ['A2_RESTORE_READINESS_MS']),
 'userScenario':json.load(open(os.environ['A2_RESTORE_USER_RECEIPT']))['checks'],
 'postRestoreRealUserOutboxAck':True,'freshServiceProcesses':True,'realUserTraceChain':True,
 'observedAcknowledgedRpoGapMs':int(os.environ['A2_RESTORE_RPO_GAP_MS']),
 'observedAcknowledgedWriteLossCount':1,
 'restoredPreviouslyAcknowledgedWrite':True,'postBackupAcknowledgedWriteAbsent':True,
 'restoredPendingOutbox':True,'restoredDeadLetter':True,'restoredPendingWorkerDrainMs':int(os.environ['A2_RESTORE_DRAIN_MS']),
 'allServiceReadiness':True,'checks':'PASS','stagingRpoRto':'PENDING'}
limits={key:os.environ.get(env) for key,env in [
 ('fullServiceRtoMs','A2_RESTORE_MAX_RTO_MS'),('observedAcknowledgedRpoGapMs','A2_RESTORE_MAX_RPO_MS')]}
if any(v is not None and (not v.isdecimal() or int(v)<=0) for v in limits.values()):
 raise SystemExit('A2_RESTORE_INVALID_PRODUCT_BUDGET')
r['productBudgetStatus']='UNSPECIFIED' if any(v is None for v in limits.values()) else (
 'PASS' if all(r[k]<=int(v) for k,v in limits.items()) else 'FAIL')
r['productBudgetMs']={k:int(v) if v is not None else None for k,v in limits.items()}
with open(sys.argv[1],'w') as f:json.dump(r,f,indent=2);f.write('\n')
if r['productBudgetStatus']=='FAIL':raise SystemExit('A2_RESTORE_PRODUCT_BUDGET_EXCEEDED')
print('A2_PRIVATE_RESTORE_USER_SCENARIO_PASS',r['fullServiceRtoMs'],r['observedAcknowledgedRpoGapMs'],r['restoredPendingWorkerDrainMs'])
RESTORE_RECEIPT
if [[ "${1:-}" == --restore-only ]]; then exit 0; fi
for window in 1 2 3; do
  node scripts/qa/observability-multi-instance.mjs \
    --target=http://127.0.0.1:56244/ready --target=http://127.0.0.1:56245/ready \
    --warmup=2 --duration=12 --rate=30 --concurrency=28 --burst=3 \
    --out="artifacts/a2-obs-real-candidate/window-$window" > "$WORK/candidate-$window.log"
done
# An inconclusive/noisy host p95 gate must NOT suppress reliability, reset and
# observable-recovery evidence. It is still a failing acceptance at the end.
load_gate_rc=0
node scripts/qa/observability-load-median.mjs \
  artifacts/a2-obs-real-baseline artifacts/a2-obs-real-candidate 3 \
  > "$WORK/load-window-comparator.log" || load_gate_rc=$?
[[ "$load_gate_rc" == 0 || "$load_gate_rc" == 2 ]] || { echo "A2_UNEXPECTED_LOAD_COMPARATOR_ERROR:$load_gate_rc"; exit "$load_gate_rc"; }
# An actual worker replica disappears: its process-local counters disappear,
# return to zero after restart, and immediately resume counting real outbox ACKs.
stop_a2_worker(){
  local port="$1" owned_pid owned_command
  owned_pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN | head -1)"
  [[ -n "$owned_pid" ]] || { echo "A2_WORKER_NOT_LISTENING:$port"; exit 1; }
  owned_command="$(ps -p "$owned_pid" -o command=)"
  if ! printf '%s' "$owned_command" | grep -Fq "$ROOT/" ||
     ! printf '%s' "$owned_command" | grep -Fq 'src/a2-observability-private-worker.ts'; then
    echo "A2_REFUSE_TERMINATE_FOREIGN_WORKER:$port"; exit 2
  fi
  kill -TERM "$owned_pid"
  for i in {1..40}; do
    lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep .25
  done
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "A2_WORKER_TERMINATION_NOT_CONFIRMED:$port"; exit 1
  fi
}
metrics_a2_worker(){
  curl -sf --max-time 5 -H "Authorization: Bearer $A2_OBS_KEY" "http://127.0.0.1:$1/metrics"
}
delivered_a2_worker(){
  metrics_a2_worker "$1" | awk '$1=="job_attempts_total{job_type=\"chat2_outbox\",outcome=\"delivered\"}" {print $2}'
}
stop_a2_worker 56247
forced="$WORK/forced-worker.json"
curl -sf --max-time 5 -X POST -H "Authorization: Bearer $A2_OBS_KEY" \
  http://127.0.0.1:56244/__a2_obs_enqueue > "$forced"
forced_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["eventId"])' "$forced")"
for i in {1..65}; do
  forced_ack="$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='$forced_id' AND \"deliveredAt\" IS NOT NULL")"
  [[ "$forced_ack" == 1 ]] && break
  sleep .25
done
[[ "$forced_ack" == 1 ]] || { echo A2_WORKER_SINGLE_REPLICA_FAILED; exit 1; }
prior_deliveries="$(delivered_a2_worker 56246)"
[[ "$prior_deliveries" =~ ^[0-9]+$ && "$prior_deliveries" -gt 0 ]] || {
  echo "A2_WORKER_COUNTER_NOT_GROWING:$prior_deliveries"; exit 1;
}
stop_a2_worker 56246
# Offline scrape means missing source, not zero count in the old process.
missing_code="$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $A2_OBS_KEY" http://127.0.0.1:56246/metrics || true)"
[[ "$missing_code" != 200 ]] || { echo A2_WORKER_MISSING_SOURCE_FALSE_NEGATIVE; exit 1; }
launch_a2_worker 56246 restart
for i in {1..90}; do
  curl -sf --max-time 2 http://127.0.0.1:56246/ready >/dev/null 2>&1 && break
  sleep .25
done
curl -sf --max-time 2 http://127.0.0.1:56246/ready >/dev/null || {
  echo A2_RESTARTED_WORKER_NOT_READY; exit 1;
}
reset_deliveries="$(delivered_a2_worker 56246)"
[[ "$reset_deliveries" == 0 ]] || { echo "A2_WORKER_COUNTER_NOT_RESET:$reset_deliveries"; exit 1; }
resumed="$WORK/resumed-worker.json"
curl -sf --max-time 5 -X POST -H "Authorization: Bearer $A2_OBS_KEY" \
  http://127.0.0.1:56245/__a2_obs_enqueue > "$resumed"
resumed_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["eventId"])' "$resumed")"
for i in {1..65}; do
  resumed_ack="$("${PSQL[@]}" -c "SELECT count(*) FROM \"Chat2OutboxEvent\" WHERE \"id\"='$resumed_id' AND \"deliveredAt\" IS NOT NULL")"
  [[ "$resumed_ack" == 1 ]] && break
  sleep .25
done
[[ "$resumed_ack" == 1 ]] || { echo A2_RESTARTED_WORKER_NOT_PROCESSING; exit 1; }
resumed_deliveries="$(delivered_a2_worker 56246)"
[[ "$resumed_deliveries" =~ ^[0-9]+$ && "$resumed_deliveries" -ge 1 ]] || {
  echo A2_RESTARTED_WORKER_METRIC_NOT_GROWING; exit 1;
}
launch_a2_worker 56247 restart
for i in {1..90}; do
  curl -sf --max-time 2 http://127.0.0.1:56247/ready >/dev/null 2>&1 && break
  sleep .25
done
curl -sf --max-time 2 http://127.0.0.1:56247/ready >/dev/null || {
  echo A2_SECOND_WORKER_NOT_RECOVERED; exit 1;
}
export A2_WORKER_BEFORE_RESTART="$prior_deliveries"
export A2_WORKER_AFTER_RESTART="$reset_deliveries"
export A2_WORKER_AFTER_RECOVERY="$resumed_deliveries"
python3 - 'artifacts/a2-obs-worker-metric-restart.json' <<'METRICS_RESTART_RECEIPT'
import os,json,sys,datetime
before,reset,recovered=(int(os.environ[n]) for n in
 ('A2_WORKER_BEFORE_RESTART','A2_WORKER_AFTER_RESTART','A2_WORKER_AFTER_RECOVERY'))
assert before>0 and reset==0 and recovered>0
receipt={'runPrefix':'a2-obs-','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'two real Chat2 Workers with one replica retired and restarted on localhost',
 'deliveredCounterBeforeRestart':before,'metricsSourceDisappeared':True,
 'counterAfterRestart':reset,'deliveredCounterAfterNewAcknowledgedOutboxEvent':recovered,
 'otherWorkerRestored':True,'scraperAlertFiringResolved':'PENDING_PROMETHEUS_RUNTIME',
 'checks':'PASS'}
with open(sys.argv[1],'w') as f:json.dump(receipt,f,indent=2);f.write('\n')
print('A2_REAL_WORKER_COUNTER_RESET_MISSING_SOURCE_AND_RECOVERY_PASS')
METRICS_RESTART_RECEIPT
python3 - "$receipt" "$callback" "artifacts/a2-obs-real-baseline/summary.json" "artifacts/a2-obs-real-candidate/summary.json" "artifacts/a2-obs-real-multi-summary.json" "$load_gate_rc" <<'REPORT'
import datetime, json, sys
from pathlib import Path

receipt_path, callback_path, baseline_path, candidate_path, output, load_gate_rc = sys.argv[1:]
initial = json.loads(Path(receipt_path).read_text())
callback = json.loads(Path(callback_path).read_text())
baseline = candidate = comparator = None
if Path(baseline_path).is_file() and Path(candidate_path).is_file():
    baseline = json.loads(Path(baseline_path).read_text())['measured']
    candidate_summary = json.loads(Path(candidate_path).read_text())
    candidate = candidate_summary['measured']
    comparator = candidate_summary['comparator']
assert load_gate_rc != '0' or (comparator and comparator['pass'])

def load_metrics(measured):
    if measured is None:
        return None
    return {k:measured[k] for k in ('requestsPerSecond','errorRate','p50Ms','p95Ms','p99Ms','capacityDropRate')}

summary={'runPrefix':'a2-obs-', 'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'scope':'loopback-only real Hono 2 API, real Chat2 dispatch 2 worker, fresh PG/Redis/Centrifugo',
  'instances':{'api':2,'chat2Workers':2,'postgres':1,'redis':1,'centrifugo':1},
  'dbDownReadiness503':True,'dbRecoveryAllReady':True,'redisDownReadiness503':True,'redisRecoveryAllReady':True,
  'correlatedOutboxDelivered':True,'differentTraceCallbackSameOperation':initial['operationId']==callback['operationId'],
  'baseline':load_metrics(baseline),'candidate':load_metrics(candidate),
  'p95DeltaPercent':comparator['changeP95Percent'] if comparator else None,
  'loadRegressionPass':load_gate_rc == '0',
  'loadProfile':'same code pre/post restore; not an old-new version A/B',
  'media360pHighVolume':'PENDING external test storage/Cloud Job','stagingReleaseRollback':'PENDING',
  'localFullServiceRestore':json.load(open('artifacts/a2-obs-real-service-restore.json')),
  'localOtlpSearch':json.load(open('artifacts/a2-obs-real-otlp-query.json')),
  'workerCounterRestart':json.load(open('artifacts/a2-obs-worker-metric-restart.json'))}
with open(output,'w') as f: json.dump(summary,f,indent=2); f.write('\n')
print(json.dumps(summary,indent=2))
REPORT
if [[ "$load_gate_rc" != 0 ]]; then
  echo A2_FUNCTIONAL_CHAOS_OTLP_RESTORE_METRICS_PASS_PERFORMANCE_GATE_FAILED
  cat "$WORK/load-window-comparator.log"
  exit "$load_gate_rc"
fi
echo A2_REAL_TWO_API_TWO_WORKER_END_TO_END_AND_DB_REDIS_CHAOS_PASS
