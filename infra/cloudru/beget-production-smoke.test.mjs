import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowLegacyPublicFeedSmokeMiss } from './beget-production-smoke.mjs';

const key = 'posts/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/attachments/bef94b1b82bd47a6b05325ec8be2b22e/poster.webp';
const digest = '93c513effa21235a9617897eb55830910863834228730eae0f42b5c78043fb02';

test('only pinned legacy public Feed fixture accepts no-store MISS', () => {
  assert.equal(allowLegacyPublicFeedSmokeMiss(true, key, digest, 'MISS'), true);
  for (const [publicRead, changedKey, changedDigest, state] of [
    [false, key, digest, 'MISS'],
    [true, key, digest, 'HIT'],
    [true, key, digest, 'ABSENT'],
    [true, key, digest, 'EXPIRED'],
    [true, key, 'f'.repeat(64), 'MISS'],
    [true, key.replace('beget-smoke-', 'beget-user-'), digest, 'MISS'],
  ]) assert.equal(allowLegacyPublicFeedSmokeMiss(publicRead, changedKey, changedDigest, state), false);
});
