#!/bin/bash
# Original Web Vite + real Hono + private PostgreSQL18/Redis, coordinated through
# existing user's personal Chrome Extension. Never touch shared dev/prod services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REPORT="${GAFUS_TEST_REPORT_PATH:-}"
[[ "$REPORT" == "$ROOT/.qa/testing/qa-"* && "$REPORT" == */tasks/*/tests.json && "$REPORT" != *..* && ! -L "$REPORT" && -d "$(dirname "$REPORT")" ]] || {
 echo QA_DELETE_UNOWNED_REPORT_DENIED;exit 2;
}
for key in $(env|cut -d= -f1);do
 case "$key" in
  DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|JWT_SECRET|JWT_REFRESH_SECRET|YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|CLOUD_RU_*|RESEND_*|SMTP_*|MAIL_*|FCM_*|APNS_*|VK_*|BEGET_*|YANDEX_*|UPTRACE_*|TELEGRAM_*|VITE_API_BASE_URL|GAFUS_WEB_DEV_API_MODE|GAFUS_QA_ACCOUNT_*)unset "$key";;
 esac
done
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb redis-server redis-cli node openssl python3 curl ps lsof;do
 command -v "$bin" >/dev/null || { echo "QA_DELETE_MISSING_TOOL $bin";exit 2; }
done
umask 077
DIR="$(mktemp -d /tmp/gafus-qa-delete-web.XXXXXXXX)"
PG_STARTED=0
REDIS_PID=''
API_PID=''
WEB_PID=''
PG_STOPPED=0
REDIS_STOPPED=0
WEB_STOPPED=0
cleanup(){
 result=$?
 trap - EXIT INT TERM
 if [[ -n "$WEB_PID" ]];then
  # The launcher execs the actual Vite node process: WEB_PID must refer to
  # the listener itself, not to an intermediate pnpm/shell that can orphan it.
  if kill -0 "$WEB_PID" 2>/dev/null;then
   if node scripts/qa/owned-vite-process.mjs owned "$WEB_PID" "$WEB_PORT" "$$" >/dev/null;then
    kill -TERM "$WEB_PID" 2>/dev/null || true
   else
    echo QA_DELETE_VITE_OWNER_MISMATCH_NO_SIGNAL >&2
   fi
  fi
  # Reap only our child; never wait indefinitely on a foreign/reused PID.
  for i in $(seq 1 50);do
   status="$(ps -p "$WEB_PID" -o stat= 2>/dev/null || true)"
   if [[ -z "$status" || "$status" == Z* ]];then
    wait "$WEB_PID" 2>/dev/null || true
    break
   fi
   sleep .1
  done
  # A stuck, still-owned Vite may be forced down, but a changed PID/command
  # must NEVER be signalled. No broad pkill, process-group or port killing.
  if kill -0 "$WEB_PID" 2>/dev/null;then
   status="$(ps -p "$WEB_PID" -o stat= 2>/dev/null || true)"
   if [[ -n "$status" && "$status" != Z* ]] &&
      node scripts/qa/owned-vite-process.mjs owned "$WEB_PID" "$WEB_PORT" "$$" >/dev/null;then
    kill -KILL "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
   fi
  fi
  # A successful wait/TERM is NOT a cleanup receipt. Both the exact PID
  # and every listener on this QA-only port must actually be absent.
  for i in $(seq 1 30);do
   if node scripts/qa/owned-vite-process.mjs released "$WEB_PID" "$WEB_PORT" >/dev/null 2>&1;then
    WEB_STOPPED=1
    break
   fi
   sleep .1
  done
  if [[ "$WEB_STOPPED" != 1 ]];then
   echo QA_DELETE_VITE_PROCESS_OR_PORT_NOT_RELEASED_NO_SUCCESS_RECEIPT >&2
  fi
 fi
 if [[ -n "$API_PID" ]];then
  if kill -0 "$API_PID" 2>/dev/null;then kill -TERM "$API_PID" 2>/dev/null || true;fi
  wait "$API_PID" 2>/dev/null || true
 fi
 if [[ -n "$REDIS_PID" ]];then
  if kill -0 "$REDIS_PID" 2>/dev/null;then kill -TERM "$REDIS_PID" 2>/dev/null || true;fi
  wait "$REDIS_PID" 2>/dev/null || true
  REDIS_STOPPED=1
 fi
 if [[ "$PG_STARTED" == 1 ]];then
  if pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1;then PG_STOPPED=1;fi
 fi
 if [[ "$DIR" == /tmp/gafus-qa-delete-web.* && -d "$DIR" && ! -L "$DIR" ]];then rm -rf -- "$DIR";fi
 if [[ "$result" == 0 && "$PG_STOPPED" == 1 && "$REDIS_STOPPED" == 1 && "$WEB_STOPPED" == 1 && ! -e "$DIR" ]];then
  node - "$(dirname "$REPORT")/resources.json" "$DB_NAME" "$PG_PORT" "$REDIS_PORT" "$WEB_PORT" "$API_PORT" "$WEB_STOPPED" "$WEB_PID" <<'JS'
const fs=require('fs'),hash=require('crypto').createHash('sha256');
const verified=process.argv[8]==='1';
if(!verified||!Number.isSafeInteger(Number(process.argv[9]))||Number(process.argv[9])<=1)
  throw Error('QA_DELETE_VITE_PROOF_NOT_PRESENT');
// Re-evaluate the actual OS process table and listening socket immediately
// before persisting the success receipt; never trust a shell flag alone.
const verify=require('node:child_process').spawnSync(process.execPath,
  ['scripts/qa/owned-vite-process.mjs','released',process.argv[9],process.argv[6]],
  {encoding:'utf8',timeout:5000});
if(verify.status!==0)throw Error('QA_DELETE_VITE_PORT_OR_PID_REAPPEARED');
fs.writeFileSync(process.argv[2],JSON.stringify({schema:2,database:process.argv[3],
 postgresPort:Number(process.argv[4]),redisPort:Number(process.argv[5]),
 webPort:Number(process.argv[6]),apiPort:Number(process.argv[7]),
 runnerSha256:hash.update(fs.readFileSync('scripts/qa/api-account-delete-web-isolated.sh')).digest('hex'),
 ownedPostgresStopped:true,ownedRedisStopped:true,ownedHonoStopped:true,
 ownedViteStopped:verified,viteProcessId:Number(process.argv[9]),
 vitePidAbsentVerified:verified,vitePortFreeVerified:verified,
 viteLifecycleGuardSha256:require('node:crypto').createHash('sha256')
  .update(fs.readFileSync('scripts/qa/owned-vite-process.mjs')).digest('hex'),
 temporaryDirectoryRemoved:true,existingChromePreserved:true,
 noExternalMail:true,noProductionConnections:true
},null,2)+'\n',{mode:0o600});
JS
 else
  if [[ "$result" == 0 ]];then echo QA_DELETE_INCOMPLETE_RESOURCE_CLEANUP;result=2;fi
 fi
 exit "$result"
}
trap cleanup EXIT INT TERM
port(){ python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
PG_PORT="$(port)";REDIS_PORT="$(port)";WEB_PORT="$(port)";API_PORT="$(port)"
[[ "$(printf '%s\n' "$PG_PORT" "$REDIS_PORT" "$WEB_PORT" "$API_PORT"|sort -u|wc -l|tr -d ' ')" == 4 ]] || { echo QA_DELETE_PORT_COLLISION;exit 2; }
DB_NAME="archqa_delete_$(openssl rand -hex 6)"
QA_RUN="$(openssl rand -hex 6)"
mkdir -m 700 "$DIR/mail"
initdb -D "$DIR/pg" -A trust -U qahttp --no-instructions >"$DIR/pg-init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg-server.log" -o "-h 127.0.0.1 -p $PG_PORT" -w start >/dev/null
PG_STARTED=1
createdb -h 127.0.0.1 -p "$PG_PORT" -U qahttp "$DB_NAME"
mkdir -m 700 "$DIR/redis"
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --protected-mode yes --save '' --appendonly no --dir "$DIR/redis" --daemonize no >"$DIR/redis.log" 2>&1 &
REDIS_PID=$!
ready=0
for i in $(seq 1 60);do
 if redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null|grep -q PONG;then ready=1;break;fi
 sleep .1
done
[[ "$ready" == 1 ]] || { echo QA_DELETE_REDIS_FAILED;exit 2; }
export DATABASE_URL="postgresql://qahttp@127.0.0.1:$PG_PORT/$DB_NAME?schema=public"
export REDIS_URL="redis://127.0.0.1:$REDIS_PORT/0"
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export NODE_ENV=test GAFUS_QA_ACCOUNT_DELETE_WEB=1 GAFUS_LOCAL_ISOLATED_API=1 API_HOST=127.0.0.1
export GAFUS_QA_ACCOUNT_DELETE_RUN="$QA_RUN" GAFUS_QA_ACCOUNT_DELETE_WEB_PORT="$WEB_PORT"
export GAFUS_QA_ACCOUNT_DELETE_API_PORT="$API_PORT" GAFUS_QA_ACCOUNT_DELETE_DB="$DB_NAME"
export GAFUS_QA_ACCOUNT_DELETE_DIR="$DIR" GAFUS_QA_ACCOUNT_MAIL_FILE="$DIR/mail/code.json"
export FEED_ENABLED=false GALLERY_ENABLED=false CDN_HEALTH_MONITOR_ENABLED=false
export CLOUDRU_MEDIA_JOBS_ENABLED=false GAFUS_BOUND_NOTIFICATION_OUTBOX_RECOVERY=disabled
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/pg-schema.log" 2>&1) || {
 echo QA_DELETE_PRISMA_SCHEMA_FAILED;tail -25 "$DIR/pg-schema.log";exit 2;
}
# Compile the currently edited source: do not use stale package dist for mail/deletion.
pnpm --filter @gafus/core build >"$DIR/core-build.log" 2>&1 || {
 echo QA_DELETE_CORE_BUILD_FAILED;tail -25 "$DIR/core-build.log";exit 2;
}
(cd apps/api && node --import tsx src/test/qa-account-delete-web-server.mts) >"$(dirname "$REPORT")/api.log" 2>&1 &
API_PID=$!
ready=0
for i in $(seq 1 120);do
 if [[ -f "$(dirname "$REPORT")/browser-ready.json" ]];then ready=1;break;fi
 if ! kill -0 "$API_PID" 2>/dev/null;then break;fi
 sleep .15
done
[[ "$ready" == 1 ]] || { echo QA_DELETE_HONO_START_FAILED;tail -25 "$(dirname "$REPORT")/api.log";exit 2; }
# No pnpm intermediary: the shell execs this exact Vite node listener so
# WEB_PID identifies the actual owner and wait() reaps it directly.
(cd apps/web-vite && exec env GAFUS_WEB_DEV_API_MODE=mock NODE_ENV=development node ./node_modules/vite/bin/vite.js --config vite.account-delete-qa.config.mjs --host 127.0.0.1 --port "$WEB_PORT" --strictPort) >"$(dirname "$REPORT")/vite.log" 2>&1 &
WEB_PID=$!
ready=0
for i in $(seq 1 130);do
 if curl --noproxy '*' --silent --max-time 2 --resolve "qa-delete-owner-$QA_RUN.localhost:$WEB_PORT:127.0.0.1" \
   "http://qa-delete-owner-$QA_RUN.localhost:$WEB_PORT/login" -o /dev/null -f;then ready=1;break;fi
 if ! kill -0 "$WEB_PID" 2>/dev/null;then break;fi
 sleep .18
done
[[ "$ready" == 1 ]] || { echo QA_DELETE_WEB_VITE_START_FAILED;tail -28 "$(dirname "$REPORT")/vite.log";exit 2; }
echo QA_DELETE_WEB_READY "$QA_RUN" "$WEB_PORT" "$API_PORT"
wait "$API_PID"
API_PID=''
