#!/bin/bash
# Disposable SQL-queued original Worker + fake in-memory object/CDN adapters.
# NEVER connect to any cloud bucket or external provider.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REPORT="${GAFUS_TEST_REPORT_PATH:-}"
[[ "$REPORT" == "$ROOT/.qa/testing/qa-"* && "$REPORT" == */tasks/*/tests.json && "$REPORT" != *..* && ! -L "$REPORT" && -d "$(dirname "$REPORT")" ]] || { echo QA_FAKE_UNOWNED_REPORT; exit 2; }
for key in $(env|cut -d= -f1);do
 case "$key" in
 DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|JWT_SECRET|JWT_REFRESH_SECRET|YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|CLOUD_RU_*|RESEND_*|SMTP_*|MAIL_*|FCM_*|APNS_*|VK_*|BEGET_*|YANDEX_*|UPTRACE_*|TELEGRAM_*|GALLERY_*|FEED_*|PUBLIC_*|YC_*|GAFUS_QA_WORKER_*|ACCOUNT_CLEANUP_TEST_DATABASE_URL)unset "$key";;
 esac
done
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for cmd in initdb pg_ctl createdb redis-server redis-cli node openssl python3 lsof;do command -v "$cmd" >/dev/null || { echo "QA_FAKE_MISSING_${cmd}";exit 2; };done
umask 077
DIR="$(mktemp -d /tmp/gafus-qa-worker-store.XXXXXXXX)"
RUN="$(openssl rand -hex 6)"
DB="archqa_worker_$RUN"
PG_STARTED=0;REDIS_PID='';REDIS_STOPPED=0;PG_STOPPED=0
port(){ python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
PG_PORT="$(port)";REDIS_PORT="$(port)"
[[ "$PG_PORT" != "$REDIS_PORT" ]] || { echo QA_FAKE_PORT_COLLISION;exit 2; }
cleanup(){
 status=$?
 trap - EXIT INT TERM
 if [[ -n "$REDIS_PID" ]];then
  if kill -0 "$REDIS_PID" 2>/dev/null;then
   cmdline="$(ps -p "$REDIS_PID" -o command= 2>/dev/null || true)"
   if [[ "$cmdline" == *redis-server* && "$cmdline" == *"$REDIS_PORT"* ]];then
    kill -TERM "$REDIS_PID" 2>/dev/null || true
   else echo QA_FAKE_REDIS_OWNER_UNCERTAIN >&2;fi
  fi
  for i in $(seq 1 30);do
   if ! kill -0 "$REDIS_PID" 2>/dev/null;then break;fi
   sleep .1
  done
  wait "$REDIS_PID" 2>/dev/null || true
  if ! kill -0 "$REDIS_PID" 2>/dev/null && ! /usr/sbin/lsof -nP -t -iTCP:"$REDIS_PORT" -sTCP:LISTEN 2>/dev/null | grep -q .;then REDIS_STOPPED=1;fi
 fi
 if [[ "$PG_STARTED" == 1 ]];then
  if pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1 &&
     ! /usr/sbin/lsof -nP -t -iTCP:"$PG_PORT" -sTCP:LISTEN 2>/dev/null|grep -q .;then PG_STOPPED=1;fi
 fi
 if [[ "$DIR" == /tmp/gafus-qa-worker-store.* && -d "$DIR" && ! -L "$DIR" ]];then rm -rf -- "$DIR";fi
 if [[ "$status" == 0 && "$REDIS_STOPPED" == 1 && "$PG_STOPPED" == 1 && ! -e "$DIR" ]];then
  node - "$(dirname "$REPORT")/resources.json" "$RUN" "$DB" "$PG_PORT" "$REDIS_PORT" <<'JS'
const fs=require('fs'),crypto=require('crypto');
const [target,run,db,pg,redis]=process.argv.slice(2);
fs.writeFileSync(target,JSON.stringify({schema:1,run,db,postgresPort:Number(pg),redisPort:Number(redis),
 ownedPostgresStopped:true,ownedRedisStopped:true,temporaryDirectoryRemoved:true,
 fakeStorageOnly:true,cloudStorageTouched:false,externalCdnTouched:false,
 runnerSha256:crypto.createHash('sha256').update(fs.readFileSync('scripts/qa/account-cleanup-fake-storage-isolated.sh')).digest('hex')},null,2)+'\n',{mode:0o600});
JS
 else
  echo 'QA_FAKE_STORAGE_CLEANUP_NOT_ATTESTED' >&2
  if [[ "$status" == 0 ]];then status=2;fi
 fi
 exit "$status"
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qahttp --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/postgres.log" -o "-h 127.0.0.1 -p $PG_PORT" -w start >/dev/null
PG_STARTED=1
createdb -h 127.0.0.1 -p "$PG_PORT" -U qahttp "$DB"
mkdir -m 700 "$DIR/redis"
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --protected-mode yes --save '' --appendonly no --dir "$DIR/redis" --daemonize no >"$DIR/redis.log" 2>&1 &
REDIS_PID=$!
ready=0
for i in $(seq 1 60);do if redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null |grep -q PONG;then ready=1;break;fi;sleep .1;done
[[ "$ready" == 1 ]]||{ echo QA_FAKE_REDIS_BOOT_FAIL;exit 2; }
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_QA_FAKE_STORAGE_ACCOUNT_CLEANUP=1 GAFUS_QA_WORKER_RUN="$RUN"
export DATABASE_URL="postgresql://qahttp@127.0.0.1:$PG_PORT/$DB?schema=public"
export REDIS_URL="redis://127.0.0.1:$REDIS_PORT/0"
export GAFUS_ISOLATED_NONPROD_S3=disabled
export GAFUS_DISABLE_ALL_EXTERNAL_PROVIDERS=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate) >"$DIR/schema.log" 2>&1 || { echo QA_FAKE_PRISMA_SCHEMA_FAILED;tail -20 "$DIR/schema.log";exit 2; }
(cd packages/worker && pnpm exec vitest run src/test/qa-account-cleanup-fake-worker.test.ts --config vitest.config.ts --reporter=json --outputFile="$REPORT" --no-file-parallelism) >"$(dirname "$REPORT")/worker-output.log" 2>&1 || { echo QA_FAKE_WORKER_VITEST_FAILED;tail -45 "$(dirname "$REPORT")/worker-output.log";exit 2; }
[[ -s "$(dirname "$REPORT")/worker-fake-storage.json" ]] || { echo QA_FAKE_EVIDENCE_MISSING;exit 2; }
echo QA_FAKE_WORKER_REAL_PG_SQL_REDIS_PASS "$RUN"
