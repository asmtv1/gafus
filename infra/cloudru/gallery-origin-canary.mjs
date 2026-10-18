/** Read-only production canary: tests the REAL deployed GAFUS API 307 origin via
 * the isolated Beget Gallery CDN BEFORE switching Gallery viewer URLs.
 * No S3 writes, media uploads, purge calls, or user identity logs.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HOST = 'https://dikinuneceswe.begetcdn.cloud';
const ORIGIN = 'https://api.gafus.ru';
const CLIENT_CACHE = 'public, max-age=180, s-maxage=600, must-revalidate';
const FINAL = /^(?:albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full)\.webp|users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/vet-visits\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/thumb\.webp)$/;

export function galleryCanarySignedUrl(key, secret, expiry) {
  if (!FINAL.test(key) || !/^[A-Za-z0-9]{24,128}$/.test(secret) ||
      !Number.isSafeInteger(expiry) || expiry < 1)
    throw new Error('GALLERY_CANARY_INPUT_INVALID');
  const path = `/${key}`;
  const token = createHash('md5').update(`${secret}${path}${expiry}`).digest('base64url');
  return `${HOST}/md5(${token},${expiry})${path}`;
}

async function request(url, options, fetchImpl) {
  // Retry ONLY transport failures; a received HTTP error is always definitive.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(16000) }); }
    catch (error) { if (attempt === 2) throw new Error('GALLERY_CANARY_TRANSPORT_FAILURE', {cause: error}); }
  }
  throw Error('GALLERY_CANARY_TRANSPORT_FAILURE');
}
function expected(response, code, label) {
  if (response.status !== code) throw Error(`GALLERY_CANARY_${label}_${response.status}`);
}
function edgeResponse(response, label) {
  expected(response, 200, label);
  if (response.headers.has('location')) throw Error(`GALLERY_CANARY_${label}_ORIGIN_URL_EXPOSED`);
  if (!response.headers.get('content-type')?.includes('image/webp'))
    throw Error(`GALLERY_CANARY_${label}_MIME`);
  if (response.headers.get('cache-control') !== CLIENT_CACHE)
    throw Error(`GALLERY_CANARY_${label}_CLIENT_CACHE`);
}
export async function checkGalleryOriginCanary(env = process.env, fetchImpl = fetch, now = Math.floor(Date.now() / 1000)) {
  if (env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED !== 'true') throw Error('GALLERY_CANARY_ROUTE_NOT_ENABLED');
  const secret = env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? '';
  const key = env.BEGET_GALLERY_SMOKE_FINAL_KEY ?? '';
  const sha = env.BEGET_GALLERY_SMOKE_SHA256 ?? '';
  if (!FINAL.test(key) || !/^[a-f0-9]{64}$/.test(sha) || !/^[A-Za-z0-9]{24,128}$/.test(secret))
    throw Error('GALLERY_CANARY_UNVERIFIED_FIXTURE_OR_SECRET');
  const url = galleryCanarySignedUrl(key, secret, now + 180);
  const origin = `${ORIGIN}/${key}`;
  const unauth = await request(origin, {}, fetchImpl);
  expected(unauth, 404, 'ORIGIN_MUST_BE_PRIVATE');
  await unauth.body?.cancel();
  const forged = await request(`${HOST}/md5(${'A'.repeat(22)},${now + 180})/${key}`, {}, fetchImpl);
  if (![403, 410].includes(forged.status)) throw Error('GALLERY_CANARY_FORGED_TOKEN_ALLOWED');
  await forged.body?.cancel();
  const expired = await request(galleryCanarySignedUrl(key, secret, now - 60), {}, fetchImpl);
  if (![403, 410].includes(expired.status)) throw Error('GALLERY_CANARY_EXPIRED_TOKEN_ALLOWED');
  await expired.body?.cancel();
  const cold = await request(url, {}, fetchImpl);
  edgeResponse(cold, 'SIGNED_GET');
  const bytes = Buffer.from(await cold.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 1_750_000 || createHash('sha256').update(bytes).digest('hex') !== sha)
    throw Error('GALLERY_CANARY_INCORRECT_CONTENT');
  const warm = await request(url, {}, fetchImpl);
  edgeResponse(warm, 'WARM_GET');
  const warmBytes = Buffer.from(await warm.arrayBuffer());
  if (!warmBytes.equals(bytes) || warm.headers.get('x-cdn-edge-cache')?.toUpperCase() !== 'HIT')
    throw Error('GALLERY_CANARY_NO_CACHE_HIT');
  const head = await request(url, { method: 'HEAD' }, fetchImpl);
  expected(head, 200, 'HEAD');
  if (head.headers.has('location')) throw Error('GALLERY_CANARY_HEAD_ORIGIN_URL_EXPOSED');
  await head.body?.cancel();
  const range = await request(url, { headers: {Range: 'bytes=0-4'} }, fetchImpl);
  expected(range, 206, 'RANGE');
  if (range.headers.get('content-range') !== `bytes 0-4/${bytes.length}` ||
      !Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(0, 5)))
    throw Error('GALLERY_CANARY_RANGE_CONTENT');
  return { originUnauthorized: 404, signedGet: 200, cacheHit: true,
    browserSeconds: 180, cdnSharedSeconds: 600, head: 200, range: 206,
    expiredDenied: true, forgedDenied: true, noUserFacingS3Redirect: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log('GALLERY_ORIGIN_CANARY_PASS', JSON.stringify(await checkGalleryOriginCanary())); }
  catch (e) { console.error('GALLERY_ORIGIN_CANARY_FAILED', e instanceof Error ? e.message : 'UNKNOWN'); process.exitCode = 1; }
}
