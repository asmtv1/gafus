import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingAppLinksFromBundleManifest,manifestStrings } from './verify-android-aab-app-links.mjs';
test('a complete new App Bundle manifest includes both verified domains and every published destination',()=>{
  assert.deepEqual(missingAppLinksFromBundleManifest(Buffer.from(manifestStrings.join('\n'))),[]);
});
test('stale AAB with just /training and /reset-password is NOT release ready',()=>{
  const missing=missingAppLinksFromBundleManifest(Buffer.from('gafus.ru /training /reset-password'));
  for(const value of ['www.gafus.ru','/feed/','/questions/','/chats/','/moments/']) {
    assert(missing.includes(value));
  }
});
