#!/bin/zsh
# WEB3 browser→currently running Hono→Core→WORK PostgreSQL only.
# Never kill, restart or mutate servers belonging to another agent.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for d in "$ROOT" "$SCRATCH" "$ROOT/apps/api" "$ROOT/apps/web-vite" "$ROOT/.local-browser-mcp/.cache" "$ROOT/scripts/refactor";do
 [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || exit 23
done
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
[[ -f "$APP_ENV" && ! -L "$APP_ENV" && "${APP_ENV:A}" == "$APP_ENV" ]] || exit 23
[[ ! -e "$SCRATCH/web3-unified-private.json" ]] || { echo 'WEB3_STALE_LEASE_MUST_RECOVER';exit 23; }
for item in '3001:api' '5173:web-vite';do
 port="${item%%:*}"; target="${item#*:}"
 pid=$(/usr/sbin/lsof -nP -iTCP:$port -sTCP:LISTEN -t|/usr/bin/head -1)
 [[ -n "$pid" ]] || exit 23
 [[ "$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn|/usr/bin/tail -1)" == "n$ROOT/apps/$target" ]] || exit 23
done
[[ "$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 3 -w '%{http_code}' http://127.0.0.1:3001/ready)" == 200 ]] || exit 23
[[ "$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 3 -w '%{http_code}' http://127.0.0.1:5173/login)" == 200 ]] || exit 23
run() {
 ( cd "$ROOT/apps/api"
  /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" \
    COREPACK_ENABLE_NETWORK=0 NODE_ENV=development APP_ENV="$APP_ENV" \
    GAFUS_WEB3_REAL_BROWSER=1 GAFUS_LOCAL_ISOLATED_API=1 /bin/zsh -c '
      set -euo pipefail
      line=$(< "$APP_ENV")
      [[ "$line" == DATABASE_URL=* ]] || exit 23
      export DATABASE_URL="${line#DATABASE_URL=}"
      exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs "../../scripts/refactor/$1" "${2:-}"
    ' _ "$1" "${2:-}"
 )
}
created=0
on_exit() {
 rc=$?
 trap - EXIT INT TERM
 if [[ "$created" == 1 ]];then
  run web3-unified-fixture.ts cleanup > "$SCRATCH/web3-sql-cleanup.log" 2>&1 || {
    print -u2 'WEB3_SQL_CLEANUP_FAILED_MANUAL_RECOVERY_REQUIRED'
    rc=99
  }
  if [[ -f "$SCRATCH/web3-sql-cleanup.log" ]];then
   /usr/bin/grep -E 'WEB3_FIXTURE_CLEANUP_OK|WEB3_FIXTURE_ERROR' "$SCRATCH/web3-sql-cleanup.log" || true
  fi
 fi
 echo "WEB3_REAL_SQL_FINISHED status=$rc"
 exit "$rc"
}
trap on_exit EXIT INT TERM
created=1
run web3-unified-fixture.ts create > "$SCRATCH/web3-sql-create.log" 2>&1
/usr/bin/grep -E 'WEB3_FIXTURE_CREATED' "$SCRATCH/web3-sql-create.log"
rc=0
run web3-real-sql-acceptance.ts || rc=$?
run web3-unified-fixture.ts cleanup > "$SCRATCH/web3-sql-cleanup.log" 2>&1 || {
 print -u2 'WEB3_SQL_EXPLICIT_CLEANUP_FAILED'; rc=99
}
if [[ -f "$SCRATCH/web3-sql-cleanup.log" ]];then
 /usr/bin/grep -E 'WEB3_FIXTURE_CLEANUP_OK|WEB3_FIXTURE_ERROR' "$SCRATCH/web3-sql-cleanup.log" || true
fi
created=0
[[ ! -e "$SCRATCH/web3-unified-private.json" ]] || { echo WEB3_SQL_LEASE_NOT_CLEAN;rc=99; }
print -r -- "WEB3_REAL_SQL_EXPLICIT_FINISH status=$rc"
exit "$rc"
