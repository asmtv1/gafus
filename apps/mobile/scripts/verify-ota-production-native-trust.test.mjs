import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {verifyProductionNativeTrust,PRODUCTION_CERT_PATH} from './verify-ota-production-native-trust.mjs';
import {PRODUCTION_SIGNING_KEY_ID} from './prepare-self-hosted-native-build.mjs';
const pem=fs.readFileSync(PRODUCTION_CERT_PATH,'utf8');
const sourceSha='a'.repeat(40),runtime='1.7.5';
const native={id:'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',verified:true,
 appId:'gafus',bundleId:'ru.gafus.app',environment:'production',channel:'production',
 platform:'android',runtimeVersion:runtime,appVersion:runtime,sourceSha,
 nativeFingerprint:'b'.repeat(64),updateUrl:'https://gafus.ru/ota/manifest',
 signingKeyId:PRODUCTION_SIGNING_KEY_ID,certificatePem:pem,
 certificateSha256:crypto.createHash('sha256').update(pem).digest('hex')};
const args={native,sourceSha,runtime,platform:'android',certificatePem:pem};
test('production 1.7.5 OTA trusts only matching signed native release',()=>{
 assert.equal(verifyProductionNativeTrust(args).runtime,runtime);
});
test('native runtime, host, channel, fingerprint and certificate mismatch fail closed',()=>{
 for(const [key,value] of [['runtimeVersion','1.8.0'],['environment','preview'],
   ['channel','preview'],['updateUrl','https://api.gafus.ru/ota/manifest'],
   ['nativeFingerprint','a'],['signingKeyId','gafus-preview-20261114'],['verified',false]])
  assert.throws(()=>verifyProductionNativeTrust({...args,native:{...native,[key]:value}}),/OTA_PRODUCTION_TRUST_/);
 assert.throws(()=>verifyProductionNativeTrust({...args,certificatePem:pem+'\n'}),/CERTIFICATE_NOT_PINNED/);
});

test('new JS-only source SHA may follow verified base binary; native fingerprint is a separate check',()=>{
 const candidate={...native,sourceSha:'c'.repeat(40)};
 assert.equal(verifyProductionNativeTrust({...args,native:candidate}).runtime,'1.7.5');
 assert.throws(()=>verifyProductionNativeTrust({...args,native:{...candidate,sourceSha:'bad'}}),/NATIVE_SOURCE_RUNTIME_OR_ENDPOINT_MISMATCH/);
});
