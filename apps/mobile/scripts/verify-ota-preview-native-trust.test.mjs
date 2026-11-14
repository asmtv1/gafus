import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyPreviewNativeTrust,PREVIEW_SIGNING_KEY_ID} from './verify-ota-preview-native-trust.mjs';
const dirname=path.dirname(fileURLToPath(import.meta.url));
const cert=fs.readFileSync(path.join(dirname,'../ota-public-certificates/gafus-preview-20261114.cert.txt'),'utf8');
const sha=crypto.createHash('sha256').update(cert).digest('hex');
const sourceSha='c'.repeat(40);
const origin='https://preview-api.gafus.ru';
const native={id:crypto.randomUUID(),appId:'gafus',bundleId:'ru.gafus.app',
  verified:true,environment:'preview',channel:'preview',platform:'ios',
  appVersion:'1.8.0',runtimeVersion:'1.8.0',sourceSha,
  updateUrl:`${origin}/ota/manifest`,signingKeyId:PREVIEW_SIGNING_KEY_ID,
  certificatePem:cert,certificateSha256:sha,nativeFingerprint:'a'.repeat(64)};
const valid={native,sourceSha,runtime:'1.8.0',platform:'ios',
  apiOrigin:origin,chatOrigin:origin,certificatePem:cert};
const bad=(override,error)=>assert.throws(()=>verifyPreviewNativeTrust({...valid,...override}),new RegExp(error));
test('real preview public certificate is trusted only for exact native key ID and preview domain',()=>{
  const actual=verifyPreviewNativeTrust(valid);
  assert.equal(actual.state,'OTA_PREVIEW_NATIVE_TRUST_PINNED');
  assert.equal(actual.certificateSha256,sha);
  assert.equal(actual.apiOrigin,origin);
});
test('preview must have physically verified native binary, exact SHA and compatible runtime',()=>{
  for(const override of [{verified:false},{sourceSha:'d'.repeat(40)},
    {runtimeVersion:'1.7.4'},{appId:'test'},{platform:'android'},
    {nativeFingerprint:'bad'}, {channel:'production'},{environment:'production'}])
    bad({native:{...native,...override}},'NATIVE_RELEASE_MISMATCH');
  bad({sourceSha:'d'.repeat(40)},'NATIVE_RELEASE_MISMATCH');
  bad({runtime:'1.7.4'},'NATIVE_RELEASE_MISMATCH');
});
test('production and arbitrary or malformed preview API origin are rejected',()=>{
  for(const badOrigin of ['http://preview-api.gafus.ru','https://api.gafus.ru',
    'https://gafus.ru','https://evil.test','https://preview-api.gafus.ru:444',
    'https://preview-api.gafus.ru/path','https://preview-api.gafus.ru?x=1'])
    bad({apiOrigin:badOrigin},'API_ORIGIN_UNTRUSTED');
  bad({chatOrigin:'https://other-preview.gafus.ru'},'CHAT_API_ORIGIN_MISMATCH');
  bad({native:{...native,updateUrl:'https://evil.example/ota/manifest'}},'MANIFEST_ORIGIN_MISMATCH');
});
test('different certificate, byte format and signing key ID never pass the pin',()=>{
  bad({native:{...native,signingKeyId:'other'}},'SIGNING_KEY_ID_UNPINNED');
  bad({native:{...native,certificatePem:cert+'\n'}},'CERTIFICATE_NOT_PINNED');
  bad({native:{...native,certificateSha256:'d'.repeat(64)}},'CERTIFICATE_NOT_PINNED');
  bad({certificatePem:cert+'\n'},'CERTIFICATE_NOT_PINNED');
});
test('expired or nearly-expired signing trust must be rotated before release',()=>{
  const validTo=Date.parse(new crypto.X509Certificate(cert).validTo);
  bad({now:validTo-29*86400_000},'CERTIFICATE_EXPIRING');
  bad({now:Date.parse(new crypto.X509Certificate(cert).validFrom)-5000},'CERTIFICATE_EXPIRING');
});
