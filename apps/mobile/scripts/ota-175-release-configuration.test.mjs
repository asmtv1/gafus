import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');
const json=filename=>JSON.parse(read(filename));
test('current app runtime follows the new 1.7.6 store version',()=>{
  const expo=json('apps/mobile/app.json').expo;
  assert.equal(expo.version,'1.7.6');
  assert.equal(json('apps/mobile/package.json').version,'1.7.6');
  assert.equal(expo.android.versionCode,17602);
  assert.deepEqual(expo.runtimeVersion,{policy:'appVersion'});
  assert.equal(json('apps/mobile/package.json').dependencies.expo,'57.0.33');
});
test('iOS SecureStore requires a predictable Keychain group across native rebuilds',()=>{
  const expo=json('apps/mobile/app.json').expo;
  assert.equal(expo.ios.bundleIdentifier,'ru.gafus.app');
  assert.deepEqual(expo.ios.entitlements?.['keychain-access-groups'],
    ['$(AppIdentifierPrefix)ru.gafus.app']);
});
test('new signed OTA physical-device test profiles never fall back to EAS or Expo Go',()=>{
  const b=json('apps/mobile/eas.json').build;
  for(const [platform,name] of [['android','ota-175-android-internal'],['ios','ota-175-ios-internal']]) {
    const p=b[name];
    assert.equal(p.channel,'production');
    assert.equal(p.environment,'production');
    assert.equal(p.distribution,'internal');
    assert.notEqual(p.developmentClient,true);
    assert.equal(p.env.GAFUS_OTA_TRANSPORT,'self-hosted');
    assert.equal(p.env.GAFUS_OTA_TARGET_PLATFORM,platform);
    assert.equal(p.env.GAFUS_OTA_LOCAL_DEVICE_TEST,'true');
    assert.equal(p.env.EXPO_PUBLIC_APP_VERSION,'1.7.5');
    assert.notEqual(p.env.EXPO_PUBLIC_ENABLE_TRACER,'true');
    assert.equal(p.env.EXPO_PUBLIC_TELEMETRY_ENABLED,'true');
    assert.equal(p.env.EXPO_PUBLIC_API_BASE_URL,'https://api.gafus.ru');
    assert.equal(p.env.EXPO_PUBLIC_CHAT2_API_ORIGIN,'https://api.gafus.ru');
  }
  assert.equal(b['ota-175-android-internal'].android.buildType,'apk');
  assert.equal(b['ota-175-ios-internal'].ios.simulator,false);
});
test('public manifest and telemetry on the real edge proxy do not fall through SPA',()=>{
  const edge=read('ci-cd/nginx/conf.d/gafus.ru.conf');
  const main=edge.indexOf('server_name gafus.ru www.gafus.ru;',edge.indexOf('listen 443 ssl;'));
  const manifest=edge.indexOf('location = /ota/manifest',main);
  const telemetry=edge.indexOf('location = /ota/telemetry',main);
  const deny=edge.indexOf('location ^~ /ota/',main);
  const spa=edge.indexOf('location / {',main);
  assert(manifest>main && telemetry>main && deny>main && spa>deny);
  for(const start of [manifest,telemetry]) {
    const fragment=edge.slice(start,edge.indexOf('\n    }',start));
    assert.match(fragment,/proxy_pass http:\/\/gafus-api;/);
    assert.match(fragment,/proxy_set_header Cookie ""/);
    assert.match(fragment,/proxy_set_header Authorization ""/);
  }
});
test('application production rollout activates OTA without any automatic update publication',()=>{
  const compose=read('ci-cd/docker/docker-compose.prod.yml');
  assert.match(compose,/MOBILE_OTA_DELIVERY_ENV=\$\{MOBILE_OTA_DELIVERY_ENV:-production\}/);
  const deploy=read('.github/workflows/production-deploy-reusable.yml');
  assert.match(deploy,/MOBILE_OTA_DELIVERY_ENV=production/);
  assert.match(deploy,/MOBILE_OTA_PRODUCTION_MANIFEST_ENABLED/);
  const workflow=YAML.parse(read('.github/workflows/gafus-self-hosted-ota-production.yml'));
  assert.ok(workflow.on.workflow_dispatch);
  assert.equal(workflow.jobs['signed-production'].environment,'ota-production');
  assert.ok(workflow.jobs['signed-production'].steps.at(-1).name.includes('never auto-publish'));
});
