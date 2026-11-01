/** Approved synthetic-only, disposable Gallery S3 + Beget dual-CDN purge acceptance. */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const env = process.env;
if (env.GITHUB_REF !== 'refs/heads/chore/gallery-cdn-purge-canary' ||
  env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
  env.GALLERY_DISPOSABLE_PURGE_CONFIRM !== 'RUN_PRIVATE_GALLERY_DISPOSABLE_PURGE_2026_11_01')
  throw Error('GALLERY_DISPOSABLE_PURGE_UNAUTHORIZED');
const legacyService = '0a8e97d5-3a65-4e90-99a6-c7f61131a461';
const newService = '96cd124e-767e-4af1-a568-c4d1f9b4e73f';
const cdnHost = 'fupiquafifeswu.begetcdn.cloud';
const bucket = 'gafus-gallery-private';
const source = env.BEGET_GALLERY_SMOKE_FINAL_KEY ?? '';
const expectedSha = env.BEGET_GALLERY_SMOKE_SHA256 ?? '';
const edge = env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? '';
if (!/^albums\/beget-smoke-[a-f0-9]{16,64}\/beget-smoke-[a-f0-9]{16,64}\/photos\/[a-f0-9]{16,64}\/full\.webp$/.test(source) ||
  !/^[a-f0-9]{64}$/.test(expectedSha) ||
  !/^[A-Za-z0-9_-]{24,32}$/.test(edge) ||
  !/^[a-zA-Z0-9_:-]{16,200}$/.test(env.CLOUDRU_S3_ACCESS_KEY_ID ?? '') ||
  (env.CLOUDRU_S3_SECRET_ACCESS_KEY ?? '').length < 16 ||
  (env.BEGET_CDN_API_TOKEN ?? '').length < 24 ||
  env.GALLERY_BEGET_CDN_SERVICE_ID !== legacyService ||
  env.GALLERY_BEGET_CDN_REDIRECT_SERVICE_ID !== newService)
  throw Error('GALLERY_DISPOSABLE_PURGE_MISSING_APPROVED_INPUTS');
const require = createRequire(new URL('../../packages/gallery-storage/package.json', import.meta.url));
const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const client = new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,
  maxAttempts:2,credentials:{accessKeyId:env.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey:env.CLOUDRU_S3_SECRET_ACCESS_KEY}});
const id = randomUUID().replaceAll('-','');
const key = `albums/beget-acceptance-${id}/beget-acceptance-${id}/photos/${id}/full.webp`;
const path = '/'+key;
const sign = () => {
  const expires = Math.floor(Date.now()/1000)+120;
  const md5 = createHash('md5').update(`${edge}${path}${expires}`).digest('base64url');
  return `https://${cdnHost}/md5(${md5},${expires})${path}`;
};
const get = (url,method='GET') => fetch(url,{method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});
const sha = b => createHash('sha256').update(b).digest('hex');
async function purge(service){
  const resp = await fetch(`https://api.beget.com/v1/cloud/cdn/${service}/purge-cache-by-paths`,{
    method:'POST',headers:{Authorization:`Bearer ${env.BEGET_CDN_API_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({service_id:service,path:[path]}),redirect:'error',signal:AbortSignal.timeout(10000),
  });
  if(!resp.ok)throw Error('GALLERY_PURGE_HTTP_'+resp.status);
  const value = await resp.json();
  if(!value?.cdn || value.error)throw Error('GALLERY_PURGE_UNVERIFIED');
}
let uploaded = false; let written = false; let deleted = false; let purgeOld = false; let purgeNew = false;
try {
  const sourceObject = await client.send(new GetObjectCommand({Bucket:bucket,Key:source}),
    {abortSignal:AbortSignal.timeout(12000)});
  const bytes = Buffer.from(await sourceObject.Body.transformToByteArray());
  if (bytes.length<20 || bytes.length>5000 || sha(bytes)!==expectedSha)
    throw Error('GALLERY_SYNTHETIC_SOURCE_DIGEST_MISMATCH');
  // The random key is not a user key; overwrite is explicitly forbidden.
  written = true;
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:'image/webp',
    CacheControl:'public, max-age=180, s-maxage=600, must-revalidate',IfNoneMatch:'*'}),
    {abortSignal:AbortSignal.timeout(15000)});
  uploaded = true;
  const url = sign();
  let response = await get(url);
  if(response.status!==200)throw Error('GALLERY_DISPOSABLE_GET_'+response.status);
  if(sha(Buffer.from(await response.arrayBuffer()))!==expectedSha ||
     response.headers.has('location'))throw Error('GALLERY_DISPOSABLE_GET_DATA_LEAK');
  response = await get(url);
  if(response.status!==200 || sha(Buffer.from(await response.arrayBuffer()))!==expectedSha)
    throw Error('GALLERY_DISPOSABLE_WARM_DATA_MISMATCH');
  if(response.headers.get('x-cdn-edge-cache')?.toUpperCase()!=='HIT')
    throw Error('GALLERY_DISPOSABLE_CACHE_NOT_HIT');
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(12000)});
  deleted = true;
  // A successful DeleteObject response alone does not prove object absence.
  try {
    await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(12000)});
    throw Error('GALLERY_DISPOSABLE_S3_NOT_DELETED');
  } catch (err) {
    if (err?.$metadata?.httpStatusCode !== 404) throw err;
  }
  await purge(legacyService); purgeOld = true;
  await purge(newService); purgeNew = true;
  let removed = false;
  for(let attempt=0;attempt<12;attempt++){
    const head = await get(sign(),'HEAD');
    const getRes = await get(sign(),'GET');
    if(head.status===404 && getRes.status===404){removed=true;break;}
    await head.body?.cancel();await getRes.body?.cancel();
    await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(!removed)throw Error('GALLERY_DISPOSABLE_CDN_NOT_INVALIDATED');
  console.log('GALLERY_DISPOSABLE_PURGE_PASS',JSON.stringify({
    isolatedObject:true,sourceShaVerified:true,cdnGet:200,cdnCacheHit:true,
    s3Deleted:true,oldCdnPurgeAccepted:true,newCdnPurgeAccepted:true,
    newCdnDeletedHead:404,newCdnDeletedGet:404 }));
} finally {
  if(written && !deleted){
    try{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(15000)});console.log('GALLERY_SYNTHETIC_S3_CLEANUP_ATTEMPTED');}
    catch(e){console.error('GALLERY_SYNTHETIC_S3_CLEANUP_FAILED',e?.name??'UNKNOWN');}
  }
  for(const [service,done] of [[legacyService,purgeOld],[newService,purgeNew]]) {
    if(written && !done)try{await purge(service);console.log('GALLERY_SYNTHETIC_EDGE_PURGE_ATTEMPTED',service===legacyService?'old':'new');}
      catch(e){console.error('GALLERY_SYNTHETIC_EDGE_PURGE_FAILED',service===legacyService?'old':'new',e?.name??'UNKNOWN');}
  }
  client.destroy();
}
