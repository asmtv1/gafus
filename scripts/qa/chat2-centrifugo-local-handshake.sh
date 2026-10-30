#!/usr/bin/env bash
# Disposable Chat 2.0 WebSocket handshake; no production DB or external providers.
# Isolated Docker network and random dev-only keys; no user messages or jobs.
set -euo pipefail
ROOT="/Users/asmtv1/Desktop/gafus-refactor"
[[ "$PWD" == "$ROOT" ]] || { echo "CHAT2_QA_SCOPE_REFUSED"; exit 2; }
[[ ! -L "$ROOT/infra/chat2/centrifugo.json" ]] || { echo "CHAT2_QA_CONFIG_LINK_REFUSED"; exit 2; }

suffix="$(openssl rand -hex 5)"
net="gafus-rf-qa-chat2-$suffix"
redis="gafus-rf-qa-redis-$suffix"
broker="gafus-rf-qa-broker-$suffix"
cleanup() {
  docker rm -f "$broker" "$redis" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  unset CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY CENTRIFUGO_HTTP_API_KEY
}
trap cleanup EXIT

# The network stays internal, without host-published ports. A disposable
# Node client runs *inside* it, so a host networking quirk cannot hide success.
docker image inspect redis:7.4-alpine >/dev/null 2>&1 || docker pull redis:7.4-alpine >/dev/null
docker image inspect centrifugo/centrifugo:v6.9.7 >/dev/null 2>&1 || docker pull centrifugo/centrifugo:v6.9.7 >/dev/null
docker network create --internal "$net" >/dev/null
docker run -d --rm --network "$net" --network-alias chat2-redis --name "$redis" \
  redis:7.4-alpine redis-server --save "" --appendonly no >/dev/null

export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY
export CENTRIFUGO_HTTP_API_KEY
CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$(openssl rand -hex 32)"
CENTRIFUGO_HTTP_API_KEY="$(openssl rand -hex 32)"
docker run -d --rm --network "$net" --network-alias chat2-centrifugo \
  --name "$broker" \
  -v "$ROOT/infra/chat2/centrifugo.json:/centrifugo/config.json:ro" \
  -e CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY \
  -e CENTRIFUGO_HTTP_API_KEY \
  centrifugo/centrifugo:v6.9.7 centrifugo -c /centrifugo/config.json >/dev/null

# This known local QA image is only used as a Node runtime, with no API entrypoint.
# No credential or production network is mounted into the client.
docker run -i --rm --network "$net" --entrypoint node \
  gafus-refactor-local-qa-api:20261029 - <<'NODE'
const net = require("node:net");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function handshake(origin) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "chat2-centrifugo", port: 8000 });
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("CHAT2_QA_TIMEOUT")); });
    socket.once("error", reject);
    socket.once("connect", () => socket.write(
      "GET /connection/websocket HTTP/1.1\r\n" +
      "Host: chat2-centrifugo:8000\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Version: 13\r\n" +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
      "Origin: " + origin + "\r\n\r\n"
    ));
    socket.once("data", chunk => {
      const matched = String(chunk).match(/^HTTP\/1\.1 (\d{3})/);
      socket.destroy();
      if (!matched) return reject(new Error("CHAT2_QA_BAD_HTTP_RESPONSE"));
      resolve(Number(matched[1]));
    });
  });
}
(async () => {
  let allowed = 0;
  // Centrifugo's /health can legitimately be disabled/404; its actual
  // WebSocket upgrade endpoint is the meaningful readiness contract.
  for (let i = 0; i < 25; i++) {
    try {
      allowed = await handshake("http://127.0.0.1:5173");
      if (allowed === 101) break;
    } catch {}
    await wait(1000);
  }
  const blocked = await handshake("https://malicious.invalid");
  console.log("CHAT2_QA_WEBSOCKET allowed=" + allowed + " blocked=" + blocked);
  if (allowed !== 101 || blocked === 101) throw new Error("CHAT2_QA_ORIGIN_GATE_FAILED");
  console.log("CHAT2_LOCAL_BROKER_HANDSHAKE_PASS");
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
NODE
