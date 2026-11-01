/** Read-only, synthetic Gallery CDN-to-Hono 307-to-S3 security acceptance. */
import { createHash } from 'node:crypto';
const host='fupiquafifeswu.begetcdn.cloud';
const origin='https://api.gafus.ru';
const pathKey=process.env.BEGET_GALLERY_SMOKE_FINAL_KEY??'';
const digest=process.env.BEGET_GALLERY_SMOKE_SHA256??'';
const secret=process.env.GALLERY_CDN_REDIRECT_SIGNING_SECRET??'';
const headerSecret=process.env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET??'';
const path='/'+pathKey;
if(!/^albums\/beget-smoke-[a-f0-9]{16,64}\/beget-smoke-[a-f0-9]{16,64}\/photos\/[a-f0-9]{16,64}\/full\.webp$/.test(pathKey) ||
 !/^[a-f0-9]{64}$/.test(digest) || !/^[A-Za-z0-9_-]{24,32}$/.test(secret) ||
 !/^[A-Za-z0-9]{32,128}$/.test(headerSecret)) throw Error('GALLERY_CANARY_UNSAFE_INPUT');
const request=async(url,opts={})=>fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),...opts});
const sign=expires=>{
 const md5=createHash('md5').update(`${secret}${path}${expires}`).digest('base64url');
 return `https://${host}/md5(${md5},${expires})${path}`;
};
const requireStatus=(got,status,name)=>{if(got!==status)throw Error(`${name}_${got}`);};
const now=Math.floor(Date.now()/1000);
const directUnauth=await request(`${origin}${path}`,{method:'HEAD'});
if(![403,404].includes(directUnauth.status)) throw Error('GALLERY_ORIGIN_HEADER_BYPASS_'+directUnauth.status);
const directAuthorized=await request(`${origin}${path}`,{method:'HEAD',headers:{'x-gafus-gallery-origin-secret':headerSecret}});
requireStatus(directAuthorized.status,307,'GALLERY_ORIGIN_PRESIGN');
const location=new URL(directAuthorized.headers.get('location')??'https://invalid.invalid');
if(location.protocol!=='https:'||location.hostname!=='s3.cloud.ru'||
 location.pathname!==`/gafus-gallery-private/${pathKey}`||
 location.searchParams.get('X-Amz-Expires')!=='60'||
 !/^[a-f0-9]{64}$/.test(location.searchParams.get('X-Amz-Signature')??''))
 throw Error('GALLERY_S3_LOCATION_UNVERIFIED');
const unsigned=await request(`https://${host}${path}`,{method:'HEAD'});
if(![403,410].includes(unsigned.status)) throw Error('GALLERY_UNSIGNED_NOT_DENIED_'+unsigned.status);
const expired=await request(sign(now-30),{method:'HEAD'});
if(![403,410].includes(expired.status))throw Error('GALLERY_EXPIRED_NOT_DENIED_'+expired.status);
const good=sign(now+240);
const forged=good.replace('/md5(', '/md5(A');
const bad=await request(forged,{method:'HEAD'});
if(![403,410].includes(bad.status))throw Error('GALLERY_FORGED_NOT_DENIED_'+bad.status);
const cold=await request(good);
requireStatus(cold.status,200,'GALLERY_GET');
if(cold.headers.has('location'))throw Error('GALLERY_LEAKED_S3_LOCATION');
const bytes=Buffer.from(await cold.arrayBuffer());
if(bytes.length<10 || bytes.length>1_750_000 || !cold.headers.get('content-type')?.includes('image/webp') ||
 createHash('sha256').update(bytes).digest('hex')!==digest)
 throw Error('GALLERY_BYTES_OR_MIME_MISMATCH');
const warm=await request(good);
requireStatus(warm.status,200,'GALLERY_WARM_GET');
if(warm.headers.has('location')||!Buffer.from(await warm.arrayBuffer()).equals(bytes))
 throw Error('GALLERY_WARM_CONTENT_CHANGED');
const browserCache=warm.headers.get('cache-control')??'';
if(browserCache!=='private, max-age=180, must-revalidate')
 throw Error('GALLERY_BROWSER_CACHE_POLICY_MISMATCH');
const state=warm.headers.get('x-cdn-edge-cache')?.toUpperCase()??'UNKNOWN';
if(state!=='HIT')throw Error('GALLERY_CACHE_NOT_HIT_'+state);
const head=await request(good,{method:'HEAD'});
requireStatus(head.status,200,'GALLERY_HEAD');
const range=await request(good,{headers:{Range:'bytes=0-4'}});
requireStatus(range.status,206,'GALLERY_RANGE');
if(!Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(0,5)))
 throw Error('GALLERY_RANGE_CONTENT_MISMATCH');
const anon=await request(`https://s3.cloud.ru/gafus-gallery-private/${pathKey}`,{method:'HEAD'});
if(anon.status<400 || anon.status>=500)throw Error('GALLERY_ANONYMOUS_S3_ALLOWED_'+anon.status);
console.log('GALLERY_REDIRECT_CANARY_PASS',JSON.stringify({host,originUnauthDenied:true,
 headerProtected:true,anonymousCdnDenied:true,expiredDenied:true,forgedDenied:true,
 signedGet:200,warmGet:200,cacheState:state,signedHead:200,range:206,
 sha256Verified:true,s3AnonDenied:true,browserCache: warm.headers.get('cache-control')??'MISSING'}));
