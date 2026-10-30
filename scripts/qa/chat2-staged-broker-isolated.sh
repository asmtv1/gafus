#!/usr/bin/env bash
# Read-only broker protocol acceptance in an ephemeral Docker network.
# Never connects to production, pulls images, binds host ports or writes DB/S3.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
[[ "$PWD" == "$ROOT" ]] || { echo CHAT2_STAGE_WRONG_ROOT; exit 2; }
[[ ! -L infra/chat2/centrifugo.prod.json ]] || { echo CHAT2_STAGE_SYMLINK_REFUSED; exit 2; }
for image in redis:7.4-alpine centrifugo/centrifugo:v6.9.7 gafus-refactor-local-qa-api:20261029; do
  docker image inspect "$image" >/dev/null 2>&1 || { echo CHAT2_STAGE_LOCAL_IMAGE_MISSING; exit 2; }
done
suffix="$(openssl rand -hex 6)"
network="rf-chat2-stage-$suffix"
redis="rf-chat2-stage-redis-$suffix"
broker="rf-chat2-stage-broker-$suffix"
cleanup(){
  docker rm -f "$broker" "$redis" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Names and aliases are unique and scoped exclusively to this invocation.
docker network create --internal "$network" >/dev/null
docker run -d --rm --network "$network" --network-alias redis --name "$redis" \
  redis:7.4-alpine redis-server --save '' --appendonly no >/dev/null
export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY CENTRIFUGO_HTTP_API_KEY
CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
docker run -d --rm --network "$network" --network-alias chat2-centrifugo --name "$broker" \
  -v "$ROOT/infra/chat2/centrifugo.prod.json:/centrifugo/config.json:ro" \
  -e CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY -e CENTRIFUGO_HTTP_API_KEY \
  centrifugo/centrifugo:v6.9.7 centrifugo -c /centrifugo/config.json >/dev/null
# Ephemeral Node client container is not the API application: it sends only
# HTTP health/info and a websocket handshake, without JWTs, rooms or messages.
docker run --rm -i --network "$network" --entrypoint node \
  -e CENTRIFUGO_HTTP_API_KEY \
  gafus-refactor-local-qa-api:20261029 - <<'NODE'
const net = require('node:net');
const {createHash,randomBytes} = require('node:crypto');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function handshake(){
  return new Promise((resolve,reject)=>{
    const key = randomBytes(16).toString('base64');
    const expect = createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const sock=net.connect({host:'chat2-centrifugo',port:8000});
    sock.setTimeout(2500,()=>{sock.destroy();reject(Error('socket timeout'))});
    sock.once('error',reject);
    sock.once('connect',()=>sock.write('GET /connection/websocket HTTP/1.1\r\nHost: chat2-centrifugo:8000\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\nOrigin: https://gafus.ru\r\n\r\n'));
    let bytes='';
    sock.on('data',b=>{
      bytes+=String(b);
      if(!bytes.includes('\r\n\r\n'))return;
      sock.destroy();
      const pass=/^HTTP\/1\.1 101 /.test(bytes) &&
        bytes.toLowerCase().includes('sec-websocket-accept: '+expect.toLowerCase());
      pass?resolve(true):reject(Error('WSS upgrade mismatch'));
    });
  });
}
(async()=>{
  let success=false;
  let lastReason='unknown';
  for(let n=0;n<25;n++){
    try{
      const health=await fetch('http://chat2-centrifugo:8000/health',{signal:AbortSignal.timeout(1500)});
      const status=await health.json();
      // Centrifugo v6 /health returns HTTP 200 and an empty JSON object {}.
      if(health.status!==200 || !status || typeof status!=='object' ||
         Array.isArray(status) || Object.keys(status).length!==0)
        throw Error('broker health not ready');
      const allowed=await fetch('http://chat2-centrifugo:8000/api/info',{
        method:'POST',headers:{'X-API-Key':process.env.CENTRIFUGO_HTTP_API_KEY,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1500)});
      const body=await allowed.json();
      if(allowed.status!==200||!body.result||body.error)throw Error('broker auth not ready');
      const denied=await fetch('http://chat2-centrifugo:8000/api/info',{
        method:'POST',headers:{'X-API-Key':'invalid-stage-only','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1500)});
      if(denied.status===200)throw Error('broker accepted invalid API auth');
      await handshake();
      success=true;break;
    }catch(e) { lastReason=e?.message?.startsWith('broker health not ready') ||
      e?.message==='broker auth not ready' || e?.message==='broker accepted invalid API auth' ||
      e?.message==='WSS upgrade mismatch' ? e.message : 'local transport or timeout';
      await sleep(400); }
  }
  if(!success)throw Error('CHAT2_STAGE_BROKER_NOT_READY: '+lastReason);
  console.log('CHAT2_ISOLATED_REAL_BROKER_PASS: health, authenticated info, denied invalid key, websocket 101');
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE
