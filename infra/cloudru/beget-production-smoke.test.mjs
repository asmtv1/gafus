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
