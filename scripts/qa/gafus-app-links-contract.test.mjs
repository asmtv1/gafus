import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyGafusAppLinkSource as verify } from './gafus-app-links-contract.mjs';
const read=p=>readFileSync(p,'utf8');
const well='apps/web-vite/public/.well-known/';
const source={
  expo:JSON.parse(read('apps/mobile/app.json')).expo,
  ios:JSON.parse(read(well+'apple-app-site-association')),
  android:JSON.parse(read(well+'assetlinks.json')),
  edge:read('ci-cd/nginx/conf.d/gafus.ru.conf'),
  inner:read('ci-cd/docker/nginx-vite-refactor.conf'),
};
test('both real domains and all native supported routes have strict verified association files',()=>{
  assert.deepEqual(verify(source),[]);
});
test('iOS AASA team identifier must match actual release embedded provisioning profile',()=>{
  const ios=structuredClone(source.ios);
  ios.applinks.details[0].appID='WRONGTEAM.ru.gafus.app';
  assert(verify({...source,ios}).includes('AASA_IOS_SIGNING_ID_NOT_MATCHING_RELEASE_TEAM'));
});
test('Android assetlinks must use a real public SHA-256 signing fingerprint and exact package',()=>{
  const android=structuredClone(source.android);
  android[0].target.sha256_cert_fingerprints=['INSERT_CERT_FINGERPRINT'];
  assert(verify({...source,android}).includes('ASSETLINKS_ANDROID_SIGNER_FINGERPRINT_INVALID'));
  android[0].target.sha256_cert_fingerprints=['AA:'.repeat(31)+'AA'];
  android[0].target.package_name='ru.other.app';
  assert(verify({...source,android}).includes('ASSETLINKS_ANDROID_ID_OR_RELATION_INVALID'));
});
test('a typo in one Android App Links host/path or disabled autoVerify blocks release',()=>{
  for(const changed of [
    {data:[{...source.expo.android.intentFilters[0].data[0],host:'bad.example'}]},
    {autoVerify:false},
    {data:[{...source.expo.android.intentFilters[0].data[0],pathPrefix:'/admin/'}]},
  ]) {
    const expo=structuredClone(source.expo);
    Object.assign(expo.android.intentFilters[0],changed);
    assert(verify({...source,expo}).some(x=>x.startsWith('ANDROID_APP_LINK_MISSING_OR_BROAD')));
  }
});
test('iPhone will not claim www without associated domain in actual native entitlements',()=>{
  const expo=structuredClone(source.expo);
  expo.ios.associatedDomains=['applinks:gafus.ru'];
  assert(verify({...source,expo}).includes('APP_LINK_IOS_ASSOCIATED_DOMAINS_MISSING'));
});
test('Nginx MUST use exact JSON files and never send SPA index.html',()=>{
  for(const value of [
    source.inner.replace('try_files $uri =404;','try_files $uri /index.html;'),
    source.inner.replace('default_type application/json;','default_type text/html;'),
  ]) assert(verify({...source,inner:value}).some(x=>x.includes('DOMAIN_ASSOCIATION_JSON_OR_SPA_FALLBACK')));
  assert(verify({...source,edge:source.edge.replace('location = /.well-known/assetlinks.json','location /assetlinks.json')})
    .some(x=>x.includes('DOMAIN_ASSOCIATION_EXACT_NGINX_ROUTE_MISSING')));
});
test('unsafe extra iOS route is not silently associated with the app',()=>{
  const ios=structuredClone(source.ios);
  ios.applinks.details[0].paths.push('/*');
  assert(verify({...source,ios}).includes('AASA_UNEXPECTED_LINK_ROUTE'));
});
