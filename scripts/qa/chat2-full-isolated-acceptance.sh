#!/bin/zsh
# Disposable native PG+Redis+Centrifugo + actual Hono HTTP and Chat2 outbox.
# Never uses the shared .local-pg-scratch/chat2-db or any production resources.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
[[ "${PWD:A}" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo CHAT2_FULL_WRONG_ROOT; exit 2; }
for p in 55445 56339 58339 58341 58342; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN | grep -q LISTEN; then echo "CHAT2_FULL_PORT_OCCUPIED:$p"; exit 2; fi
done
for bin in initdb pg_ctl redis-server psql python3; do command -v "$bin" >/dev/null || { echo "CHAT2_FULL_PREREQUISITE_MISSING:$bin"; exit 2; }; done
BROKER="$ROOT/.local-pg-scratch/chat2-bin/centrifugo"
[[ -x "$BROKER" && ! -L "$BROKER" ]] || { echo CHAT2_FULL_BROKER_BINARY_MISSING; exit 2; }
[[ -d "$ROOT/.local-pg-scratch" && ! -L "$ROOT/.local-pg-scratch" ]] || exit 2
umask 077
WORK="$(mktemp -d "$ROOT/.local-pg-scratch/agent2-chat2-full-XXXXXX")"
[[ "$WORK" == "$ROOT/.local-pg-scratch/agent2-chat2-full-"* && ! -L "$WORK" ]] || exit 2
redis_pid=''; broker_pid=''; pg_started=0
cleanup(){
  [[ -n "$broker_pid" ]] && kill "$broker_pid" 2>/dev/null || true
  [[ -n "$redis_pid" ]] && kill "$redis_pid" 2>/dev/null || true
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true; fi
  [[ -n "$broker_pid" ]] && wait "$broker_pid" 2>/dev/null || true
  [[ -n "$redis_pid" ]] && wait "$redis_pid" 2>/dev/null || true
  if [[ -d "$WORK" && ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-chat2-full-"* ]]; then rm -rf -- "$WORK"; fi
}
trap cleanup EXIT INT TERM
mkdir "$WORK/sock"
initdb -D "$WORK/pg" -A trust --no-instructions > "$WORK/pg-init.log" 2>&1 || { echo CHAT2_FULL_PG_INIT_FAILED; exit 1; }
pg_ctl -D "$WORK/pg" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 55445 -k $WORK/sock -c max_connections=80" start >/dev/null 2>&1 || { echo CHAT2_FULL_PG_START_FAILED; exit 1; }
pg_started=1
createdb -h 127.0.0.1 -p 55445 chat2_agent2_qa || { echo CHAT2_FULL_DB_CREATE_FAILED; exit 1; }
redis-server --bind 127.0.0.1 --port 56339 --save '' --appendonly no --protected-mode yes > "$WORK/redis.log" 2>&1 &
redis_pid=$!
python3 - "$WORK" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]); source=Path('infra/chat2/centrifugo.json')
data=json.loads(source.read_text())
data['engine']['redis']['address']='redis://127.0.0.1:56339'
data['health']={'enabled':True}
(root/'centrifugo.json').write_text(json.dumps(data))
PY
export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
export CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
"$BROKER" -c "$WORK/centrifugo.json" --http_server.address 127.0.0.1 --http_server.port 58339 > "$WORK/broker.log" 2>&1 &
broker_pid=$!
# Broker and Redis may need a few hundred ms to bind; never race E2E tests.
ready=0
for step in {1..35}; do
  if curl -sf --max-time 1 http://127.0.0.1:58339/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.25
done
if [[ "$ready" != 1 ]]; then
  echo CHAT2_FULL_BROKER_START_FAILED
  grep -iE '(error|fatal|invalid|unable)' "$WORK/broker.log" | tail -4 | sed -E 's#(secret|api_key|password)[^ ]*#<redacted>#gi' || true
  exit 1
fi
export DATABASE_URL='postgresql://asmtv1@127.0.0.1:55445/chat2_agent2_qa'
export REDIS_URL='redis://127.0.0.1:56339'
export NODE_ENV=test API_HOST=127.0.0.1 API_PORT=58341
export WORKER_HEALTH_PORT=58342 CHAT2_LOCAL_WORKER_PORT=58342 GAFUS_CHAT2_FULL_ISOLATED_ACCEPTANCE=1
export CHAT2_API_ENABLED=enabled CHAT2_WORKER_ENABLED=enabled CHAT2_PRIVATE_MEDIA_ENABLED=enabled
export CHAT2_LEGACY_RETIRE_ENABLED=disabled
export CHAT2_PUBLIC_WS_URL='ws://127.0.0.1:58339/connection/websocket'
export CHAT2_CENTRIFUGO_HTTP_API='http://127.0.0.1:58339/api/publish'
export CHAT2_CENTRIFUGO_TOKEN_SECRET="$CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY"
export CHAT2_CENTRIFUGO_API_KEY="$CENTRIFUGO_HTTP_API_KEY"
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export CHAT2_MAIL_ENABLED=disabled
# First-install schema in a fresh empty, ephemeral database only. Never migrate a shared DB.
if ! (cd packages/prisma && ./node_modules/.bin/prisma db push --skip-generate > "$WORK/db-push.log" 2>&1); then
  echo CHAT2_FULL_DISPOSABLE_SCHEMA_PUSH_FAILED; tail -8 "$WORK/db-push.log" | sed -E 's#postgresql://[^ ]+#<redacted>#g'; exit 1
fi
# All external services are loopback and synthetic; no test mocks of access guards.
if ! (cd apps/api && ./node_modules/.bin/vitest run --config vitest.chat2-full-isolated.config.ts --reporter=dot > "$WORK/test.log" 2>&1); then
  echo CHAT2_FULL_ISOLATED_ACCEPTANCE_FAILED
  grep -E '(FAIL|Error|expected|CHAT2_FULL_|CUTOVER_|Test Files|Tests|TypeError|PrismaClient)' "$WORK/test.log" | tail -32 | sed -E 's#postgresql://[^ ]+#<redacted>#g'
  exit 1
fi
grep -E '(Test Files|Tests)' "$WORK/test.log" | tail -3
printf 'CHAT2_FULL_REAL_ISOLATED_PASS: verified registered Hono/auth, PG outbox, worker, broker, websocket, ACL, idempotency, legacy 503/410\n'
