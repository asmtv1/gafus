const {test}=require('node:test');
const assert=require('node:assert/strict');
const {withGafusNativeCrashCapture,ENDPOINT}=require('./native-crash-uptrace-config.cjs');
const opts={resolveObservePackage:()=>'/private/node_modules/expo-observe/package.json',packageMetadata:()=>({version:'57.0.28'})};
const release=(environment='production')=>({
  version:'1.7.5',runtimeVersion:{policy:'appVersion'},
  updates:{url:'https://api.gafus.ru/ota/manifest'},
  extra:{eas:{projectId:'6c36fab5-6226-450f-8ee5-64e9beeea7db'},
   otaEnvironment:environment,otaTransport:'self-hosted',otaChannel:environment},
});
const env=(environment='production')=>({
  GAFUS_OTA_TRANSPORT:'self-hosted',APP_ENV:environment,
  EXPO_PUBLIC_TELEMETRY_ENABLED:'true',EXPO_PUBLIC_API_BASE_URL:'https://api.gafus.ru',
});
test('native Observe points to the GAFUS API even when telemetry is disabled',()=>{
 const result=withGafusNativeCrashCapture(release(),{},opts);
 assert.equal(result.extra.eas.observe.endpointUrl,ENDPOINT);
 assert.equal(result.extra.nativeCrashSink,'gafus-uptrace');
 assert(!JSON.stringify(result).includes('api.expo.dev'));
});
test('signed iOS and Android release metadata keep one fixed production/preview endpoint',()=>{
 for(const channel of ['production','preview']) {
  const r=withGafusNativeCrashCapture(release(channel),env(channel),opts);
  assert.equal(r.extra.eas.observe.endpointUrl,'https://api.gafus.ru/api/v1/telemetry/observe');
 }
});
test('missing module, stale SDK, invalid project or untrusted release fails closed',()=>{
 for(const [config,environment,options] of [
  [release(),env(),{resolveObservePackage:()=>{throw Error('missing')}}],
  [release(),env(),{...opts,packageMetadata:()=>({version:'57.0.20'})}],
  [{...release(),extra:{eas:{projectId:'other'}}},env(),opts],
  [release(),{...env(),EXPO_PUBLIC_API_BASE_URL:'https://evil.example'},opts],
  [release('preview'),env('production'),opts],
 ])assert.throws(()=>withGafusNativeCrashCapture(config,environment,options),/NATIVE_CRASH_/);
});

test('installed SDK57 autolinks native crash capture on BOTH Apple and Android',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const root=path.resolve(__dirname,'..');
 const pkg=require(require.resolve('expo-observe/package.json',{paths:[root]}));
 const filename=path.join(path.dirname(require.resolve('expo-observe/package.json',{paths:[root]})),'expo-module.config.json');
 const native=JSON.parse(fs.readFileSync(filename,'utf8'));
 assert.match(pkg.version,/^57\.0\.\d+$/);
 assert.deepEqual(native.platforms.sort(),['android','apple']);
 assert(native.apple.modules.includes('ObserveModule'));
 assert(native.apple.appDelegateSubscribers.includes('ObserveAppDelegateSubscriber'));
 assert(native.android.modules.includes('expo.modules.observe.ObserveModule'));
 const deps=require(path.join(root,'package.json')).dependencies;
 assert.match(deps['expo-observe'],/^~57\.0\.\d+$/);
 assert.equal(deps['@apptracer/sdk'],undefined);
});
