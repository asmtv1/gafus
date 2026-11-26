import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeEnv,matches,targets} from './mobile-build.mjs';
const a={version:'1.7.6',android:{versionCode:17603}};
const head='a'.repeat(40);
const d={platform:'android',distribution:'google-play',environment:'production',channel:'production',verified:false,updateUrl:'https://gafus.ru/ota/manifest',appVersion:'1.7.6',runtimeVersion:'1.7.6',buildNumber:'17603',sourceSha:head,nativeFingerprint:'b'.repeat(64),id:'8628a29d-1993-4dbb-80d0-783e0faf4b2a'};
test('Google Play descriptor binds version, source and target; reject RuStore, stale and verified',()=>{
 assert.equal(matches(d,targets.play,a,head),true);
 assert.equal(matches(d,targets.rustore,a,head),false);
 for(const patch of [{buildNumber:'17602'},{sourceSha:'c'.repeat(40)},{runtimeVersion:'1.7.5'},{verified:true},{updateUrl:'https://u.expo.dev/fake'},{environment:'preview'}])assert.equal(matches({...d,...patch},targets.play,a,head),false);
});
test('production forces standard payment and correct env, not stale overrides',()=>{
 const e=composeEnv({PATH:'/bin',GAFUS_OTA_TRANSPORT:'eas',OTA_PAYMENT_CONTENT:'android-rustore-yookassa',EXPO_PUBLIC_APP_VERSION:'0.0.0'},{EXPO_PUBLIC_API_BASE_URL:'http://wrong',EXPO_PUBLIC_APP_VERSION:'1.7.1',EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG:'1',EXPO_PUBLIC_REWARDED_ADS_TEST_MODE:'true',EXPO_PUBLIC_YM_MOBILE_API_KEY:'public',PRIVATE_DB_PASSWORD:'not-exported'},true,'1.7.6');
 assert.equal(e.APP_ENV,'production');assert.equal(e.GAFUS_OTA_TRANSPORT,'self-hosted');assert.equal(e.OTA_PAYMENT_CONTENT,'standard');assert.equal(e.EXPO_PUBLIC_APP_VERSION,'1.7.6');assert.equal(e.EXPO_PUBLIC_API_BASE_URL,'https://api.gafus.ru');assert.equal(e.EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG,'0');assert.equal(e.EXPO_PUBLIC_REWARDED_ADS_TEST_MODE,'false');assert.equal(e.EXPO_PUBLIC_YM_MOBILE_API_KEY,'public');assert.equal(e.PRIVATE_DB_PASSWORD,undefined);
});
test('debug does not inherit store credentials or production OTA',()=>{
 const e=composeEnv({PATH:'/bin',GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR:'store.json'}, {},false,'1.7.6');
 assert.equal(e.APP_ENV,'development');assert.equal(e.EXPO_PUBLIC_REWARDED_ADS_TEST_MODE,'true');assert.equal(e.GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR,undefined);
});
test('iOS descriptor is not restricted to Android versionCode',()=>{
 const v={...d,platform:'ios',distribution:'app-store',buildNumber:'101'};assert.equal(matches(v,targets.appstore,a,head),true);assert.equal(matches(v,targets.play,a,head),false);
});
