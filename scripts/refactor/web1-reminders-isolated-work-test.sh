#!/bin/zsh
# Only the attested local WORK copy, only synthetic WEB1 candidate and fake provider.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" ]] || exit 23
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for d in "$ROOT" "$SCRATCH" "$ROOT/packages/worker" "$ROOT/scripts/refactor"; do
  [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || exit 23
done
/bin/zsh "$ROOT/scripts/refactor/ag1-isolated-hono-run.sh" --preflight
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
[[ -f "$APP_ENV" && ! -L "$APP_ENV" && "${APP_ENV:A}" == "$APP_ENV" ]] || exit 23
cd "$ROOT/packages/worker"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
  APP_ENV="$APP_ENV" COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
  GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WEB1_ISOLATED_REMINDER_TEST=1 \
  /bin/zsh -c '
    set -euo pipefail
    line=$(< "$APP_ENV")
    [[ "$line" == DATABASE_URL=* ]] || exit 23
    export DATABASE_URL="${line#DATABASE_URL=}"
    exec /opt/homebrew/bin/pnpm exec vitest run --config vitest.config.ts \
      src/training-reminders-web1-isolated-work.integration.test.ts --maxWorkers=1 --reporter=dot
  '
