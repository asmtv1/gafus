#!/bin/zsh
# Original in-process Hono HTTP + real restricted PostgreSQL WORK, never Main/prod.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" ]] || exit 23
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for d in "$ROOT" "$SCRATCH" "$ROOT/apps/api" "$ROOT/scripts/refactor"; do
  [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || exit 23
done
/bin/zsh "$ROOT/scripts/refactor/ag1-isolated-hono-run.sh" --preflight
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
ACCESS="$SCRATCH/hono-local-access.secret"
REFRESH="$SCRATCH/hono-local-refresh.secret"
[[ -f "$APP_ENV" && -f "$ACCESS" && -f "$REFRESH" ]] || exit 23
cd "$ROOT/apps/api"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
  APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" \
  COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
  GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_BROWSER_AUTH=1 GAFUS_AUTH_ISOLATED_WORK_TEST=1 \
  API_HOST=127.0.0.1 API_PORT=3001 REDIS_URL='redis://127.0.0.1:55927/1' \
  GALLERY_ENABLED=false FEED_ENABLED=false CDN_HEALTH_MONITOR_ENABLED=false \
  /bin/zsh -c '
    set -euo pipefail
    line=$(< "$APP_ENV")
    [[ "$line" == DATABASE_URL=* ]] || exit 23
    export DATABASE_URL="${line#DATABASE_URL=}" JWT_SECRET="$(< "$ACCESS")" JWT_REFRESH_SECRET="$(< "$REFRESH")"
    exec /opt/homebrew/bin/pnpm exec vitest run --config vitest.config.ts src/routes/v1/auth-session-isolated-work.integration.test.ts --maxWorkers=1 --reporter=dot
  '
