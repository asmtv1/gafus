#!/bin/bash
# Actual cached release image CMD startup with freshly initialized PG/Redis.
# NO production env, no uploads, no shared DB, no image pull/prune.
set -euo pipefail
ROOT='/Users/asmtv1/Desktop/gafus-refactor'
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo OCI_QA_WRONG_ROOT;exit 2; }
MODE="${1:-}"; [[ "$MODE" == worker || "$MODE" == api ]] || { echo OCI_QA_MODE_REQUIRED;exit 2; }
IMAGE="gafus-refactor-agent2-$MODE-local:20261030"
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo OCI_QA_IMAGE_MISSING;exit 2; }
[[ -d .local-pg-scratch && ! -L .local-pg-scratch ]] || { echo OCI_QA_SCRATCH_INVALID;exit 2; }
for p in 55448 56343;do if lsof -nP -iTCP:$p -sTCP:LISTEN | grep -q LISTEN;then echo OCI_QA_RESERVED_PORT_OCCUPIED;exit 2;fi;done
for cmd in initdb pg_ctl createdb redis-server psql python3 docker;do command -v "$cmd" >/dev/null || { echo "OCI_QA_MISSING_TOOL:$cmd";exit 2;};done
umask 077
WORK="$(mktemp -d "$ROOT/.local-pg-scratch/agent2-oci-$MODE-XXXXXX")"
[[ ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-oci-$MODE-"* ]] || exit 2
suffix="$(openssl rand -hex 6)"; network="rf-a2-oci-$MODE-net-$suffix"; container="rf-a2-oci-$MODE-$suffix"
pg_started=0; redis_pid=''; network_started=0
cleanup(){
  docker rm -f "$container" >/dev/null 2>&1 || true
  [[ "$network_started" == 1 ]] && docker network rm "$network" >/dev/null 2>&1 || true
  [[ -n "$redis_pid" ]] && kill "$redis_pid" 2>/dev/null || true
  [[ "$pg_started" == 1 ]] && pg_ctl -D "$WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  [[ -n "$redis_pid" ]] && wait "$redis_pid" 2>/dev/null || true
  if [[ -d "$WORK" && ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-oci-$MODE-"* ]];then rm -rf -- "$WORK";fi
}
trap cleanup EXIT
printf 'OCI_QA_SYNTHETIC_MODE=%s\n' "$MODE"
initdb -D "$WORK/pg" -A trust --no-instructions > "$WORK/initdb.log" 2>&1
mkdir "$WORK/sock"
pg_ctl -D "$WORK/pg" -l "$WORK/pg.log" -o "-h 127.0.0.1 -p 55448 -k $WORK/sock -c max_connections=65" start >/dev/null
pg_started=1
createdb -h 127.0.0.1 -p 55448 agent2_oci_qa
redis-server --bind 127.0.0.1 --port 56343 --save '' --appendonly no --protected-mode yes > "$WORK/redis.log" 2>&1 & redis_pid=$!
ready=0
for n in {1..30};do if redis-cli -h 127.0.0.1 -p 56343 ping 2>/dev/null | grep -qx PONG;then ready=1;break;fi;sleep 0.3;done
[[ "$ready" == 1 ]] || { echo OCI_QA_REDIS_UNAVAILABLE; exit 1; }
# pg mutation is ONLY on this fresh unique disposable data directory.
export DATABASE_URL='postgresql://asmtv1@127.0.0.1:55448/agent2_oci_qa'
export REDIS_URL='redis://127.0.0.1:56343'
printf 'OCI_QA_PRISMA_DB_PUSH_FRESH_ONLY\n'
pnpm --filter @gafus/prisma exec prisma db push --skip-generate > "$WORK/schema.log" 2>&1 || { echo OCI_QA_DB_PUSH_FAILED; tail -10 "$WORK/schema.log" | cut -c1-170; exit 1; }
python3 - "$WORK/pg" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]).resolve();assert '/.local-pg-scratch/agent2-oci-' in str(p) and p.name=='pg'
print('OCI_QA_FRESH_LOCAL_PG_VERIFIED')
PY
# Uses one **unique** Docker bridge solely so host.docker.internal forwards to
# synthetic native loopback. --internal cannot reach Mac loopback on Docker Desktop.
docker network create "$network" >/dev/null;network_started=1
common_env=(
 -e NODE_ENV=production
 -e DATABASE_URL='postgresql://asmtv1@host.docker.internal:55448/agent2_oci_qa'
 -e REDIS_URL='redis://host.docker.internal:56343'
 -e CHAT2_API_ENABLED=disabled -e CHAT2_WORKER_ENABLED=disabled
 -e CHAT2_PRIVATE_MEDIA_ENABLED=disabled -e CHAT2_LEGACY_RETIRE_ENABLED=disabled
 -e FEED_ENABLED=false -e GALLERY_ENABLED=false
 -e MAIL_OUTBOX_ENABLED=false -e CLOUDRU_MEDIA_JOBS_ENABLED=false
 -e CDN_HEALTH_MONITOR_ENABLED=false -e COURSE_CACHE_SYNC_ENABLED=false
 -e WORKER_HEALTH_PORT=3003 -e API_PORT=3001
)
# No Docker host ports, no production DNS or app secrets. Make all external DNS
# fail closed while the explicit synthetic host alias remains available.
docker run --pull=never -d --rm --name "$container" --network "$network" --dns 127.0.0.1 --add-host host.docker.internal:host-gateway \
  "${common_env[@]}" "$IMAGE" >/dev/null
ready=0
for n in {1..40};do
  if ! docker inspect "$container" --format '{{.State.Running}}' 2>/dev/null | grep -qx true;then echo OCI_QA_IMAGE_EXITED;docker logs --tail 22 "$container" 2>&1 | cut -c1-180;exit 1;fi
  if [[ "$MODE" == worker ]];then
    if docker exec "$container" node -e "fetch('http://127.0.0.1:3003/health',{signal:AbortSignal.timeout(1200)}).then(r=>r.json().then(x=>process.exit(r.status===200&&x.ok===true?0:4))).catch(()=>process.exit(5))" >/dev/null 2>&1;then ready=1;break;fi
  else
    if docker exec "$container" node -e "fetch('http://127.0.0.1:3001/health',{signal:AbortSignal.timeout(1200)}).then(r=>process.exit(r.status===200?0:4)).catch(()=>process.exit(5))" >/dev/null 2>&1;then ready=1;break;fi
  fi
  sleep 0.35
done
if [[ "$ready" != 1 ]];then echo OCI_QA_REAL_ENTRYPOINT_HEALTH_TIMEOUT;docker logs --tail 24 "$container" 2>&1 | cut -c1-175;exit 1;fi
sleep 2
docker inspect "$container" --format '{{.State.Running}}' | grep -qx true || { echo OCI_QA_ENTRYPOINT_CRASHED; exit 1; }
if docker logs "$container" 2>&1 | grep -Eiq 'ERR_MODULE_NOT_FOUND|Cannot find module|MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED';then echo OCI_QA_UNRESOLVED_IMPORT;exit 1;fi
printf 'OCI_QA_REAL_%s_ENTRYPOINT_HEALTH_PASS\n' "$(echo "$MODE" | tr '[:lower:]' '[:upper:]')"
if [[ "$MODE" == worker ]];then
  docker exec "$container" node -e "fetch('http://127.0.0.1:3003/internal/chat2/ready',{headers:{'X-Chat2-Readiness-Key':'synthetic-denied'},signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.status===404?0:9)).catch(()=>process.exit(5))" && echo OCI_QA_CHAT2_DISABLED_AUTH_DENIAL_404_PASS
fi
printf 'OCI_QA_ONLY_DISPOSABLE_SERVICES_CLEANUP\n'
