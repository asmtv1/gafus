#!/bin/zsh
# WEB4 bounded ORIGINAL Hono3501 -> WORK SQL PG18 -> strict local MinIO9500.
# Own synthetic MP4/users/objects only. Never restart occupied Hono3001/Web.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
S3="$SCRATCH/web4-nonprod-s3"
MP4="$S3/web4-browser-120-test.mp4"
LOG="$SCRATCH/web4-browser120-hono3501.private.log"
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for dir in "$ROOT" "$SCRATCH" "$S3" "$ROOT/apps/api"; do
  [[ -d "$dir" && ! -L "$dir" && "${dir:A}" == "$dir" ]] || exit 23
done
[[ ! -e "$MP4" && ! -L "$MP4" ]] || { print -u2 'WEB4_120_TEST_SOURCE_EXISTS_REVIEW'; exit 23; }
[[ ! -e "$LOG" || ( -f "$LOG" && ! -L "$LOG" ) ]] || exit 23
[[ "$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 3 -w '%{http_code}' http://127.0.0.1:9500/minio/health/live)" == 200 ]] || exit 23
for port in 3501 5504; do
  [[ "$(/usr/sbin/lsof -nP -iTCP:$port -sTCP:LISTEN 2>/dev/null | /usr/bin/awk 'NR>1{n++}END{print n+0}')" == 0 ]] || exit 23
done
/bin/zsh scripts/refactor/web4-hono-3501-s3.sh --preflight-local-s3
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
[[ -f "$APP_ENV" && ! -L "$APP_ENV" && "$(/usr/bin/stat -f '%Lp' "$APP_ENV")" == 600 ]] || exit 23
umask 077
API_PID='';VITE_PID=''
owned_descendant(){
 local child="$1";local ancestor="${2:-$API_PID}";local parent; local iterations=0
 while [[ "$child" == <-> && "$child" -gt 1 && $iterations -lt 8 ]]; do
  [[ "$child" == "$ancestor" ]] && return 0
  parent=$(ps -p "$child" -o ppid= 2>/dev/null | tr -d ' ')
  child="$parent";(( iterations += 1 ))
 done
 return 1
}
finish(){
 local code=$?; trap - EXIT INT TERM
 if [[ -n "$API_PID" ]]; then
   local listener
   listener=$(/usr/sbin/lsof -nP -iTCP:3501 -sTCP:LISTEN 2>/dev/null | /usr/bin/awk 'NR==2{print $2}')
   if [[ -n "$listener" ]] && owned_descendant "$listener"; then
     kill -TERM "$listener" 2>/dev/null || true
   fi
   kill -TERM "$API_PID" 2>/dev/null || true
   wait "$API_PID" 2>/dev/null || true
 fi
 if [[ -n "$VITE_PID" ]];then
   local vpid=$(/usr/sbin/lsof -nP -iTCP:5504 -sTCP:LISTEN 2>/dev/null | /usr/bin/awk 'NR==2{print $2}')
   if [[ -n "$vpid" ]] && owned_descendant "$vpid" "$VITE_PID";then kill -TERM "$vpid" 2>/dev/null || true;fi
   kill -TERM "$VITE_PID" 2>/dev/null || true;wait "$VITE_PID" 2>/dev/null || true
 fi
 if [[ -f "$MP4" && ! -L "$MP4" && "${MP4:A}" == "$MP4" ]]; then
   rm -- "$MP4" || code=99
 fi
 print -r -- "WEB4_VIDEO120_BROWSER_DRIVER_FINISHED exit=$code"
 exit "$code"
}
trap finish EXIT INT TERM
/opt/homebrew/bin/ffmpeg -hide_banner -nostdin -loglevel error -n \
 -f lavfi -i 'testsrc2=size=160x96:rate=5' -t 120 \
 -c:v libx264 -pix_fmt yuv420p -preset ultrafast -threads 2 \
 -movflags +faststart "$MP4"
[[ -f "$MP4" && ! -L "$MP4" && "$(/usr/bin/stat -f '%Lp' "$MP4")" == 600 ]] || exit 23
print -r -- 'WEB4_VIDEO120_LOCAL_MP4_120S_CREATED'
( cd "$ROOT"; exec /bin/zsh scripts/refactor/web4-hono-3501-s3.sh --run-local-s3 ) \
 > "$LOG" 2>&1 &
API_PID=$!
ready=0
for i in {1..160}; do
  if ! kill -0 "$API_PID" 2>/dev/null;then break;fi
  code=$(/usr/bin/curl --noproxy '*' -s --max-time 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:3501/health 2>/dev/null || :)
  if [[ "$code" == 200 ]];then ready=1;break;fi
  /bin/sleep .4
done
[[ "$ready" == 1 ]] || { print -u2 'WEB4_ORIGINAL_HONO_3501_START_FAILED'; tail -n 10 "$LOG" | cut -c1-180;exit 33; }
print -r -- 'WEB4_ORIGINAL_HONO_3501_PRIVATE_S3_READY'
( cd "$ROOT/apps/web-vite";exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
 HOME="$S3" TMPDIR="$S3/" COREPACK_ENABLE_NETWORK=0 NODE_ENV=development \
 GAFUS_WEB4_ISOLATED_MEDIA=1 GAFUS_WEB_DEV_API_MODE=local-hono VITE_WEB4_PRIVATE_S3=1 \
 VITE_API_BASE_URL=http://127.0.0.1:4174 \
 /opt/homebrew/bin/node node_modules/vite/bin/vite.js --config vite.web4.config.mjs \
 --host 127.0.0.1 --port 5504 --strictPort ) > "$ROOT/.local-pg-scratch/web4-browser120-vite5504.private.log" 2>&1 &
VITE_PID=$!
vite_ready=0
for attempt in {1..120};do
 if ! kill -0 "$VITE_PID" 2>/dev/null;then break;fi
 code=$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 2 -w '%{http_code}' http://127.0.0.1:5504/login 2>/dev/null || :)
 if [[ "$code" == 200 ]];then vite_ready=1;break;fi
 /bin/sleep .3
done
[[ "$vite_ready" == 1 ]] || { print -u2 'WEB4_VITE5504_START_FAILED';exit 34; }
print -r -- 'WEB4_GENUINE_VITE5504_VIDEO_READY'
( cd "$ROOT/apps/api";
  /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S3" TMPDIR="$S3/" \
    COREPACK_ENABLE_NETWORK=0 APP_ENV="$APP_ENV" WEB4_VIDEO120_BROWSER_HTTP=1 \
    NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 API_HOST=127.0.0.1 API_PORT=3501 \
    GAFUS_WEB4_ISOLATED_MEDIA=1 REDIS_URL=redis://127.0.0.1:55927/1 \
    /bin/zsh -c '
      set -euo pipefail
      line=$(< "$APP_ENV")
      [[ "$line" == DATABASE_URL=postgresql://gafus_refactor_local_real:* ]] || exit 23
      export DATABASE_URL="${line#DATABASE_URL=}"
      exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs \
        src/test/web4-video120-3501-browser.acceptance.ts
    ' )
