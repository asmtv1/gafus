import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGalleryOriginCanary,galleryCanarySignedUrl} from './gallery-origin-canary.mjs';
const key='albums/o/a/photos/p/full.webp';
const bytes=Buffer.from('RIFF-synthetic-WEBP-test');
const secret='S'.repeat(48);
const env={GALLERY_CDN_ORIGIN_ROUTE_ENABLED:'true',GALLERY_CDN_REDIRECT_SIGNING_SECRET:secret,
  BEGET_GALLERY_SMOKE_FINAL_KEY:key,BEGET_GALLERY_SMOKE_SHA256:createHash('sha256').update(bytes).digest('hex')};
const cache='public, max-age=180, s-maxage=600, must-revalidate';
function response(code, body=null, headers={}){return new Response(body,{status:code,headers});}
function fakeFetch(extra={}){let got=0;return async (url, options={})=>{
  const u=String(url);
  if(u.includes('api.gafus.ru'))return response(404);
  if(u.includes('md5(AAAAAAAAAAAAAAAAAAAAAA,') || u.includes('md5(') && /,\d+\)/.test(u) && Number(u.match(/,(\d+)\)/)[1]) < 999)return response(403);
  // Expiry is pinned below by checking token's exact form.
  if(u===galleryCanarySignedUrl(key,secret,940))return response(410);
  if(options.method==='HEAD')return response(200,null);
  if(options.headers?.Range==='bytes=0-4')return response(206,bytes.subarray(0,5),{'content-range':`bytes 0-4/${bytes.length}`});
  got++;return response(200,bytes,{'content-type':'image/webp','cache-control':extra.badCache?'public,max-age=600':cache,
    'x-cdn-edge-cache':got>1?'HIT':'MISS',...(extra.leak?{location:'https://s3.cloud.ru/bucket?X-Amz-Signature=secret'}:{})});
};}
test('signer refuses originals and non-final keys',()=>{
  assert.throws(()=>galleryCanarySignedUrl('albums/o/a/incoming/u/source.jpg',secret,1120),/INVALID/);
  assert.throws(()=>galleryCanarySignedUrl(key,'weak',1120),/INVALID/);
});
test('read-only canary proves warm cache, privacy, content and range',async()=>{
  assert.deepEqual(await checkGalleryOriginCanary(env,fakeFetch(),1000),{
    originUnauthorized:404,signedGet:200,cacheHit:true,browserSeconds:180,cdnSharedSeconds:600,
    head:200,range:206,expiredDenied:true,forgedDenied:true,noUserFacingS3Redirect:true });
});
test('fails closed on bad browser cache or S3 redirect leaks',async()=>{
  await assert.rejects(checkGalleryOriginCanary(env,fakeFetch({badCache:true}),1000),/CLIENT_CACHE/);
  await assert.rejects(checkGalleryOriginCanary(env,fakeFetch({leak:true}),1000),/ORIGIN_URL_EXPOSED/);
  await assert.rejects(checkGalleryOriginCanary({...env,GALLERY_CDN_ORIGIN_ROUTE_ENABLED:'false'},fakeFetch(),1000),/ROUTE_NOT_ENABLED/);
});
