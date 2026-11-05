import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { createHash, randomBytes } from 'node:crypto';

const FAIL = (code) => { throw new Error(`CHAT2_RELEASE_BLOCKED: ${code}`); };
const expectedWs = new Set(['wss://gafus.ru/connection/websocket', 'wss://www.gafus.ru/connection/websocket']);
const expectedPublish = 'http://chat2-centrifugo:8000/api/publish';

// This reads the REAL intended Docker Compose .env, never an example or local
// developer environment. No values are included in errors or console output.
export function parseDestinationEnv(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) FAIL('destination env syntax');
    const [, key, value] = match;
    if (Object.hasOwn(values, key) && (key.startsWith('CHAT2_') || key === 'COMPOSE_PROFILES'))
      FAIL(`duplicate destination key: ${key}`);
    values[key] = value;
  }
  return values;
}

function compareVersions(left,right) {
  const a=left.split('.').map(Number),b=right.split('.').map(Number);
  for (let i=0;i<3;i++) if (a[i]!==b[i]) return a[i]-b[i];
  return 0;
}

export function validateCutoverConfig(env, stage = false) {
  for (const key of ['CHAT2_API_ENABLED', 'CHAT2_WORKER_ENABLED', 'CHAT2_PRIVATE_MEDIA_ENABLED']) {
    if (env[key] !== 'enabled') FAIL(`${key} must be enabled in destination`);
  }
  if (env.CHAT2_LEGACY_RETIRE_ENABLED !== (stage ? 'disabled' : 'enabled'))
    FAIL(`CHAT2_LEGACY_RETIRE_ENABLED must be ${stage ? 'disabled during staging' : 'enabled for cutover'}`);
  if (!env.COMPOSE_PROFILES?.split(/[\s,]+/).includes('chat2'))
    FAIL('destination COMPOSE_PROFILES must start the chat2 broker');
  if (!expectedWs.has(env.CHAT2_PUBLIC_WS_URL)) FAIL('destination websocket URL is not approved');
  if (env.CHAT2_CENTRIFUGO_HTTP_API !== expectedPublish)
    FAIL('destination broker publish endpoint differs from Docker network');
  if (!env.CHAT2_CENTRIFUGO_TOKEN_SECRET || env.CHAT2_CENTRIFUGO_TOKEN_SECRET.length < 32 ||
      /^(changeme|example|placeholder|todo)/i.test(env.CHAT2_CENTRIFUGO_TOKEN_SECRET))
    FAIL('destination token secret absent/placeholder');
  if (!env.CHAT2_CENTRIFUGO_API_KEY || env.CHAT2_CENTRIFUGO_API_KEY.length < 16 ||
      /^(changeme|example|placeholder|todo)/i.test(env.CHAT2_CENTRIFUGO_API_KEY))
    FAIL('destination broker API key absent/placeholder');
  if (env.CHAT2_SUBSCRIBE_PROXY_ENABLED !== 'true')
    FAIL('proxy-only Chat2 is mandatory; legacy room tokens are forbidden');
  for (const key of ['CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET','CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET']) {
    if (!env[key] || env[key].length < 32 || /^(changeme|example|placeholder|todo|replace|unique_)/i.test(env[key]))
      FAIL(`destination ${key} absent/placeholder`);
  }
  const secrets = [env.CHAT2_CENTRIFUGO_TOKEN_SECRET, env.CHAT2_CENTRIFUGO_API_KEY,
    env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET, env.CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET];
  if (new Set(secrets).size !== secrets.length)
    FAIL('Chat2 connection/broker/proxy/subscription-deny keys must be independent');
  return true;
}

function docker(args) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', timeout: 7000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { FAIL('live Docker inspection failed'); }
}
function inspect(container) {
  let result;
  try { result = JSON.parse(docker(['inspect', container]))[0]; }
  catch { FAIL('live Docker container is missing or unreadable'); }
  if (result?.State?.Running !== true || result?.State?.Health?.Status === 'unhealthy')
    FAIL('live Chat2 component is not running/healthy');
  return result;
}
function liveEnv(container) {
  return Object.fromEntries((container.Config?.Env ?? []).map(value => {
    const index = value.indexOf('=');
    return [value.slice(0, index), value.slice(index + 1)];
  }));
}

// No test fixture can satisfy this production check: it reads the running
// destination Docker containers and checks the real broker's HTTP /health.
export function verifyLiveDestination(env, composeFile) {
  const api = inspect('gafus-api');
  const worker = inspect('gafus-worker');
  const apiEnv = liveEnv(api);
  const workerEnv = liveEnv(worker);
  for (const key of ['CHAT2_LEGACY_RETIRE_ENABLED', 'CHAT2_API_ENABLED', 'CHAT2_PRIVATE_MEDIA_ENABLED', 'CHAT2_PUBLIC_WS_URL',
    'CHAT2_CENTRIFUGO_HTTP_API']) {
    if (apiEnv[key] !== env[key]) FAIL(`running API differs from destination: ${key}`);
  }
  for (const key of ['CHAT2_WORKER_ENABLED', 'CHAT2_CENTRIFUGO_HTTP_API']) {
    if (workerEnv[key] !== env[key]) FAIL(`running worker differs from destination: ${key}`);
  }
  // Never log secrets: compare only boolean equality of the existing service values.
  if (apiEnv.CHAT2_CENTRIFUGO_TOKEN_SECRET !== env.CHAT2_CENTRIFUGO_TOKEN_SECRET ||
      apiEnv.CHAT2_CENTRIFUGO_API_KEY !== env.CHAT2_CENTRIFUGO_API_KEY ||
      apiEnv.CHAT2_SUBSCRIBE_PROXY_ENABLED !== 'true' ||
      apiEnv.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET !== env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET ||
      workerEnv.CHAT2_CENTRIFUGO_API_KEY !== env.CHAT2_CENTRIFUGO_API_KEY)
    FAIL('running API/worker broker credentials differ from destination');
  try {
    const code = [
      "(async()=>{",
      "const base='http://127.0.0.1:3001';",
      "const opts={signal:AbortSignal.timeout(2500)};",
      "const [ready,chat,worker,broker]=await Promise.all([",
      "fetch(base+'/ready',opts),fetch(base+'/api/v1/chats',opts),",
      "fetch('http://worker:3003/internal/chat2/ready',{...opts,headers:{'X-Chat2-Readiness-Key':process.env.CHAT2_CENTRIFUGO_API_KEY}}),",
      "fetch('http://chat2-centrifugo:8000/api/info',{...opts,method:'POST',headers:{'X-API-Key':process.env.CHAT2_CENTRIFUGO_API_KEY,'Content-Type':'application/json'},body:'{}'})]);",
      "if(ready.status!==200||chat.status!==401||worker.status!==200||broker.status!==200)process.exit(1);",
      "const [a,w,b]=await Promise.all([ready.json(),worker.json(),broker.json()]);",
      "if(a.status!=='ready'||w.ready!==true||b.error||!b.result)process.exit(1);",
      "})().catch(()=>process.exit(1))",
    ].join('');
    docker(['exec', 'gafus-api', 'node', '-e', code]);
  } catch { FAIL('running Chat2 API readiness/authorization route unavailable'); }
  const brokerId = (() => {
    try { return execFileSync('docker-compose', ['-f', composeFile, '--profile', 'chat2', 'ps', '-q', 'chat2-centrifugo'],
      { encoding: 'utf8', timeout: 7000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { FAIL('live broker Compose inspection unavailable'); }
  })();
  if (!/^[a-f0-9]{12,64}$/i.test(brokerId)) FAIL('live Chat2 broker is missing');
  const broker = inspect(brokerId);
  const brokerEnv = liveEnv(broker);
  if (brokerEnv.CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY !== env.CHAT2_CENTRIFUGO_TOKEN_SECRET ||
      brokerEnv.CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY !==
        env.CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET ||
      brokerEnv.CENTRIFUGO_VAR_CHAT2_PROXY_SHARED_SECRET !==
        env.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET ||
      brokerEnv.CENTRIFUGO_HTTP_API_KEY !== env.CHAT2_CENTRIFUGO_API_KEY)
    FAIL('live broker credentials differ from destination');
  return true;
}

/** A READ-ONLY release veto: public config must already force both old
 * mobile builds to stores. No automatic DB/config writes on production. */
export async function verifyMobileForcedUpdate(env, request = fetch) {
  for (const [platform, key] of [
    ['ios','CHAT2_MOBILE_IOS_MIN_VERSION'],
    ['android','CHAT2_MOBILE_ANDROID_MIN_VERSION'],
  ]) {
    let response;
    try {
      response = await request('https://api.gafus.ru/api/v1/public/mobile-app', {
        method: 'GET', redirect: 'error',
        headers: { 'X-Client-Platform':platform,'X-Client-Version':'1.7.2',
          Accept:'application/json' },
        signal: AbortSignal.timeout(4500),
      });
    } catch { FAIL(`published ${platform} Mobile update policy unavailable`); }
    if (response.status !== 200) FAIL(`published ${platform} Mobile update policy not HTTP 200`);
    let payload;
    try { payload = await response.json(); }
    catch { FAIL(`published ${platform} Mobile update policy not JSON`); }
    const value=payload?.data?.minimumSupportedVersion?.[platform];
    if (payload?.success !== true || value !== env[key])
      FAIL(`published ${platform} Mobile minimum version differs from approved new build`);
    const destination=payload?.data?.storeUrl?.[platform];
    let store;
    try { store=new URL(destination); }
    catch { FAIL(`published ${platform} Mobile store URL missing`); }
    const allowed=platform==='ios'?new Set(['apps.apple.com']):
      new Set(['play.google.com','www.rustore.ru','rustore.ru']);
    if (store.protocol!=='https:' || !allowed.has(store.hostname))
      FAIL(`published ${platform} Mobile update destination not approved store`);
  }
  return true;
}

/** A read-only *real* public WSS upgrade, independent of private /health.
 * A 200 HTML SPA fallback, 403, 404, 5xx or a forged 101 is NEVER readiness.
 * Does not issue actor JWTs, subscribe to rooms or touch production data.
 */
export async function probePublicWebsocketUpgrade(wsUrl, request = httpsRequest) {
  if (!expectedWs.has(wsUrl)) FAIL('public websocket address is not approved');
  const challenge = randomBytes(16).toString('base64');
  const expectedAccept = createHash('sha1').update(challenge +
    '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  await new Promise((resolve, reject) => {
    let settled = false;
    let req;
    let timeout;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ok) resolve(true);
      else reject(Error('CHAT2_RELEASE_BLOCKED: public websocket upgrade unavailable'));
    };
    try {
      req = request(wsUrl.replace(/^wss:/, 'https:'), {
        method: 'GET', timeout: 5000,
        headers: {
          Connection: 'Upgrade', Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': challenge,
          Origin: 'https://gafus.ru',
        },
      });
    } catch { finish(false); return; }
    // A fixed wall-clock deadline also covers a stalled DNS/TLS handshake.
    timeout = setTimeout(() => { req.destroy(); finish(false); }, 6500);
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      finish(res.statusCode === 101 && res.headers['sec-websocket-accept'] === expectedAccept);
    });
    req.on('response', response => { response.resume(); finish(false); });
    req.on('error', () => finish(false));
    req.on('timeout', () => { req.destroy(); finish(false); });
    req.end();
  });
  return true;
}

export function validateStaticContracts(compose, nginx, broker, edgeNginx) {
  for (const key of ['CHAT2_LEGACY_RETIRE_ENABLED=', 'CHAT2_API_ENABLED=', 'CHAT2_WORKER_ENABLED=', 'CHAT2_PRIVATE_MEDIA_ENABLED=',
    'CHAT2_PUBLIC_WS_URL=', 'CHAT2_CENTRIFUGO_HTTP_API=', 'CHAT2_CENTRIFUGO_API_KEY=',
    'CHAT2_CENTRIFUGO_TOKEN_SECRET=', 'CHAT2_SUBSCRIBE_PROXY_ENABLED=',
    'CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET=']) {
    if (!compose.includes(key)) FAIL(`missing Compose field: ${key}`);
  }
  if (!compose.includes('${CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET:-}'))
    FAIL('separate never-issued subscription key absent from broker configuration');
  if (!compose.includes('profiles: [chat2]') || !compose.includes('chat2-centrifugo:'))
    FAIL('Chat2 Docker profile missing');
  if (!nginx.includes('location = /connection/websocket') ||
      !nginx.includes('proxy_set_header Upgrade $http_upgrade') ||
      !nginx.includes('proxy_set_header Connection "upgrade"'))
    FAIL('websocket upgrade proxy is missing');
  // Production front-door is the Compose-mounted edge nginx, not the Vite
  // runtime nginx. The optional broker MUST be dynamically resolved so nginx
  // can start with the chat2 profile disabled during the first installation.
  const mainTls = (edgeNginx ?? '').match(/listen 443 ssl;([\s\S]*?)(?=^server\s*\{|$(?![\s\S]))/m)?.[1] ?? '';
  const edgeSocket = mainTls.match(/location\s*=\s*\/connection\/websocket\s*\{([^}]*)\}/)?.[1] ?? '';
  if (!/\.\.\/nginx\/conf\.d:\/etc\/nginx\/conf\.d:ro/.test(compose) ||
      !/server_name\s+gafus\.ru\s+www\.gafus\.ru;/.test(mainTls) ||
      !edgeSocket ||
      !/resolver\s+127\.0\.0\.11\s+valid=5s\s+ipv6=off;/.test(edgeSocket) ||
      !/set\s+\$chat2_broker_backend\s+chat2-centrifugo:8000;/.test(edgeSocket) ||
      !/proxy_pass\s+http:\/\/\$chat2_broker_backend\$request_uri;/.test(edgeSocket) ||
      !/proxy_set_header\s+Upgrade\s+\$http_upgrade;/.test(edgeSocket) ||
      !/proxy_set_header\s+Connection\s+"upgrade";/.test(edgeSocket) ||
      !/proxy_cache\s+off;/.test(edgeSocket))
    FAIL('ACTIVE edge nginx Chat2 websocket route missing or cannot start without broker');
  // Production Compose names, private origins and health ports must agree
  // with both hard-coded API retirement checks and the worker HTTP server.
  const service = name => compose.match(new RegExp(`^  ${name}:\\s*\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|$(?![\\s\\S]))`, 'm'))?.[1] ?? '';
  const api = service('api');
  const worker = service('worker');
  const centrifugo = service('chat2-centrifugo');
  if (!api.includes('API_PORT=3001') || !worker.includes('WORKER_HEALTH_PORT=3003') ||
      !api.includes('CHAT2_WORKER_ENABLED=') ||
      !api.includes('CHAT2_LEGACY_RETIRE_ENABLED=${CHAT2_LEGACY_RETIRE_ENABLED:-disabled}') ||
      !api.includes('CHAT2_CENTRIFUGO_HTTP_API=') ||
      !worker.includes('CHAT2_CENTRIFUGO_HTTP_API=') ||
      !worker.includes('CHAT2_CENTRIFUGO_API_KEY=') ||
      !centrifugo.includes('CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY=') ||
      !centrifugo.includes('CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY=') ||
      !centrifugo.includes('CENTRIFUGO_VAR_CHAT2_PROXY_SHARED_SECRET=') ||
      !api.includes('CHAT2_SUBSCRIBE_PROXY_ENABLED=') ||
      !api.includes('CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET=') ||
      !centrifugo.includes('CENTRIFUGO_HTTP_API_KEY=${CHAT2_CENTRIFUGO_API_KEY:-}') ||
      !centrifugo.includes('profiles: [chat2]'))
    FAIL('Chat2 private API/worker/broker Compose origin or readiness contract incompatible');
  if (broker.engine?.type !== 'redis' || broker.engine.redis?.address !== 'redis://redis:6379' ||
      broker.client?.token?.issuer !== 'gafus-chat2' || broker.health?.enabled !== true ||
      !broker.client.allowed_origins?.includes('https://gafus.ru'))
    FAIL('Centrifugo broker config invalid');
  // Centrifugo prioritizes a provided room JWT OVER subscribe proxy. A distinct
  // never-issued subscription verifier key is mandatory to reject old JWTs.
  if (broker.client.subscription_token?.enabled !== true ||
      broker.client.subscription_token?.issuer !== 'gafus-chat2-subscription-deny' ||
      broker.channel.namespaces.length !== 1 ||
      broker.channel.namespaces[0]?.name !== 'chat2' ||
      broker.channel.namespaces[0]?.subscribe_proxy_enabled !== true ||
      broker.channel.namespaces[0]?.allow_user_limited_channels !== false ||
      broker.channel.namespaces[0]?.allow_subscribe_for_client !== false ||
      broker.channel.proxy?.subscribe?.endpoint !==
        'http://gafus-api:3001/internal/chat2/chat2-subscribe' ||
      broker.channel.proxy.subscribe.http?.static_headers?.['X-GAFUS-Subscribe-Proxy-Key'] !==
        '${CENTRIFUGO_VAR_CHAT2_PROXY_SHARED_SECRET}' ||
      broker.channel.proxy.subscribe.http_headers?.length ||
      broker.channel.proxy.subscribe.emulated_headers?.length)
    FAIL('Chat2 broker must enforce proxy-only and reject legacy JWTs');
  if (!/location\s+\^~\s+\/internal\/\s*\{\s*return\s+404;/.test(edgeNginx) ||
      !/location\s+\^~\s+\/internal\/\s*\{\s*return\s+404;/.test(nginx))
    FAIL('Chat2 internal proxy ingress must be closed at both public front doors');
  const apiHost = edgeNginx.slice(edgeNginx.lastIndexOf('server_name api.gafus.ru;'));
  if (!/location\s+\^~\s+\/internal\/chat2\/chat2-subscribe\s*\{\s*return\s+404;/.test(apiHost))
    FAIL('public api.gafus.ru must deny broker subscription ingress (not Cloud media callbacks)');
  if (/\bports:\s*\n[^\n]*8000/.test(centrifugo))
    FAIL('Chat2 broker HTTP API must not publish a public port');
  return true;
}

export function verifyQaStatus(markdown) {
  // Historical successes do not authorize release. QA status is manually
  // maintained and is an additional veto, NOT a substitute for live checks.
  if (markdown.match(/\bREADY=(YES|NO)\b/)?.[1] !== 'YES') FAIL('QA readiness is not YES');
  return true;
}

export function readDestinationEnv(path) { return parseDestinationEnv(readFileSync(path, 'utf8')); }
