import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('infra/cloudru/beget-production-smoke.mjs', 'utf8');
test('private origin may reject unsigned HEAD as 403 or 404, never accept 200', () => {
  assert.match(source, /!\[403, 404\]\.includes\(directOrigin\.status\)/);
  assert.match(source, /DIRECT_ORIGIN_UNAUTHORIZED_\$\{directOrigin\.status\}/);
});
test('signed CDN is still required to return exact image bytes, cache and range', () => {
  for (const condition of [
    "status(cold, 200, 'VALID_GET')", "createHash('sha256').update(bytes).digest('hex') !== expectedDigest",
    "status(warm, 200, 'WARM_GET')", "CACHE_NOT_HIT_", "CLIENT_CACHE_POLICY_MISMATCH_",
    "status(range, 206, 'RANGE')", "WRONG_FIXTURE_OR_MIME",
  ]) assert(source.includes(condition), 'MISSING_REQUIRED_SIGNED_CDN_PROOF: '+condition);
});

test('production Feed CDN host is the live service, not the removed DNS entry', () => {
  const expected = 'quepraquiecebquomiel.begetcdn.cloud';
  assert(source.includes(expected));
  assert(!source.includes('garaquachegasourn.begetcdn.cloud'));
  for (const path of [
    '.github/workflows/production-deploy-reusable.yml',
    'ci-cd/docker/docker-compose.prod.yml',
    'infra/cloudru/beget-synthetic-purge-acceptance.mjs',
  ]) {
    const content = readFileSync(path, 'utf8');
    assert(content.includes(expected), path);
    assert(!content.includes('garaquachegasourn.begetcdn.cloud'), path);
  }
});

test('Feed V2 public media checks its real S3 key, query URL, digest, MIME and range', () => {
  assert(source.includes("FEED_CDN_PUBLIC_READ_APPROVED"));
  assert(source.includes("checkPublicFeedV2(scope,key,expectedDigest,secret)"));
  for (const requirement of [
    "FEED_V2_SMOKE_KEY_INVALID",
    "FEED_PUBLIC_GET",
    "FEED_PUBLIC_BYTES_OR_DIGEST_MISMATCH",
    "FEED_QUERY_TOKEN_GET",
    "FEED_APPLICATION_URL_BYTES_DIFFER",
    "FEED_PUBLIC_BROWSER_CACHE_MISMATCH",
    "FEED_QUERY_TOKEN_HEAD",
    "FEED_QUERY_TOKEN_RANGE",
    "FEED_QUERY_TOKEN_RANGE_MISMATCH",
  ]) assert(source.includes(requirement), requirement);
  const yaml = readFileSync('.github/workflows/ci-cd.yml', 'utf8');
  assert(yaml.includes("vars.FEED_CDN_PUBLIC_READ_APPROVED || 'false'"));
  assert(source.includes("const feed = /^media"));
  assert(!source.includes("const feed = new RegExp("));
});
