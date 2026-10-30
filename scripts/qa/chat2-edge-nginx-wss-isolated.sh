#!/bin/bash
# Agent2: REAL production edge nginx files, disposable broker/Redis/site;
# only synthetic TLS on 127.0.0.1; no pull/build/shared prune/production.
set -euo pipefail
ROOT='/Users/asmtv1/Desktop/gafus-refactor'
[[ "$PWD" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" ]] || { echo EDGE_QA_WRONG_ROOT; exit 2; }
[[ -d .local-pg-scratch && ! -L .local-pg-scratch && ! -L ci-cd/nginx/conf.d/gafus.ru.conf ]] || { echo EDGE_QA_UNSAFE_SOURCE;exit 2; }
for image in nginx:1.27-alpine mirror.gcr.io/library/node:20-alpine redis:7.4-alpine centrifugo/centrifugo:v6.9.7; do
  docker image inspect "$image" >/dev/null 2>&1 || { echo "EDGE_QA_IMAGE_NOT_CACHED:$image"; exit 2; }
done
[[ "$(df -Pk . | tail -1 | awk '{print $4}')" -gt 1048576 ]] || { echo EDGE_QA_DISK_UNSAFE_BELOW_1G;exit 2; }
if lsof -nP -iTCP:58355 -sTCP:LISTEN | grep -q LISTEN; then echo EDGE_QA_PORT_BUSY;exit 2;fi
umask 077
WORK="$(mktemp -d "$ROOT/.local-pg-scratch/agent2-chat2-edge-XXXXXX")"
[[ "$WORK" == "$ROOT/.local-pg-scratch/agent2-chat2-edge-"* && ! -L "$WORK" ]] || exit 2
suffix="$(openssl rand -hex 6)"
network="rf-a2-edge-net-$suffix"; site="rf-a2-edge-site-$suffix"; redis="rf-a2-edge-redis-$suffix"; broker="rf-a2-edge-broker-$suffix"; edge="rf-a2-edge-nginx-$suffix"
started_network=0
cleanup() {
  docker rm -f "$broker" "$edge" "$redis" "$site" >/dev/null 2>&1 || true
  [[ "$started_network" == 1 ]] && docker network rm "$network" >/dev/null 2>&1 || true
  if [[ -d "$WORK" && ! -L "$WORK" && "$WORK" == "$ROOT/.local-pg-scratch/agent2-chat2-edge-"* ]];then rm -rf -- "$WORK";fi
}
trap cleanup EXIT
for cname in gafus.ru adminka-gafus.ru api-gafus.ru;do mkdir -p "$WORK/certs/$cname";done
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 -subj '/CN=gafus.ru' \
  -keyout "$WORK/certs/gafus.ru/privkey.pem" -out "$WORK/certs/gafus.ru/fullchain.pem" >"$WORK/certgen.log" 2>&1
for cname in adminka-gafus.ru api-gafus.ru;do
  cp "$WORK/certs/gafus.ru/privkey.pem" "$WORK/certs/$cname/privkey.pem"
  cp "$WORK/certs/gafus.ru/fullchain.pem" "$WORK/certs/$cname/fullchain.pem"
done
mkdir "$WORK/certbot"
cat > "$WORK/synthetic-site.cjs" <<'NODE'
const http=require('node:http');
for(const port of [3000,3001,3002,3006]){
  http.createServer((req,res)=>{
    res.writeHead(req.url==='/'?200:404,{'Content-Type':'text/plain','Cache-Control':'no-store'});
    res.end(req.url==='/'?'AGENT2_MAIN_SITE_OK':'AGENT2_SITE_NON_ROOT_404');
  }).listen(port,'0.0.0.0');
}
NODE
# Docker Desktop does not publish host-loopback ports from --internal networks.
# A unique isolated bridge has ONLY synthetic aliases; test requests go solely
# to local 127.0.0.1:58355 and internal broker/site aliases; never external hosts.
docker network create "$network" >/dev/null
started_network=1
# All external name aliases are synthetic stand-ins. No production connections.
docker run --pull=never -d --rm --network "$network" --network-alias gafus-web \
  --network-alias gafus-api --network-alias gafus-trainer-panel \
  --network-alias gafus-bull-board --network-alias gafus-admin-panel \
  --network-alias s3.cloud.ru --name "$site" \
  -v "$WORK/synthetic-site.cjs:/fixture/synthetic-site.cjs:ro" \
  mirror.gcr.io/library/node:20-alpine node /fixture/synthetic-site.cjs >/dev/null
# IMPORTANT: mount the ACTUAL full edge source unchanged, NOT a copied snippet.
docker run --pull=never -d --rm --network "$network" --name "$edge" \
  -p 127.0.0.1:58355:443 \
  -v "$ROOT/ci-cd/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$ROOT/ci-cd/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "$WORK/certs:/etc/letsencrypt/live:ro" \
  -v "$WORK/certbot:/var/www/certbot:ro" \
  nginx:1.27-alpine >/dev/null
edge_alive=0
for n in {1..25};do
  if curl -sk --max-time 1 -H 'Host: gafus.ru' https://127.0.0.1:58355/ | grep -qx 'AGENT2_MAIN_SITE_OK';then edge_alive=1;break;fi
  sleep 0.3
done
if [[ "$edge_alive" != 1 ]]; then
  echo EDGE_QA_FULL_CONFIG_NGINX_START_FAILED
  docker inspect "$edge" --format 'own_edge_running={{.State.Running}} own_edge_exit={{.State.ExitCode}}' 2>/dev/null || true
  docker exec "$edge" nginx -t 2>&1 | tail -8 || true
  docker exec "$site" node -e "require('https').get('https://$edge:443/',{rejectUnauthorized:false,headers:{Host:'gafus.ru'}},r=>{console.log('PRIVATE_EDGE_SITE_STATUS='+r.statusCode);r.resume();}).on('error',e=>console.log('PRIVATE_EDGE_ERROR='+e.code))" 2>&1 | tail -8 || true
  curl -skv --max-time 2 -H 'Host: gafus.ru' https://127.0.0.1:58355/ -o /dev/null 2>&1 | grep -E '(Trying|Connected|connect|Failed|refused|HTTP/)' | tail -8 || true
  docker logs --tail 24 "$edge" 2>&1 | sed -E 's/(secret|password|token)=[^ ]+/\1=<redacted>/g' | tail -24 || true
  exit 1
fi
# nginx -T validates the *running* full mounted main+conf.d files.
docker exec "$edge" nginx -T > "$WORK/effective-nginx.conf" 2> "$WORK/nginx-test.log"
python3 - "$WORK/effective-nginx.conf" <<'PY'
import re,sys
from pathlib import Path
source=Path('ci-cd/nginx/conf.d/gafus.ru.conf').read_text()
loaded=Path(sys.argv[1]).read_text()
regex=r'location\s*=\s*/connection/websocket\s*\{([^}]*)\}'
s=re.search(regex,source);l=re.search(regex,loaded)
assert s and l and s.group(1)==l.group(1),'RUNNING_EDGE_WEBSOCKET_BLOCK_DIFFERS_FROM_SOURCE'
for expected in [
  'resolver 127.0.0.11 valid=5s ipv6=off;',
  'set $chat2_broker_backend chat2-centrifugo:8000;',
  'proxy_pass http://$chat2_broker_backend$request_uri;',
  'proxy_set_header Host $host;', 'proxy_set_header Origin $http_origin;',
  'proxy_set_header Upgrade $http_upgrade;', 'proxy_set_header Connection "upgrade";',
  'proxy_read_timeout 3600s;', 'proxy_send_timeout 3600s;',
  'proxy_buffering off;', 'proxy_cache off;',
]: assert expected in l.group(1),f'EDGE_MISSING_HEADER_OR_TIMEOUT:{expected}'
print('EDGE_RUNNING_NGINX_FULL_SOURCE_LOCATION_HEADERS_TIMEOUTS_MATCH_PASS')
PY
export GAFUS_AGENT2_EDGE_DISPOSABLE=1 GAFUS_AGENT2_SYNTHETIC_SITE="$site"
export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
export CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
node scripts/qa/chat2-edge-nginx-wss-client.cjs before
printf 'EDGE_MAIN_SITE_SURVIVED_MISSING_OPTIONAL_BROKER_PASS\n'
docker run --pull=never -d --rm --network "$network" --network-alias redis --name "$redis" \
  redis:7.4-alpine redis-server --save '' --appendonly no >/dev/null
run_broker(){
  docker run --pull=never -d --rm --network "$network" --network-alias chat2-centrifugo --name "$broker" \
    -v "$ROOT/infra/chat2/centrifugo.prod.json:/centrifugo/config.json:ro" \
    -e CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY -e CENTRIFUGO_HTTP_API_KEY \
    centrifugo/centrifugo:v6.9.7 centrifugo -c /centrifugo/config.json >/dev/null
  local ready=0
  for n in {1..35};do
    if docker exec "$site" node -e "fetch('http://chat2-centrifugo:8000/health',{signal:AbortSignal.timeout(1000)}).then(r=>process.exit(r.status===200?0:2)).catch(()=>process.exit(3))" >/dev/null 2>&1;then ready=1;break;fi
    sleep 0.35
  done
  [[ "$ready" == 1 ]] || { echo EDGE_BROKER_HEALTH_FAILED; return 1; }
  # nginx caches the non-existing name for 5s; no reload permitted.
  sleep 6
}
run_broker
node scripts/qa/chat2-edge-nginx-wss-client.cjs ready
printf 'EDGE_BROKER_APPEARED_DYNAMIC_DNS_WITHOUT_NGINX_RELOAD_PASS\n'
# Change the broker container instance and DNS address, without touching nginx.
docker rm -f "$broker" >/dev/null
docker inspect "$edge" --format '{{.State.Running}}' | grep -qx true
node scripts/qa/chat2-edge-nginx-wss-client.cjs before
run_broker
node scripts/qa/chat2-edge-nginx-wss-client.cjs ready
printf 'EDGE_BROKER_REPLACED_DYNAMIC_DNS_RECONNECT_EVENT_PASS\n'
echo EDGE_FULL_REAL_EXTERNAL_NGINX_WSS_ACCEPTANCE_PASS
