#!/bin/zsh
# Private live Feed API: Refactor WORK DB + loopback MinIO only.
# Shares only local auth secrets with gallery Hono 3601; never touches its process.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
# Optional CDN-only media preview. All writes to Gallery/Feed are rejected by dispatchers.
[[ $# -eq 0 || ($# -eq 1 && "$1" == --readonly-cdn) ]] || exit 30
live_cdn_flag=""
if [[ $# -eq 1 ]]; then
  secret="$R/.local-pg-scratch/live-media-cdn-readonly.json"
  [[ -f "$secret" && ! -L "$secret" && "${secret:A}" == "$secret" &&
     "$(stat -f %Lp "$secret")" == 600 ]] || { echo 'LIVE_CDN_SECRETS_NOT_CONFIGURED'; exit 38; }
  live_cdn_flag=enabled
fi
[[ "${PWD:A}" == "$R" && "$(git -C "$R" rev-parse --show-toplevel)" == "$R" &&
  "$(git -C "$R" branch --show-current)" == vite ]] || exit 31
for d in "$R/.local-pg-scratch" "$R/.local-pg-scratch/nonprod-s3" "$R/apps/api"; do
  [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || exit 32
done
[[ "$(stat -f %Lp "$R/.local-pg-scratch/nonprod-s3")" == 700 ]] || exit 33
for f in "$R/.local-pg-scratch/production_snapshot_20261024/app.env" \
  "$R/.local-pg-scratch/hono-local-access.secret" \
  "$R/.local-pg-scratch/hono-local-refresh.secret" \
  "$R/.local-pg-scratch/nonprod-s3/credentials.json";do
  [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" && "$(stat -f %Lp "$f")" == 600 ]] || exit 34
done
if lsof -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN;then
  echo MOMENTS_LIVE_3001_ALREADY_LISTENING;exit 35
fi
curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:9000/minio/health/live >/dev/null
/opt/homebrew/bin/redis-cli -h 127.0.0.1 -p 55927 PING | grep -q PONG
# The API isolation guard re-checks WORK database, Redis, localhost and S3.
# No production key is placed in argv/environment.
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  HOME="$R/.local-pg-scratch" TMPDIR="$R/.local-pg-scratch/" \
  APP_ENV="$R/.local-pg-scratch/production_snapshot_20261024/app.env" \
  ACCESS="$R/.local-pg-scratch/hono-local-access.secret" \
  REFRESH="$R/.local-pg-scratch/hono-local-refresh.secret" \
  COREPACK_ENABLE_NETWORK=0 \
  NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_BROWSER_AUTH=1 \
  API_HOST=127.0.0.1 API_PORT=3001 \
  REDIS_URL=redis://127.0.0.1:55927/1 \
  GALLERY_ENABLED=true FEED_ENABLED=true FEED_PROCESSOR_READY=true \
  GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE=1 \
  GAFUS_ISOLATED_NONPROD_S3=enabled \
  GAFUS_ISOLATED_S3_ENDPOINT=http://127.0.0.1:9000 \
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET=gafus-refactor-documents-test \
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET=gafus-refactor-questions-test \
  GAFUS_ISOLATED_S3_GALLERY_BUCKET=gafus-refactor-gallery-test \
  GAFUS_ISOLATED_S3_FEED_BUCKET=gafus-refactor-feed-test \
  CLOUDRU_MEDIA_JOBS_ENABLED=false \
  GALLERY_MEDIA_FALLBACK_ENABLED=false FEED_MEDIA_FALLBACK_ENABLED=false \
  CDN_HEALTH_MONITOR_ENABLED=false \
  ${live_cdn_flag:+GAFUS_LOCAL_READONLY_CDN=enabled} \
  /bin/zsh -c '
    set -euo pipefail
    line=$(< "$APP_ENV")
    [[ "$line" == DATABASE_URL=* ]] || exit 36
    export DATABASE_URL="${line#DATABASE_URL=}"
    export JWT_SECRET="$(< "$ACCESS")"
    export JWT_REFRESH_SECRET="$(< "$REFRESH")"
    exec /usr/bin/python3 /Users/asmtv1/Desktop/gafus-refactor/scripts/refactor/local-questions-v2-api-env.py
  '
