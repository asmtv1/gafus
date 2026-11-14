const {test}=require('node:test');
const {strict:assert}=require('node:assert');
const {withObservePreviewExperiment}=require('./observe-preview-config.cjs');
const fakeInstalled={resolveObservePackage:()=>'/private/node_modules/expo-observe/package.json'};
const release=()=>({
 version:'1.8.0',runtimeVersion:{policy:'appVersion'},
 plugins:['expo-video','./plugins/withAppTracerNative','expo-location'],
 updates:{url:'https://preview.example.test/ota/manifest'},
 extra:{eas:{projectId:'6c36fab5-6226-450f-8ee5-64e9beeea7db'},
  otaEnvironment:'preview',otaTransport:'self-hosted',otaChannel:'preview'},
});
test('default observe path leaves native config untouched',()=>{
 const native=release();assert.equal(withObservePreviewExperiment(native,{}),native);
});
test('verified preview installs GAFUS-only native endpoint and removes AppTracer hook',()=>{
 const result=withObservePreviewExperiment(release(),{GAFUS_OBSERVE_EXPERIMENT:'true',GAFUS_OTA_TRANSPORT:'self-hosted',EXPO_PUBLIC_API_BASE_URL:'https://api.gafus.ru'},fakeInstalled);
 assert.equal(result.extra.eas.observe.endpointUrl,'https://api.gafus.ru/api/v1/telemetry/observe');
 assert(!result.plugins.includes('./plugins/withAppTracerNative'));
 assert.equal(result.extra.observeExperiment,true);
});
test('production, SDK55 and alternate OTA endpoints fail closed',()=>{
 for(const update of [
   {extra:{...release().extra,otaEnvironment:'production'}},
   {version:'1.7.4'},
   {updates:{url:'https://gafus.ru/ota/manifest'}},
   {updates:{url:'http://preview.example.test/ota/manifest'}},
 ]){
  assert.throws(()=>withObservePreviewExperiment({...release(),...update},{GAFUS_OBSERVE_EXPERIMENT:'true',GAFUS_OTA_TRANSPORT:'self-hosted',EXPO_PUBLIC_API_BASE_URL:'https://api.gafus.ru'}),
    /OBSERVE_EXPERIMENT/);
 }
});

test('preview build rejects missing Expo Observe native module instead of silently using Expo servers',()=>{
 assert.throws(()=>withObservePreviewExperiment(release(),{
  GAFUS_OBSERVE_EXPERIMENT:'true',
  GAFUS_OTA_TRANSPORT:'self-hosted',
  EXPO_PUBLIC_API_BASE_URL:'https://api.gafus.ru',
 }), /OBSERVE_EXPERIMENT_REQUIRES_EXPO_OBSERVE_NATIVE_DEPENDENCY/);
});
