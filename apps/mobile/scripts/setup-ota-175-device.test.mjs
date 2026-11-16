import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNative175Config} from './setup-ota-175-device.mjs';
const sha='a'.repeat(40);
test('prepare both 1.7.5 device candidates with separate idempotent registration operation IDs',()=>{
  const ios=createNative175Config('ios',sha);
  const android=createNative175Config('android',sha);
  for(const config of [ios,android]){
    assert.equal(config.environment,'production');
    assert.equal(config.distribution,'internal');
    assert.equal(config.apiOrigin,'https://gafus.ru');
    assert.equal(config.buildNumber,'17501');
    assert.equal(config.sourceSha,sha);
    assert.match(config.operationId,/^[A-Za-z0-9_-]{16,120}$/);
  }
  assert.notEqual(ios.operationId,android.operationId);
  assert.deepEqual(createNative175Config('ios',sha),ios);
  assert.equal(createNative175Config('ios',sha,'17502').buildNumber,'17502');
});
test('refuse arbitrary platforms, non-git SHAs or malformed build numbers',()=>{
  assert.throws(()=>createNative175Config('web',sha),/INVALID_PLATFORM/);
  assert.throws(()=>createNative175Config('ios','x'.repeat(40)),/INVALID_GIT_SHA/);
  for(const code of ['0','01','-1','1750a','1'.repeat(12)])
    assert.throws(()=>createNative175Config('android',sha,code),/INVALID_BUILD_NUMBER/);
});
