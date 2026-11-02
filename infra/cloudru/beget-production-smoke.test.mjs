import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const source = readFileSync('infra/cloudru/beget-production-smoke.mjs', 'utf8');
test('retired Gallery origin is never called by production smoke', () => {
  assert.doesNotMatch(source, /gafus-gallery-origin|GALLERY_CDN_SECRET|mepsuduyokabib/);
  assert.match(source, /SigV4 Hono redirect canary/);
});
test('Feed V2 public media checks real S3 key, token, digest, MIME and range', () => {
  for (const requirement of [
    'FEED_CDN_PUBLIC_READ_APPROVED', 'FEED_V2_SMOKE_KEY_INVALID',
    'FEED_PUBLIC_GET', 'FEED_PUBLIC_BYTES_OR_DIGEST_MISMATCH',
    'FEED_QUERY_TOKEN_GET', 'FEED_APPLICATION_URL_BYTES_DIFFER',
    'FEED_PUBLIC_BROWSER_CACHE_MISMATCH', 'FEED_24H_CACHE_PROVIDER_GATE_MISSING',
    'FEED_QUERY_TOKEN_HEAD',
    'FEED_QUERY_TOKEN_RANGE', 'FEED_QUERY_TOKEN_RANGE_MISMATCH',
  ]) assert(source.includes(requirement), requirement);
  assert(source.includes('quepraquiecebquomiel.begetcdn.cloud'));
  assert(!source.includes('garaquachegasourn.begetcdn.cloud'));
  assert(source.includes('FEED_SMOKE_FINAL_OBJECT_MISSING'));
});
