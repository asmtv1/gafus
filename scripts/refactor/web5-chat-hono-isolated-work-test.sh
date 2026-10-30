#!/bin/zsh
# WEB5 own synthetic JWT->registered Hono->Core->WORK PostgreSQL->DEV Stream.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for p in "$ROOT" "$SCRATCH" "$ROOT/apps/api" "$ROOT/scripts/refactor"; do [[ -d "$p" && ! -L "$p" && "${p:A}" == "$p" ]] || exit 23; done
# ag1 preflight checks WORK DB identity, restricted role, secrets and Redis first;
# its last check rejects a busy 3001. This test mounts original Hono in-process
# without binding a port and must never stop another agent's 3001 listener.
preflight_out=$(/bin/zsh scripts/refactor/ag1-isolated-hono-run.sh --preflight 2>&1) || {
  [[ "$preflight_out" == 'ISOLATED_HONO_PRECHECK_DENIED:api_port_occupied' ]] || {
    print -u2 "$preflight_out"; exit 23
  }
  print -r -- 'WEB5_WORK_PREFLIGHT_OK; port 3001 owned by another agent, in-process Hono only'
}
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
ACCESS="$SCRATCH/hono-local-access.secret"
REFRESH="$SCRATCH/hono-local-refresh.secret"
DEV_STREAM="$ROOT/.env.stream-chat-test"
for f in "$APP_ENV" "$ACCESS" "$REFRESH" "$DEV_STREAM"; do [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" && "$(stat -f '%Lp' "$f")" == 600 ]] || exit 23; done
cd "$ROOT/apps/api"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
 APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" COREPACK_ENABLE_NETWORK=0 \
 NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WEB5_ISOLATED_CHAT_STREAM_TEST=1 \
 CYNOLOGIST_CHAT_ENABLED=true REDIS_URL=redis://127.0.0.1:55927/1 \
 /bin/zsh -c '
  set -euo pipefail
  line=$(< "$APP_ENV")
  [[ "$line" == DATABASE_URL=* ]] || exit 23
  export DATABASE_URL="${line#DATABASE_URL=}" JWT_SECRET="$(< "$ACCESS")" JWT_REFRESH_SECRET="$(< "$REFRESH")"
  # Set trainer only by reading the fixed private test actor lease, if present;
  # otherwise the suite uses a per-run unique actor passed via a scoped fixture.
  exec /opt/homebrew/bin/node --env-file=/Users/asmtv1/Desktop/gafus-refactor/.env.stream-chat-test \
   node_modules/vitest/vitest.mjs run --config vitest.web5-isolated.config.ts \
   src/routes/v1/web5-chat-isolated-work-stream.integration.test.ts --maxWorkers=1 --reporter=dot
 '
