#!/bin/zsh
# WEB3 R52: bounded owner-only Chromium/Hono3103/WORK PG acceptance.
# Other agents' 3001/5173 never read, signalled or touched.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
S="$R/.local-pg-scratch"
[[ "$PWD" == "$R" && "$(git rev-parse --show-toplevel)" == "$R" &&
   "$(git branch --show-current)" == vite ]] || exit 91
for d in "$R" "$S" "$R/apps/api" "$R/scripts/refactor" "$R/.local-browser-mcp/.cache";do
 [[ -d "$d" && ! -L "$d" ]] || exit 92
done
for f in "$R/scripts/refactor/web3-survey-real-http.ts" "$R/scripts/refactor/web3-unified-fixture.ts";do
 [[ -f "$f" && ! -L "$f" ]] || exit 93
done
[[ ! -e "$S/web3-unified-private.json" ]] || { echo R52_FOREIGN_FIXTURE_LEASE_DENIED;exit 94; }
for port in 3103 5183;do
 [[ -z "$(/usr/sbin/lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null||true)" ]] ||
 { echo "R52_FOREIGN_PORT_${port}_BUSY";exit 95; }
done
# Independent OWN-PORT 3103 preflight. The standard Hono 3001 preflight
# intentionally rejects another agent's occupied port; never signal/restart it.
# Verify the SAME restricted WORK DB/PG cluster and Redis before any write.
CLUSTER="$S/production_snapshot_20261024/data"
SOCKET="$S/production_snapshot_20261024/s"
REDIS_DIR="$S/redis-hono-20261024"
for p in "$CLUSTER" "$SOCKET" "$REDIS_DIR";do
 [[ -d "$p" && ! -L "$p" ]] || { echo R52_PROJECT_PG_SCOPE_DENIED;exit 23; }
done
PG_BIN=/opt/homebrew/opt/postgresql@18/bin/psql
REDIS_CLI=/opt/homebrew/bin/redis-cli
[[ -x "$PG_BIN" && -x "$REDIS_CLI" ]] || exit 23
identity=$(/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=3  "$PG_BIN" -X -w -h "$SOCKET" -p 55921 -U asmtv1  -d gafus_refactor_real_work_20261024 -At -v ON_ERROR_STOP=1  -c "SELECT current_database() || '|' || current_setting('server_version_num') || '|' || current_setting('data_directory') || '|' || current_setting('listen_addresses')") ||
 { echo R52_WORK_PG_UNAVAILABLE;exit 23; }
[[ "$identity" == "gafus_refactor_real_work_20261024|180004|$CLUSTER|127.0.0.1" ]] ||
 { echo R52_WORK_PG_WRONG_CLUSTER;exit 23; }
[[ "$("$REDIS_CLI" -h 127.0.0.1 -p 55927 PING 2>/dev/null)" == PONG ]] ||
 { echo R52_REDIS_UNAVAILABLE;exit 23; }
[[ "$("$REDIS_CLI" -h 127.0.0.1 -p 55927 --raw CONFIG GET dir 2>/dev/null | /usr/bin/tail -1)" == "$REDIS_DIR" ]] ||
 { echo R52_REDIS_WRONG_DIR;exit 23; }

APP_ENV="$S/production_snapshot_20261024/app.env"
ACCESS="$S/hono-local-access.secret"
REFRESH="$S/hono-local-refresh.secret"
for f in "$APP_ENV" "$ACCESS" "$REFRESH";do
 [[ -f "$f" && ! -L "$f" && "$(/usr/bin/stat -f '%Lp' "$f")" == 600 ]] || exit 96
done
/usr/bin/python3 - "$APP_ENV" <<'PY_DB_AUTH'
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import sys
s=Path(sys.argv[1]).read_text().strip()
assert s.startswith("DATABASE_URL=") and "\n" not in s
u=urlsplit(s.split("=",1)[1].strip().strip("'\""))
assert u.scheme=="postgresql" and u.hostname=="127.0.0.1" and u.port==55921
assert u.path=="/gafus_refactor_real_work_20261024"
assert u.username=="gafus_refactor_local_real" and bool(u.password)
assert parse_qs(u.query)=={"schema":["public"]} and not u.fragment
PY_DB_AUTH

LOG="$S/web3-survey-hono-r52-20261026.log"
[[ ! -e "$LOG" && ! -L "$LOG" ]] || { echo R52_LOG_ALREADY_EXISTS;exit 97; }
HONO_PID=""
VITE_PID=""
FIXTURE=0
FINISHED=0
fixture(){
 ( cd "$R/apps/api"
   /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/" \
    APP_ENV="$APP_ENV" COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
    GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WEB3_REAL_BROWSER=1 \
    /bin/zsh -c '
      set -euo pipefail
      line=$(< "$APP_ENV"); [[ "$line" == DATABASE_URL=* ]] || exit 23
      export DATABASE_URL="${line#DATABASE_URL=}"
      exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs \
        ../../scripts/refactor/web3-unified-fixture.ts "$1"
    ' _ "$1"
 )
}
acceptance(){
 ( cd "$R/apps/api"
   /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/" \
    APP_ENV="$APP_ENV" COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
    GAFUS_LOCAL_ISOLATED_API=1 GAFUS_WEB3_REAL_BROWSER=1 \
    GAFUS_WEB3_OWN_HTTP=1 GAFUS_WEB3_SURVEY_REAL_HTTP=1 \
    /bin/zsh -c '
      set -euo pipefail
      line=$(< "$APP_ENV"); [[ "$line" == DATABASE_URL=* ]] || exit 23
      export DATABASE_URL="${line#DATABASE_URL=}"
      exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs \
        ../../scripts/refactor/web3-survey-real-http.ts "$1"
    ' _ "$1"
 )
}
finish(){
 local rc=${1:-$?}
 if [[ "$FINISHED" == 1 ]];then exit "$rc";fi
 FINISHED=1
 trap - EXIT INT TERM
 # tsx bootstrap can spawn the listener; terminate ONLY this job's processes.
 if [[ -n "$VITE_PID" ]]; then
  listener=$(/usr/sbin/lsof -nP -iTCP:5183 -sTCP:LISTEN -t 2>/dev/null | /usr/bin/head -1 || true)
  [[ "$listener" != "$VITE_PID" ]] || kill -TERM "$listener" 2>/dev/null||true
  kill -TERM "$VITE_PID" 2>/dev/null||true;wait "$VITE_PID" 2>/dev/null||true
 fi
 if [[ -n "$HONO_PID" ]];then
  listener=$(/usr/sbin/lsof -nP -iTCP:3103 -sTCP:LISTEN -t 2>/dev/null | /usr/bin/head -1 || true)
  if [[ -n "$listener" ]] && own_hono_listener "$listener";then
   kill -TERM "$listener" 2>/dev/null||true
  fi
  kill -TERM "$HONO_PID" 2>/dev/null||true;wait "$HONO_PID" 2>/dev/null||true
 fi
 if [[ "$FIXTURE" == 1 ]]; then
  acceptance cleanup || { echo R52_SURVEY_EXACT_CLEANUP_FAILED;rc=99; }
  fixture cleanup || { echo R52_FIXTURE_CLEANUP_FAILED;rc=99; }
  [[ ! -e "$S/web3-unified-private.json" ]] || rc=99
 fi
 echo "WEB3_R52_END exit=$rc"
 exit "$rc"
}
trap finish EXIT INT TERM
FIXTURE=1
fixture create
( cd "$R/apps/api"
 exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/" \
 APP_ENV="$APP_ENV" ACCESS="$ACCESS" REFRESH="$REFRESH" COREPACK_ENABLE_NETWORK=0 \
 NODE_ENV=development GAFUS_WEB3_OWN_HTTP=1 GAFUS_LOCAL_ISOLATED_API=1 \
 API_HOST=127.0.0.1 API_PORT=3103 REDIS_URL="redis://127.0.0.1:55927/6" \
 /bin/zsh -c '
  set -euo pipefail
  line=$(< "$APP_ENV"); [[ "$line" == DATABASE_URL=* ]] || exit 23
  export DATABASE_URL="${line#DATABASE_URL=}"
  export JWT_SECRET="$(< "$ACCESS")" JWT_REFRESH_SECRET="$(< "$REFRESH")"
  exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs \
    ../../scripts/refactor/web3-owned-hono-server.ts
 '
) >"$LOG" 2>&1 &
HONO_PID=$!
own_hono_listener(){
 local candidate="$1" parent depth
 [[ "$candidate" == "$HONO_PID" ]] && return 0
 for depth in {1..8};do
  [[ "$candidate" =~ '^[0-9]+$' ]] || return 1
  parent=$(/bin/ps -o ppid= -p "$candidate" 2>/dev/null|/usr/bin/tr -d '[:space:]')
  [[ -n "$parent" && "$parent" != 1 && "$parent" != "$candidate" ]] || return 1
  [[ "$parent" == "$HONO_PID" ]] && return 0
  candidate="$parent"
 done
 return 1
}
ready=0
for i in {1..120};do
 kill -0 "$HONO_PID" 2>/dev/null||break
 code=$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 1 -w '%{http_code}' \
  http://127.0.0.1:3103/ready 2>/dev/null||true)
 pid=$(/usr/sbin/lsof -nP -iTCP:3103 -sTCP:LISTEN -t 2>/dev/null|/usr/bin/head -1||true)
 if [[ "$code" == 200 ]] && own_hono_listener "$pid";then ready=1;break;fi
 /bin/sleep .2
done
[[ "$ready" == 1 ]] || { echo R52_REGISTERED_HONO_NOT_READY; finish 36; }
echo "WEB3_R52_REGISTERED_HONO_READY"
VITE_LOG="$S/web3-survey-vite-r52-20261026.log"
[[ ! -e "$VITE_LOG" && ! -L "$VITE_LOG" ]] || exit 98
( cd "$R/apps/web-vite"
 exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S" TMPDIR="$S/"  COREPACK_ENABLE_NETWORK=0 GAFUS_WEB_DEV_API_MODE=local-hono  VITE_API_BASE_URL=http://127.0.0.1:4174  /opt/homebrew/bin/node node_modules/vite/bin/vite.js  --config vite.web3.parity.config.mjs --host 127.0.0.1 --port 5183 --strictPort
) > "$VITE_LOG" 2>&1 &
VITE_PID=$!
vite_ready=0
for i in {1..120};do
 kill -0 "$VITE_PID" 2>/dev/null||break
 http_code=$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 1 -w '%{http_code}'   http://127.0.0.1:5183/login 2>/dev/null||true)
 listener=$(/usr/sbin/lsof -nP -iTCP:5183 -sTCP:LISTEN -t 2>/dev/null | /usr/bin/head -1 || true)
 if [[ "$http_code" == 200 && "$listener" == "$VITE_PID" ]];then vite_ready=1;break;fi
 /bin/sleep .2
done
[[ "$vite_ready" == 1 ]] || { echo R52_VITE_NOT_READY; finish 39; }
echo "WEB3_R52_OWN_VITE_READY"
# Explicit cleanup even on an accepted test failure, not only EXIT trap.
acceptance_rc=0
acceptance run || acceptance_rc=$?
if [[ "$acceptance_rc" == 0 ]];then echo "WEB3_R52_SURVEY_BROWSER_REAL_PG_PASS";fi
finish "$acceptance_rc"
