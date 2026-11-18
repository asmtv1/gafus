import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {validateStoreProfile,validateStoreDescriptor,parseRemoteVersion,verifyIpa,verifyAppleStoreProvisioningProfile,expectedEasIgnore} from './ota-175-ios-store.mjs';
import {applyNativeSelfHostedProfile} from './self-hosted-native-profile.cjs';
const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const eas=JSON.parse(fs.readFileSync(path.join(mobile,'eas.json')));
const app=JSON.parse(fs.readFileSync(path.join(mobile,'app.json'))).expo;
const pem=fs.readFileSync(path.join(mobile,'ota-public-certificates/gafus-production-20261115.cert.txt'),'utf8');
const sha='b'.repeat(40);
const native=()=>({id:crypto.randomUUID(),appId:'gafus',platform:'ios',distribution:'app-store',
  environment:'production',channel:'production',bundleId:'ru.gafus.app',appVersion:'1.7.5',
  runtimeVersion:'1.7.5',buildNumber:'97',updateUrl:'https://gafus.ru/ota/manifest',
  signingKeyId:'gafus-production-20261115',nativeFingerprint:'a'.repeat(64),
  certificatePem:pem,certificateSha256:crypto.createHash('sha256').update(pem).digest('hex'),
  sourceSha:sha,verified:false});

test('dedicated Store EAS profile is production only, not internal and never auto increments',()=>{
  assert.equal(validateStoreProfile(eas,app).distribution,'store');
  for(const mod of [
    (e)=>{e.build['ota-175-ios-store'].distribution='internal'},
    (e)=>{e.build['ota-175-ios-store'].autoIncrement=true},
    (e)=>{e.build['ota-175-ios-store'].env.GAFUS_OTA_TRANSPORT='eas'},
    (e)=>{e.cli.appVersionSource='local'},
    (e)=>{e.build['ota-175-ios-store'].env.GAFUS_OTA_LOCAL_DEVICE_TEST='true'}]){
    const e=structuredClone(eas);mod(e);
    assert.throws(()=>validateStoreProfile(e,app),/OTA_175_IOS_STORE_/);
  }
});

test('iOS widgets CocoaPods uses the same SDK 57 autolinker as Expo, not the hoisted SDK 55 one',()=>{
  const require=createRequire(import.meta.url);
  const widgetsRoot=path.dirname(require.resolve('expo-widgets/package.json',{paths:[mobile]}));
  const widgetPodScript=fs.readFileSync(path.join(widgetsRoot,'scripts/autolinking.rb'),'utf8');
  const expoPackage=require.resolve('expo/package.json',{paths:[mobile]});
  const correctAutolinker=require.resolve('expo-modules-autolinking/package.json',{paths:[expoPackage]});
  assert.equal(require(correctAutolinker).version.split('.')[0],'57');
  assert.match(widgetPodScript,/require\.resolve\('expo-modules-autolinking\/package\.json', \{ paths: \[require\.resolve\('expo\/package\.json'\)\] \}\)/);
  const patch=fs.readFileSync(path.join(mobile,'../../patches/expo-widgets@57.0.28.patch'),'utf8');
  assert.match(patch,/diff --git a\/scripts\/autolinking\.rb b\/scripts\/autolinking\.rb/);
});

test('Store prepare requires explicit new build number; no reuse of a registered failed candidate',()=>{
  const result=spawnSync(process.execPath,[path.join(mobile,'scripts/ota-175-ios-store.mjs'),'prepare'],
    {cwd:mobile,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/BUILD_NUMBER_REQUIRED/);
});

test('Store candidate is immutable and matches admin registration trust and build number',()=>{
  const v=native();assert.equal(validateStoreDescriptor(v,sha,pem),v);
  for(const patch of [{verified:true},{distribution:'internal'},{updateUrl:'https://u.expo.dev/123'},
    {sourceSha:'c'.repeat(40)},{buildNumber:'0'},{nativeFingerprint:'f'.repeat(64),
      certificateSha256:'c'.repeat(64)}]){
    assert.throws(()=>validateStoreDescriptor({...v,...patch},sha,pem),/REGISTERED_DESCRIPTOR_INVALID|CERTIFICATE_MISMATCH/);
  }
});

test('Store native local bypass allows only explicit Store iOS build and keeps production CI gate otherwise',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ios-store-ota-test-'));
  try{
    fs.mkdirSync(path.join(dir,'.ota-certs'));
    fs.writeFileSync(path.join(dir,'.ota-certs/native.pem'),pem);
    fs.writeFileSync(path.join(dir,'.ota-certs/ios-store-native.json'),JSON.stringify(native()));
    const env={APP_ENV:'production',GAFUS_OTA_TRANSPORT:'self-hosted',
      GAFUS_OTA_TARGET_PLATFORM:'ios',GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:'.ota-certs/ios-store-native.json',
      GAFUS_OTA_NATIVE_CERTIFICATE:'.ota-certs/native.pem'};
    const simple={version:'1.7.5',runtimeVersion:{policy:'appVersion'},updates:{}};
    assert.throws(()=>applyNativeSelfHostedProfile(simple,{appRoot:dir,environment:env}),
      /SELF_HOSTED_PRODUCTION_REQUIRES_APPROVED_CI/);
    const applied=applyNativeSelfHostedProfile(simple,{appRoot:dir,
      environment:{...env,GAFUS_OTA_LOCAL_STORE_BUILD:'true'}});
    assert.equal(applied.ios.buildNumber,'97');
    assert.equal(applied.updates.url,'https://gafus.ru/ota/manifest');
    assert.equal(applied.updates.checkAutomatically,'NEVER');
    assert.equal(applied.updates.codeSigningMetadata.keyid,'gafus-production-20261115');
    assert.equal(applied.updates.requestHeaders['x-gafus-native-fingerprint'],'a'.repeat(64));
    const bad=native();bad.distribution='internal';
    fs.writeFileSync(path.join(dir,'.ota-certs/ios-store-native.json'),JSON.stringify(bad));
    assert.throws(()=>applyNativeSelfHostedProfile(simple,{appRoot:dir,
      environment:{...env,GAFUS_OTA_LOCAL_STORE_BUILD:'true'}}),/SELF_HOSTED_PRODUCTION_REQUIRES_APPROVED_CI/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('read EAS remote version without silently defaulting to local build number',()=>{
  assert.equal(parseRemoteVersion('{"buildNumber":"97"}'),'97');
  for(const s of ['','{}','{"buildNumber":17504}','{"buildNumber":"0"}','warning\\n{}'])
    assert.throws(()=>parseRemoteVersion(s),/OTA_175_IOS_STORE_/);
});

test('App Store provisioning with NSDate and NSData validates without lossy JSON conversion',()=>{
  const require=createRequire(import.meta.url);
  const plist=require('@expo/plist').default;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ios-store-profile-test-'));
  const file=path.join(dir,'provisioning.plist');
  const original={
    ExpirationDate:new Date('2030-01-01T00:00:00Z'),
    DeveloperCertificates:[Buffer.from([1,2,3,4])],
    Entitlements:{'get-task-allow':false,'application-identifier':'PJQ8PP666S.ru.gafus.app'},
  };
  const verify=(data)=>{fs.writeFileSync(file,plist.build(data));verifyAppleStoreProvisioningProfile(file);};
  try{
    verify(original);
    for(const variation of [
      {ProvisionedDevices:['device-id']},
      {ProvisionsAllDevices:true},
      {Entitlements:{...original.Entitlements,'get-task-allow':true}},
      {Entitlements:{...original.Entitlements,'application-identifier':'PJQ8PP666S.ru.other.app'}},
      {ExpirationDate:new Date('2020-01-01T00:00:00Z')},
    ]){
      assert.throws(()=>verify({...original,...variation}),/IPA_NOT_APP_STORE_DISTRIBUTION/);
    }
    fs.writeFileSync(file,'not a plist');
    assert.throws(()=>verifyAppleStoreProvisioningProfile(file),/IPA_PROVISIONING_PLIST_INVALID/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('actual IPA payload plist inspection validates our signed self-hosted OTA metadata without compiling iOS',()=>{
  const require=createRequire(import.meta.url);
  const plist=require('@expo/plist').default;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-store-ipa-fixture-'));
  try{
    const appDir=path.join(tmp,'Payload','Gafus.app');fs.mkdirSync(appDir,{recursive:true});
    fs.writeFileSync(path.join(appDir,'Info.plist'),plist.build({
      CFBundleIdentifier:'ru.gafus.app',CFBundleShortVersionString:'1.7.5',CFBundleVersion:'97'}));
    const d=native();
    fs.writeFileSync(path.join(appDir,'Expo.plist'),plist.build({
      EXUpdatesRuntimeVersion:'1.7.5',EXUpdatesURL:'https://gafus.ru/ota/manifest',
      EXUpdatesCheckOnLaunch:'NEVER',EXUpdatesRequestHeaders:{'expo-channel-name':'production',
        'x-gafus-native-fingerprint':d.nativeFingerprint},
      EXUpdatesCodeSigningCertificate:pem,EXUpdatesCodeSigningMetadata:{
        keyid:d.signingKeyId,alg:'rsa-v1_5-sha256'}}));
    fs.writeFileSync(path.join(appDir,'dummy.payload'),Buffer.alloc(11_000_000));
    const ipa=path.join(tmp,'test.ipa');
    const zip=spawnSync('zip',['-0','-q','-r',ipa,'Payload'],{cwd:tmp});
    assert.equal(zip.status,0,zip.stderr?.toString());
    const result=verifyIpa(ipa,d,{metadataOnly:true});
    assert.equal(result.version,'1.7.5');
    assert.equal(result.buildNumber,'97');
    assert.equal(result.otaUrl,'https://gafus.ru/ota/manifest');
    assert.match(result.sha256,/^[a-f0-9]{64}$/);
    assert.throws(()=>verifyIpa(ipa,d),/IPA_APPLE_CODESIGN_INVALID/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});


test('EAS archive mirrors nested ignore protections and pins only two public OTA trust files',()=>{
  const gitRoot=path.resolve(mobile,'../..');
  const actual=fs.readFileSync(path.join(gitRoot,'.easignore'),'utf8');
  assert.equal(actual,expectedEasIgnore());
  for(const pathName of ['infra/feed/.gitignore','apps/trainer-panel/.gitignore',
    'scripts/refactor/local-development-data-inbox/.gitignore'])
    assert(actual.includes(`# From ${pathName}`));
  assert.match(actual,/!apps\/mobile\/\.ota-certs\/native\.pem/);
  assert.match(actual,/!apps\/mobile\/\.ota-certs\/ios-store-native\.json/);
  assert.match(actual,/apps\/mobile\/\.ota-certs\/\*/);
  const nativeServer=fs.readFileSync(path.join(gitRoot,
    'packages/mobile-ota-server/src/native-release-admin.ts'),'utf8');
  assert.match(nativeServer,/"app-store"/);
  assert.match(fs.readFileSync(path.join(mobile,'scripts/prepare-self-hosted-native-build.mjs'),'utf8'),
    /\['app-store'\]/);
});
