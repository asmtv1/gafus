import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const valid = Object.freeze({
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  GAFUS_MEDIA_CDN_TARGET: 'beget',
  BEGET_CDN_RELEASE_CONFIRM: 'reviewed-gallery-feed-beget-cutover',
  BEGET_CDN_PURGE_API_VERIFIED: 'true',
  BEGET_CDN_CACHE_KEY_VERIFIED: 'true',
  BEGET_CDN_PURGE_PROPAGATION_VERIFIED: 'true',
  BEGET_CDN_LIVE_SMOKE_VERIFIED: 'true',
  GALLERY_BEGET_CDN_SERVICE_ID: '0a8e97d5-3a65-4e90-99a6-c7f61131a461',
  FEED_BEGET_CDN_SERVICE_ID: 'becd9e5d-4fa8-47da-878c-9b80ded74e71',
  GALLERY_CDN_SECRET: 'gallery-test-placeholder'.padEnd(48,'G'),
  FEED_CDN_SECRET: 'feed-test-placeholder'.padEnd(32,'F'),
  GALLERY_ORIGIN_SECRET: 'G'.repeat(32),
  FEED_ORIGIN_SECRET: 'F'.repeat(32),
  BEGET_CDN_API_TOKEN: 'not-a-real-purge-token'.padEnd(36,'X'),
  BEGET_GALLERY_SMOKE_FINAL_KEY: 'albums/owner/album/photos/image/full.webp',
  BEGET_GALLERY_SMOKE_SHA256: 'a'.repeat(64),
  BEGET_FEED_SMOKE_FINAL_KEY: 'posts/owner/post/attachments/image/poster.webp',
  BEGET_FEED_SMOKE_SHA256: 'b'.repeat(64),
});
const check = (overrides = {}, mode = '--check') =>
  spawnSync(process.execPath, ['infra/cloudru/beget-release-readiness.mjs',mode], {
    cwd: process.cwd(), encoding:'utf8', timeout:5000,
    env: {...valid, ...overrides},
  });
test('offline plan is non-mutating and does not need credentials', () => {
  const result = check({GALLERY_CDN_SECRET:'',BEGET_CDN_API_TOKEN:''},'--plan');
  assert.equal(result.status,0);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mutates,false);
  assert.equal(plan.provider,'beget-only');
});
test('valid placeholder environment passes config ONLY; never accesses network', () => {
  const result=check();
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/BEGET_ONLY_READINESS=PASS/);
  for (const secret of [valid.GALLERY_CDN_SECRET,valid.FEED_CDN_SECRET,valid.BEGET_CDN_API_TOKEN])
    assert.doesNotMatch(result.stdout, new RegExp(secret));
});
test('public Feed requires a new verified CDN host/service but no legacy Feed signing secrets', () => {
  const config = {
    FEED_BUCKET_PUBLIC: 'true', FEED_CDN_BASE_URL: 'https://quepraquiecebquomiel.begetcdn.cloud',
    FEED_BEGET_CDN_SERVICE_ID: 'cbb7fe86-a193-457e-a756-9cf3aa2aef1b',
    FEED_CDN_HEALTH_OBJECT_KEY: valid.BEGET_FEED_SMOKE_FINAL_KEY,
    FEED_CDN_SECRET: '', FEED_ORIGIN_SECRET: '',
  };
  const result = check(config);
  assert.equal(result.status, 0, result.stderr);
  for (const invalid of [
    {FEED_CDN_BASE_URL: 'https://garaquachegasourn.begetcdn.cloud'},
    {FEED_CDN_BASE_URL: 'https://evil.test'},
    {FEED_CDN_BASE_URL: 'https://fake.begetcdn.cloud'},
    {FEED_BEGET_CDN_SERVICE_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'},
    {FEED_CDN_HEALTH_OBJECT_KEY: ''},
    {FEED_BEGET_CDN_SERVICE_ID: valid.FEED_BEGET_CDN_SERVICE_ID},
    {FEED_BEGET_CDN_SERVICE_ID: ''},
  ]) assert.notEqual(check({ ...config, ...invalid }).status, 0);
});
test('manual release uses same guard, never falls back to Yandex', () => {
  assert.equal(check({GITHUB_EVENT_NAME:'workflow_dispatch'}).status,0);
  assert.notEqual(check({GAFUS_MEDIA_CDN_TARGET:'yandex'}).status,0);
  assert.notEqual(check({GAFUS_MEDIA_CDN_TARGET:''}).status,0);
});
test('never accesses production from non-main or unapproved event', () => {
  for(const [name,value] of [['GITHUB_REF','refs/heads/develop'],['GITHUB_EVENT_NAME','pull_request']]) {
    const result=check({[name]:value});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/BEGET_RELEASE_BRANCH_UNAUTHORIZED/);
  }
});
test('missing purge approval, live validation and API token block release', () => {
  for(const name of ['BEGET_CDN_PURGE_API_VERIFIED','BEGET_CDN_CACHE_KEY_VERIFIED',
    'BEGET_CDN_PURGE_PROPAGATION_VERIFIED','BEGET_CDN_LIVE_SMOKE_VERIFIED',
    'BEGET_CDN_API_TOKEN','BEGET_CDN_RELEASE_CONFIRM']) {
    const result=check({[name]:''});
    assert.notEqual(result.status,0,name);
    assert.doesNotMatch(result.stderr,/not-a-real-purge-token/);
  }
});
test('does not treat generic staging assets or fake service ids as valid live smoke', () => {
  for(const overrides of [
    {GALLERY_BEGET_CDN_SERVICE_ID:'another-gallery'},
    {BEGET_GALLERY_SMOKE_FINAL_KEY:'albums/owner/staging/photos/fixture/full.webp'},
    {BEGET_FEED_SMOKE_SHA256:''},
    {FEED_CDN_SECRET:'invalid'},
    {GALLERY_CDN_SECRET:'invalid'},
  ]) assert.notEqual(check(overrides).status,0,JSON.stringify(Object.keys(overrides)));
});

test('new Gallery CDN mode requires metadata migration, dual purge, current mobile compatibility and separate origin signing secrets', () => {
  const redirect={
    GALLERY_CDN_REDIRECT_ENABLED: 'true',
    GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'true',
    GALLERY_CDN_PURGE_DUAL_ENABLED: 'true',
    GALLERY_CDN_CACHEABLE_FINAL_ENABLED: 'true',
    GALLERY_CDN_METADATA_MIGRATED: 'true',
    GALLERY_MOBILE_COMPAT_VERIFIED: 'true',
    GALLERY_CDN_BROWSER_CACHE_VERIFIED: 'true',
    GALLERY_BEGET_CDN_SERVICE_ID: '10530e64-21b7-4352-8366-806c79c2f1b7',
    GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'N'.repeat(32),
    GALLERY_CDN_REDIRECT_ORIGIN_SECRET: 'R'.repeat(64),
  };
  assert.equal(check(redirect).status, 0, check(redirect).stderr);
  assert.equal(check({ ...redirect, GALLERY_MOBILE_COMPAT_VERIFIED: 'false',
    GALLERY_MOBILE_POST_DEPLOY_TEST_APPROVED: 'true' }).status, 0,
    'owner-approved post-deployment mobile test must not block rollout');
  for(const invalid of [
    { GALLERY_BEGET_CDN_SERVICE_ID: valid.GALLERY_BEGET_CDN_SERVICE_ID },
    { GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'false' },
    { GALLERY_CDN_PURGE_DUAL_ENABLED: 'false' },
    { GALLERY_CDN_CACHEABLE_FINAL_ENABLED: 'false' },
    { GALLERY_CDN_METADATA_MIGRATED: 'false' },
    { GALLERY_MOBILE_COMPAT_VERIFIED: 'false', GALLERY_MOBILE_POST_DEPLOY_TEST_APPROVED: 'false' },
    { GALLERY_CDN_BROWSER_CACHE_VERIFIED: 'false' },
    { GALLERY_CDN_REDIRECT_SIGNING_SECRET: '' },
    { GALLERY_CDN_REDIRECT_ORIGIN_SECRET: 'weak' },
  ]) assert.notEqual(check({ ...redirect, ...invalid }).status,0,JSON.stringify(Object.keys(invalid)));
});

test('Gallery origin canary stage-1 requires separate secrets but does not redirect viewers', () => {
  const canary={GALLERY_CDN_ORIGIN_ROUTE_ENABLED:'true',GALLERY_CDN_REDIRECT_ENABLED:'false',
    GALLERY_CDN_REDIRECT_SIGNING_SECRET:'S'.repeat(32),GALLERY_CDN_REDIRECT_ORIGIN_SECRET:'O'.repeat(64)};
  assert.equal(check(canary).status,0,check(canary).stderr);
  assert.notEqual(check({...canary,GALLERY_CDN_REDIRECT_ORIGIN_SECRET:''}).status,0);
  assert.notEqual(check({...canary,GALLERY_CDN_REDIRECT_SIGNING_SECRET:''}).status,0);
});
