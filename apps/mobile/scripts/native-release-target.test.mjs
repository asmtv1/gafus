import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {validateRegisteredTarget,mobileRoot} from './native-release-target.mjs';
import {assertEmbeddedAndroidOtaConfig} from './native-generated-config.mjs';
const certificatePem='test public certificate';
const sha='a'.repeat(40);
const target=(platform,distribution,appVersion='9.8.7',environment='production')=>({
  id:crypto.randomUUID(),appId:'gafus',bundleId:'ru.gafus.app',platform,distribution,environment,channel:environment,
  appVersion,runtimeVersion:appVersion,buildNumber:'98701',sourceSha:sha,nativeFingerprint:'f'.repeat(64),
  signingKeyId:'future-key',certificatePem,certificateSha256:crypto.createHash('sha256').update(certificatePem).digest('hex'),
  updateUrl:environment==='production'?'https://gafus.ru/ota/manifest':'https://preview.gafus.ru/ota/manifest',verified:false,
});
const expectTarget=d=>({platform:d.platform,distribution:d.distribution,appVersion:d.appVersion,sourceSha:sha,certificatePem,environment:d.environment});
test('same descriptor validation supports future iOS Android and all release distributions',()=>{
  for(const [p,dist,env] of [['ios','app-store','production'],['ios','internal','production'],['ios','testflight','preview'],
    ['android','google-play','production'],['android','rustore','production'],['android','internal','preview']]){
    const d=target(p,dist,'9.8.7',env);
    assert.equal(validateRegisteredTarget(d,expectTarget(d)),d);
  }
});
test('cross-store, old runtime, source, certificate and remote OTA mismatch fail closed',()=>{
  const d=target('android','rustore');
  for(const change of [{platform:'ios'},{distribution:'google-play'},{runtimeVersion:'1.7.5'},{sourceSha:'c'.repeat(40)},
    {certificateSha256:'c'.repeat(64)},{updateUrl:'https://u.expo.dev/ota/manifest'},{verified:true},{buildNumber:'0'}]){
    assert.throws(()=>validateRegisteredTarget({...d,...change},expectTarget(d)),/NATIVE_RELEASE_/);
  }
});
test('generic embedded verification uses future descriptor not 1.7.5',()=>{
  const d=target('android','internal','9.8.7');
  const config={version:d.appVersion,updates:{url:d.updateUrl,fallbackToCacheTimeout:60000},
    android:{versionCode:Number(d.buildNumber)},extra:{otaTransport:'self-hosted',otaEnvironment:d.environment,
      otaChannel:d.channel,otaNativeFingerprint:d.nativeFingerprint,otaNativeReleaseId:d.id}};
  assert.doesNotThrow(()=>assertEmbeddedAndroidOtaConfig(config,d));
  assert.throws(()=>assertEmbeddedAndroidOtaConfig({...config,version:'1.7.5'},d),/VERSION_MISMATCH/);
  assert.throws(()=>assertEmbeddedAndroidOtaConfig({...config,extra:{...config.extra,otaNativeReleaseId:'other'}},d),/NATIVE_RELEASE_MISMATCH/);
});
test('daily package commands and profile are version independent; historical commands stay separate',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(mobileRoot,'package.json'),'utf8'));
  const eas=JSON.parse(fs.readFileSync(path.join(mobileRoot,'eas.json'),'utf8'));
  for(const key of ['build:ota:android:local','build:ota:ios:local','check:ota:android:local','check:ota:ios:local','native:ios:store:build','native:android:store:check']){
    assert.ok(pkg.scripts[key]);assert.doesNotMatch(pkg.scripts[key],/175|176|1\.7\./);
  }
  assert.equal(eas.build['native-ios-store'].autoIncrement,false);
  assert.equal(eas.build['native-ios-store'].env.EXPO_PUBLIC_APP_VERSION,undefined);
  assert.ok(pkg.scripts['ota:175:check']);
});
