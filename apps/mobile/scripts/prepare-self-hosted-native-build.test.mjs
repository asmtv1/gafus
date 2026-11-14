import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareNativeCandidate,finalizeNativeBuild} from './prepare-self-hosted-native-build.mjs';
import {applyNativeSelfHostedProfile} from './self-hosted-native-profile.cjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-native-preview-prebuild-'));
const run=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const write=(p,value)=>{const abs=path.join(root,p);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,value)};
const cert=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),
  '../ota-public-certificates/gafus-preview-20261114.cert.txt'),'utf8');
run(['init','--quiet']);run(['config','user.name','Native QA']);run(['config','user.email','native-qa@example.invalid']);
write('pnpm-lock.yaml','lockfileVersion: "9.0"\n');
write('apps/mobile/app.json',JSON.stringify({expo:{version:'1.8.0',runtimeVersion:{policy:'appVersion'}}}));
write('apps/mobile/package.json',JSON.stringify({version:'1.8.0'}));
for(const n of ['app.config.js','eas.json','metro.config.js','babel.config.js','expo-env.d.ts'])
  write(`apps/mobile/${n}`,`// immutable native source ${n}\n`);
write('apps/mobile/plugins/example.cjs','module.exports = {};\n');
run(['add','.']);run(['commit','--quiet','-m','clean-native-snapshot']);
const sourceSha=run(['rev-parse','HEAD']);
const cfg={platform:'ios',distribution:'internal',sourceSha,buildNumber:'187',
  operationId:'build-preview-ota-register-0001',
  apiOrigin:'https://preview-api.gafus.ru',ciRunId:'native-local-qa-1234',
  buildLogRef:'native-local-build-qa-before-artifact'};
const make=(config=cfg)=>prepareNativeCandidate({root,config,certificatePem:cert});
const nativeId=crypto.randomUUID();
after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('prepare creates an admin-registerable native record WITHOUT impossible prebuild IPA SHA',()=>{
  const result=make();const c=result.candidate;
  assert.equal(c.runtimeVersion,'1.8.0');
  assert.equal(c.verified,undefined);
  assert.equal(c.provenance.nativeArtifactSha256,undefined);
  assert.equal(c.certificatePem,cert);
  assert.match(c.nativeFingerprint,/^[0-9a-f]{64}$/);
  assert(result.fileCount>=8);
  assert.equal(make().candidate.nativeFingerprint,c.nativeFingerprint);
});
test('finalize requires server-issued ID and reproduces same native fingerprint',()=>{
  const candidate=make().candidate;
  const native=finalizeNativeBuild({root,candidate,nativeId,certificatePem:cert});
  assert.equal(native.id,nativeId);
  assert.equal(native.verified,false);
  assert.equal(native.nativeFingerprint,candidate.nativeFingerprint);
  assert.equal(native.signingKeyId,'gafus-preview-20261114');
  assert.equal(native.updateUrl,'https://preview-api.gafus.ru/ota/manifest');
  assert.equal(native.certificateSha256,crypto.createHash('sha256').update(cert).digest('hex'));
  write('apps/mobile/.ota-certs/preview.pem',cert);
  const descriptorPath=path.join(root,'native.json');
  fs.writeFileSync(descriptorPath,JSON.stringify(native));
  const config={version:'1.8.0',runtimeVersion:{policy:'appVersion'},updates:{}};
  const applied=applyNativeSelfHostedProfile(config,{appRoot:path.join(root,'apps/mobile'),
    environment:{GAFUS_OTA_TRANSPORT:'self-hosted',GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:descriptorPath,
      GAFUS_OTA_NATIVE_CERTIFICATE:'.ota-certs/preview.pem',GAFUS_OTA_TARGET_PLATFORM:'ios'}});
  assert.equal(applied.updates.codeSigningMetadata.keyid,'gafus-preview-20261114');
  assert.equal(applied.extra.otaNativeReleaseId,nativeId);
  assert.equal(applied.updates.checkAutomatically,'NEVER');
  fs.rmSync(path.join(root,'apps/mobile/.ota-certs'),{recursive:true});
  fs.unlinkSync(descriptorPath);
});
test('rejects dirty checkout, untracked native modifications and stale source SHA',()=>{
  write('apps/mobile/plugins/new.cjs','module.exports=1;\n');
  assert.throws(()=>make(),/DIRTY_CHECKOUT/);
  fs.rmSync(path.join(root,'apps/mobile/plugins/new.cjs'));
  assert.throws(()=>make({...cfg,sourceSha:'a'.repeat(40)}),/SOURCE_SHA_MISMATCH/);
});
test('rejects production endpoint, incorrect runtime, platform and untrusted provenance',()=>{
  for(const o of [{apiOrigin:'https://api.gafus.ru'},
    {apiOrigin:'https://preview-api.gafus.ru/mismatch'},
    {apiOrigin:'https://example.invalid'},
    {distribution:'app-store'},{platform:'windows'},
    {operationId:'too-short'},{ciRunId:''},{buildNumber:'4.2'}])
    assert.throws(()=>make({...cfg,...o}),/OTA_PREVIEW_BUILD_/);
});
test('finalize refuses changed candidate and refuses unrelated signing certificates',()=>{
  const candidate=make().candidate;
  assert.throws(()=>finalizeNativeBuild({root,candidate,nativeId:'not-uuid',certificatePem:cert}),/INVALID_NATIVE_ID/);
  assert.throws(()=>finalizeNativeBuild({root,candidate:{...candidate,sourceSha:'a'.repeat(40)},nativeId,certificatePem:cert}),/SOURCE_SHA_MISMATCH/);
  assert.throws(()=>finalizeNativeBuild({root,candidate:{...candidate,nativeFingerprint:'b'.repeat(64)},nativeId,certificatePem:cert}),/CANDIDATE_CHANGED/);
  assert.throws(()=>finalizeNativeBuild({root,candidate,nativeId,certificatePem:cert+'\n'}),/UNTRUSTED_CANDIDATE/);
});
