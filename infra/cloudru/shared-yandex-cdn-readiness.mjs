import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const resourceId = 'bc8rr3yxsrkobnonoi2w';
export const origin = 'https://cdn.gafus.ru';
const owner = '[A-Za-z0-9_-]{1,128}';
const uuid = '[a-fA-F0-9-]{36}';
const patterns = {
  gallery: new RegExp(`^albums/${owner}/${owner}/photos/${owner}/(?:thumb|full)\\.webp$`),
  galleryV2: new RegExp(`^gallery/${owner}/media/${owner}/v2/(?:thumb|full)\\.webp$`),
  galleryVet: new RegExp(`^users/${owner}/pets/${owner}/vet-visits/${owner}/${owner}/thumb\\.webp$`),
  feedImage: new RegExp(`^media/v2/${owner}/v[1-9][0-9]*/image/s\\.webp$`),
  feed360: new RegExp(`^media/v2/${owner}/v[1-9][0-9]*/video/360\\.mp4$`),
  feed720: new RegExp(`^media/v2/${owner}/v[1-9][0-9]*/video/720\\.mp4$`),
  chatImage: new RegExp(`^chat2/${owner}/${owner}/${uuid}/v1/image/s\\.webp$`),
  chat360: new RegExp(`^chat2/${owner}/${owner}/${uuid}/v1/video/360\\.mp4$`),
  chat720: new RegExp(`^chat2/${owner}/${owner}/${uuid}/v1/video/720\\.mp4$`),
  questions: new RegExp(`^questions/uploads/questions/v2/${owner}/${uuid}/v1/image/s\\.webp$`),
};
export function readManifest(raw) {
  let value;
  try { value = JSON.parse(raw ?? ''); } catch { throw Error('YANDEX_SHARED_CDN_SMOKE_MANIFEST_INVALID'); }
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== Object.keys(patterns).sort().join(',')) throw Error('YANDEX_SHARED_CDN_SMOKE_MANIFEST_INVALID');
  for (const [name, pattern] of Object.entries(patterns)) {
    const item = value[name];
    if (!item || !pattern.test(item.key ?? '') || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || !Number.isSafeInteger(item.bytes) || item.bytes<24 || item.bytes>2_000_000) throw Error('YANDEX_SHARED_CDN_SMOKE_FIXTURE_INVALID_'+name);
  }
  return value;
}
export function requireReadiness(env=process.env) {
  const checks = {
    GAFUS_MEDIA_CDN_TARGET:'yandex', YANDEX_SHARED_CDN_RESOURCE_ID:resourceId,
    YANDEX_SHARED_CDN_RELEASE_CONFIRM:'reviewed-single-cdn-cutover',
    YANDEX_SHARED_CDN_EDGE_VERIFIED:'true',YANDEX_SHARED_CDN_PURGE_VERIFIED:'true',
    YANDEX_SHARED_CDN_DUAL_PURGE:'true',BEGET_CDN_PURGE_API_VERIFIED:'true',
    BEGET_CDN_CACHE_KEY_VERIFIED:'true',BEGET_CDN_PURGE_PROPAGATION_VERIFIED:'true',
    GALLERY_BEGET_CDN_SERVICE_ID:'96cd124e-767e-4af1-a568-c4d1f9b4e73f',
    FEED_BEGET_CDN_SERVICE_ID:'cbb7fe86-a193-457e-a756-9cf3aa2aef1b',
  };
  for (const [name,value] of Object.entries(checks)) if (env[name]!==value) throw Error('YANDEX_SHARED_CDN_GATE_MISSING_'+name);
  if (env.GITHUB_REF!=='refs/heads/main' || !['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) throw Error('YANDEX_SHARED_CDN_BRANCH_UNAUTHORIZED');
  if (env.FEED_PUBLIC_BROWSER_CACHE_24H_VERIFIED==='true' || env.FEED_CDN_BROWSER_CACHE_24H_VERIFIED==='true') throw Error('YANDEX_SHARED_CDN_24H_CACHE_UNVERIFIED');
  for (const name of ['GALLERY_CDN_REDIRECT_SIGNING_SECRET','FEED_CDN_SECRET']) if (!/^[A-Za-z0-9_-]{24,32}$/.test(env[name]??'')) throw Error('YANDEX_SHARED_CDN_SECRET_MISSING_'+name);
  if ((env.BEGET_CDN_API_TOKEN??'').length<24) throw Error('YANDEX_SHARED_CDN_LEGACY_PURGE_REQUIRED');
  let key; try {key=JSON.parse(Buffer.from(env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY_B64??'','base64').toString('utf8'));}catch {throw Error('YANDEX_SHARED_CDN_IAM_KEY_INVALID');}
  if (!key?.id || !key?.service_account_id || !key?.private_key) throw Error('YANDEX_SHARED_CDN_IAM_KEY_INVALID');
  return readManifest(env.YANDEX_SHARED_CDN_SMOKE_MANIFEST);
}
const sign=(path,secret,expires)=>`${origin}/${path}?md5=${createHash('md5').update(`${expires}/${path} ${secret}`).digest('base64url')}&expires=${expires}`;
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fetchResponse(url, method, headers={}) {
  return fetch(url,{method,headers,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
}
function status(r,expected,label){if(r.status!==expected)throw Error('YANDEX_SMOKE_'+label+'_HTTP_'+r.status);}
export async function smoke(env=process.env) {
  const fixtures=readManifest(env.YANDEX_SHARED_CDN_SMOKE_MANIFEST);
  const expires=Math.floor(Date.now()/1000)+180;
  for (const [name, f] of Object.entries(fixtures)) {
    const priv=name.startsWith('gallery'), feed=name.startsWith('feed'), video=/\.mp4$/.test(f.key);
    const url=priv||feed?sign(f.key,env[priv?'GALLERY_CDN_REDIRECT_SIGNING_SECRET':'FEED_CDN_SECRET'],expires):`${origin}/${f.key}`;
    const r=await fetchResponse(url,'GET',{Origin:'https://gafus.ru'});status(r,200,name);
    const bytes=Buffer.from(await r.arrayBuffer());
    if(bytes.length!==f.bytes||sha(bytes)!==f.sha256||r.headers.get('content-type')?.split(';')[0] !== (video?'video/mp4':'image/webp'))throw Error('YANDEX_SMOKE_BYTES_OR_MIME_'+name);
    const cache=r.headers.get('cache-control')??'';
    const ages=[...cache.matchAll(/(?:^|,)\s*(?:s-maxage|max-age)=(\d+)\b/gi)].map(m=>Number(m[1]));
    if(priv?(!/(?:^|,)\s*private(?:,|$)/i.test(cache)||!/(?:^|,)\s*no-store(?:,|$)/i.test(cache)||ages.some(age=>age>0)||/\bpublic\b/i.test(cache)):(ages.length===0||ages.some(age=>age>180)))throw Error('YANDEX_SMOKE_CACHE_'+name);
    if(!priv && !['*','https://gafus.ru'].includes(r.headers.get('access-control-allow-origin')))throw Error('YANDEX_SMOKE_CORS_'+name);
    const head=await fetchResponse(url,'HEAD');status(head,200,name+'_HEAD');
    if(priv && (r.headers.get('cache-status')==='HIT' || head.headers.get('cache-status')==='HIT' || !/\bprivate\b/i.test(head.headers.get('cache-control')??'') || !/\bno-store\b/i.test(head.headers.get('cache-control')??'')))throw Error('YANDEX_SMOKE_PRIVATE_CACHE_'+name);
    if(Number(head.headers.get('content-length'))!==f.bytes)throw Error('YANDEX_SMOKE_HEAD_LENGTH_'+name);
    if(video){const partial=await fetchResponse(url,'GET',{Range:'bytes=0-15'});status(partial,206,name+'_RANGE');if(partial.headers.get('content-range')!==`bytes 0-15/${f.bytes}`||!Buffer.from(await partial.arrayBuffer()).equals(bytes.subarray(0,16)))throw Error('YANDEX_SMOKE_RANGE_'+name);}
    if(feed){const pub=await fetchResponse(`${origin}/${f.key}`,'GET');status(pub,200,name+'_PUBLIC');if(sha(Buffer.from(await pub.arrayBuffer()))!==f.sha256)throw Error('YANDEX_SMOKE_PUBLIC_BYTES_'+name);}
    if(priv){for(const [bad,expected] of [[`${origin}/${f.key}`,403],[sign(f.key,'wrong-secret-test-only',expires),403],[sign(f.key,env.GALLERY_CDN_REDIRECT_SIGNING_SECRET,expires-360),410]]){const denied=await fetchResponse(bad,'GET');if(denied.status!==expected)throw Error('YANDEX_SMOKE_PRIVATE_DENIAL_HTTP_'+denied.status);void denied.body?.cancel();}}
    console.log('YANDEX_SMOKE_PASS_'+name);
  }
  for(const path of ['/','/posts/canary/incoming/source.jpg','/users/o/pets/p/vet-visits/v/a/original.pdf','/chat2/x/y/z/incoming/source.jpg','/questions/v2/x/y/incoming/source.jpg']) {const r=await fetchResponse(origin+path,'GET');status(r,404,'DENY');void r.body?.cancel();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const mode=process.argv[2];
 if(mode==='--check'){requireReadiness();console.log('YANDEX_SHARED_CDN_READINESS=PASS');}
 else if(mode==='--smoke'){requireReadiness();await smoke();}
 else if(mode==='--probe'){await smoke();}
 else throw Error('YANDEX_SHARED_CDN_INVALID_MODE');
}
