#!/bin/bash
# Agent2 ONLY: fresh local PostgreSQL/Redis/Centrifugo + actual optimized OCI
# image CMDs, app containers isolated from Internet by an internal-only bridge.
set -euo pipefail
ROOT='/Users/asmtv1/Desktop/gafus-refactor'
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo AGENT2_OCI_WRONG_ROOT; exit 2; }
[[ -d .local-pg-scratch && ! -L .local-pg-scratch ]] || { echo AGENT2_OCI_UNSAFE_SCRATCH; exit 2; }
[[ "$(df -Pk . | tail -1 | awk '{print $4}')" -ge 8388608 ]] || { echo AGENT2_OCI_DISK_UNSAFE; exit 2; }
for exe in initdb pg_ctl createdb psql redis-server redis-cli python3 docker; do command -v "$exe" >/dev/null || { echo "AGENT2_OCI_MISSING_EXEC:$exe"; exit 2; }; done
# Keep old immutable tags as default for historical Packet13 reproductions.
# Postsubscription requires different tags AND externally measured new image
# IDs (supplied only after both builds complete), never silently old receipts.
image_worker='gafus-refactor-agent2-worker-local:20261030'
image_api='gafus-refactor-agent2-api-local:20261030'
if [[ "${GAFUS_AGENT2_OCI_IMAGE_FLAVOR:-frozen}" == postsubscription ]];then
  image_worker='gafus-refactor-agent2-worker-local:20261030-postsubscription'
  image_api='gafus-refactor-agent2-api-local:20261030-postsubscription'
  [[ "${GAFUS_AGENT2_OCI_EXPECTED_WORKER_ID:-}" =~ ^sha256:[0-9a-f]{64}$ &&
     "${GAFUS_AGENT2_OCI_EXPECTED_API_ID:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo AGENT2_OCI_NEW_IMAGE_EXPECTED_IDS_REQUIRED;exit 2; }
elif [[ "${GAFUS_AGENT2_OCI_IMAGE_FLAVOR:-frozen}" != frozen ]];then
  echo AGENT2_OCI_IMAGE_FLAVOR_INVALID; exit 2
fi
for image in "$image_api" "$image_worker";do
  docker image inspect "$image" >/dev/null 2>&1 || { echo "AGENT2_OCI_IMAGE_MISSING:$image"; exit 2; }
done
if [[ "${GAFUS_AGENT2_OCI_REAL_MESSAGE_FLOW:-0}" == 1 ]];then
  if [[ "${GAFUS_AGENT2_OCI_IMAGE_FLAVOR:-frozen}" == postsubscription ]];then
    [[ "$(docker image inspect "$image_worker" --format '{{.Id}}')" == "$GAFUS_AGENT2_OCI_EXPECTED_WORKER_ID" &&
       "$(docker image inspect "$image_api" --format '{{.Id}}')" == "$GAFUS_AGENT2_OCI_EXPECTED_API_ID" ]] || { echo AGENT2_OCI_POSTSUBSCRIPTION_ID_DRIFT;exit 2; }
  else
    [[ "$(docker image inspect "$image_worker" --format '{{.Id}}')" == 'sha256:4983c109471f180a82000338f79f95522543e76de9ea39208e2f5dd9b9a482c3' &&
       "$(docker image inspect "$image_api" --format '{{.Id}}')" == 'sha256:6b7bd4104f4e75d88d5548945148d9eba91af3a84585ba39e845d69d0336b94c' ]] || { echo AGENT2_OCI_FROZEN_IMAGE_ID_DRIFT;exit 2; }
  fi
fi
[[ -x .local-pg-scratch/chat2-bin/centrifugo ]] || { echo AGENT2_OCI_LOCAL_BROKER_BINARY_MISSING; exit 2; }
for port in 55447 56347 58347; do
  if lsof -nP -iTCP:$port -sTCP:LISTEN | grep -q LISTEN;then echo "AGENT2_OCI_PORT_BUSY:$port"; exit 2;fi
done
umask 077
WORK="$(mktemp -d "$ROOT/.local-pg-scratch/agent2-oci-runtime-XXXXXX")"
[[ "$WORK" == "$ROOT/.local-pg-scratch/agent2-oci-runtime-"* && ! -L "$WORK" ]] || exit 2
suffix="$(openssl rand -hex 6)"
net="rf-a2-oci-net-$suffix"; proxy="rf-a2-oci-proxy-$suffix"; worker="rf-a2-oci-worker-$suffix"; api="rf-a2-oci-api-$suffix"
pg_started=0; redis_pid=''; broker_pid=''; network_created=0
cleanup() {
  docker rm -f "$api" "$worker" "$proxy" >/dev/null 2>&1 || true
  [[ "$network_created" == 1 ]] && docker network rm "$net" >/dev/null 2>&1 || true
  [[ -n "$broker_pid" ]] && kill "$broker_pid" >/dev/null 2>&1 || true
  [[ -n "$redis_pid" ]] && kill "$redis_pid" >/dev/null 2>&1 || true
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true;fi
  [[ -n "$broker_pid" ]] && wait "$broker_pid" >/dev/null 2>&1 || true
  [[ -n "$redis_pid" ]] && wait "$redis_pid" >/dev/null 2>&1 || true
  if [[ -d "$WORK" && ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-oci-runtime-"* ]];then rm -rf -- "$WORK";fi
}
on_exit(){
  local original_exit=$?
  trap - EXIT
  cleanup
  exit "$original_exit"
}
trap on_exit EXIT
mkdir "$WORK/sock"
initdb -D "$WORK/pg" -A trust --no-instructions > "$WORK/pg-init.log" 2>&1
pg_ctl -D "$WORK/pg" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 55447 -k $WORK/sock -c max_connections=80" start >/dev/null 2>&1
pg_started=1
createdb -h 127.0.0.1 -p 55447 agent2_oci_runtime_qa
actual_dir="$(psql -h 127.0.0.1 -p 55447 -d agent2_oci_runtime_qa -Atc 'show data_directory')"
[[ "$actual_dir" == "$WORK/pg" ]] || { echo AGENT2_OCI_PG_DIRECTORY_ISOLATION_FAILED;exit 2; }
redis-server --bind 127.0.0.1 --port 56347 --save '' --appendonly no --protected-mode yes > "$WORK/redis.log" 2>&1 & redis_pid=$!
for n in {1..35};do redis-cli -h 127.0.0.1 -p 56347 ping 2>/dev/null | grep -qx PONG && break;sleep .25;done
redis-cli -h 127.0.0.1 -p 56347 ping | grep -qx PONG || { echo AGENT2_OCI_REDIS_UNREADY;exit 2; }
export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
export CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
python3 - "$WORK/centrifugo.json" <<'PY'
import json,sys
from pathlib import Path
config=json.loads(Path('infra/chat2/centrifugo.json').read_text())
config['engine']['redis']['address']='redis://127.0.0.1:56347'
config['health']={'enabled':True}
Path(sys.argv[1]).write_text(json.dumps(config))
PY
"$ROOT/.local-pg-scratch/chat2-bin/centrifugo" -c "$WORK/centrifugo.json" --http_server.address 127.0.0.1 --http_server.port 58347 > "$WORK/broker.log" 2>&1 & broker_pid=$!
for n in {1..40};do
  if curl -sf --max-time 1 http://127.0.0.1:58347/health >/dev/null 2>&1;then break;fi
  sleep .25
done
curl -sf --max-time 1 http://127.0.0.1:58347/health >/dev/null || { echo AGENT2_OCI_BROKER_UNREADY;exit 2; }
echo AGENT2_OCI_REAL_LOCAL_PG_REDIS_BROKER_READY
# Fresh SQL schema ONLY in the actual verified private PG data directory.
export DATABASE_URL='postgresql://asmtv1@127.0.0.1:55447/agent2_oci_runtime_qa?schema=public'
if ! (cd packages/prisma && ./node_modules/.bin/prisma db push --skip-generate > "$WORK/schema-push.log" 2>&1); then
  echo AGENT2_OCI_DISPOSABLE_SCHEMA_PUSH_FAILED
  grep -E -i 'error|failed|denied|invalid' "$WORK/schema-push.log" | tail -5 | cut -c1-150 || true
  exit 1
fi
echo AGENT2_OCI_FRESH_PG_PRISMA_SCHEMA_PUSH_PASS
# Default-deny Docker internal network: app OCI containers cannot reach public Internet.
docker network create --internal "$net" >/dev/null;network_created=1
# Only this disposable, narrowly coded fixed-port TCP proxy also attaches to
# Docker bridge, to reach fresh loopback-only host services via host.docker.internal.
docker run --pull=never -d --rm --network bridge --name "$proxy" \
  -v "$ROOT/scripts/qa/agent2-oci-runtime-proxy.cjs:/fixture/proxy.cjs:ro" \
  --user root --entrypoint node "$image_worker" /fixture/proxy.cjs >/dev/null
docker network connect --alias db --alias redis --alias chat2-centrifugo "$net" "$proxy"
# Native services are *not* reachable from application containers except through
# the fixed 3-port proxy; public cloud targets have no route.
for n in {1..30};do
  if docker exec "$proxy" node -e "require('node:net').connect(5432,'db').once('connect',()=>process.exit(0)).once('error',()=>process.exit(1)).setTimeout(700,()=>process.exit(2))" >/dev/null 2>&1;then break;fi
  sleep .25
done
# Probe actual SQL through the disposable proxy from isolated Docker network.
docker run --pull=never --rm --network "$net" --entrypoint node "$image_worker" \
  -e "const net=require('node:net');for(const [host,port] of [['db',5432],['redis',6379],['chat2-centrifugo',8000]]){const c=net.connect({host,port});c.setTimeout(1500);c.once('connect',()=>{console.log('OCI_ISOLATED_TCP_CONNECT_'+host+'_'+port);c.destroy()});c.once('error',()=>{console.error('OCI_ISOLATED_TCP_CONNECT_FAILED_'+host);process.exitCode=1})}setTimeout(()=>process.exit(process.exitCode||0),2100)"
echo AGENT2_OCI_INTERNAL_NETWORK_PRIVATE_SERVICES_REACHABLE
export CHAT2_CENTRIFUGO_API_KEY="$CENTRIFUGO_HTTP_API_KEY"
export CHAT2_CENTRIFUGO_TOKEN_SECRET="$CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY"
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
local_db='postgresql://asmtv1@db:5432/agent2_oci_runtime_qa?schema=public'
# Real Worker image CMD, no --entrypoint override; the real Chat2 outbox poll is enabled.
legacy_cutover=disabled
private_media=disabled
if [[ "${GAFUS_AGENT2_OCI_REAL_MESSAGE_FLOW:-0}" == 1 ]];then
  # This enables the REAL fail-closed readiness check; all media/provider
  # credentials remain absent and app has no route to external services.
  legacy_cutover=enabled
  private_media=enabled
fi
docker run --pull=never -d --rm --network "$net" --network-alias worker --name "$worker" \
  -e NODE_ENV=production -e DATABASE_URL="$local_db" -e REDIS_URL='redis://redis:6379' \
  -e WORKER_HEALTH_PORT=3003 -e CHAT2_WORKER_ENABLED=enabled -e CHAT2_API_ENABLED=enabled \
  -e CHAT2_LEGACY_RETIRE_ENABLED="$legacy_cutover" -e CHAT2_PRIVATE_MEDIA_ENABLED=disabled \
  -e CHAT2_CENTRIFUGO_HTTP_API='http://chat2-centrifugo:8000/api/publish' \
  -e CHAT2_CENTRIFUGO_API_KEY -e CHAT2_CENTRIFUGO_TOKEN_SECRET -e JWT_SECRET -e JWT_REFRESH_SECRET \
  -e CLOUDRU_MEDIA_JOBS_ENABLED=false -e CDN_HEALTH_MONITOR_ENABLED=false \
  -e CHAT2_MAIL_ENABLED=disabled \
  "$image_worker" >/dev/null
# Real API image CMD in a separate container, only isolated private services.
docker run --pull=never -d --rm --network "$net" --network-alias api --name "$api" \
  -e NODE_ENV=production -e DATABASE_URL="$local_db" -e REDIS_URL='redis://redis:6379' \
  -e API_PORT=3001 -e API_HOST=0.0.0.0 -e CHAT2_WORKER_ENABLED=enabled \
  -e CHAT2_API_ENABLED=enabled -e CHAT2_LEGACY_RETIRE_ENABLED="$legacy_cutover" \
  -e CHAT2_PRIVATE_MEDIA_ENABLED="$private_media" -e CHAT2_PUBLIC_WS_URL='wss://gafus.ru/connection/websocket' \
  -e CHAT2_CENTRIFUGO_HTTP_API='http://chat2-centrifugo:8000/api/publish' \
  -e CHAT2_CENTRIFUGO_API_KEY -e CHAT2_CENTRIFUGO_TOKEN_SECRET -e JWT_SECRET -e JWT_REFRESH_SECRET \
  -e GALLERY_ENABLED=false -e FEED_ENABLED=false -e CDN_HEALTH_MONITOR_ENABLED=false \
  -e CLOUDRU_MEDIA_JOBS_ENABLED=false -e CHAT2_MAIL_ENABLED=disabled \
  "$image_api" >/dev/null
probe(){
  local name="$1" port="$2" path="$3" expected="$4"; shift 4
  docker exec "$proxy" node -e "fetch('http://$name:$port$path',{signal:AbortSignal.timeout(1600)}).then(async r=>{console.log('OCI_HTTP_${name}:${port}${path}_'+r.status);process.exit(r.status===$expected?0:1)}).catch(()=>process.exit(3))" >/dev/null 2>&1
}
worker_ok=0;api_ok=0
for n in {1..55};do
  if [[ "$worker_ok" == 0 ]] && probe worker 3003 /health 200;then worker_ok=1;echo AGENT2_WORKER_TRUE_CMD_HEALTH_200;fi
  if [[ "$api_ok" == 0 ]] && probe api 3001 /health 200;then api_ok=1;echo AGENT2_API_TRUE_CMD_HEALTH_200;fi
  [[ "$worker_ok" == 1 && "$api_ok" == 1 ]] && break
  sleep .45
done
if [[ "$worker_ok" != 1 || "$api_ok" != 1 ]];then
  echo "AGENT2_OCI_TRUE_CMD_HEALTH_BLOCKER worker=$worker_ok api=$api_ok"
  for own in "$worker" "$api";do
    echo "OCI_STATUS $(docker inspect "$own" --format '{{.Name}}={{.State.Status}} exit={{.State.ExitCode}}' 2>/dev/null || true)"
    docker logs --tail 12 "$own" 2>&1 | sed -E 's#postgresql://[^ ]+#<redacted>#g;s#(TOKEN|SECRET|PASSWORD|KEY)=[^ ]+#<redacted>#g' | cut -c1-190 || true
  done
  exit 1
fi
# Strict readiness: real fresh SQL, actual Redis, broker info auth and outbox.
api_ready=0;worker_ready=0
for n in {1..32};do
  if [[ "$api_ready" == 0 ]] && probe api 3001 /ready 200;then api_ready=1;echo AGENT2_API_TRUE_CMD_READY_200;fi
  if [[ "$worker_ready" == 0 ]] && docker exec "$worker" node -e "fetch('http://127.0.0.1:3003/internal/chat2/ready',{headers:{'X-Chat2-Readiness-Key':process.env.CHAT2_CENTRIFUGO_API_KEY},signal:AbortSignal.timeout(1600)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(2))" >/dev/null 2>&1; then worker_ready=1;echo AGENT2_WORKER_TRUE_CMD_CHAT2_AUTH_FRESH_POLL_READY_200;fi
  [[ "$api_ready" == 1 && "$worker_ready" == 1 ]] && break
  sleep .6
done
# Denial contract, no key must return 404 even when actual worker is ready.
docker exec "$worker" node -e "fetch('http://127.0.0.1:3003/internal/chat2/ready',{signal:AbortSignal.timeout(1600)}).then(r=>{console.log('AGENT2_WORKER_CHAT2_NO_KEY_STATUS_'+r.status);process.exit(r.status===404?0:1)}).catch(()=>process.exit(2))"
# With cutover disabled the API MUST stay 503 despite healthy worker.
if [[ "$legacy_cutover" == disabled ]];then
  docker exec "$api" node -e "fetch('http://127.0.0.1:3001/api/v1/cynologist-chat',{signal:AbortSignal.timeout(1600)}).then(r=>{console.log('AGENT2_API_STAGED_LEGACY_STATUS_'+r.status);process.exit(r.status===503?0:1)}).catch(()=>process.exit(2))"
fi
if [[ "$api_ready" != 1 || "$worker_ready" != 1 ]];then
  echo "AGENT2_OCI_SERVICE_READY_BLOCKER api_ready=$api_ready worker_chat2_ready=$worker_ready"
  for own in "$worker" "$api";do docker logs --tail 8 "$own" 2>&1 | sed -E 's#postgresql://[^ ]+#<redacted>#g;s#(TOKEN|SECRET|PASSWORD|KEY)=[^ ]+#<redacted>#g' | cut -c1-180 || true;done
  exit 1
fi
printf 'AGENT2_OCI_REAL_API_WORKER_PG_REDIS_BROKER_TRUE_CMD_READY_PASS\n'
# Additional frozen-image USER message acceptance; no direct broker publish.
# Uses only synthetic users in the verified fresh disposable PostgreSQL DB.
if [[ "${GAFUS_AGENT2_OCI_REAL_MESSAGE_FLOW:-0}" == 1 ]];then
  export GAFUS_AGENT2_OCI_API_CONTAINER="$api"
  export GAFUS_AGENT2_OCI_WORKER_CONTAINER="$worker"
  export GAFUS_AGENT2_OCI_PROXY_CONTAINER="$proxy"
  node scripts/qa/agent2-oci-message-flow.cjs
fi
