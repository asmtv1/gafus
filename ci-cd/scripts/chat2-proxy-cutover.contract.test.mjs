/** No legacy Chat2 room JWT support. All client subscriptions use broker proxy. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(file,'utf8');
const broker=JSON.parse(read('infra/chat2/centrifugo.prod.json'));
const review=JSON.parse(read('infra/chat2/centrifugo.proxy-only.review.json'));
const compose=read('ci-cd/docker/docker-compose.prod.yml');
const api=read('apps/api/src/app.ts');
const connection=read('apps/api/src/modules/chat2/realtime.ts');
const route=read('apps/api/src/routes/v1/chats.ts');
const web=read('apps/web-vite/src/features/chats/Chat2Messenger.tsx');
const mobile=read('apps/mobile/src/features/chat2/Chat2RoomScreen.tsx');
const webApi=read('apps/web-vite/src/features/chats/chat2Api.ts');
const mobileApi=read('apps/mobile/src/features/chat2/api.ts');
const helper=read('packages/core-client/src/chat2/realtimeSubscription.ts');

test('production broker ONLY uses authenticated subscribe-proxy on private Hono route',()=>{
  assert.equal(broker.channel.namespaces.length,1);
  const namespace=broker.channel.namespaces[0];
  assert.equal(namespace.name,'chat2');
  assert.equal(namespace.subscribe_proxy_enabled,true);
  assert.equal(namespace.allow_subscribe_for_client,false);
  assert.equal(namespace.allow_user_limited_channels,false);
  assert.equal(broker.channel.proxy.subscribe.endpoint,
    'http://gafus-api:3001/internal/chat2/chat2-subscribe');
  assert.equal(broker.channel.proxy.subscribe.http.static_headers['X-GAFUS-Subscribe-Proxy-Key'],
    '${CENTRIFUGO_VAR_CHAT2_PROXY_SHARED_SECRET}');
  assert(!broker.channel.proxy.subscribe.http_headers?.length);
  assert(!broker.channel.proxy.subscribe.emulated_headers?.length);
  assert(!compose.includes('ports:\n      - "8000:8000"'));
});
test('old room JWTs cannot bypass proxy: distinct never-issued broker verifier key',()=>{
  for(const config of [broker,review]) {
    assert.equal(config.client.subscription_token.enabled,true);
    assert.equal(config.client.subscription_token.issuer,'gafus-chat2-subscription-deny');
    assert.equal(config.channel.namespaces[0].subscribe_proxy_enabled,true);
  }
  assert.equal(broker.client.token.issuer,'gafus-chat2');
  assert.match(compose,/CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY=\$\{CHAT2_CENTRIFUGO_SUBSCRIPTION_SECRET:-\}/);
  assert.match(compose,/CENTRIFUGO_VAR_CHAT2_PROXY_SHARED_SECRET=\$\{CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET:-\}/);
  assert.doesNotMatch(connection,/new SignJWT\(\{\s*channel\s*\}/);
  assert.doesNotMatch(connection,/subscriptionToken/);
  assert.doesNotMatch(route,/"\/:id\/realtime"/);
});
test('Hono connection requires proxy mode and separate secrets: missing env means 503 NOT legacy',()=>{
  assert.match(connection,/requireChat2ProxyOnly/);
  assert.match(connection,/CHAT2_SUBSCRIBE_PROXY_ENABLED === "true"/);
  assert.match(connection,/if \(!configured \|\| shared\.length/);
  assert.match(connection,/shared === signing/);
  assert.match(connection,/shared === brokerKey/);
  assert.match(connection,/subscriptionMode: "proxy"/);
  assert.match(api,/app\.route\("\/internal\/chat2", createChat2SubscribeProxyRoutes/);
  assert.match(api,/checkCurrentMembership: readGate/);
  assert.match(compose,/CHAT2_SUBSCRIBE_PROXY_ENABLED=\$\{CHAT2_SUBSCRIBE_PROXY_ENABLED:-false\}/);
});
test('Web and Mobile require proxy-only, no old JWT call, no refresh or downgrade',()=>{
  for(const client of [web,mobile]) {
    assert.match(client,/chat2SubscriptionForConnection\(connection, id\)/);
    assert.match(client,/chat2SubscriptionTransportOptions\(subscription\)/);
    assert.doesNotMatch(client,/\.subscription\(id\)|\.refreshSubscription\(id\)|refreshChat2RoomToken\(id\)/);
    assert.match(client,/\.on\("unsubscribed"/);
    assert.match(client,/\.on\("error"/);
  }
  for(const clientApi of [webApi,mobileApi]) {
    assert.doesNotMatch(clientApi,/\/:id\/realtime|\$\{(?:safe|chatId)\(id\)\}\/realtime|refreshSubscription:|subscription: \(id/);
  }
  assert.match(helper,/CHAT2_PROXY_ONLY_REQUIRED/);
  assert.doesNotMatch(helper,/legacyGrant|refreshLegacyRoomToken|mode: "token"/);
  assert.match(helper,/return \{\};/);
  assert.doesNotMatch(helper,/getToken:|token: grant\.token/);
});
test('active subscriptions are revoked after committed BAN, reconnects always check readGate',()=>{
  const service=read('apps/api/src/modules/chat2/service.ts');
  const segment=service.slice(service.indexOf('export async function moderateGroup('),
    service.indexOf('export async function transferGroupOwner('));
  assert(segment.indexOf('data: { role: "BANNED"')<segment.indexOf('await revokeLiveRoomSubscription(targetId, id)'));
  const dm=service.slice(service.indexOf('export async function blockUser('),
    service.indexOf('export async function leaveChat('));
  assert(dm.indexOf('await prisma.chat2Block.upsert')<dm.indexOf('revokeLiveRoomSubscription(userId, room.id)'));
  const revocation=read('apps/api/src/modules/chat2/revocation.ts');
  assert.match(revocation,/\/api\/unsubscribe/);
});
test('public nginx ingress blocks /internal while preserving public WSS only',()=>{
  for(const file of ['ci-cd/nginx/conf.d/gafus.ru.conf','ci-cd/docker/nginx-vite-refactor.conf']) {
    const content=read(file);
    assert.match(content,/location \^~ \/internal\/ \{ return 404; \}/);
    assert.match(content,/location = \/connection\/websocket/);
  }
  const edge=read('ci-cd/nginx/conf.d/gafus.ru.conf');
  assert.match(edge.slice(edge.lastIndexOf('server_name api.gafus.ru;')),
    /location \^~ \/internal\/chat2\/chat2-subscribe \{ return 404; \}/);
});
test('mobile forced-update policy exists and needs a published new store build before activation',()=>{
  const gate=read('apps/mobile/src/shared/components/RequiredAppUpdateGate.tsx');
  const policy=read('apps/api/src/routes/v1/public-mobile.ts');
  assert.match(gate,/minimumSupportedVersion/);
  assert.match(gate,/isAppUpdateRequired/);
  assert.match(gate,/Обновить приложение/);
  assert.match(policy,/getMobileAppPublicConfig/);
});
