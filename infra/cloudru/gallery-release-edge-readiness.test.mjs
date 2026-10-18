import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGalleryNewEdgeSettings} from './gallery-release-edge-readiness.mjs';
const key='K'.repeat(32),originSecret='O'.repeat(64),token='A'.repeat(32);
const env={GALLERY_CDN_REDIRECT_ENABLED:'true',GALLERY_CDN_ORIGIN_ROUTE_ENABLED:'true',
  GALLERY_CDN_REDIRECT_SIGNING_SECRET:key,GALLERY_CDN_REDIRECT_ORIGIN_SECRET:originSecret,
  BEGET_CDN_API_TOKEN:token};
const settings={follow_origin_redirect:{enable:true},tokenized_url_secure_key:{enable:true,key},
  static_request_headers:{enabled:true,value:{'x-gafus-gallery-origin-secret':originSecret}},
  caching_time:600,caching_time_browser:{enable:false},static_response_headers:{enable:false}};
const service={service:{display_name:'GAFUS Gallery S3 redirect test',cdn:{source_domain:{domain:'api.gafus.ru'},
  resource_domain:[{domain:'dikinuneceswe.begetcdn.cloud',status:'WORKING'}],settings}}};
const fetcher=x=>async(_url,opts)=>{assert.equal(opts.headers.Authorization,`Bearer ${token}`);return {
  status:200,json:async()=>x};};
test('new Beget Gallery is verified without needing a deployed API origin',async()=>{
  assert.deepEqual(await checkGalleryNewEdgeSettings(env,fetcher(service)),{
    enabled:true,https:'WORKING',origin:'api.gafus.ru',secureToken:true,secureOriginHeader:true,follows307:true,edgeCacheSeconds:600});
  assert.deepEqual(await checkGalleryNewEdgeSettings({...env,GALLERY_CDN_REDIRECT_ENABLED:'false'},()=>{throw Error('should not fetch')}),{enabled:false});
});
test('incorrect origin secret, signing key or redirect setting stops release',async()=>{
  for(const bad of [
    {...settings,follow_origin_redirect:{enable:false}},
    {...settings,tokenized_url_secure_key:{enable:true,key:'DIFFERENT'}},
    {...settings,static_request_headers:{enabled:true,value:{'x-gafus-gallery-origin-secret':'WRONG'}}},
    {...settings,caching_time:86400},
  ])await assert.rejects(checkGalleryNewEdgeSettings(env,fetcher({service:{...service.service,cdn:{...service.service.cdn,settings:bad}}})),/CONFIG_MISMATCH/);
  await assert.rejects(checkGalleryNewEdgeSettings({...env,GALLERY_CDN_REDIRECT_ORIGIN_SECRET:''},fetcher(service)),/REQUIRED_SECRETS/);
});
