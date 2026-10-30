#!/bin/zsh
# Opt-in real HTTP POST/PATCH/archive on an INACTIVE SYNTHETIC test promo in WORK DB.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
[[ "${PWD:A}" == "$R" && "$(git -C "$R" rev-parse --show-toplevel)" == "$R" &&
  "$(git -C "$R" branch --show-current)" == vite ]] || exit 31
APP_ENV="$R/.local-pg-scratch/production_snapshot_20261024/app.env"
ACCESS="$R/.local-pg-scratch/hono-local-access.secret"
for f in "$APP_ENV" "$ACCESS";do
  [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" && "$(stat -f %Lp "$f")" == 600 ]] || exit 32
done
line=$(< "$APP_ENV")
[[ "$line" == DATABASE_URL=* ]] || exit 33
export DATABASE_URL="${line#DATABASE_URL=}"
export JWT_SECRET="$(< "$ACCESS")"
export GAFUS_ADMIN_PROMO_SAFE_WORK=1 GAFUS_LOCAL_ISOLATED_API=1
export API_HOST=127.0.0.1 API_PORT=3001 REDIS_URL=redis://127.0.0.1:55927/1
curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:3001/ready >/dev/null
exec /opt/homebrew/bin/pnpm --filter @gafus/api exec tsx src/test/admin-promo-live-safe.smoke.ts
