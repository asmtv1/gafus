#!/bin/zsh
# Exclusive 3103/5183 Hono registered app + Vite, restricted WORK PG/Redis.
# Does not touch or stop anyone else's services. Test data exact-leased.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
S="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for d in "$ROOT" "$S" "$ROOT/apps/api" "$ROOT/apps/web-vite" "$ROOT/scripts/refactor" "$ROOT/.local-browser-mcp/.cache";do
 [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || exit 23
done
APP_ENV="$S/production_snapshot_20261024/app.env"
ACCESS="$S/hono-local-access.secret"
REFRESH="$S/hono-local-refresh.secret"
for f in "$APP_ENV" "$ACCESS" "$REFRESH";do
 [[ -f "$f" && ! -L "$f" && "${f:A}" == "$f" ]] || exit 23
done
[[ ! -e "$S/web3-unified-private.json" ]] || exit 23
for p in 3103 5183;do
 if /usr/sbin/lsof -nP -iTCP:$p -sTCP:LISTEN 2>/dev/null |/usr/bin/grep -q LISTEN;then
  print -u2 "WEB3_OWN_PORT_OCCUPIED $p";exit 23
 fi
done
API_PID=''; VITE_PID=''; OWN_FIXTURE=0
run_ts() {
 (cd "$ROOT/apps/api"
  /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/" \
   APP_ENV="$APP_ENV" COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
   GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WEB3_REAL_BROWSER=1 \
   GAFUS_WEB3_OWN_HTTP=1 GAFUS_WEB3_AUTH_TRANSPORT=bearer /bin/zsh -c '
    set -euo pipefail
    line=$(< "$APP_ENV");[[ "$line" == DATABASE_URL=* ]] || exit 23
    export DATABASE_URL="${line#DATABASE_URL=}"
    exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs "../../scripts/refactor/$1" "${2:-}"
   ' _ "$1" "${2:-}"
 )
}
finish() {
 local code=$?
 trap - EXIT INT TERM
 [[ -z "$VITE_PID" ]] || { kill "$VITE_PID" 2>/dev/null||true;wait "$VITE_PID" 2>/dev/null||true; }
 [[ -z "$API_PID" ]] || { kill "$API_PID" 2>/dev/null||true;wait "$API_PID" 2>/dev/null||true; }
 if [[ "$OWN_FIXTURE" == 1 ]];then
  run_ts web3-unified-fixture.ts cleanup > "$S/web3-owned-sql-cleanup.log" 2>&1 || { print -u2 'WEB3_CLEANUP_FAILED';code=99; }
  /usr/bin/grep -E 'WEB3_FIXTURE_CLEANUP_OK|WEB3_FIXTURE_ERROR' "$S/web3-owned-sql-cleanup.log"||true
  [[ ! -e "$S/web3-unified-private.json" ]] || code=99
 fi
 print -r -- "WEB3_OWN_SQL_FINISHED status=$code"
 exit "$code"
}
trap finish EXIT INT TERM
(cd "$ROOT/apps/api"
 exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/" \
  APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
  GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WEB3_OWN_HTTP=1 \
  API_PORT=3103 API_HOST=127.0.0.1 REDIS_URL=redis://127.0.0.1:55927/1 \
  /bin/zsh -c '
    set -euo pipefail
    line=$(< "$APP_ENV");[[ "$line" == DATABASE_URL=* ]] || exit 23
    export DATABASE_URL="${line#DATABASE_URL=}"
    export JWT_SECRET="$(< "$ACCESS")" JWT_REFRESH_SECRET="$(< "$REFRESH")"
    exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs ../../scripts/refactor/web3-owned-hono-server.ts
  '
) > "$S/web3-owned-hono.log" 2>&1 &
API_PID=$!
ready=0
for i in {1..140};do
 kill -0 "$API_PID" 2>/dev/null||break
 code=$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 1 -w '%{http_code}' http://127.0.0.1:3103/ready 2>/dev/null||true)
 [[ "$code" != 200 ]] || { ready=1;break; }
 /bin/sleep .2
done
[[ "$ready" == 1 ]] || { echo WEB3_HONO_NOT_READY;tail -n 15 "$S/web3-owned-hono.log"|cut -c1-190;exit 33; }
echo WEB3_OWN_HONO_READY
(cd "$ROOT/apps/web-vite"
 exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/" \
   COREPACK_ENABLE_NETWORK=0 GAFUS_WEB_DEV_API_MODE=local-hono \
   VITE_API_BASE_URL=http://127.0.0.1:4174 \
   /opt/homebrew/bin/node node_modules/vite/bin/vite.js \
   --config vite.web3.parity.config.mjs --host 127.0.0.1 --port 5183 --strictPort
) > "$S/web3-owned-vite.log" 2>&1 &
VITE_PID=$!
ready=0
for i in {1..140};do
 kill -0 "$VITE_PID" 2>/dev/null||break
 code=$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 1 -w '%{http_code}' http://127.0.0.1:5183/login 2>/dev/null||true)
 [[ "$code" != 200 ]] || { ready=1;break; }
 /bin/sleep .2
done
[[ "$ready" == 1 ]] || { echo WEB3_VITE_NOT_READY;tail -n 15 "$S/web3-owned-vite.log"|cut -c1-190;exit 34; }
echo WEB3_OWN_VITE_READY
OWN_FIXTURE=1
run_ts web3-unified-fixture.ts create > "$S/web3-owned-sql-create.log" 2>&1
/usr/bin/grep -E 'WEB3_FIXTURE_CREATED' "$S/web3-owned-sql-create.log"
# Always complete exact-user SQL cleanup on success AND a failed assertion.
# Zsh's errexit can bypass EXIT traps for nested exec / subshell failures,
# therefore normal/test-failure completion must use this explicit path.
rc=0
run_ts web3-real-sql-acceptance.ts || rc=$?
run_ts web3-unified-fixture.ts cleanup > "$S/web3-owned-sql-cleanup.log" 2>&1 || rc=99
/usr/bin/grep -E 'WEB3_FIXTURE_CLEANUP_OK|WEB3_FIXTURE_ERROR' "$S/web3-owned-sql-cleanup.log" || true
[[ ! -e "$S/web3-unified-private.json" ]] || rc=99
OWN_FIXTURE=0
[[ -z "$VITE_PID" ]] || { kill "$VITE_PID" 2>/dev/null||true;wait "$VITE_PID" 2>/dev/null||true; }
[[ -z "$API_PID" ]] || { kill "$API_PID" 2>/dev/null||true;wait "$API_PID" 2>/dev/null||true; }
VITE_PID='';API_PID=''
print -r -- "WEB3_OWN_BEARER_SQL_EXPLICIT_STATUS=$rc"
exit "$rc"
