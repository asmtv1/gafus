#!/bin/bash
# Opt-in real Hono/PG/Redis HTTP QA. Only launch-owned PIDs & PG data dir touched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REPORT="${GAFUS_TEST_REPORT_PATH:-}"
[[ "$REPORT" == "$ROOT/.qa/testing/qa-"* && "$REPORT" == */tasks/*/tests.json && "$REPORT" != *..* && ! -L "$REPORT" && -d "$(dirname "$REPORT")" ]] || {
 echo API_QA_UNOWNED_REPORT_DENIED;exit 2;
}
for key in $(env | cut -d= -f1);do
 case "$key" in
  DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|JWT_SECRET|JWT_REFRESH_SECRET|YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|CLOUD_RU_*|RESEND_*|SMTP_*|FCM_*|APNS_*|VK_*|BEGET_*|YANDEX_*|UPTRACE_*|TELEGRAM_*) unset "$key";;
 esac
done
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb redis-server redis-cli node openssl python3;do
 command -v "$bin" >/dev/null || { echo "API_QA_MISSING_TOOL $bin";exit 2;}
done
umask 077
DIR="$(mktemp -d /tmp/gafus-qa-api-http.XXXXXXXX)"
PG_STARTED=0
REDIS_STARTED=0
REDIS_PID=''
API_PID=''
PG_STOPPED=0
REDIS_STOPPED=0
cleanup(){
 result=$?
 trap - EXIT INT TERM
 if [[ -n "$API_PID" ]];then
   if kill -0 "$API_PID" 2>/dev/null;then kill -TERM "$API_PID" 2>/dev/null || true;fi
   wait "$API_PID" 2>/dev/null || true
 fi
 if [[ "$REDIS_STARTED" == 1 && -n "$REDIS_PID" ]];then
   if kill -0 "$REDIS_PID" 2>/dev/null;then kill -TERM "$REDIS_PID" 2>/dev/null || true;fi
   wait "$REDIS_PID" 2>/dev/null || true
   REDIS_STOPPED=1
 fi
 if [[ "$PG_STARTED" == 1 ]];then
   if pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1;then PG_STOPPED=1;fi
 fi
 if [[ "$DIR" == /tmp/gafus-qa-api-http.* && -d "$DIR" && ! -L "$DIR" ]];then rm -rf -- "$DIR";fi
 if [[ "$result" == 0 && "$PG_STOPPED" == 1 && "$REDIS_STOPPED" == 1 && ! -e "$DIR" ]];then
   node - "$(dirname "$REPORT")/resources.json" "$DB_NAME" "$PG_PORT" "$REDIS_PORT" <<'JS'
const fs=require('node:fs');fs.writeFileSync(process.argv[2],JSON.stringify({
 schema:1,database:process.argv[3],postgresPort:Number(process.argv[4]),redisPort:Number(process.argv[5]),
 wrapperSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync('scripts/qa/api-authenticated-http-isolated.sh')).digest('hex'),
 ownedPostgresStopped:true,ownedRedisStopped:true,ownedApiStopped:true,
 ownedTemporaryDirectoryRemoved:true,otherProcessesUntouched:true,
 location:'disposable-loopback-PostgreSQL18-Redis-Hono',noProductionConnections:true
},null,2)+'\n',{mode:0o600});
JS
 else
   if [[ "$result" == 0 ]];then echo API_QA_RESOURCE_CLEANUP_INCOMPLETE;result=2;fi
 fi
 exit "$result"
}
trap cleanup EXIT INT TERM
port(){ python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
PG_PORT="$(port)";REDIS_PORT="$(port)"
[[ "$PG_PORT" != "$REDIS_PORT" ]] || { echo API_QA_PORT_COLLISION;exit 2; }
DB_NAME="archqa_http_$(openssl rand -hex 6)"
initdb -D "$DIR/pg" -A trust -U qahttp --no-instructions >"$DIR/pg-init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PG_PORT" -w start >/dev/null
PG_STARTED=1
createdb -h 127.0.0.1 -p "$PG_PORT" -U qahttp "$DB_NAME"
mkdir -m 700 "$DIR/redis"
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --protected-mode yes --save '' --appendonly no --dir "$DIR/redis" --daemonize no >"$DIR/redis.log" 2>&1 &
REDIS_PID=$!;REDIS_STARTED=1
ready=0
for i in $(seq 1 60);do
 if redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG;then ready=1;break;fi
 sleep .1
done
[[ "$ready" == 1 ]] || { echo API_QA_OWN_REDIS_UNAVAILABLE;exit 2; }
export DATABASE_URL="postgresql://qahttp@127.0.0.1:$PG_PORT/$DB_NAME?schema=public"
export REDIS_URL="redis://127.0.0.1:$REDIS_PORT/0"
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export NODE_ENV=test GAFUS_QA_AUTH_API_HTTP=1 GAFUS_LOCAL_ISOLATED_API=1
export FEED_ENABLED=false GALLERY_ENABLED=false CDN_HEALTH_MONITOR_ENABLED=false
export CLOUDRU_MEDIA_JOBS_ENABLED=false GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY=disabled
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1) || { echo API_QA_SCHEMA_FAILED;tail -35 "$DIR/schema.log";exit 2; }
(cd apps/api && node --import tsx src/test/qa-authenticated-http.acceptance.mts) &
API_PID=$!
wait "$API_PID";API_PID=''
