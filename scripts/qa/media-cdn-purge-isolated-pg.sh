#!/bin/bash
# Disposable real PostgreSQL, user and revision fixtures only; no production.
set -euo pipefail
# Never inherit real payment/CDN/queue provider credentials into disposable QA.
for key in $(env | cut -d= -f1); do
  case "$key" in
    YOOKASSA_*|APPLE_*|AWS_*|S3_*|CLOUDRU_*|REDIS_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|DIRECT_URL|SHADOW_DATABASE_URL)
      unset "$key" ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl psql createdb python3; do
  command -v "$bin" >/dev/null || { echo "MEDIA_PURGE_QA_MISSING_TOOL"; exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-media-purge-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup(){
  if [ "$started" = "1" ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true;fi
  if [[ "$DIR" == /tmp/gafus-media-purge-pg.* ]] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qacourse --no-instructions > "$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qacourse gafus_refactor_media_purge
export DATABASE_URL="postgresql://qacourse@127.0.0.1:$PORT/gafus_refactor_media_purge?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_MEDIA_PURGE_SQL_ISOLATED_TEST=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate > "$DIR/schema.log" 2>&1) ||
{ tail -60 "$DIR/schema.log";exit 1; }
coverage_dir="${GAFUS_QA_COVERAGE_DIR:-}"
worker_coverage_args=()
if [[ -n "$coverage_dir" ]]; then
  [[ "$coverage_dir" == "$ROOT/.qa/testing/"* && "$coverage_dir" != *..* && ! -L "$coverage_dir" ]] || { echo 'WORKER_QA_UNSAFE_COVERAGE_DIR'; exit 2; }
  mkdir -p "$coverage_dir/worker"
  worker_coverage_args=(--coverage --coverage.provider=v8 --coverage.allowExternal
    --coverage.include=src/media-cdn-purge-worker.ts
    --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=lcov
    "--coverage.reportsDirectory=$coverage_dir/worker")
fi
report_path="${GAFUS_TEST_REPORT_PATH:-}"
if [[ -n "$report_path" ]]; then
  # Refuse unowned destinations, symlinks and accidental writes outside test receipts.
  [[ "$report_path" == "$ROOT/.qa/testing/"* && "$report_path" == */tests.json && "$report_path" != *..* && ! -L "$report_path" ]] || { echo 'MEDIA_PURGE_QA_UNSAFE_REPORT_PATH'; exit 2; }
  worker_config=vitest.config.ts
  worker_test=src/media-cdn-purge-worker.real-pg.test.ts
  if [[ -n "$coverage_dir" ]]; then
    (cd packages/worker && pnpm exec vitest run --config "$worker_config" "$worker_test" --reporter=json --outputFile="$report_path" "${worker_coverage_args[@]}")
  else
    (cd packages/worker && pnpm exec vitest run --config "$worker_config" "$worker_test" --reporter=json --outputFile="$report_path")
  fi
else
  (cd packages/worker && pnpm exec vitest run --config vitest.config.ts src/media-cdn-purge-worker.real-pg.test.ts --reporter=dot)
fi
echo "MEDIA_CDN_PURGE_REAL_PG_PASS: real SQL fencing, checkpoint, retry and synthetic provider ACK"
