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
