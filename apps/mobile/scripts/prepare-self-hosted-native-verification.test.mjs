import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareNativeVerification,hashNativePackage} from './prepare-self-hosted-native-verification.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-native-artifact-qa-'));
const binary=path.join(root,'signed.ipa');
const payload=Buffer.alloc(1024*1024+24,0x61);
payload.set(Buffer.from([0x50,0x4b,0x03,0x04]),0);
fs.writeFileSync(binary,payload);
const cert=fs.readFileSync(new URL('../ota-public-certificates/gafus-preview-20261114.cert.txt',import.meta.url),'utf8');
const native={id:crypto.randomUUID(),verified:false,environment:'preview',
  channel:'preview',platform:'ios',signingKeyId:'gafus-preview-20261114',
  appId:'gafus',bundleId:'ru.gafus.app',runtimeVersion:'1.8.0',appVersion:'1.8.0',
  sourceSha:'a'.repeat(40),nativeFingerprint:'b'.repeat(64),
  certificatePem:cert,certificateSha256:crypto.createHash('sha256').update(cert).digest('hex'),
  updateUrl:'https://preview-api.gafus.ru/ota/manifest'};
const evidence={physicalDeviceVerified:true,distributionVerified:true,
  operationId:'qa-artifact-device-verified-001',
  reason:'Explicit evidence of IPA device installation and distribution validation',
  reference:'qa-device-session-20261114'};
after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('verification requires explicit human review and hashes the exact native artifact',async()=>{
  const result=await prepareNativeVerification({native,evidence,packageFile:binary});
  assert.equal(result.action,'VERIFY');
  assert.equal(result.evidence.nativeArtifactSha256,crypto.createHash('sha256').update(payload).digest('hex'));
  assert.equal(result.evidence.physicalDeviceVerified,true);
});
test('neither distribution nor physical device verification can be silently invented',async()=>{
  for(const override of [{physicalDeviceVerified:false},{distributionVerified:false},
    {operationId:'short'},{reference:'x'},{reason:'too short'}])
    await assert.rejects(()=>prepareNativeVerification({native,evidence:{...evidence,...override},
      packageFile:binary}),/EXPLICIT_HUMAN_QA_EVIDENCE_REQUIRED/);
});
test('rejects conflicting environment, unknown key, or fully-verified candidate',async()=>{
  for(const override of [{verified:true,embeddedUpdateId:crypto.randomUUID()},{environment:'production'},
    {signingKeyId:'not-our-key'},{id:'invalid'}])
    await assert.rejects(()=>prepareNativeVerification({native:{...native,...override},
      evidence,packageFile:binary}),/UNTRUSTED_NATIVE_DESCRIPTOR/);
});
test('permits explicit legacy embedded-ID backfill for a previously verified native',async()=>{
  const result=await prepareNativeVerification({native:{...native,verified:true,embeddedUpdateId:null},
    evidence,packageFile:binary});
  assert.equal(result.action,'VERIFY');
  assert.equal(result.evidence.nativeArtifactSha256,crypto.createHash('sha256').update(payload).digest('hex'));
});
test('rejects replacing trusted native cert, runtime, origin or app id',async()=>{
  for(const override of [{certificatePem:cert+'\n'},
    {certificateSha256:'a'.repeat(64)}])
    await assert.rejects(()=>prepareNativeVerification({native:{...native,...override},
      evidence,packageFile:binary}),/UNPINNED_NATIVE_CERTIFICATE/);
  for(const override of [{updateUrl:'https://api.gafus.ru/ota/manifest'},
    {updateUrl:'http://preview-api.gafus.ru/ota/manifest'}])
    await assert.rejects(()=>prepareNativeVerification({native:{...native,...override},
      evidence,packageFile:binary}),/UNTRUSTED_NATIVE_MANIFEST_ORIGIN/);
  for(const override of [{appId:'bad'},{appVersion:'1.7.4'},
    {sourceSha:'oops'}])
    await assert.rejects(()=>prepareNativeVerification({native:{...native,...override},
      evidence,packageFile:binary}),/UNTRUSTED_NATIVE_DESCRIPTOR/);
});
test('rejects symlink, non-ZIP bytes, invalid extension and undersized native package',async()=>{
  await assert.rejects(()=>hashNativePackage(binary,'android'),/PACKAGE_PLATFORM_EXTENSION_MISMATCH/);
  const symlink=path.join(root,'link.ipa');fs.symlinkSync(binary,symlink);
  await assert.rejects(()=>hashNativePackage(symlink,'ios'),/PACKAGE_MISSING_OR_TOO_SMALL/);
  const fake=path.join(root,'fake.ipa');fs.writeFileSync(fake,Buffer.alloc(payload.length));
  await assert.rejects(()=>hashNativePackage(fake,'ios'),/INVALID_ZIP_CONTAINER/);
  const small=path.join(root,'small.ipa');fs.writeFileSync(small,Buffer.from('PK\x03\x04fake'));
  await assert.rejects(()=>hashNativePackage(small,'ios'),/PACKAGE_MISSING_OR_TOO_SMALL/);
});
test('hash detects payload modifications and checks Android package extensions',async()=>{
  const first=await hashNativePackage(binary,'ios');
  fs.appendFileSync(binary,Buffer.from('bytes changed'));
  assert.notEqual(await hashNativePackage(binary,'ios'),first);
  const android=path.join(root,'signed.apk');fs.copyFileSync(binary,android);
  assert.equal(await hashNativePackage(android,'android'),await hashNativePackage(binary,'ios'));
});
test('production 1.7.5 Android APK and iOS IPA require real human device attestation',async()=>{
  const prodCert=fs.readFileSync(new URL('../ota-public-certificates/gafus-production-20261115.cert.txt',import.meta.url),'utf8');
  for(const platform of ['android','ios']) {
    const descriptor={...native,environment:'production',channel:'production',platform,
      signingKeyId:'gafus-production-20261115',appVersion:'1.7.5',runtimeVersion:'1.7.5',
      certificatePem:prodCert,certificateSha256:crypto.createHash('sha256').update(prodCert).digest('hex'),
      updateUrl:'https://gafus.ru/ota/manifest'};
    const packageFile=platform==='ios'?binary:path.join(root,'native-prod.apk');
    if(platform==='android')fs.copyFileSync(binary,packageFile);
    const result=await prepareNativeVerification({native:descriptor,evidence,packageFile});
    assert.equal(result.action,'VERIFY');
    assert.match(result.evidence.nativeArtifactSha256,/^[a-f0-9]{64}$/);
    await assert.rejects(()=>prepareNativeVerification({native:descriptor,
      evidence:{...evidence,physicalDeviceVerified:false},packageFile}),/EXPLICIT_HUMAN_QA_EVIDENCE_REQUIRED/);
    await assert.rejects(()=>prepareNativeVerification({native:{...descriptor,appVersion:'1.8.0'},
      evidence,packageFile}),/UNTRUSTED_NATIVE_DESCRIPTOR/);
  }
});

test('embedded symbols receipt must match exact artifact, build, update and immutable delivery records',async()=>{
  const dir=fs.mkdtempSync(path.join(root,'symbols-'));
  fs.chmodSync(dir,0o700);
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  const artifactSha=await hashNativePackage(binary,'ios');
  const updateId=crypto.randomUUID();
  const descriptor={...native,buildNumber:'103'};
  const bytes=Buffer.from(JSON.stringify({version:3,sources:['src/test.ts'],mappings:'AAAA',sourcesContent:[' '.repeat(1500)]}));
  const mapHash=sha(bytes),filename=mapHash+'.map';
  fs.writeFileSync(path.join(dir,filename),bytes,{mode:0o600});
  const manifest={schemaVersion:1,private:true,retentionClass:'release-symbols',environment:'preview',
    platform:'ios',runtimeVersion:'1.8.0',updateId,sourceSha:descriptor.sourceSha,revision:0,
    nativeBuild:'103',nativeArtifactSha256:artifactSha,
    maps:[{filename,sha256:mapHash,sizeBytes:bytes.length,logicalBundle:'main.hbc'}]};
  const manifestBytes=Buffer.from(JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir,'private-symbol-manifest.json'),manifestBytes,{mode:0o600});
  const prefix='symbols/preview/gafus/1.8.0/ios/embedded/103/'+updateId;
  const receipt={state:'IMMUTABLE_PRIVATE_SYMBOLS_VERIFIED',environment:'preview',platform:'ios',
    runtimeVersion:'1.8.0',updateId,sourceSha:descriptor.sourceSha,manifestSha256:sha(manifestBytes),
    report:[{key:prefix+'/'+filename,sha256:mapHash,size:bytes.length,verified:true},
      {key:prefix+'/private-symbol-manifest.json',sha256:sha(manifestBytes),size:manifestBytes.length,verified:true}]};
  const receiptFile=path.join(dir,'private-symbol-delivery-evidence.json');
  fs.writeFileSync(receiptFile,JSON.stringify(receipt),{mode:0o600});
  const input={native:descriptor,packageFile:binary,evidence:{...evidence,embeddedUpdateId:updateId},symbolsDirectory:dir};
  const result=await prepareNativeVerification(input);
  assert.equal(result.evidence.embeddedSymbolsRef,'symbols-s3:'+sha(manifestBytes));
  // Run the documented entry point from outside its source directory.
  const descriptorFile=path.join(dir,'descriptor.json'), evidenceFile=path.join(dir,'evidence.json');
  const out=path.join(dir,'verification.json');
  fs.writeFileSync(descriptorFile,JSON.stringify(descriptor),{mode:0o600});
  fs.writeFileSync(evidenceFile,JSON.stringify(input.evidence),{mode:0o600});
  const cli=fileURLToPath(new URL('./prepare-self-hosted-native-verification.mjs',import.meta.url));
  const report=JSON.parse(execFileSync(process.execPath,[cli,descriptorFile,binary,evidenceFile,out,dir],{
    cwd:root,env:{...process.env,SYMBOLS_UPLOAD_EXECUTE:'0'},encoding:'utf8'}));
  assert.equal(report.state,'NATIVE_QA_ATTESTATION_PREPARED_FOR_ADMIN_REVIEW');
  assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),result);
  assert.equal(fs.statSync(out).mode&0o077,0);
  fs.chmodSync(receiptFile,0o644);
  await assert.rejects(()=>prepareNativeVerification(input),/EMBEDDED_SYMBOL_RECEIPT_INSECURE/);
  fs.chmodSync(receiptFile,0o600);
  fs.chmodSync(path.join(dir,filename),0o644);
  await assert.rejects(()=>prepareNativeVerification(input),/SYMBOLS_PRIVATE_MAP_INSECURE/);
  fs.chmodSync(path.join(dir,filename),0o600);
  await assert.rejects(()=>prepareNativeVerification({...input,native:{...descriptor,buildNumber:'104'}}),/EMBEDDED_SYMBOL_SCOPE_MISMATCH/);
  await assert.rejects(()=>prepareNativeVerification({...input,evidence:{...input.evidence,embeddedUpdateId:crypto.randomUUID()}}),/EMBEDDED_SYMBOL_SCOPE_MISMATCH/);
  fs.writeFileSync(receiptFile,JSON.stringify({...receipt,report:receipt.report.map(r=>({...r,verified:false}))}));
  await assert.rejects(()=>prepareNativeVerification(input),/EMBEDDED_SYMBOL_RECEIPT_MISMATCH/);
});
