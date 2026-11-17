import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {assertGeneratedNativeOta,assertEmbeddedAndroidOtaConfig} from './build-ota-175-local.mjs';
const require=createRequire(import.meta.url);
const plist=require('@expo/plist').default;
const plan={buildNumber:'17501',signingKeyId:'gafus-production-20261115',nativeFingerprint:'f'.repeat(64)};
const cert='-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n';
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ota-native-check-'));
  const write=(file,data)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data)};
  return {root,write,dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('iOS 1.7.5 embeds signed production manifest, runtime, headers and build number',()=>{
  const f=fixture();
  try {
    f.write('.ota-certs/native.pem',cert);
    f.write('ios/Gafus/Info.plist',plist.build({CFBundleShortVersionString:'1.7.5',CFBundleVersion:plan.buildNumber}));
    const config={EXUpdatesRuntimeVersion:'1.7.5',EXUpdatesURL:'https://gafus.ru/ota/manifest',
      EXUpdatesCheckOnLaunch:'NEVER',EXUpdatesCodeSigningMetadata:{keyid:plan.signingKeyId,alg:'rsa-v1_5-sha256'},
      EXUpdatesCodeSigningCertificate:cert,EXUpdatesRequestHeaders:{'x-gafus-native-fingerprint':plan.nativeFingerprint,'expo-channel-name':'production'}};
    f.write('ios/Gafus/Supporting/Expo.plist',plist.build(config));
    f.write('ios/Gafus.xcodeproj/project.pbxproj',
      'CURRENT_PROJECT_VERSION = 17501;\nPRODUCT_BUNDLE_IDENTIFIER = "ru.gafus.app";\n'.repeat(2));
    assert.doesNotThrow(()=>assertGeneratedNativeOta('ios',plan,f.root));
    config.EXUpdatesURL='https://u.expo.dev/legacy';
    f.write('ios/Gafus/Supporting/Expo.plist',plist.build(config));
    assert.throws(()=>assertGeneratedNativeOta('ios',plan,f.root),/IOS_ENDPOINT_MISMATCH/);
  }finally{f.dispose()}
});
test('Android 1.7.5 embeds signed production manifest, runtime, headers and build number',()=>{
  const f=fixture();
  try {
    f.write('android/app/build.gradle',`versionCode 17501\nversionName "1.7.5"`);
    f.write('android/app/src/main/res/values/strings.xml','<string name="expo_runtime_version">1.7.5</string>');
    const meta=(k,v)=>`<meta-data android:name="expo.modules.updates.${k}" android:value="${v}"/>`;
    const manifest=[meta('EXPO_UPDATE_URL','https://gafus.ru/ota/manifest'),meta('EXPO_UPDATES_CHECK_ON_LAUNCH','NEVER'),
      meta('EXPO_UPDATES_LAUNCH_WAIT_MS','60000'),
      meta('CODE_SIGNING_METADATA',plan.signingKeyId),meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY',`production ${plan.nativeFingerprint}`),
      meta('CODE_SIGNING_CERTIFICATE','-----BEGIN CERTIFICATE-----')].join('\n');
    f.write('android/app/src/main/AndroidManifest.xml',manifest);
    assert.doesNotThrow(()=>assertGeneratedNativeOta('android',plan,f.root));
    f.write('android/app/src/main/AndroidManifest.xml',manifest.replace('EXPO_UPDATES_LAUNCH_WAIT_MS" android:value="60000','EXPO_UPDATES_LAUNCH_WAIT_MS" android:value="0'));
    assert.throws(()=>assertGeneratedNativeOta('android',plan,f.root),/ANDROID_OTA_NETWORK_TIMEOUT_MISMATCH/);
    f.write('android/app/src/main/AndroidManifest.xml',manifest.replace('https://gafus.ru/ota/manifest','https://u.expo.dev/legacy'));
    assert.throws(()=>assertGeneratedNativeOta('android',plan,f.root),/ANDROID_ENDPOINT_MISMATCH/);
  }finally{f.dispose()}
});

test('embedded Android Expo Constants config must carry exact signed OTA identity',()=>{
  const expected={...plan,nativeReleaseId:'015ba79a-8f89-4702-8b9e-000bba34dd7d'};
  const embedded={version:'1.7.5',updates:{url:'https://gafus.ru/ota/manifest',fallbackToCacheTimeout:60000},
    android:{versionCode:17501},extra:{otaTransport:'self-hosted',otaEnvironment:'production',
      otaChannel:'production',otaNativeFingerprint:plan.nativeFingerprint,
      otaNativeReleaseId:expected.nativeReleaseId}};
  assert.doesNotThrow(()=>assertEmbeddedAndroidOtaConfig(embedded,expected));
  const generic={...embedded,updates:{url:'https://u.expo.dev/legacy'},extra:{}};
  assert.throws(()=>assertEmbeddedAndroidOtaConfig(generic,expected),/ENDPOINT_MISMATCH/);
  assert.throws(()=>assertEmbeddedAndroidOtaConfig({...embedded,extra:{}},expected),/TRANSPORT_MISMATCH/);
  assert.throws(()=>assertEmbeddedAndroidOtaConfig({...embedded,android:{versionCode:17502}},expected),/BUILD_NUMBER_MISMATCH/);
  assert.throws(()=>assertEmbeddedAndroidOtaConfig({...embedded,updates:{...embedded.updates,fallbackToCacheTimeout:0}},expected),/NETWORK_TIMEOUT_MISMATCH/);
  assert.throws(()=>assertEmbeddedAndroidOtaConfig({...embedded,extra:{...embedded.extra,otaNativeFingerprint:'0'.repeat(64)}},expected),/FINGERPRINT_MISMATCH/);
});
