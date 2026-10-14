/**
 * Isolated *production* Beget/CDNvideo acceptance on TWO disposable objects.
 * Pure --plan by default. --run requires distinct explicit authorization,
 * Cloud.ru credentials and real CDN/Beget secrets via a protected environment.
 * No user key, CDN resource configuration, GitHub flag or DNS is changed.
 * Never output signed URLs, secrets or sensitive request/response bodies.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { S3Client, PutObjectCommand, HeadObjectCommand, HeadBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const mode = process.argv[2] ?? '--plan';
if (!['--plan', '--run'].includes(mode) || process.argv.length > 3)
  throw Error('UNSUPPORTED_ACCEPTANCE_ACTION');
const scopes = [
  { name: 'gallery', bucket: 'gafus-gallery-private',
    host: 'mepsuduyokabib.begetcdn.cloud', serviceId: '0a8e97d5-3a65-4e90-99a6-c7f61131a461',
    key: id => `albums/beget-probe-${id}/beget-probe-${id}/photos/${id}/full.webp` },
  { name: 'feed', bucket: 'gafus-feed-private',
    host: 'garaquachegasourn.begetcdn.cloud', serviceId: 'becd9e5d-4fa8-47da-878c-9b80ded74e71',
    key: id => `posts/beget-probe-${id}/beget-probe-${id}/attachments/${id}/poster.webp` },
];
if (mode === '--plan') {
  console.log(JSON.stringify({ mode, mutates: false, effectOfRun: [
    'one temporary object per private Cloud.ru bucket',
    'read-only authenticated edge GET/HEAD/Range and security probes',
    'delete ONLY both UUID test objects',
    'purge ONLY both matching CDN object paths',
    'verify fresh signed GET and HEAD 404 after edge invalidation',
  ], provider: 'beget', never: ['delete user objects','modify CDN resources','enable verified flags'] }));
  process.exit(0);
}
const env = process.env;
if (env.BEGET_SYNTHETIC_PURGE_CONFIRM !== 'approved-two-disposable-production-webps' ||
    env.CLOUDRU_S3_ENDPOINT !== 'https://s3.cloud.ru')
  throw Error('SYNTHETIC_ACCEPTANCE_NOT_AUTHORIZED');
for (const name of [
  'CLOUDRU_S3_ACCESS_KEY_ID','CLOUDRU_S3_SECRET_ACCESS_KEY','BEGET_CDN_API_TOKEN',
  'GALLERY_CDN_SECRET','FEED_CDN_SECRET',
]) if (!env[name] || env[name].length < 16) throw Error('SYNTHETIC_ACCEPTANCE_MISSING_' + name);
for (const scope of scopes) {
  if (env[`${scope.name.toUpperCase()}_BEGET_CDN_SERVICE_ID`] !== scope.serviceId)
    throw Error('SYNTHETIC_ACCEPTANCE_BAD_SERVICE_ID_' + scope.name);
  const secret = env[`${scope.name.toUpperCase()}_CDN_SECRET`];
  if (!(scope.name === 'gallery' ? /^[A-Za-z0-9_-]{24,128}$/ : /^[A-Za-z0-9_-]{24,32}$/).test(secret))
    throw Error('SYNTHETIC_ACCEPTANCE_BAD_SIGNER_' + scope.name);
}
const e2eRequire = createRequire(new URL('../../apps/gallery-cloud/package.json',import.meta.url));
const sharp = e2eRequire('sharp');
const client = new S3Client({ endpoint: 'https://s3.cloud.ru', region: 'ru-central-1',
  forcePathStyle: true, maxAttempts: 1, credentials: {
    accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID, secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY,
  } });
const synthetic = await sharp({create:{width:16,height:16,channels:3,background:{r:66,g:121,b:87}}}).webp().toBuffer();
if (synthetic.length > 5000 || synthetic.length < 20) throw Error('INVALID_SYNTHETIC_WEBP');
const digest = createHash('sha256').update(synthetic).digest('hex');
const request = async (url, method='GET', extra={}) => fetch(url, {
  method, ...extra, redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(12_000),
});
const signed = (scope, key, expires) => {
  const path = '/' + key;
  const secret = env[`${scope.name.toUpperCase()}_CDN_SECRET`];
  const signature = createHash('md5').update(`${secret}${path}${expires}`).digest('base64url');
  return `https://${scope.host}/md5(${signature},${expires})${path}`;
};
async function expectHttp(response, status, scope, check) {
  if (response.status !== status) {
    void response.body?.cancel();
    throw Error(`${scope.name.toUpperCase()}_${check}_HTTP_${response.status}_EXPECTED_${status}`);
  }
}
async function assertDeletedInS3(scope,key){
  try { await client.send(new HeadObjectCommand({Bucket:scope.bucket,Key:key}),
    { abortSignal: AbortSignal.timeout(15_000) });
    throw Error('SYNTHETIC_NOT_REMOVED_FROM_BUCKET_' + scope.name);
  } catch (error) {if (error?.$metadata?.httpStatusCode !== 404) throw error;}
}
async function purge(scope,key){
  // Provider API expects UUID service ID and a single exact content path.
  const response = await fetch(`https://api.beget.com/v1/cloud/cdn/${scope.serviceId}/purge-cache-by-paths`, {
    method:'POST',headers:{Authorization:`Bearer ${env.BEGET_CDN_API_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({service_id:scope.serviceId,path:['/'+key]}),
    redirect:'error',signal:AbortSignal.timeout(14_000),
  });
  if (!response.ok) throw Error(`SYNTHETIC_PURGE_HTTP_${scope.name}_${response.status}`);
  const data=await response.json();
  if (!data || typeof data!=='object' || !data.cdn || data.error)
    throw Error(`SYNTHETIC_PURGE_RESPONSE_INVALID_${scope.name}`);
  console.log('PURGE_API_ACCEPTED',scope.name);
}
async function edgeDeleted(scope,key){
  const expires = Math.floor(Date.now()/1000)+90;
  const url = signed(scope,key,expires);
  for (const method of ['HEAD','GET']) {
    const response=await request(url,method);
    const status=response.status;
    void response.body?.cancel();
    if (status!==404) return false;
  }
  return true;
}
// Only isolated random final-key WebPs are ever written. Probe all S3 bucket
// permissions BEFORE any write, so a missing second bucket never leaves the
// first test file behind without an attempted cleanup.
for (const scope of scopes) {
  const head = await client.send(new HeadBucketCommand({Bucket:scope.bucket}),
    {abortSignal:AbortSignal.timeout(12_000)});
  if(head.$metadata.httpStatusCode!==200)throw Error('SYNTHETIC_PREFLIGHT_PRIVATE_BUCKET_UNREACHABLE_'+scope.name);
}
let failed = false;
for (const scope of scopes) {
  const id=randomUUID().replace(/-/g,'');
  const key=scope.key(id);
  let uploaded=false;
  let edgeFetched=false;
  let deleted=false;
  let purged=false;
  try {
    const put=await client.send(new PutObjectCommand({
      Bucket:scope.bucket,Key:key,Body:synthetic,
      ContentType:'image/webp',CacheControl:'private, max-age=180, must-revalidate',IfNoneMatch:'*',
    }),{abortSignal:AbortSignal.timeout(20_000)});
    if(put.$metadata.httpStatusCode!==200) throw Error('SYNTHETIC_PUT_REJECTED_'+scope.name);
    uploaded=true;
    const now=Math.floor(Date.now()/1000);
    const unsigned=await request(`https://${scope.host}/${key}`,'HEAD');
    if (![403,410].includes(unsigned.status)) throw Error('SYNTHETIC_UNSIGNED_NOT_REJECTED_'+scope.name);
    void unsigned.body?.cancel();
    const expired=await request(signed(scope,key,now-60),'HEAD');
    if (![403,410].includes(expired.status)) throw Error('SYNTHETIC_EXPIRED_NOT_REJECTED_'+scope.name);
    void expired.body?.cancel();
    const forged=await request(signed(scope,key,now+240).replace(/md5\([A-Za-z0-9_-]{22}/,`md5(${'A'.repeat(22)}`),'HEAD');
    if (![403,410].includes(forged.status)) throw Error('SYNTHETIC_FORGED_NOT_REJECTED_'+scope.name);
    void forged.body?.cancel();
    const url=signed(scope,key,now+240);
    const get=await request(url); await expectHttp(get,200,scope,'GET');
    edgeFetched=true;
    const body=Buffer.from(await get.arrayBuffer());
    if (!body.equals(synthetic)||!get.headers.get('content-type')?.includes('image/webp'))
      throw Error('SYNTHETIC_EDGE_BYTES_OR_MIME_INVALID_'+scope.name);
    const cacheControl=get.headers.get('cache-control')??'';
    const expectedCacheControl='private, max-age=180, must-revalidate';
    const cachePolicyMatched=cacheControl===expectedCacheControl;
    let hot=false;
    const cacheStates=[];
    for (let i=0;i<5;i++) {
      const warm=await request(url);await expectHttp(warm,200,scope,'WARM_GET');
      if (!Buffer.from(await warm.arrayBuffer()).equals(synthetic))
        throw Error('SYNTHETIC_WARM_BYTES_MISMATCH_'+scope.name);
      const edge=(warm.headers.get('x-cdn-edge-cache')??'').slice(0,35);
      const xCache=(warm.headers.get('x-cache')??'').slice(0,35);
      const cf=(warm.headers.get('cf-cache-status')??'').slice(0,35);
      cacheStates.push({edge,xCache,cf});
      if (edge.toUpperCase()==='HIT'||xCache.toUpperCase().includes('HIT')||cf.toUpperCase()==='HIT') hot=true;
    }
    console.log('SYNTHETIC_CACHE_EVIDENCE',scope.name,JSON.stringify({
      cacheControl:cacheControl.slice(0,140),cachePolicyMatched,cacheStates,hot,
    }));
    const head=await request(url,'HEAD');await expectHttp(head,200,scope,'HEAD');
    void head.body?.cancel();
    const range=await request(url,'GET',{headers:{Range:'bytes=0-4'}});
    await expectHttp(range,206,scope,'RANGE');
    if (!Buffer.from(await range.arrayBuffer()).equals(synthetic.subarray(0,5)))
      throw Error('SYNTHETIC_RANGE_BYTES_INVALID_'+scope.name);
    console.log('SIGNED_EDGE_GET_HIT_HEAD_RANGE_PASS',scope.name,'bytes',synthetic.length,'sha256',digest);
    await client.send(new DeleteObjectCommand({Bucket:scope.bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(20_000)});
    deleted=true;
    await assertDeletedInS3(scope,key);
    await purge(scope,key);purged=true;
    let propagated=false;
    for(let attempt=0;attempt<12;attempt++){
      if(await edgeDeleted(scope,key)){propagated=true;break;}
      // Avoid polling a CDN too aggressively or mistaking purge acceptance
      // for global edge invalidation. At most one minute of local edge checks.
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    if (!propagated) throw Error('SYNTHETIC_PURGE_PROPAGATION_NOT_PROVEN_'+scope.name);
    console.log('SIGNED_EDGE_POSTPURGE_HEAD_GET_404_PASS',scope.name);
    if (!cachePolicyMatched) throw Error('SYNTHETIC_CLIENT_CACHE_CONTROL_MISMATCH_'+scope.name);
    if (!hot) throw Error('SYNTHETIC_CDN_CACHE_HIT_NOT_PROVEN_'+scope.name);
  } catch(error) {
    failed=true;
    console.error('SYNTHETIC_BEGET_ACCEPTANCE_FAILED',scope.name,error?.message??'UNKNOWN');
  } finally {
    if(uploaded&&!deleted){
      try { await client.send(new DeleteObjectCommand({Bucket:scope.bucket,Key:key}),
        {abortSignal:AbortSignal.timeout(20_000)}); await assertDeletedInS3(scope,key);
        console.log('SYNTHETIC_TEST_SOURCE_REMOVED',scope.name); deleted=true;
      } catch(err){failed=true;console.error('SYNTHETIC_SOURCE_CLEANUP_FAILED',scope.name,err?.name??'UNKNOWN');}
    }
    if(edgeFetched&&!purged){
      try {await purge(scope,key);purged=true;}
      catch(err){failed=true;console.error('SYNTHETIC_EDGE_CLEANUP_FAILED',scope.name,err?.message??'UNKNOWN');}
    }
  }
}
client.destroy();
if(failed)process.exitCode=1;
else console.log('BEGET_TWO_DISPOSABLE_OBJECTS_FULL_ACCEPTANCE=PASS');
