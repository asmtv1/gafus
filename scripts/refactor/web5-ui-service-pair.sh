#!/bin/zsh
# WEB5 test-only Hono and Vite. Own ports exclusively; no other-agent process control.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" && "$(git -C "$ROOT" rev-parse --show-toplevel)" == "$ROOT" && "$(git -C "$ROOT" branch --show-current)" == vite ]] || exit 23
for d in "$ROOT" "$SCRATCH" "$ROOT/apps/api" "$ROOT/apps/web-vite";do [[ -d "$d" && ! -L "$d" && "${d:A}" == "$d" ]] || exit 23;done
for p in 3001 5173;do
 if /usr/sbin/lsof -nP -iTCP:$p -sTCP:LISTEN 2>/dev/null | grep -q LISTEN;then echo "WEB5_PORT_BUSY_$p";exit 23;fi
done
/bin/zsh "$ROOT/scripts/refactor/ag1-isolated-hono-run.sh" --preflight
api='';vite=''
finish(){local code=$?;trap - EXIT INT TERM; for pid in "$vite" "$api";do [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || :; wait "$pid" 2>/dev/null || :; };done;echo WEB5_SERVICES_FINISHED_$code;exit "$code";}
trap finish EXIT INT TERM
(cd "$ROOT";exec /bin/zsh scripts/refactor/ag1-isolated-hono-run.sh --run) > "$SCRATCH/web5-hono-service.log" 2>&1 &
api=$!
ready=0
for i in {1..120};do
 if ! kill -0 "$api" 2>/dev/null;then break;fi
 [[ "$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3001/ready 2>/dev/null)" == 200 ]] && { ready=1;break; }
 sleep .4
done
[[ "$ready" == 1 ]] || { echo WEB5_HONO_NOT_READY;exit 24; }
echo WEB5_HONO_SERVICE_READY
(cd "$ROOT/apps/web-vite";exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/" COREPACK_ENABLE_NETWORK=0 GAFUS_WEB_DEV_API_MODE=local-hono VITE_API_BASE_URL=http://127.0.0.1:4174 /opt/homebrew/bin/node node_modules/vite/bin/vite.js --config vite.config.mjs --host 127.0.0.1 --port 5173 --strictPort) > "$SCRATCH/web5-vite-service.log" 2>&1 &
vite=$!
ready=0
for i in {1..120};do
 if ! kill -0 "$vite" 2>/dev/null;then break;fi
 [[ "$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:5173/login 2>/dev/null)" == 200 ]] && {ready=1;break;}
 sleep .4
done
[[ "$ready" == 1 ]] || { echo WEB5_VITE_NOT_READY;exit 24; }
echo WEB5_VITE_SERVICE_READY
while kill -0 "$api" 2>/dev/null && kill -0 "$vite" 2>/dev/null;do sleep 3;done
exit 1
