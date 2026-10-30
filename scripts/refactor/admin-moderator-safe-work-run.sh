#!/bin/zsh
# An isolated WORK-only real Hono authorization acceptance run.
# Creates and deletes ONLY its own synthetic Moderator/User fixture.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
[[ "${PWD:A}" == "$R" && "$(git -C "$R" rev-parse --show-toplevel)" == "$R" &&
  "$(git -C "$R" branch --show-current)" == vite ]] || exit 31
APP_ENV="$R/.local-pg-scratch/production_snapshot_20261024/app.env"
ACCESS="$R/.local-pg-scratch/hono-local-access.secret"
for f in "$APP_ENV" "$ACCESS"; do
  [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" && "$(stat -f %Lp "$f")" == 600 ]] || exit 32
done
line=$(< "$APP_ENV")
[[ "$line" == DATABASE_URL=* ]] || exit 33
export DATABASE_URL="${line#DATABASE_URL=}"
export JWT_SECRET="$(< "$ACCESS")"
export GAFUS_ADMIN_MODERATOR_SAFE_WORK=1 GAFUS_LOCAL_ISOLATED_API=1
if [[ "${GAFUS_ADMIN_ISOLATED_ALTERNATE:-0}" == 1 ]]; then
  export API_PORT=3301 GAFUS_WEB1_ALT_HONO=1
else
  export API_PORT=3001
fi
export API_HOST=127.0.0.1 REDIS_URL=redis://127.0.0.1:55927/1
curl --noproxy '*' -fsS --max-time 3 "http://127.0.0.1:$API_PORT/ready" >/dev/null
exec /opt/homebrew/bin/pnpm --filter @gafus/api exec tsx src/test/admin-moderator-safe-work.smoke.ts
