#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export LC_ALL=C LANG=C
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb python3; do
 command -v "$bin" >/dev/null || { echo "TRAINER_AI_QA_TOOL_MISSING"; exit 2; }
done
DIR="$(mktemp -d /tmp/gafus-stage13-consult-exam-pg.XXXXXX)"
umask 077
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
redis_pid=""
cleanup(){
 if [[ -n "$redis_pid" ]]; then kill "$redis_pid" 2>/dev/null || true; wait "$redis_pid" 2>/dev/null || true; fi
 if [ "$started" = "1" ];then pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true;fi
 if [[ "$DIR" == /tmp/gafus-stage13-consult-exam-pg.* ]] && [ ! -L "$DIR" ];then rm -rf -- "$DIR";fi
}
trap cleanup EXIT INT TERM
initdb -D "$DIR/pg" -A trust -U qacourse --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/server.log" -o "-h 127.0.0.1 -p $PORT -k $DIR" -w start >/dev/null || { cat "$DIR/server.log" >&2; exit 1; }
started=1
createdb -h 127.0.0.1 -p "$PORT" -U qacourse gafus_stage13_consult_exam
export DATABASE_URL="postgresql://qacourse@127.0.0.1:$PORT/gafus_stage13_consult_exam?schema=public"
export NODE_ENV=test GAFUS_LOCAL_ISOLATED_API=1 GAFUS_STAGE13_CONSULT_EXAM=1
(cd packages/prisma && pnpm exec prisma db push --skip-generate >"$DIR/schema.log" 2>&1) || { tail -65 "$DIR/schema.log"; exit 1; }
export NODE_OPTIONS="${NODE_OPTIONS:-} --require $ROOT/scripts/qa/block-nonlocal-network.cjs"
export GAFUS_STAGE13_QA=1
REDIS_PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --save "" --appendonly no --dir "$DIR" >"$DIR/redis.log" 2>&1 &
redis_pid=$!
for i in {1..50}; do
  kill -0 "$redis_pid" 2>/dev/null || { cat "$DIR/redis.log"; exit 1; }
  if redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null | grep -qx PONG; then break; fi
  sleep 0.2
done
kill -0 "$redis_pid"
redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping | grep -qx PONG
export REDIS_URL="redis://127.0.0.1:$REDIS_PORT"
pnpm exec tsx scripts/qa/stage13-consult-exam-real-pg.smoke.ts
