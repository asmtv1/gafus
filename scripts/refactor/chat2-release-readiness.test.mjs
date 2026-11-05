import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { validateCutoverConfig, parseDestinationEnv, validateStaticContracts,
  verifyQaStatus, probePublicWebsocketUpgrade, verifyMobileForcedUpdate } from './chat2-release-readiness.mjs';

const ready = Object.freeze({
  COMPOSE_PROFILES: 'chat2', CHAT2_LEGACY_RETIRE_ENABLED: 'enabled', CHAT2_API_ENABLED: 'enabled', CHAT2_WORKER_ENABLED: 'enabled',
  CHAT2_PRIVATE_MEDIA_ENABLED: 'enabled',
  CHAT2_PUBLIC_WS_URL: 'wss://gafus.ru/connection/websocket',
  CHAT2_CENTRIFUGO_HTTP_API: 'http://chat2-centrifugo:8000/api/publish',
  CHAT2_CENTRIFUGO_TOKEN_SECRET: 'a'.repeat(40), CHAT2_CENTRIFUGO_API_KEY: 'b'.repeat(20),
  CHAT2_SUBSCRIBE_PROXY_ENABLED: 'true',
  CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET: 'c'.repeat(40),
  CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET: 'd'.repeat(40),
  CHAT2_MOBILE_STORES_VERIFIED: 'true',
  CHAT2_MOBILE_IOS_MIN_VERSION: '1.7.3',
  CHAT2_MOBILE_ANDROID_MIN_VERSION: '1.7.3',
});

test('ready INTENDED destination configuration passes configuration validation only', () => {
  assert.equal(validateCutoverConfig(ready), true);
  assert.equal(validateCutoverConfig(parseDestinationEnv(Object.entries(ready).map(([k,v]) => `${k}=${v}`).join('\n'))), true);
});
test('staged first-install configuration never authorizes legacy 410', () => {
  const staged = { ...ready, CHAT2_LEGACY_RETIRE_ENABLED: 'disabled' };
  assert.equal(validateCutoverConfig(staged, true), true);
  assert.throws(() => validateCutoverConfig(staged), /LEGACY_RETIRE/);
  assert.throws(() => validateCutoverConfig(ready, true), /LEGACY_RETIRE/);
});
test('disabled destination fails closed', () => {
  for (const key of ['CHAT2_API_ENABLED','CHAT2_WORKER_ENABLED','CHAT2_PRIVATE_MEDIA_ENABLED']) {
    assert.throws(() => validateCutoverConfig({ ...ready, [key]: 'disabled' }), new RegExp(key));
  }
});
test('misconfigured broker, unactivated profile, insecure websocket, placeholder creds fail closed', () => {
  for (const values of [
    { COMPOSE_PROFILES: '' }, { COMPOSE_PROFILES: 'metrics' },
    { CHAT2_PUBLIC_WS_URL: 'ws://127.0.0.1:8000/connection/websocket' },
    { CHAT2_CENTRIFUGO_HTTP_API: 'https://attacker.test/api/publish' },
    { CHAT2_CENTRIFUGO_TOKEN_SECRET: 'example' + 'a'.repeat(40) },
    { CHAT2_CENTRIFUGO_API_KEY: 'changeme' + 'b'.repeat(20) },
    { CHAT2_SUBSCRIBE_PROXY_ENABLED: 'false' },
    { CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET: '' },
    { CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET: ready.CHAT2_CENTRIFUGO_TOKEN_SECRET },
    { CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET: ready.CHAT2_CENTRIFUGO_API_KEY },
    { CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET: ready.CHAT2_CENTRIFUGO_TOKEN_SECRET },
    { CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET: ready.CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET },
    { CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET: 'placeholder' + 'd'.repeat(40) },
  ]) assert.throws(() => validateCutoverConfig({ ...ready, ...values }), /CHAT2_RELEASE_BLOCKED/);
  assert.throws(() => parseDestinationEnv('CHAT2_API_ENABLED=enabled\nCHAT2_API_ENABLED=disabled'), /duplicate/);
});
test('historical READY=YES cannot override first QA READY=NO', () => {
  assert.throws(() => verifyQaStatus('READY=NO\nold READY=YES'), /QA readiness/);
  assert.equal(verifyQaStatus('READY=YES\nold READY=NO'), true);
});
test('real static Compose/nginx/broker contract is present', () => {
  const root = new URL('../../', import.meta.url);
  const read = name => readFileSync(new URL(name, root), 'utf8');
  assert.equal(validateStaticContracts(read('ci-cd/docker/docker-compose.prod.yml'),
    read('ci-cd/docker/nginx-vite-refactor.conf'), JSON.parse(read('infra/chat2/centrifugo.prod.json')),
    read('ci-cd/nginx/conf.d/gafus.ru.conf')), true);
});
test('real release workflows check candidate and actual generated destination, before mutations', () => {
  const root = new URL('../../', import.meta.url);
  const prod = readFileSync(new URL('.github/workflows/production-deploy-reusable.yml', root), 'utf8');
  const ci = readFileSync(new URL('.github/workflows/ci-cd.yml', root), 'utf8');
  assert.match(prod, /check-chat2-prod-boundary\.mjs --candidate/);
  assert.match(ci, /check-chat2-prod-boundary\.mjs --candidate/);
  const activation = readFileSync(new URL('docs/operations/workflow-archive/production-media-activate-reusable.yml', root), 'utf8');
  assert(!prod.includes('check-chat2-prod-boundary.mjs --release --destination-env ci-cd/docker/.env'), 'first deploy may not inspect the old Chat2 runtime');
  const destination = activation.indexOf('check-chat2-prod-boundary.mjs --release --destination-env ci-cd/docker/.env');
  assert.ok(destination > activation.indexOf('docker-compose -f "$compose" up -d --no-deps --force-recreate api worker'));
  assert.ok(activation.includes('trap rollback_activation EXIT'));
  for (const key of Object.keys(ready).filter(key => key !== "CHAT2_MOBILE_STORES_VERIFIED")) assert.match(prod, new RegExp(`echo "${key}=`));
  assert.doesNotMatch(prod, /--release --destination-env .*example/);
});

// The real --release code uses node:https; this fake is for deterministic
// protocol-unit coverage only and is NEVER passed off as real WSS readiness.
test('WSS readiness requires a verified 101 upgrade, not 200 SPA or forged header', async () => {
  const url = 'wss://gafus.ru/connection/websocket';
  const handshake = (kind) => (target, options) => {
    assert.equal(target, 'https://gafus.ru/connection/websocket');
    assert.equal(options.headers.Upgrade, 'websocket');
    assert.equal(options.headers.Origin, 'https://gafus.ru');
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      if (kind === 'spa') {
        req.emit('response', { statusCode: 200, resume() {} }); return;
      }
      const expected = createHash('sha1').update(options.headers['Sec-WebSocket-Key'] +
        '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      req.emit('upgrade', { statusCode: 101,
        headers: { 'sec-websocket-accept': kind === 'good' ? expected : 'invalid' } },
        {destroy() {}});
    });
    return req;
  };
  assert.equal(await probePublicWebsocketUpgrade(url, handshake('good')), true);
  await assert.rejects(probePublicWebsocketUpgrade(url, handshake('spa')), /upgrade unavailable/);
  await assert.rejects(probePublicWebsocketUpgrade(url, handshake('forged')), /upgrade unavailable/);
  await assert.rejects(probePublicWebsocketUpgrade('wss://evil.test/connection/websocket', handshake('good')),
    /not approved/);
});

test('active production edge nginx and private worker/broker names are REQUIRED, not just Vite nginx', () => {
  const root = new URL('../../', import.meta.url);
  const read = name => readFileSync(new URL(name, root), 'utf8');
  const compose = read('ci-cd/docker/docker-compose.prod.yml');
  const vite = read('ci-cd/docker/nginx-vite-refactor.conf');
  const edge = read('ci-cd/nginx/conf.d/gafus.ru.conf');
  const broker = JSON.parse(read('infra/chat2/centrifugo.prod.json'));
  const check = (c=compose,e=edge) => validateStaticContracts(c,vite,broker,e);
  assert.equal(check(),true);
  for(const altered of [
    edge.replace('location = /connection/websocket', 'location = /old-websocket'),
    edge.replace('set $chat2_broker_backend chat2-centrifugo:8000;',
      'set $chat2_broker_backend unexpected:8000;'),
    edge.replace('resolver 127.0.0.11 valid=5s ipv6=off;', ''),
    edge.replace('proxy_pass http://$chat2_broker_backend$request_uri;',
      'proxy_pass http://gafus-web:3000;'),
    edge.replace('proxy_set_header Upgrade $http_upgrade;', ''),
    edge.replace('proxy_cache off;', 'proxy_cache on;'),
  ]) assert.throws(()=>check(compose,altered),/ACTIVE edge nginx/);
  for(const altered of [
    compose.replace('WORKER_HEALTH_PORT=3003','WORKER_HEALTH_PORT=9003'),
    compose.replace('API_PORT=3001','API_PORT=4301'),
    compose.replace('CHAT2_LEGACY_RETIRE_ENABLED=${CHAT2_LEGACY_RETIRE_ENABLED:-disabled}', 'CHAT2_LEGACY_RETIRE_ENABLED=enabled'),
    compose.replace('CENTRIFUGO_HTTP_API_KEY=${CHAT2_CENTRIFUGO_API_KEY:-}', 'CENTRIFUGO_HTTP_API_KEY=disabled'),
  ]) assert.throws(()=>check(altered,edge),/Compose|Chat2/);
  assert.throws(()=>check(compose.replace('../nginx/conf.d:/etc/nginx/conf.d:ro','/other/path:/etc/nginx/conf.d:ro')),
    /ACTIVE edge nginx/);
});

test('main CI has a real source-only staged lane; production still fails closed before image pulls', () => {
  const root = new URL('../../', import.meta.url);
  const ci = readFileSync(new URL('.github/workflows/ci-cd.yml',root),'utf8');
  const deploy = readFileSync(new URL('.github/workflows/production-deploy-reusable.yml',root),'utf8');
  const lane = ci.match(/      - name: Check Chat2 first-install staged source without deploy \(blocking\)([\s\S]*?)(?=\n      - name:|\n  [a-z-]+:|$)/)?.[1];
  assert.ok(lane,'source-only staged lane must run in normal CI');
  for(const line of [
    'COMPOSE_PROFILES: chat2', 'CHAT2_LEGACY_RETIRE_ENABLED: disabled',
    'CHAT2_API_ENABLED: enabled','CHAT2_WORKER_ENABLED: enabled',
    'CHAT2_PRIVATE_MEDIA_ENABLED: enabled',
    'CHAT2_PUBLIC_WS_URL: wss://gafus.ru/connection/websocket',
    'CHAT2_CENTRIFUGO_HTTP_API: http://chat2-centrifugo:8000/api/publish',
    'node scripts/refactor/check-chat2-prod-boundary.mjs --staged',
  ]) assert.ok(lane.includes(line),`stage missing ${line}`);
  assert.ok(lane.includes('openssl rand -hex 32') && lane.includes('openssl rand -hex 24'));
  assert.doesNotMatch(lane,/continue-on-error|\bif:|ssh|docker|--release|deployment|\|\| true/);
  assert.ok(deploy.indexOf('--release --destination-env ci-cd/docker/.env') <
    deploy.indexOf('Pulling seven immutable Docker images'), 'release live gate must remain before mutation');
  assert.doesNotMatch(deploy, /check-chat2-prod-boundary\.mjs --staged/,
    'staged source-only command must never replace the actual production live release gate');
});


test('no broker subscription token override, no public internal ingress, no client token bypass', () => {
  const root = new URL('../../', import.meta.url);
  const read = name => readFileSync(new URL(name,root),'utf8');
  const broker=JSON.parse(read('infra/chat2/centrifugo.prod.json'));
  const compose=read('ci-cd/docker/docker-compose.prod.yml');
  const edge=read('ci-cd/nginx/conf.d/gafus.ru.conf');
  const vite=read('ci-cd/docker/nginx-vite-refactor.conf');
  const verify=(conf=broker,c=compose,e=edge,v=vite)=>validateStaticContracts(c,v,conf,e);
  assert.equal(verify(),true);
  for(const broken of [
    { ...broker, client:{ ...broker.client, subscription_token:{ enabled:false } } },
    { ...broker, channel:{ ...broker.channel, namespaces:[{...broker.channel.namespaces[0], subscribe_proxy_enabled:false}] } },
    { ...broker, channel:{ ...broker.channel, namespaces:[{...broker.channel.namespaces[0], allow_user_limited_channels:true}] } },
    { ...broker, channel:{ ...broker.channel, proxy:{ subscribe:{
      ...broker.channel.proxy.subscribe, http_headers:['X-GAFUS-Subscribe-Proxy-Key'] } } } },
  ]) assert.throws(()=>verify(broken),/proxy-only|JWT/);
  assert.throws(()=>verify(broker,compose,edge.replace('location ^~ /internal/ { return 404; }','')),/ingress/);
  assert.throws(()=>verify(broker,compose,edge,vite.replace('location ^~ /internal/ { return 404; }','')),/ingress/);
});


test('optional mobile policy diagnostic uses read-only calls', async () => {
  const seen=[];
  const endpoint='https://api.gafus.ru/api/v1/public/mobile-app';
  const fake=(url,opts)=>{
    seen.push([url,opts]);
    const platform=opts.headers['X-Client-Platform'];
    return Promise.resolve({status:200,json:async()=>({success:true,data:{
      minimumSupportedVersion:{ios:'1.7.3',android:'1.7.3'},
      storeUrl:{ios:'https://apps.apple.com/app/id000',android:'https://play.google.com/store/apps/details?id=example'},
    }})});
  };
  assert.equal(await verifyMobileForcedUpdate(ready,fake),true);
  assert.deepEqual(seen.map(([url,options])=>[url,options.method,
    options.headers['X-Client-Platform'],options.headers['X-Client-Version']]),[
      [endpoint,'GET','ios','1.7.2'],[endpoint,'GET','android','1.7.2'],
    ]);
  const stale=async()=>({status:200,json:async()=>({success:true,data:{
    minimumSupportedVersion:{ios:'1.7.2',android:'1.7.2'},
    storeUrl:{ios:'https://apps.apple.com/app/id000',android:'https://play.google.com/store/apps/details?id=example'},
  }})});
  await assert.rejects(verifyMobileForcedUpdate(ready,stale),/minimum version differs/);
  const unreachable=async()=>{throw Error('unavailable')};
  await assert.rejects(verifyMobileForcedUpdate(ready,unreachable),/policy unavailable/);
  const malicious=async()=>({status:200,json:async()=>({success:true,data:{
    minimumSupportedVersion:{ios:'1.7.3',android:'1.7.3'},
    storeUrl:{ios:'https://malicious.invalid/download',android:'https://play.google.com/store/apps/details?id=example'},
  }})});
  await assert.rejects(verifyMobileForcedUpdate(ready,malicious),/not approved store/);
});

 test('server release is independent of mobile store review and public version policy', () => {
   const env = {...ready};
   for (const key of ['CHAT2_MOBILE_STORES_VERIFIED','CHAT2_MOBILE_IOS_MIN_VERSION','CHAT2_MOBILE_ANDROID_MIN_VERSION']) delete env[key];
   assert.equal(validateCutoverConfig(env),true);
   const gate=readFileSync(new URL('./check-chat2-prod-boundary.mjs',import.meta.url),'utf8');
   assert.doesNotMatch(gate,/verifyMobileForcedUpdate/);
 });
