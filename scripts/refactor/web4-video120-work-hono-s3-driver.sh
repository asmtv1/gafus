#!/bin/zsh
# WEB4 bounded ORIGINAL Hono3301 -> WORK SQL PG18 -> strict local MinIO9000.
# Own synthetic MP4/users/objects only. Never restart occupied Hono3001/Web.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
S3="$SCRATCH/nonprod-s3"
MP4="$S3/web4-video-120-test.mp4"
LOG="$SCRATCH/web4-video120-ticket-hono.private.log"
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for dir in "$ROOT" "$SCRATCH" "$S3" "$ROOT/apps/api"; do
  [[ -d "$dir" && ! -L "$dir" && "${dir:A}" == "$dir" ]] || exit 23
done
[[ ! -e "$MP4" && ! -L "$MP4" ]] || { print -u2 'WEB4_120_TEST_SOURCE_EXISTS_REVIEW'; exit 23; }
[[ ! -e "$LOG" || ( -f "$LOG" && ! -L "$LOG" ) ]] || exit 23
[[ "$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 3 -w '%{http_code}' http://127.0.0.1:9000/minio/health/live)" == 200 ]] || exit 23
[[ "$(/usr/sbin/lsof -nP -iTCP:3301 -sTCP:LISTEN 2>/dev/null | /usr/bin/awk 'NR>1{n++}END{print n+0}')" == 0 ]] || exit 23
/bin/zsh scripts/refactor/web4-hono-3301-s3.sh --preflight-local-s3
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
[[ -f "$APP_ENV" && ! -L "$APP_ENV" && "$(/usr/bin/stat -f '%Lp' "$APP_ENV")" == 600 ]] || exit 23
umask 077
API_PID=''
owned_descendant(){
 local child="$1";local parent; local iterations=0
 while [[ "$child" == <-> && "$child" -gt 1 && $iterations -lt 8 ]]; do
  [[ "$child" == "$API_PID" ]] && return 0
  parent=$(ps -p "$child" -o ppid= 2>/dev/null | tr -d ' ')
  child="$parent";(( iterations += 1 ))
 done
 return 1
}
finish(){
 local code=$?; trap - EXIT INT TERM
 if [[ -n "$API_PID" ]]; then
   local listener
   listener=$(/usr/sbin/lsof -nP -iTCP:3301 -sTCP:LISTEN 2>/dev/null | /usr/bin/awk 'NR==2{print $2}')
   if [[ -n "$listener" ]] && owned_descendant "$listener"; then
     kill -TERM "$listener" 2>/dev/null || true
   fi
   kill -TERM "$API_PID" 2>/dev/null || true
   wait "$API_PID" 2>/dev/null || true
 fi
 if [[ -f "$MP4" && ! -L "$MP4" && "${MP4:A}" == "$MP4" ]]; then
   rm -- "$MP4" || code=99
 fi
 print -r -- "WEB4_VIDEO120_DRIVER_FINISHED exit=$code"
 exit "$code"
}
trap finish EXIT INT TERM
/opt/homebrew/bin/ffmpeg -hide_banner -nostdin -loglevel error -n \
 -f lavfi -i 'testsrc2=size=160x96:rate=5' -t 120 \
 -c:v libx264 -pix_fmt yuv420p -preset ultrafast -threads 2 \
 -movflags +faststart "$MP4"
[[ -f "$MP4" && ! -L "$MP4" && "$(/usr/bin/stat -f '%Lp' "$MP4")" == 600 ]] || exit 23
print -r -- 'WEB4_VIDEO120_LOCAL_MP4_120S_CREATED'
( cd "$ROOT"; exec /bin/zsh scripts/refactor/web4-hono-3301-s3.sh --run-local-s3 ) \
 > "$LOG" 2>&1 &
API_PID=$!
ready=0
for i in {1..160}; do
  if ! kill -0 "$API_PID" 2>/dev/null;then break;fi
  code=$(/usr/bin/curl --noproxy '*' -s --max-time 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:3301/health 2>/dev/null || :)
  if [[ "$code" == 200 ]];then ready=1;break;fi
  /bin/sleep .4
done
[[ "$ready" == 1 ]] || { print -u2 'WEB4_ORIGINAL_HONO_3301_START_FAILED'; tail -n 10 "$LOG" | cut -c1-180;exit 33; }
print -r -- 'WEB4_ORIGINAL_HONO_3301_PRIVATE_S3_READY'
( cd "$ROOT/apps/api";
  /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$S3" TMPDIR="$S3/" \
    COREPACK_ENABLE_NETWORK=0 APP_ENV="$APP_ENV" WEB4_VIDEO120_WORK_HTTP=1 \
    NODE_ENV=development GAFUS_LOCAL_ISOLATED_API=1 API_HOST=127.0.0.1 API_PORT=3301 \
    GAFUS_WEB1_ALT_HONO=1 REDIS_URL=redis://127.0.0.1:55927/1 \
    /bin/zsh -c '
      set -euo pipefail
      line=$(< "$APP_ENV")
      [[ "$line" == DATABASE_URL=postgresql://gafus_refactor_local_real:* ]] || exit 23
      export DATABASE_URL="${line#DATABASE_URL=}"
      exec /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs \
        src/test/web4-video120-real-work-http.acceptance.ts
    ' )
