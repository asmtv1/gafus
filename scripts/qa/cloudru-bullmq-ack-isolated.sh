#!/bin/bash
# Disposable real Redis + BullMQ local retry test. Never touches production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ "$PWD" = "$ROOT" ] || { echo "BULLMQ_QA_WRONG_ROOT"; exit 2; }
for bin in redis-server redis-cli python3;do command -v "$bin" >/dev/null || {
 echo "BULLMQ_QA_MISSING_TOOL";exit 2;};done
temp="$(mktemp -d /tmp/gafus-cloudru-bullmq-ack.XXXXXX)"
pid=""
cleanup(){
 result=$?
 trap - EXIT
 if [ -n "$pid" ];then kill "$pid" 2>/dev/null || true;wait "$pid" 2>/dev/null || true;fi
 if [[ "$temp" == /tmp/gafus-cloudru-bullmq-ack.* && -d "$temp" && ! -L "$temp" ]];then rm -rf -- "$temp";fi
 exit "$result"
}
trap cleanup EXIT
port="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
redis-server --bind 127.0.0.1 --port "$port" --protected-mode yes --save '' --appendonly no --dir "$temp" > "$temp/redis.log" 2>&1 &
pid=$!
ready=0
for i in $(seq 1 50);do
 if redis-cli -h 127.0.0.1 -p "$port" ping 2>/dev/null | grep -q PONG;then ready=1;break;fi
 sleep 0.1
done
[ "$ready" = 1 ] || { echo "BULLMQ_QA_REDIS_NOT_READY";exit 1; }
export NODE_ENV=test GAFUS_CLOUDRU_BULLMQ_ISOLATED_QA=1 GAFUS_CLOUDRU_BULLMQ_QA_PORT="$port"
(cd packages/worker && ./node_modules/.bin/vitest run --config vitest.config.ts src/cloudru-unknown-ack.real-bullmq.test.ts --reporter=dot) > "$temp/test.log" 2>&1 || {
 echo "BULLMQ_QA_UNKNOWN_ACK_REPLAY_FAILED";tail -100 "$temp/test.log";exit 1;
}
grep -E 'Test Files|Tests ' "$temp/test.log" | tail -4
echo "BULLMQ_QA_REAL_REDIS_UNRECOVERABLE_ACK_PASS"
