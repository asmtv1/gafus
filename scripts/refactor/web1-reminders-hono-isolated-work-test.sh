#!/bin/zsh
# Registered original Hono -> Core -> isolated WORK SQL only, no providers.
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
for f in "$APP_ENV" "$ACCESS" "$REFRESH"; do
 [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" ]] || exit 23
done
cd "$ROOT/apps/api"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
 APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" COREPACK_ENABLE_NETWORK=0 \
 NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_BROWSER_AUTH=1 \
 GAFUS_WEB1_ISOLATED_REMINDER_HONO_TEST=1 API_HOST=127.0.0.1 API_PORT=3001 \
 /bin/zsh -c '
   set -euo pipefail
   line=$(< "$APP_ENV")
   [[ "$line" == DATABASE_URL=* ]] || exit 23
   export DATABASE_URL="${line#DATABASE_URL=}" JWT_SECRET="$(< "$ACCESS")" JWT_REFRESH_SECRET="$(< "$REFRESH")"
   exec /opt/homebrew/bin/pnpm exec vitest run --config vitest.config.ts \
      src/routes/v1/reminders-web1-isolated-work.integration.test.ts --maxWorkers=1 --reporter=dot
 '
