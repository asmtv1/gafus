#!/bin/zsh
# Exact Refactor-only real Hono -> PostgreSQL WORK -> private local MinIO proof.
# No production endpoints, no GAFUS Main, no schema mutation or port hijack.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
[[ "${PWD:A}" == "$ROOT" ]] || exit 71
[[ "$(git -C "$ROOT" rev-parse --show-toplevel)" == "$ROOT" ]] || exit 72
[[ "$(git -C "$ROOT" branch --show-current)" == vite ]] || exit 73
for p in .local-pg-scratch/production_snapshot_20261024/app.env \
 .local-pg-scratch/hono-local-access.secret .local-pg-scratch/nonprod-s3 \
 scripts/refactor/web2-pet-photo-hono-work-proof.ts \
 apps/api/src/routes/v1/web2-hono-media.work.test.ts; do
 [[ ! -L "$p" ]] || exit 74
done
[[ "$(stat -f '%Lp' .local-pg-scratch/production_snapshot_20261024/app.env)" == 600 ]] || exit 75
[[ "$(stat -f '%Lp' .local-pg-scratch/hono-local-access.secret)" == 600 ]] || exit 75
[[ "$(/opt/homebrew/bin/redis-cli -h 127.0.0.1 -p 55927 ping)" == PONG ]] || exit 76
if /usr/sbin/lsof -nP -iTCP:9000 -sTCP:LISTEN >/dev/null 2>&1; then
  print -r -- 'WEB2_REFUSE_FOREIGN_S3_LISTENER'; exit 77
fi
/usr/bin/python3 scripts/refactor/ag1-nonprod-s3-server.py &
server=$!
finish(){ kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; }
trap finish EXIT INT TERM
ready=0
for i in {1..15}; do
 code=$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 2 \
   http://127.0.0.1:9000/minio/health/live 2>/dev/null || true)
 if [[ "$code" == 200 ]]; then ready=1; break; fi
 kill -0 "$server" 2>/dev/null || exit 78
 sleep 1
done
[[ "$ready" == 1 ]] || exit 79
print -r -- 'WEB2_HONO_PG18_S3_GUARDED_READY'
line=$(< .local-pg-scratch/production_snapshot_20261024/app.env)
[[ "$line" == DATABASE_URL=* ]] || exit 80
url="${line#DATABASE_URL=}"
access=$(< .local-pg-scratch/hono-local-access.secret)
exec_status=0
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$ROOT" \
 TMPDIR="$ROOT/.local-pg-scratch/" DATABASE_URL="$url" \
 NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 \
 JWT_SECRET="$access" REDIS_URL=redis://127.0.0.1:55927/1 \
 GAFUS_WEB2_WORK_MEDIA=enabled GAFUS_ISOLATED_NONPROD_S3=enabled \
 GAFUS_ISOLATED_S3_ENDPOINT=http://127.0.0.1:9000 \
 GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET=gafus-refactor-documents-test \
 /opt/homebrew/bin/pnpm --dir apps/api exec vitest run \
 src/routes/v1/web2-hono-media.work.test.ts --maxWorkers=1 --reporter=default || exec_status=$?
exit "$exec_status"
