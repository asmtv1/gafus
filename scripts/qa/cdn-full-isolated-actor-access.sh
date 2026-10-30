#!/bin/zsh
# Real local Hono -> Core -> disposable PostgreSQL -> presigned MinIO readback.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo CDN_QA_WRONG_ROOT; exit 2; }
for p in 55446 56340 58343 58344 58390 58391; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN | grep -q LISTEN; then echo "CDN_QA_PORT_OCCUPIED:$p"; exit 2; fi
done
for bin in initdb pg_ctl redis-server psql createdb openssl curl python3; do command -v "$bin" >/dev/null || { echo "CDN_QA_MISSING_TOOL:$bin";exit 2; }; done
MINIO="$ROOT/.local-pg-scratch/nonprod-s3/bin/minio"
[[ -x "$MINIO" && ! -L "$MINIO" ]] || { echo CDN_QA_NO_LOCAL_MINIO_BINARY; exit 2; }
umask 077
WORK="$(mktemp -d "$ROOT/.local-pg-scratch/agent2-cdn-full-XXXXXX")"
[[ "$WORK" == "$ROOT/.local-pg-scratch/agent2-cdn-full-"* && ! -L "$WORK" ]] || exit 2
redis_pid='' minio_pid='' pg_started=0
cleanup() {
  [[ -n "$minio_pid" ]] && kill "$minio_pid" 2>/dev/null || true
  [[ -n "$redis_pid" ]] && kill "$redis_pid" 2>/dev/null || true
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  [[ -n "$minio_pid" ]] && wait "$minio_pid" 2>/dev/null || true
  [[ -n "$redis_pid" ]] && wait "$redis_pid" 2>/dev/null || true
  if [[ -d "$WORK" && ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-cdn-full-"* ]]; then rm -rf -- "$WORK"; fi
}
trap cleanup EXIT INT TERM
mkdir "$WORK/sock" "$WORK/s3"
initdb -D "$WORK/pg" -A trust --no-instructions >"$WORK/pg-init.log" 2>&1 || { echo CDN_QA_PG_INIT_FAILED;exit 1; }
pg_ctl -D "$WORK/pg" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 55446 -k $WORK/sock -c max_connections=80" start >/dev/null 2>&1 || { echo CDN_QA_PG_START_FAILED;exit 1; }
pg_started=1
createdb -h 127.0.0.1 -p 55446 cdn_agent2_qa || {echo CDN_QA_DB_CREATE_FAILED;exit 1;}
redis-server --bind 127.0.0.1 --port 56340 --save '' --appendonly no --protected-mode yes >"$WORK/redis.log" 2>&1 &
redis_pid=$!
export GAFUS_CDN_LOCAL_S3_KEY="$(openssl rand -hex 16)" GAFUS_CDN_LOCAL_S3_SECRET="$(openssl rand -hex 32)"
export MINIO_ROOT_USER="$GAFUS_CDN_LOCAL_S3_KEY" MINIO_ROOT_PASSWORD="$GAFUS_CDN_LOCAL_S3_SECRET"
MINIO_BROWSER=off "$MINIO" server "$WORK/s3" --address '127.0.0.1:58390' --console-address '127.0.0.1:58391' >"$WORK/minio.log" 2>&1 &
minio_pid=$!
ready=0
for step in {1..60}; do
  if curl -fsS --max-time 1 http://127.0.0.1:58390/minio/health/live >/dev/null 2>&1; then ready=1;break;fi
  sleep 0.3
done
[[ "$ready" == 1 ]] || {echo CDN_QA_MINIO_UNREADY;exit 1;}
export DATABASE_URL='postgresql://asmtv1@127.0.0.1:55446/cdn_agent2_qa' REDIS_URL='redis://127.0.0.1:56340'
export NODE_ENV=test API_HOST=127.0.0.1 API_PORT=58343
export GAFUS_CDN_FULL_ISOLATED_ACCEPTANCE=1 GAFUS_CDN_LOCAL_S3_ENDPOINT='http://127.0.0.1:58390'
export FEED_ENABLED=true FEED_PROCESSOR_READY=true FEED_MEDIA_FALLBACK_ENABLED=true
export GALLERY_ENABLED=true GALLERY_PROCESSOR_READY=true GALLERY_MEDIA_FALLBACK_ENABLED=true
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
if ! (cd packages/prisma && ./node_modules/.bin/prisma db push --skip-generate >"$WORK/db-push.log" 2>&1); then
  echo CDN_QA_LOCAL_SCHEMA_PUSH_FAILED; tail -7 "$WORK/db-push.log" | sed -E 's#postgresql://[^ ]+#<redacted>#g';exit 1
fi
if ! (cd apps/api && ./node_modules/.bin/vitest run --config vitest.cdn-full-isolated.config.ts --reporter=dot >"$WORK/test.log" 2>&1); then
  echo CDN_QA_ACTOR_ACCESS_FAILED
  grep -E '(FAIL|Error|expected|CDN_QA_|Test Files|Tests|PrismaClient)' "$WORK/test.log" | tail -38 | sed -E 's#postgresql://[^ ]+#<redacted>#g'
  exit 1
fi
grep -E '(Test Files|Tests)' "$WORK/test.log" | tail -3
printf 'CDN_QA_FULL_REAL_LOCAL_PASS: Hono JWT/Core actor access + signed private MinIO GET readback + revocation/delete\n'
