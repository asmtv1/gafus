/** Read-only fail-closed release contract: the proxy is review-only and off by default. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const deployed = JSON.parse(read('infra/chat2/centrifugo.prod.json'));
const review = JSON.parse(read('infra/chat2/centrifugo.proxy-only.review.json'));
const compose = read('ci-cd/docker/docker-compose.prod.yml');
const api = read('apps/api/src/app.ts');
const connect = read('apps/api/src/modules/chat2/realtime.ts');
const web = read('apps/web-vite/src/features/chats/Chat2Messenger.tsx');
const mobile = read('apps/mobile/src/features/chat2/Chat2RoomScreen.tsx');
const helper = read('packages/core-client/src/chat2/realtimeSubscription.ts');

test('deployed Centrifugo and production compose remain legacy and do not activate review-only broker configuration', () => {
  assert(!deployed.channel.namespaces.some(item => item.subscribe_proxy_enabled),
    'LIVE_BROKER_CONFIG_MUST_NOT_BE_MODIFIED_BEFORE_COORDINATED_CUTOVER');
  assert.equal(deployed.client.subscription_token?.enabled, undefined);
  assert.match(compose, /infra\/chat2\/centrifugo\.prod\.json/);
  assert.doesNotMatch(compose, /centrifugo\.proxy-only\.review\.json/);
  assert.doesNotMatch(compose, /CHAT2_SUBSCRIBE_PROXY_ENABLED/);
});

test('review template is private, uses dedicated subscription JWT signing and static broker auth on server-only proxy', () => {
  assert.equal(review.channel.namespaces.find(item => item.name === 'chat2')?.subscribe_proxy_enabled, true);
  assert.equal(review.client.subscription_token.enabled, true);
  assert.notEqual(review.client.subscription_token.hmac_secret_key, review.client.token.hmac_secret_key);
  assert.match(review.channel.proxy.subscribe.endpoint, /\/internal\/chat2\/chat2-subscribe$/);
  assert.match(review.channel.proxy.subscribe.endpoint, /^__INTERNAL_ONLY_HONO_ENDPOINT__/);
  assert(review.channel.proxy.subscribe.http.static_headers['X-GAFUS-Subscribe-Proxy-Key']);
  assert(review.client.token.hmac_secret_key.startsWith('__INJECT_'));
  assert(review.client.subscription_token.hmac_secret_key.startsWith('__INJECT_'));
  assert(review.channel.proxy.subscribe.http.static_headers['X-GAFUS-Subscribe-Proxy-Key'].startsWith('__INJECT_'));
});

test('real Hono mount is opt-in; Web/Mobile both negotiate proxy-only from server and retain legacy token fallback', () => {
  assert.match(api, /process\.env\.CHAT2_SUBSCRIBE_PROXY_ENABLED === "true"/);
  assert.match(api, /app\.route\("\/internal\/chat2", createChat2SubscribeProxyRoutes/);
  assert.match(connect, /CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET/);
  assert.match(connect, /subscriptionMode: mode/);
  for (const client of [web, mobile]) {
    assert.match(client, /chat2SubscriptionForConnection\(connection, id/);
    assert.match(client, /chat2SubscriptionTransportOptions\(subscription,/);
    assert.match(client, /getToken: async \(\) => /);
  }
  assert.match(helper, /if \(connection\.subscriptionMode === "proxy"\)/);
  assert.match(helper, /const result = await legacyGrant\(\)/);
  assert.match(helper, /CHAT2_LEGACY_GRANT_MISMATCH/);
  assert.match(helper, /CHAT2_SUBSCRIPTION_MODE_INVALID/);
  assert.match(helper, /if \(grant\.mode === "proxy"\) return \{\};/);
});

test('client room switching and offline mode never inherit a prior room live grant', () => {
  // Both components remount the room for each actor; Mobile additionally binds
  // the verified authentication epoch. Socket cleanup only affects that room.
  assert(web.includes('key={`${ownerId}:${chosen}`}'));
  assert(mobile.includes('key={`${owner}:${binding.authEpoch}:${id}`}'));
  // A socket connection without a channel grant is not a usable subscription.
  assert.equal((web.match(/setStatus\("live"\)/g) || []).length, 1);
  assert.equal((mobile.match(/setConnection\("online"\)/g) || []).length, 1);
  assert.match(web, /sub\.on\("subscribed",\s*\(\) => \{\s*if \(!disposed\) setStatus\("live"\)/);
  assert.match(mobile, /sub\.on\("subscribed",\s*\(\) => \{\s*if \(live\) setConnection\("online"\)/);
  for (const client of [web, mobile]) {
    assert.match(client, /sub\.on\("unsubscribed"/);
    assert.match(client, /sub\.on\("error"/);
  }
  assert.match(web, /refetchInterval: 12000/);
  assert.match(mobile, /\}, 12000\);/);
});
