#!/bin/zsh
# Separate, fail-closed, local-only QA: port 5507 UI → 3002 API → 9000 MinIO.
# Does not stop/reconfigure the existing user servers 5173/3001.
set -euo pipefail
cd /Users/asmtv1/Desktop/gafus-refactor
[[ "$PWD" == "/Users/asmtv1/Desktop/gafus-refactor" ]] || exit 30
[[ "${NODE_ENV:-development}" != production ]] || exit 31
if lsof -nP -iTCP:3002 -iTCP:5507 -sTCP:LISTEN | grep -q LISTEN; then
  echo 'QUESTIONS_QA_PORT_ALREADY_OCCUPIED'; exit 32
fi
log_dir="$PWD/.local-pg-scratch/questions-v2-local-20261029"
mkdir -p "$log_dir"
chmod 700 "$log_dir"
umask 077
api_pid='' worker_pid='' web_pid=''
cleanup(){
  trap - TERM INT EXIT
  for pid in "$web_pid" "$worker_pid" "$api_pid"; do
    if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  wait 2>/dev/null || true
  echo 'QUESTIONS_QA_STACK_STOPPED'
}
trap cleanup TERM INT EXIT
pnpm exec tsx scripts/qa/questions-photo-v2-isolated.mts server >"$log_dir/api.log" 2>&1 & api_pid=$!
pnpm exec tsx scripts/qa/questions-photo-v2-isolated.mts worker >"$log_dir/worker.log" 2>&1 & worker_pid=$!
GAFUS_WEB_DEV_API_MODE=local-hono GAFUS_QUESTIONS_ISOLATED_QA=1 VITE_QUESTIONS_LOCAL_QA=1 \
  pnpm --dir apps/web-vite exec vite --config vite.config.mjs --host 127.0.0.1 \
    --port 5507 --strictPort >"$log_dir/web.log" 2>&1 & web_pid=$!
for i in {1..55}; do
  if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$worker_pid" 2>/dev/null ||
     ! kill -0 "$web_pid" 2>/dev/null; then
    echo 'QUESTIONS_QA_STACK_PROCESS_EXITED_EARLY'; exit 34
  fi
  qa_api=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3002/ready 2>/dev/null || true)
  qa_web=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:5507/questions 2>/dev/null || true)
  if [[ "$qa_api" == 200 && "$qa_web" == 200 ]]; then
    echo 'QUESTIONS_QA_STACK_READY web=http://127.0.0.1:5507/questions api=http://127.0.0.1:3002 storage=loopback-MinIO'
    break
  fi
  sleep 1
  if [[ "$i" == 55 ]]; then echo 'QUESTIONS_QA_STACK_UNREADY'; exit 35; fi
done
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$worker_pid" 2>/dev/null &&
      kill -0 "$web_pid" 2>/dev/null; do sleep 5; done
exit 36
