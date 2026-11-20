#!/bin/bash
# Own PG18 cluster + Redis (spawned by controller) + test-only BullMQ Worker child.
# Never signal, discover, or touch pre-existing processes; no shared service ports.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REPORT="${GAFUS_TEST_REPORT_PATH:-}"
[[ "$REPORT" == "$ROOT/.qa/testing/qa-"* && "$REPORT" == */tasks/*/tests.json && "$REPORT" != *..* && ! -L "$REPORT" && -d "$(dirname "$REPORT")" ]] || {
  echo WORKER_REDIS_RECOVERY_UNOWNED_REPORT_DENIED;exit 2;
}
for key in $(env | cut -d= -f1);do
  case "$key" in
    DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|UPTRACE_*|BEGET_*)unset "$key";;
  esac
done
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for binary in pg_ctl initdb createdb psql redis-server node python3;do
  command -v "$binary" >/dev/null || { echo "WORKER_REDIS_QA_MISSING_TOOL $binary";exit 2;}
done
umask 077
DIR="$(mktemp -d /tmp/gafus-qa-worker-recovery.XXXXXXXX)"
PG_STARTED=0
cleanup(){
  exit_status=$?
  trap - EXIT INT TERM
  if [[ "$PG_STARTED" == 1 ]];then
    pg_ctl -D "$DIR/pg" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [[ "$DIR" == /tmp/gafus-qa-worker-recovery.* && -d "$DIR" && ! -L "$DIR" ]];then
    rm -rf -- "$DIR"
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM
PG_PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
REDIS_PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
[[ "$PG_PORT" != "$REDIS_PORT" ]] || { echo WORKER_REDIS_QA_PORT_COLLISION;exit 2;}
DB_NAME="archqa_worker_recovery_$(openssl rand -hex 6)"
initdb -D "$DIR/pg" -A trust -U qarecovery --no-instructions >"$DIR/pg-init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg-server.log" -o "-h 127.0.0.1 -p $PG_PORT" -w start >/dev/null
PG_STARTED=1
createdb -h 127.0.0.1 -p "$PG_PORT" -U qarecovery "$DB_NAME"
export DATABASE_URL="postgresql://qarecovery@127.0.0.1:$PG_PORT/$DB_NAME?schema=public"
export NODE_ENV=test GAFUS_RECOVERY_EXPLICIT_QA=1 GAFUS_RECOVERY_DIR="$DIR" GAFUS_RECOVERY_REDIS_PORT="$REDIS_PORT"
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/pg-schema.log" 2>&1) || {
  echo WORKER_REDIS_QA_SCHEMA_BOOTSTRAP_FAILED;tail -45 "$DIR/pg-schema.log";exit 2;
}
(cd packages/worker && node qa/recovery-controller.mjs)
