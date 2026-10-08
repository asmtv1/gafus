// Deliberately opt-in, isolated nonproduction only. Never prints credentials, tokens or bodies.
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createGalleryObjectStore, objectMd5 } from '../../../packages/gallery-storage/dist/objects.js';
import { signGalleryRequest } from '../../../packages/gallery-storage/dist/hmac.js';
import { signGalleryCdnUrl } from '../../../packages/gallery-storage/dist/cdn.js';
import { assertFinalKey, sourceUploadId } from '../../../packages/gallery-storage/dist/keys.js';
async function main() {
const env = process.env;
function check(value, name) { if (!value) throw Error(name); }
function required(name) { check(env[name], `MISSING_${name}`); return env[name]; }
check(['dev','staging'].includes(required('GALLERY_SMOKE_ENV')), 'NONPRODUCTION_ONLY');
check(env.GALLERY_SMOKE_MUTATIONS === 'true', 'EXPLICIT_SMOKE_MUTATIONS_REQUIRED');
const manifest = JSON.parse(await readFile(required('GALLERY_SMOKE_MANIFEST'), 'utf8'));
check(manifest.environment === env.GALLERY_SMOKE_ENV, 'MANIFEST_ENVIRONMENT');
// Manifest comes from authenticated core registration, never construct IDs or destination keys here.
check(sourceUploadId(manifest.post.fields.key) === manifest.uploadId, 'REGISTRY_SOURCE_KEY');
for (const key of Object.values(manifest.finalKeys)) assertFinalKey(key);
const origin = new URL(required('GALLERY_SMOKE_ORIGIN_URL'));
const cdn = new URL(required('GALLERY_CDN_BASE_URL'));
const internal = new URL(required('GALLERY_INTERNAL_BASE_URL'));
check([origin,cdn,internal].every(u=>u.protocol === 'https:' && u.pathname === '/' && !u.username && !u.password && !u.search && !u.hash), 'HTTPS_ROOTS_ONLY');
check(env.GALLERY_BUCKET !== 'gafus-media' && env.GALLERY_BUCKET !== 'gafus-public', 'DEDICATED_PRIVATE_BUCKET');
const postUrl = new URL(manifest.post.url);
check(postUrl.protocol === 'https:' && postUrl.hostname === 'storage.yandexcloud.net' && postUrl.pathname === `/${required('GALLERY_BUCKET')}` && !postUrl.username && !postUrl.password && !postUrl.search && !postUrl.hash, 'DEDICATED_POST_DESTINATION');
const fetchSafe = (url, options={}) => fetch(url,{redirect:'error',signal:AbortSignal.timeout(10_000),...options});
const credentials = { accessKeyId:required('GALLERY_S3_ACCESS_KEY_ID'), secretAccessKey:required('GALLERY_S3_SECRET_ACCESS_KEY') };
const client = new S3Client({ endpoint:'https://storage.yandexcloud.net',region:'ru-central1',forcePathStyle:true,credentials,maxAttempts:1 });
const store = createGalleryObjectStore({bucket:required('GALLERY_BUCKET'),endpoint:'https://storage.yandexcloud.net',...credentials},client);
const corePath = '/internal/gallery/maintenance', body = JSON.stringify({limit:10});
const auth = signGalleryRequest({method:'POST',path:corePath,body,secret:required('GALLERY_INTERNAL_HMAC_SECRET')});
const call = (headers, raw=body) => fetchSafe(`${internal.origin}${corePath}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:raw});
const denied = async(response,label) => { await response.body?.cancel(); check([401,403].includes(response.status),label); };
await denied(await call(signGalleryRequest({method:'POST',path:corePath,body,secret:env.GALLERY_INTERNAL_HMAC_SECRET,timestamp:Math.floor(Date.now()/1000)-61})),'STALE_HMAC_REJECTED');
await denied(await call(auth,body+' '),'TAMPERED_BODY_REJECTED');
const source = await readFile(manifest.sourceFile);
check(source.length > 0 && source.length <= 10*1024*1024, 'SOURCE_SIZE');
const form = new FormData();
for (const [name,value] of Object.entries(manifest.post.fields)) form.set(name,value);
form.set('file',new Blob([source],{type:manifest.contentType}),'source');
const upload = await fetchSafe(manifest.post.url,{method:'POST',body:form});
check(upload.ok,'PRESIGNED_POST'); await upload.body?.cancel();
// Intentionally no client-confirm call. Maintenance must HEAD/pin and recover this upload.
const validAuth = signGalleryRequest({method:'POST',path:corePath,body,secret:env.GALLERY_INTERNAL_HMAC_SECRET});
const recoveryResponse = await call(validAuth);
check(recoveryResponse.ok,'MAINTENANCE_HTTP'); const recovery = await recoveryResponse.json();
await denied(await call(validAuth),'SHARED_NONCE_REPLAY_REJECTED');
check(Array.isArray(recovery.processUploadIds),'MAINTENANCE_BARE_CORE_DTO');
const recoveredUpload = recovery.processUploadIds.includes(manifest.uploadId);
if (env.GALLERY_SMOKE_REQUIRE_RECOVERY === 'true') check(recoveredUpload,'MISSING_EVENT_RECOVERY_REQUIRED');
const queue = new SQSClient({endpoint:'https://message-queue.api.cloud.yandex.net',region:'ru-central1',maxAttempts:1,credentials:{accessKeyId:required('GALLERY_QUEUE_ACCESS_KEY_ID'),secretAccessKey:required('GALLERY_QUEUE_SECRET_ACCESS_KEY')}});
for (const uploadId of recovery.processUploadIds) await queue.send(new SendMessageCommand({QueueUrl:required('GALLERY_QUEUE_URL'),MessageBody:JSON.stringify({version:1,uploadId})}));
let ready=false;
for (let i=0;i<132;i++) {
  const metadata = await Promise.all(Object.values(manifest.finalKeys).map(key=>store.head(key)));
  if (metadata.every(Boolean)) { ready=true; break; }
  await new Promise(resolve=>setTimeout(resolve,5000));
}
check(ready,'PUBLISHED_WITHOUT_CLIENT_CONFIRM');
const finalKey = manifest.finalKeys.full;
const snapshot = await store.read(finalKey);
check(snapshot.metadata.bytes <= 1_750_000 && snapshot.metadata.contentType === 'image/webp','FINAL_WEBP_BOUND');
check(snapshot.metadata.etag === objectMd5(snapshot.bytes),'SINGLE_PART_CONTENT_ETAG');
await store.create(finalKey,snapshot.bytes,'image/webp'); // identical retry must skip PUT.
let immutableRejected=false;
try { await store.create(finalKey,Buffer.from('conflict'),'image/webp'); } catch(e) { immutableRejected=e.message === 'IMMUTABLE_CONFLICT'; }
check(immutableRejected,'IMMUTABLE_CONFLICT');
let conditionalRejected=false;
try { await client.send(new PutObjectCommand({Bucket:env.GALLERY_BUCKET,Key:finalKey,Body:Buffer.from('conflict'),ContentType:'image/webp',IfNoneMatch:'*'})); } catch(e) { conditionalRejected=e.$metadata?.httpStatusCode === 412 || e.$metadata?.httpStatusCode === 409; }
check(conditionalRejected,'PROVIDER_CONDITIONAL_PUT');
const after = await store.read(finalKey,snapshot.metadata.etag);
check(after.metadata.etag === snapshot.metadata.etag && Buffer.from(after.bytes).equals(Buffer.from(snapshot.bytes)),'CONDITIONAL_PUT_NO_CHANGE');
let etagRejected=false;
try { await store.read(finalKey,'"'+'0'.repeat(32)+'"'); } catch(e) { etagRejected=e.$metadata?.httpStatusCode === 412; }
check(etagRejected,'PROVIDER_CONDITIONAL_GET');
const noSecret = await fetchSafe(`${origin.origin}/${finalKey}`);
check(noSecret.status===403,'ORIGIN_SECRET_REQUIRED'); await noSecret.body?.cancel();
const start = performance.now();
const fromOrigin = await fetchSafe(`${origin.origin}/${finalKey}`,{headers:{'x-gallery-origin-secret':required('GALLERY_ORIGIN_SECRET')}});
check(fromOrigin.ok,'ORIGIN_RESPONSE'); const originBytes = Buffer.from(await fromOrigin.arrayBuffer());
const originMs = Math.round(performance.now()-start);
check(originMs<5000 && originBytes.equals(Buffer.from(snapshot.bytes)),'ORIGIN_FIVE_SECOND_GATE');
check(fromOrigin.headers.get('cache-control')?.includes('no-store'),'ORIGIN_BROWSER_NO_STORE');
const encodedPath = await fetchSafe(`${origin.origin}/albums%2Fo/a/photos/p/full.webp`,{headers:{'x-gallery-origin-secret':env.GALLERY_ORIGIN_SECRET}});
check([400,404].includes(encodedPath.status),'ENCODED_PATH_REJECTED'); await encodedPath.body?.cancel();
const unsignedPublic = await fetchSafe(`https://storage.yandexcloud.net/${env.GALLERY_BUCKET}/${finalKey}`);
check(unsignedPublic.status===403,'BUCKET_ANONYMOUS_READ_DENIED'); await unsignedPublic.body?.cancel();
let hit=false;
for (let i=0;i<4;i++) {
  const url=signGalleryCdnUrl(cdn.origin,finalKey,new Date(Date.now()+120_000),required('GALLERY_CDN_SECRET'));
  const response=await fetchSafe(url);
  check(response.ok,'CDN_VALID_TOKEN'); check(response.headers.get('cache-control')?.includes('no-store'),'CDN_BROWSER_NO_STORE');
  check(Buffer.from(await response.arrayBuffer()).equals(originBytes),'CDN_FINAL_CONTENT');
  hit ||= /\bHIT\b/i.test(response.headers.get(env.GALLERY_SMOKE_CACHE_HEADER ?? 'x-cache') ?? '');
}
check(hit,'CDN_HIT_REQUIRED');
const unsigned=new URL(`/${finalKey}`,cdn.origin);
const expired=new URL(unsigned), expires=String(Math.floor(Date.now()/1000)-1);
expired.searchParams.set('expires',expires);expired.searchParams.set('md5',createHash('md5').update(`${expires}/${finalKey} ${env.GALLERY_CDN_SECRET}`).digest('base64url'));
const invalid=new URL(signGalleryCdnUrl(cdn.origin,finalKey,new Date(Date.now()+120_000),env.GALLERY_CDN_SECRET)); invalid.searchParams.set('md5','0'.repeat(22));
for (const url of [unsigned,expired,invalid]) {
  const response=await fetchSafe(url); check(response.status===403,'CACHED_HIT_AUTHORIZATION'); await response.body?.cancel();
}
// At-least-once replay: only registered upload ID goes into queue. Final snapshots stay stable.
for(let i=0;i<2;i++) await queue.send(new SendMessageCommand({QueueUrl:env.GALLERY_QUEUE_URL,MessageBody:JSON.stringify({version:1,uploadId:manifest.uploadId})}));
await new Promise(resolve=>setTimeout(resolve,15_000));
check((await store.head(finalKey)).etag===snapshot.metadata.etag,'DUPLICATE_DELIVERY_NO_CHANGE');
console.log(JSON.stringify({status:'passed',environment:env.GALLERY_SMOKE_ENV,originMs,cloudColdStartVerified:false,cdnHitVerified:true,cachedAuthorizationVerified:true,conditionalWritesVerified:true,sourceWithoutConfirmVerified:true,missingEventRecoveryVerified:recoveredUpload,duplicateDeliveryVerified:true,cleanup:'Use authenticated owner deletion; core persists cleanup jobs.'},null,2));
}
main().catch(error => { console.error(JSON.stringify({status:'failed',code:/^[A-Z0-9_]+$/.test(error.message ?? '') ? error.message : 'SMOKE_FAILED'})); process.exitCode=1; });
