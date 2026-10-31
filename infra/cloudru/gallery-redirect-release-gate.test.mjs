import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGalleryRedirectConfig, checkGalleryRedirectProvider } from './gallery-redirect-release-gate.mjs';
const env = {
  GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'true', GALLERY_CDN_REDIRECT_ENABLED: 'true',
  GALLERY_CDN_PURGE_DUAL_ENABLED: 'true', GALLERY_CDN_CACHEABLE_FINAL_ENABLED: 'true',
  GALLERY_CDN_EDGE_TOKEN_VERIFIED: 'true',
  BEGET_CDN_PURGE_API_VERIFIED: 'true', BEGET_CDN_CACHE_KEY_VERIFIED: 'true',
  BEGET_CDN_PURGE_PROPAGATION_VERIFIED: 'true',
  GALLERY_CDN_REDIRECT_S3_SMOKE_VERIFIED: 'true', GALLERY_CDN_BROWSER_CACHE_VERIFIED: 'true',
  GALLERY_CDN_METADATA_MIGRATED: 'true',
  GALLERY_CDN_REDIRECT_ORIGIN_SECRET: 'V'.repeat(48),
  GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'N'.repeat(32), GALLERY_CDN_SECRET: 'O'.repeat(32),
  GALLERY_BEGET_CDN_REDIRECT_SERVICE_ID: '10530e64-21b7-4352-8366-806c79c2f1b7',
  GALLERY_CDN_BASE_URL: 'https://dikinuneceswe.begetcdn.cloud',
  BEGET_CDN_API_TOKEN: 'test-api-token-12345678901234567',
};
test('remains off without any release flags and never calls provider',async()=>{
  assert.deepEqual(checkGalleryRedirectConfig({}),{ enabled:false });
  assert.deepEqual(await checkGalleryRedirectProvider({},()=>{ throw Error('unexpected call') }),{ enabled:false });
});
test('rejects missing secrets, absent purge, metadata, and unverified smoke',()=>{
  for (const [key,val] of Object.entries({
    GALLERY_CDN_PURGE_DUAL_ENABLED:'false', GALLERY_CDN_REDIRECT_SIGNING_SECRET:'',
    GALLERY_CDN_REDIRECT_ORIGIN_SECRET:'weak', GALLERY_CDN_REDIRECT_S3_SMOKE_VERIFIED:'false',
    GALLERY_CDN_METADATA_MIGRATED:'false', GALLERY_CDN_BASE_URL:'https://evil.invalid',
    GALLERY_CDN_ORIGIN_ROUTE_ENABLED:'false',
  })) assert.throws(()=>checkGalleryRedirectConfig({...env,[key]:val}),/GALLERY_REDIRECT_GATE_/);
});
test('only approves verified new Beget origin, token, header, redirects, cache',async()=>{
  const fixture={service:{status:'RUNNING',cdn:{source_domain:{domain:'api.gafus.ru',source_protocol:'HTTPS'},
    resource_domain:[{domain:'dikinuneceswe.begetcdn.cloud',status:'WORKING'}],
    settings:{follow_origin_redirect:{enable:true},tokenized_url_secure_key:{enable:true},
      static_request_headers:{enabled:true},caching_time:600}}}};
  const ok = async()=>({ok:true,json:async()=>fixture});
  assert.deepEqual(await checkGalleryRedirectProvider(env,ok),{enabled:true,redirect:true,providerVerified:true});
  const bad=structuredClone(fixture);bad.service.cdn.settings.follow_origin_redirect.enable=false;
  await assert.rejects(checkGalleryRedirectProvider(env,async()=>({ok:true,json:async()=>bad})),/BEGET_SETTINGS/);
});
