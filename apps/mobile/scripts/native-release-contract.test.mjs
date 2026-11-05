import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { compareStoreVersions, validateNativeReleaseContract,
  validateOtaPublishAttestation, parseOtaChannel } from './native-release-contract.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(readFileSync(resolve(root,f),'utf8'));
const good={expo:read('app.json').expo,mobilePackage:read('package.json'),eas:read('eas.json')};
const check=(overrides={})=>validateNativeReleaseContract({...good,...overrides});
test('current native iOS/Android release config is safe for fresh store binaries',()=>{
  assert.deepEqual(check(),[]);
});
test('SDK-wide OTA runtime is forbidden after native compressor/gestures change',()=>{
  for(const policy of ['sdkVersion','nativeVersion','fingerprint']) {
    assert(check({expo:{...good.expo,runtimeVersion:{policy}}})
      .includes('MOBILE_OTA_RUNTIME_MUST_BE_APP_VERSION_NOT_SDK_VERSION'));
  }
});
test('we cannot silently reuse old native store version or mismatched package',()=>{
  assert(check({expo:{...good.expo,version:'1.7.2'}})
    .includes('MOBILE_VERSION_NEW_NATIVE_BUILD_REQUIRED'));
  assert(check({mobilePackage:{...good.mobilePackage,version:'1.7.2'}})
    .includes('MOBILE_PACKAGE_AND_EXPO_VERSION_MUST_MATCH'));
  assert.equal(compareStoreVersions('1.7.10','1.7.9')>0,true);
});
test('Android keyboard and predictive back cannot accidentally regress on prebuild',()=>{
  for(const key of ['softwareKeyboardLayoutMode','predictiveBackGestureEnabled']) {
    const android={...good.expo.android,[key]:key==='softwareKeyboardLayoutMode'?'pan':false};
    assert(check({expo:{...good.expo,android}}).some(e=>e.startsWith('MOBILE_ANDROID_')));
  }
});
test('required photo/video/gesture native modules must be linked into next binary',()=>{
  const dependencies={...good.mobilePackage.dependencies};
  delete dependencies['react-native-compressor'];
  assert(check({mobilePackage:{...good.mobilePackage,dependencies}})
    .includes('MOBILE_REQUIRED_NATIVE_DEP_MISSING:react-native-compressor'));
});
test('an obsolete environment version must not affect the store release contract',()=>{
  assert.deepEqual(check({env:{EXPO_PUBLIC_APP_VERSION:'1.7.1'}}),[]);
});
test('OTA production is stopped until both NEW store binaries of same runtime exist',()=>{
  const attestation=env=>validateOtaPublishAttestation({channel:'production',expoVersion:'1.7.3',env});
  assert(attestation({}).includes('MOBILE_OTA_PRODUCTION_REQUIRES_BOTH_STORES_PUBLISHED'));
  assert(attestation({GAFUS_MOBILE_NATIVE_STORES_PUBLISHED:'true',
    GAFUS_MOBILE_NATIVE_PUBLISHED_VERSION:'1.7.2'})
    .includes('MOBILE_OTA_PUBLISHED_VERSION_MUST_MATCH_RUNTIME'));
  assert.deepEqual(attestation({GAFUS_MOBILE_NATIVE_STORES_PUBLISHED:'true',
    GAFUS_MOBILE_NATIVE_PUBLISHED_VERSION:'1.7.3'}),[]);
  assert.deepEqual(validateOtaPublishAttestation({channel:'preview',expoVersion:'1.7.3',env:{}}),[]);
});
test('OTA CLI channel must be explicit, not silently production',()=>{
  assert.equal(parseOtaChannel(['--channel','production']),'production');
  assert.equal(parseOtaChannel(['--channel=preview']),'preview');
  assert.equal(parseOtaChannel([]),'');
});
