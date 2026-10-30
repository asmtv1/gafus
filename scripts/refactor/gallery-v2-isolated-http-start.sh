#!/bin/zsh
# Exact isolated test DB, owned S3 emulator and private Redis. No production.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
[[ "$(pwd -P)" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" &&
  "$(git branch --show-current)" == vite ]] || exit 31
for f in .local-pg-scratch/hono-local-access.secret .local-pg-scratch/hono-local-refresh.secret; do
 [[ -f "$f" && ! -L "$f" && "$(stat -f %Lp "$f")" == 600 ]] || exit 32
done
[[ "$(/opt/homebrew/bin/redis-cli -h 127.0.0.1 -p 55927 PING)" == PONG ]] || exit 33
lsof -nP -iTCP:9000 -sTCP:LISTEN | grep -F '127.0.0.1:9000' >/dev/null || exit 34
if lsof -nP -iTCP:3601 -sTCP:LISTEN | grep -q LISTEN; then exit 35; fi
exec /usr/bin/env -i PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  HOME="$ROOT/.local-pg-scratch" \
  DATABASE_URL="postgresql://asmtv1@127.0.0.1:5432/gafus_gallery_v2_test_20261028" \
  REDIS_URL="redis://127.0.0.1:55927/1" \
  NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_BROWSER_AUTH=1 \
  GAFUS_GALLERY_ISOLATED_HONO=1 GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE=1 \
  GAFUS_ISOLATED_NONPROD_S3=enabled \
  GAFUS_ISOLATED_S3_ENDPOINT="http://127.0.0.1:9000" \
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET="gafus-refactor-documents-test" \
  GAFUS_ISOLATED_S3_GALLERY_BUCKET="gafus-refactor-gallery-test" \
  GAFUS_ISOLATED_S3_FEED_BUCKET="gafus-refactor-feed-test" \
  GALLERY_ENABLED=true FEED_ENABLED=false CLOUDRU_MEDIA_JOBS_ENABLED=false \
  GALLERY_MEDIA_FALLBACK_ENABLED=false FEED_MEDIA_FALLBACK_ENABLED=false \
  CDN_HEALTH_MONITOR_ENABLED=false \
  API_HOST=127.0.0.1 API_PORT=3601 \
  JWT_SECRET="$(cat .local-pg-scratch/hono-local-access.secret)" \
  JWT_REFRESH_SECRET="$(cat .local-pg-scratch/hono-local-refresh.secret)" \
  /opt/homebrew/bin/pnpm --filter @gafus/api exec tsx src/test/gallery-v2-isolated-hono.ts
