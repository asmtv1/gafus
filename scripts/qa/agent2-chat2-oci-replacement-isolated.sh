#!/bin/bash
# Actual optimized API+Worker image entrypoints as separate disposable Docker
# processes, live native PostgreSQL/Redis/Centrifugo; never production.
set -euo pipefail
ROOT='/Users/asmtv1/Desktop/gafus-refactor'
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo CHAT2_OCI_WRONG_ROOT;exit 2; }
for image in gafus-refactor-agent2-worker-local:20261030 gafus-refactor-agent2-api-local:20261030; do
  docker image inspect "$image" >/dev/null 2>&1 || { echo CHAT2_OCI_IMAGE_UNAVAILABLE; exit 2; }
done
for p in 55449 56344 8000; do if lsof -nP -iTCP:$p -sTCP:LISTEN | grep -q LISTEN;then echo CHAT2_OCI_RESERVED_PORT_BUSY;exit 2;fi;done
for bin in initdb pg_ctl createdb psql redis-server redis-cli python3 docker;do command -v "$bin" >/dev/null || { echo CHAT2_OCI_MISSING_TOOL; exit 2; };done
BROKER="$ROOT/.local-pg-scratch/chat2-bin/centrifugo"
[[ -x "$BROKER" && ! -L "$BROKER" ]] || { echo CHAT2_OCI_NATIVE_BROKER_UNAVAILABLE;exit 2; }
[[ -d .local-pg-scratch && ! -L .local-pg-scratch ]] || exit 2
umask 077
WORK="$(mktemp -d "$ROOT/.local-pg-scratch/agent2-chat2-oci-XXXXXX")"
[[ "$WORK" == "$ROOT/.local-pg-scratch/agent2-chat2-oci-"* && ! -L "$WORK" ]] || exit 2
suffix="$(openssl rand -hex 6)"; network="rf-a2-chat2-oci-net-$suffix"; worker="rf-a2-chat2-oci-worker-$suffix"; api="rf-a2-chat2-oci-api-$suffix"
pg_started=0;network_started=0;redis_pid='';broker_pid=''
cleanup(){
  docker rm -f "$api" "$worker" >/dev/null 2>&1 || true
  [[ "$network_started" == 1 ]] && docker network rm "$network" >/dev/null 2>&1 || true
  [[ -n "$broker_pid" ]] && kill "$broker_pid" 2>/dev/null || true
  [[ -n "$redis_pid" ]] && kill "$redis_pid" 2>/dev/null || true
  [[ "$pg_started" == 1 ]] && pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  [[ -n "$broker_pid" ]] && wait "$broker_pid" 2>/dev/null || true
  [[ -n "$redis_pid" ]] && wait "$redis_pid" 2>/dev/null || true
  [[ -d "$WORK" && ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-chat2-oci-"* ]] && rm -rf -- "$WORK" || true
}
trap cleanup EXIT
initdb -D "$WORK/pg" -A trust --no-instructions > "$WORK/init.log" 2>&1
mkdir "$WORK/sock"
pg_ctl -D "$WORK/pg" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 55449 -k $WORK/sock -c max_connections=80" start >/dev/null
pg_started=1
createdb -h 127.0.0.1 -p 55449 agent2_chat2_oci_qa
redis-server --bind 127.0.0.1 --port 56344 --save '' --appendonly no --protected-mode yes > "$WORK/redis.log" 2>&1 & redis_pid=$!
export DATABASE_URL='postgresql://asmtv1@127.0.0.1:55449/agent2_chat2_oci_qa'
export REDIS_URL='redis://127.0.0.1:56344'
redis_ready=0
for i in {1..35};do if redis-cli -h 127.0.0.1 -p 56344 ping 2>/dev/null | grep -qx PONG;then redis_ready=1;break;fi;sleep 0.2;done
[[ "$redis_ready" == 1 ]] || { echo CHAT2_OCI_LOCAL_REDIS_UNREADY;exit 1; }
# Prisma push to NEW disposable database, never a shared or production URL.
pnpm --filter @gafus/prisma exec prisma db push --skip-generate > "$WORK/schema.log" 2>&1 || { echo CHAT2_OCI_SCHEMA_FAILED; tail -7 "$WORK/schema.log" | cut -c1-170; exit 1; }
python3 - "$WORK" <<'PY'
from pathlib import Path
import json,sys
root=Path(sys.argv[1]); assert '/.local-pg-scratch/agent2-chat2-oci-' in str(root.resolve())
cfg=json.loads(Path('infra/chat2/centrifugo.prod.json').read_text())
cfg['engine']['redis']['address']='redis://127.0.0.1:56344'
(root/'broker.json').write_text(json.dumps(cfg))
PY
export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
export CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
"$BROKER" -c "$WORK/broker.json" --http_server.address 127.0.0.1 --http_server.port 8000 > "$WORK/broker.log" 2>&1 & broker_pid=$!
broker_ready=0
for i in {1..40};do if curl -sf --max-time 1 'http://127.0.0.1:8000/health' >/dev/null 2>&1;then broker_ready=1;break;fi;sleep 0.25;done
[[ "$broker_ready" == 1 ]] || { echo CHAT2_OCI_BROKER_UNREADY; exit 1; }
# Cannot use --internal because Docker Desktop blocks native Mac loopback even
# with host-gateway; unique bridge + --dns 127.0.0.1 disables external DNS.
docker network create "$network" >/dev/null;network_started=1
common=( -e NODE_ENV=production
  -e DATABASE_URL='postgresql://asmtv1@host.docker.internal:55449/agent2_chat2_oci_qa'
  -e REDIS_URL='redis://host.docker.internal:56344'
  -e CHAT2_API_ENABLED=enabled -e CHAT2_WORKER_ENABLED=enabled
  -e CHAT2_PRIVATE_MEDIA_ENABLED=enabled -e CHAT2_LEGACY_RETIRE_ENABLED=enabled
  -e CHAT2_PUBLIC_WS_URL=wss://gafus.ru/connection/websocket
  -e CHAT2_CENTRIFUGO_HTTP_API=http://chat2-centrifugo:8000/api/publish
  -e CHAT2_CENTRIFUGO_TOKEN_SECRET="$CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY"
  -e CHAT2_CENTRIFUGO_API_KEY="$CENTRIFUGO_HTTP_API_KEY"
  -e JWT_SECRET="$(openssl rand -hex 32)" -e JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
  -e WORKER_HEALTH_PORT=3003 -e API_PORT=3001
  -e FEED_ENABLED=false -e GALLERY_ENABLED=false
  -e MAIL_OUTBOX_ENABLED=false -e CLOUDRU_MEDIA_JOBS_ENABLED=false
  -e CDN_HEALTH_MONITOR_ENABLED=false -e COURSE_CACHE_SYNC_ENABLED=false
)
docker run --pull=never -d --rm --name "$worker" --network "$network" --dns 127.0.0.1 \
  --add-host host.docker.internal:host-gateway --add-host chat2-centrifugo:host-gateway \
  "${common[@]}" gafus-refactor-agent2-worker-local:20261030 >/dev/null
worker_ready=0
for i in {1..55};do
  if ! docker inspect "$worker" --format '{{.State.Running}}' 2>/dev/null | grep -qx true;then echo CHAT2_OCI_WORKER_PROCESS_EXITED;docker logs --tail 20 "$worker" 2>&1 | cut -c1-150;exit 1;fi
  if docker exec "$worker" node -e "fetch('http://127.0.0.1:3003/internal/chat2/ready',{headers:{'X-Chat2-Readiness-Key':process.env.CHAT2_CENTRIFUGO_API_KEY},signal:AbortSignal.timeout(1400)}).then(async r=>{const j=await r.json();process.exit(r.status===200&&j.ready===true?0:5)}).catch(()=>process.exit(6))" >/dev/null 2>&1;then worker_ready=1;break;fi
  sleep 0.4
done
if [[ "$worker_ready" != 1 ]];then echo CHAT2_OCI_WORKER_OUTBOX_READINESS_FAILED;docker logs --tail 16 "$worker" 2>&1 | cut -c1-170;exit 1;fi
worker_ip="$(docker inspect "$worker" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
[[ "$worker_ip" =~ ^172\.|^192\.|^10\. ]] || { echo CHAT2_OCI_WORKER_IP_UNEXPECTED; exit 2; }
docker run --pull=never -d --rm --name "$api" --network "$network" --dns 127.0.0.1 \
  --add-host host.docker.internal:host-gateway --add-host chat2-centrifugo:host-gateway --add-host "worker:$worker_ip" \
  "${common[@]}" gafus-refactor-agent2-api-local:20261030 >/dev/null
api_ready=0
for i in {1..55};do
  if ! docker inspect "$api" --format '{{.State.Running}}' 2>/dev/null | grep -qx true;then echo CHAT2_OCI_API_PROCESS_EXITED;docker logs --tail 19 "$api" 2>&1 | cut -c1-150;exit 1;fi
  if docker exec "$api" node -e "fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(1200)}).then(async r=>{const j=await r.json();process.exit(r.status===200&&j.status==='ready'?0:4)}).catch(()=>process.exit(5))" >/dev/null 2>&1;then api_ready=1;break;fi
  sleep 0.4
done
if [[ "$api_ready" != 1 ]];then echo CHAT2_OCI_API_READY_FAILED;docker logs --tail 18 "$api" 2>&1 | cut -c1-165;exit 1;fi
legacy_status="$(docker exec "$api" node -e "fetch('http://127.0.0.1:3001/api/v1/cynologist-chat',{signal:AbortSignal.timeout(4500)}).then(r=>console.log(r.status)).catch(()=>process.exit(5))")"
[[ "$legacy_status" == 410 ]] || { echo "CHAT2_OCI_LEGACY_NOT_READY_STATUS:$legacy_status"; exit 1; }
# No user records created: guest access is still rejected for Chat2 Hono routes.
chat_status="$(docker exec "$api" node -e "fetch('http://127.0.0.1:3001/api/v1/chats',{signal:AbortSignal.timeout(4500)}).then(r=>console.log(r.status)).catch(()=>process.exit(5))")"
[[ "$chat_status" == 401 ]] || { echo "CHAT2_OCI_GUEST_ACL_CHANGED:$chat_status"; exit 1; }
if { docker logs "$worker" 2>&1; docker logs "$api" 2>&1; } | grep -Eiq 'ERR_MODULE_NOT_FOUND|Cannot find module|ERR_PACKAGE_PATH_NOT_EXPORTED';then echo CHAT2_OCI_UNRESOLVED_MODULE_IMPORT;exit 1;fi
printf 'CHAT2_OCI_SEPARATE_REAL_API_WORKER_PG_REDIS_BROKER_PASS\n'
printf 'CHAT2_OCI_WORKER_AUTH_POLL_200_API_READY_200_LEGACY_410_GUEST_401\n'
