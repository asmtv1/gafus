#!/bin/zsh
# WEB4 opt-in mixed photo+poll Ready acceptance: only fixed WORK PG, private MinIO9500.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/bin:/bin
ROOT=/Users/asmtv1/Desktop/gafus-refactor
SCRATCH="$ROOT/.local-pg-scratch"
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || exit 23
for p in "$ROOT" "$SCRATCH" "$ROOT/apps" "$ROOT/apps/api" "$ROOT/scripts/refactor" "$SCRATCH/web4-nonprod-s3";do
 [[ -d "$p" && ! -L "$p" && "${p:A}" == "$p" ]] || exit 23
done
[[ ! -e "$SCRATCH/web4-visual-3501-private.json" ]] || { print -u2 'WEB4_R37_ACTIVE_VISUAL_LEASE';exit 23; }
[[ ! -e "$SCRATCH/web4-r37-hono.private.log" ]] || {print -u2 'WEB4_R37_LOG_ALREADY_EXISTS';exit 23;}
[[ "$(( $(/usr/sbin/lsof -nP -iTCP:3501 -sTCP:LISTEN 2>/dev/null|awk 'NR>1{n++}END{print n+0}') ))" == 0 ]] || exit 23
[[ "$(curl --noproxy '*' -s -o /dev/null --max-time 3 -w '%{http_code}' http://127.0.0.1:9500/minio/health/live)" == 200 ]] || exit 23
APP_ENV="$SCRATCH/production_snapshot_20261024/app.env"
[[ -f "$APP_ENV" && ! -L "$APP_ENV" && "$(stat -f '%Lp' "$APP_ENV")" == 600 ]] || exit 23
[[ -f "$SCRATCH/web4-nonprod-s3/credentials.json" && ! -L "$SCRATCH/web4-nonprod-s3/credentials.json" && "$(stat -f '%Lp' "$SCRATCH/web4-nonprod-s3/credentials.json")" == 600 ]] || exit 23
/bin/zsh scripts/refactor/web4-hono-3501-s3.sh --preflight-local-s3
api_pid=''
stop_owned(){
 local actual
 [[ -n "$api_pid" ]] || return 0
 actual=$(/usr/sbin/lsof -nP -iTCP:3501 -sTCP:LISTEN 2>/dev/null|awk 'NR==2{print $2}')
 if [[ -n "$actual" ]];then
   local child="$actual" parent='' i=0
   while [[ "$child" == <-> && "$child" -gt 1 && "$i" -lt 12 ]];do
     if [[ "$child" == "$api_pid" ]];then kill -TERM "$actual" 2>/dev/null||true;break;fi
     parent=$(ps -p "$child" -o ppid= 2>/dev/null|tr -d ' '); child="$parent"; ((i+=1))
   done
 fi
 kill -TERM "$api_pid" 2>/dev/null||true
 wait "$api_pid" 2>/dev/null||true
}
finish(){ local ec=$?;trap - EXIT INT TERM;stop_owned;print -r -- "WEB4_R37_DRIVER_EXIT=$ec";exit "$ec";}
trap finish EXIT INT TERM
umask 077
( cd "$ROOT";exec /bin/zsh scripts/refactor/web4-hono-3501-s3.sh --run-local-s3 ) > "$SCRATCH/web4-r37-hono.private.log" 2>&1 &
api_pid=$!
ready=0
for i in {1..120};do
  kill -0 "$api_pid" 2>/dev/null||break
  code=$(curl --noproxy '*' -s -o /dev/null --max-time 2 -w '%{http_code}' http://127.0.0.1:3501/health 2>/dev/null||true)
  if [[ "$code" == 200 ]];then ready=1;break;fi
  /bin/sleep .4
done
[[ "$ready" == 1 ]] || {print -u2 'WEB4_R37_HONO_NOT_READY';exit 34;}
print -r -- 'WEB4_R37_PRIVATE_HONO_WORK_READY'
# No host environment, production credentials or endpoints inherited.
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin HOME="$SCRATCH" TMPDIR="$SCRATCH/web4-nonprod-s3/" \
 APP_ENV="$APP_ENV" NODE_ENV=development COREPACK_ENABLE_NETWORK=0 \
 GAFUS_LOCAL_ISOLATED_API=1 GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE=1 \
 GAFUS_WEB4_ISOLATED_MEDIA=1 API_PORT=3501 WEB4_MIXED_READY_R37_WORK_HTTP=1 \
 FEED_PROCESSOR_READY=true FEED_ENABLED=true CLOUDRU_MEDIA_JOBS_ENABLED=false \
 GAFUS_ISOLATED_NONPROD_S3=enabled GAFUS_ISOLATED_S3_ENDPOINT=http://127.0.0.1:9500 \
 GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET=gafus-refactor-web4-documents-test \
 GAFUS_ISOLATED_S3_GALLERY_BUCKET=gafus-refactor-web4-gallery-test \
 GAFUS_ISOLATED_S3_QUESTIONS_BUCKET=gafus-refactor-web4-questions-test \
 GAFUS_ISOLATED_S3_FEED_BUCKET=gafus-refactor-web4-feed-test \
 /bin/zsh -c '
   set -euo pipefail
   line=$(< "$APP_ENV"); [[ "$line" == DATABASE_URL=postgresql://gafus_refactor_local_real:* ]] || exit 23
   export DATABASE_URL="${line#DATABASE_URL=}"
   exec /opt/homebrew/bin/pnpm --dir apps/api exec tsx src/test/web4-mixed-photo-poll-ready-r37.acceptance.ts
 '
print -r -- 'WEB4_R37_REAL_MIXED_PHOTO_POLL_WORKER_ACCEPTANCE_PASS'
