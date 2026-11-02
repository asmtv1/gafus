/** Read-only Feed V2 Beget smoke. Gallery is tested separately by the
 * private S3 SigV4 Hono redirect canary, never by the retired origin.
 */
import { createHash } from 'node:crypto';
const feed = { name: 'feed', host: 'quepraquiecebquomiel.begetcdn.cloud',
  secret: 'FEED_CDN_SECRET', keyVar: 'BEGET_FEED_SMOKE_FINAL_KEY',
  shaVar: 'BEGET_FEED_SMOKE_SHA256' };
const status = (response, expected, code) => {
  if (response.status !== expected) throw new Error(`${code}_${response.status}`);
};
const fetchSafe = async (url, options = {}) => fetch(url, {
  ...options, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12_000),
});
const token = (secret, path, expiry) => createHash('md5')
  .update(`${secret}${path}${expiry}`).digest('base64url');
export function smokeSignedUrl(host, path, secret, expiry) {
  return `https://${host}/md5(${token(secret, path, expiry)},${expiry})${path}`;
}
// Explicit product decision: Feed V2 published variants are public.
// Feed app uses ?md5=...&expires=... query URLs for compatibility.
async function checkPublicFeedV2(scope,key,digest,secret) {
  if(process.env.FEED_CDN_PUBLIC_READ_APPROVED!=='true')
    throw Error('FEED_PUBLIC_MEDIA_MODE_UNAPPROVED');
  if(!/^media\/v2\/[A-Za-z0-9_-]{1,128}\/v[1-9][0-9]*\/image\/(?:s|m|l)\.webp$/.test(key))
    throw Error('FEED_V2_SMOKE_KEY_INVALID');
  const path='/'+key;
  const daily=process.env.FEED_PUBLIC_BROWSER_CACHE_24H_VERIFIED==='true';
  if(daily && process.env.FEED_CDN_BROWSER_CACHE_24H_VERIFIED!=='true')
    throw Error('FEED_24H_CACHE_PROVIDER_GATE_MISSING');
  // A live long-signature request is mandatory before enabling 24h mode.
  const expiry=Math.floor(Date.now()/1000)+(daily ? 30*3600 : 180);
  const md5=createHash('md5').update(expiry+path+' '+secret).digest('base64url');
  const publicUrl='https://'+scope.host+path;
  const applicationUrl=publicUrl+'?md5='+md5+'&expires='+expiry;
  const publicGet=await fetchSafe(publicUrl);
  status(publicGet,200,'FEED_PUBLIC_GET');
  const bytes=Buffer.from(await publicGet.arrayBuffer());
  if(!bytes.length || bytes.length>1_750_000 ||
     !publicGet.headers.get('content-type')?.includes('image/webp') ||
     createHash('sha256').update(bytes).digest('hex')!==digest)
    throw Error('FEED_PUBLIC_BYTES_OR_DIGEST_MISMATCH');
  const appGet=await fetchSafe(applicationUrl);
  status(appGet,200,'FEED_QUERY_TOKEN_GET');
  if(!Buffer.from(await appGet.arrayBuffer()).equals(bytes))
    throw Error('FEED_APPLICATION_URL_BYTES_DIFFER');
  const cacheControl=appGet.headers.get('cache-control')??'';
  if(cacheControl!==(daily ? 'public, max-age=86400, immutable' : 'public, max-age=180, must-revalidate'))
    throw Error('FEED_PUBLIC_BROWSER_CACHE_MISMATCH');
  const head=await fetchSafe(applicationUrl,{method:'HEAD'});
  status(head,200,'FEED_QUERY_TOKEN_HEAD');
  if(head.headers.get('content-type')!=='image/webp')
    throw Error('FEED_QUERY_TOKEN_HEAD_MIME');
  const range=await fetchSafe(applicationUrl,{headers:{Range:'bytes=0-4'}});
  status(range,206,'FEED_QUERY_TOKEN_RANGE');
  if(range.headers.get('content-range')!=='bytes 0-4/'+bytes.length ||
     !Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(0,5)))
    throw Error('FEED_QUERY_TOKEN_RANGE_MISMATCH');
  const cacheState=appGet.headers.get('x-cdn-edge-cache')?.toUpperCase()??'ABSENT';
  if(cacheState!=='HIT') console.warn('FEED_V2_EDGE_CACHE_WARNING_'+cacheState);
  return {scope:scope.name,publicMode:true,get:200,queryTokenGet:200,
    head:200,range:206,sha256Verified:true,cacheState};
}

async function checkFeed() {
  const secret = process.env[feed.secret] ?? '';
  if (!/^[A-Za-z0-9_-]{24,32}$/.test(secret)) throw Error('FEED_CDN_SECRET_MISSING');
  const key = process.env[feed.keyVar] ?? '';
  const digest = process.env[feed.shaVar] ?? '';
  if (!/^media\/v2\/[A-Za-z0-9_-]{1,128}\/v[1-9][0-9]*\/image\/(?:s|m|l)\.webp$/.test(key) ||
      key.includes('/staging/') || key.includes('__gafus_cloudru_validation__') ||
      !/^[a-f0-9]{64}$/.test(digest)) throw Error('FEED_SMOKE_FINAL_OBJECT_MISSING');
  return checkPublicFeedV2(feed, key, digest, secret);
}

const smokeMode = process.argv[2] ?? '--both';
if (!['--both', '--feed-only'].includes(smokeMode) || process.argv.length > 3)
  throw Error('BEGET_SMOKE_INVALID_MODE');
if (process.argv[1]?.endsWith('/beget-production-smoke.mjs')) {
  checkFeed().then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error('FEED_SMOKE_FAIL:', error instanceof Error ? error.message : 'UNKNOWN');
      process.exitCode = 1;
    });
}
