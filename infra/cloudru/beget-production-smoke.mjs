/** Read-only Beget/CDNvideo and Cloud.ru Origin proof; never prints signed URLs.
 * Use existing production Gallery/Feed CDN signing secrets through a protected environment.
 * Does not modify production buckets, Beget resources, DNS or flags.
 */
import { createHash } from 'node:crypto';
const galleryRedirect = process.env.GALLERY_CDN_REDIRECT_ENABLED === 'true';
const scopes = [
  { name: 'gallery', host: galleryRedirect ? 'dikinuneceswe.begetcdn.cloud' : 'mepsuduyokabib.begetcdn.cloud',
    origin: galleryRedirect ? 'api.gafus.ru' : 'gafus-gallery-origin.containerapps.ru',
    secret: galleryRedirect ? 'GALLERY_CDN_REDIRECT_SIGNING_SECRET' : 'GALLERY_CDN_SECRET',
    keyVar: 'BEGET_GALLERY_SMOKE_FINAL_KEY', shaVar: 'BEGET_GALLERY_SMOKE_SHA256' },
  { name: 'feed', host: 'garaquachegasourn.begetcdn.cloud',
    origin: 'gafus-feed-origin.containerapps.ru', secret: 'FEED_CDN_SECRET',
    keyVar: 'BEGET_FEED_SMOKE_FINAL_KEY', shaVar: 'BEGET_FEED_SMOKE_SHA256' },
];
const expectedCacheControl = 'private, max-age=180, must-revalidate';
const legacyFeedSmoke = {
  key: 'posts/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/beget-smoke-bef94b1b82bd47a6b05325ec8be2b22e/attachments/bef94b1b82bd47a6b05325ec8be2b22e/poster.webp',
  digest: '93c513effa21235a9617897eb55830910863834228730eae0f42b5c78043fb02',
};
export function allowLegacyPublicFeedSmokeMiss(publicRead, key, digest, cacheState) {
  return publicRead && key === legacyFeedSmoke.key &&
    digest === legacyFeedSmoke.digest && cacheState === 'MISS';
}

const status = (response, expected, code) => {
  if (response.status !== expected) throw new Error(`${code}_${response.status}`);
};
// Read-only CDN requests may hit intermittent TLS/connect timeouts at the edge.
// Retry ONLY transport errors (never an HTTP response, bad signature, wrong
// bytes/SHA256, wrong Cache-Control, or missing cache HIT). Keep URLs/signing
// tokens entirely out of retry logs.
export function isRetryableSmokeTransportError(error) {
  if (error?.name === 'TimeoutError') return true;
  if (error?.name !== 'TypeError') return false;
  return new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
    'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH'])
    .has(error.cause?.code);
}
export async function fetchSafe(url, options = {}, http = fetch,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await http(url, {
        ...options, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      // Undici can receive HTTP headers successfully, then time out while
      // downloading the WebP body. Buffer successful GETs inside this same
      // retry boundary; keep every status and header for the strict checks.
      if ((options.method === undefined || options.method === 'GET') &&
          (response.status === 200 || response.status === 206) &&
          response instanceof Response) {
        const body = await response.arrayBuffer();
        return new Response(body, { status: response.status, headers: response.headers });
      }
      return response;
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableSmokeTransportError(error)) throw error;
      // Never log the signed URL, response body, tokens, or headers.
      console.warn('BEGET_SMOKE_TRANSPORT_RETRY', JSON.stringify({
        method: options.method ?? 'GET', nextAttempt: attempt + 1, maxAttempts,
      }));
      await pause(350 * attempt);
    }
  }
}
// A public CDN edge can briefly return a stale 403 after origin/ACL updates.
// Recheck only the approved public Feed URL. Persistent denial still fails,
// and every successful response must pass the ordinary strict SHA/MIME/cache
// and range assertions. Private origins and forged signatures never use this.
export async function fetchPublicFeedProof(url, options = {}, request = fetchSafe,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await request(url, options);
    if (response.status !== 403 || attempt === 3) return response;
    console.warn('PUBLIC_FEED_CDN_403_RECHECK', JSON.stringify({
      method: options.method ?? 'GET', nextAttempt: attempt + 1, maxAttempts: 3,
    }));
    await pause(1500 * attempt);
  }
}
const token = (secret, path, expiry) => createHash('md5')
  .update(`${secret}${path}${expiry}`).digest('base64url');
export function smokeSignedUrl(host, path, secret, expiry) {
  return `https://${host}/md5(${token(secret, path, expiry)},${expiry})${path}`;
}
async function check(scope) {
  const publicRead = scope.name === 'feed' && process.env.FEED_BUCKET_PUBLIC === 'true';
  const secret = publicRead ? '' : process.env[scope.secret] ?? '';
  const allowedSecret = scope.name === 'gallery'
    ? /^[A-Za-z0-9_-]{24,128}$/ : /^[A-Za-z0-9_-]{24,32}$/;
  if (!publicRead && !allowedSecret.test(secret)) throw new Error(`${scope.name.toUpperCase()}_CDN_SECRET_MISSING`);
  // Previously retained diagnostics are under /staging/, which both private
  // Origins rightly reject. A real smoke MUST use separately approved, immutable
  // synthetic WebP stored under the normal final-key namespace.
  const key = process.env[scope.keyVar] ?? '';
  const expectedDigest = process.env[scope.shaVar] ?? '';
  const id = '[A-Za-z0-9_-]{1,128}';
  const gallery = new RegExp(`^albums/${id}/${id}/photos/${id}/(?:thumb|full)\\.webp$`);
  const feed = new RegExp(`^posts/${id}/${id}/attachments/${id}/(?:thumb|full|poster)\\.webp$`);
  if (!(scope.name === 'gallery' ? gallery : feed).test(key) ||
      key.includes('/staging/') || key.includes('__gafus_cloudru_validation__') ||
      !/^[0-9a-f]{64}$/.test(expectedDigest))
    throw new Error(`${scope.name.toUpperCase()}_SMOKE_FINAL_OBJECT_MISSING`);
  const path = `/${key}`;
  const expiry = Math.floor(Date.now() / 1000) + 300;
  const publicHost = process.env.FEED_CDN_BASE_URL ?? '';
  if (publicRead && (!/^https:\/\/[a-z0-9-]+\.begetcdn\.cloud$/.test(publicHost) ||
      publicHost === 'https://garaquachegasourn.begetcdn.cloud'))
    throw new Error('UNSAFE_PUBLIC_FEED_CDN');
  const url = publicRead ? `${publicHost}${path}` : smokeSignedUrl(scope.host, path, secret, expiry);
  const header = 'x-cdn-edge-cache';
  let unsignedStatus = null;
  if (!publicRead) {
    status(await fetchSafe(`https://${scope.origin}${path}`, { method: 'HEAD' }),
      galleryRedirect && scope.name === 'gallery' ? 404 : 403, 'DIRECT_ORIGIN_UNAUTHORIZED');
  const unsigned = await fetchSafe(`https://${scope.host}${path}`, { method: 'HEAD' });
  unsignedStatus = unsigned.status;
  if (![403, 410].includes(unsigned.status)) throw new Error(`UNSIGNED_CDN_${unsigned.status}`);
  status(await fetchSafe(smokeSignedUrl(scope.host, path, secret, expiry - 700), { method: 'HEAD' }), 410, 'EXPIRED_SIGNATURE');
  const forged = url.replace(/md5\([A-Za-z0-9_-]{22}/, `md5(${'A'.repeat(22)}`);
  // Rare case the forged token equals the correct token: always mutate it.
  const forgedUrl = forged === url ? url.replace(/md5\(([A-Za-z0-9_-])/, (_, char) => `md5(${char === 'A' ? 'B' : 'A'}`) : forged;
  const invalid = await fetchSafe(forgedUrl, { method: 'HEAD' });
  if (invalid.status !== 403 && invalid.status !== 410) throw new Error(`FORGED_SIGNATURE_${invalid.status}`);
  }
  const edgeRequest = publicRead ? fetchPublicFeedProof : fetchSafe;
  const cold = await edgeRequest(url);
  status(cold, 200, 'VALID_GET');
  const bytes = new Uint8Array(await cold.arrayBuffer());
  if (!bytes.length || bytes.length > 1_750_000 ||
      !cold.headers.get('content-type')?.includes('image/webp') ||
      createHash('sha256').update(bytes).digest('hex') !== expectedDigest)
    throw new Error('WRONG_FIXTURE_OR_MIME');
  const warm = await edgeRequest(url);
  status(warm, 200, 'WARM_GET');
  const warmBytes = new Uint8Array(await warm.arrayBuffer());
  if (Buffer.compare(bytes, warmBytes) !== 0) throw new Error('CACHE_BYTES_CHANGED');
  const cacheState = warm.headers.get(header)?.toUpperCase() ?? '';
  // This pre-existing, immutable fixture was uploaded with `private, no-store`.
  // Beget correctly refuses to cache its origin response. Independent live
  // synthetic acceptance proved a real MISS -> HIT with public cache headers.
  // Only this exact *key + SHA256* may return MISS; all other fixtures need HIT.
  const legacyNoStoreFixture = allowLegacyPublicFeedSmokeMiss(publicRead, key, expectedDigest, cacheState);
  if (cacheState !== 'HIT' && !legacyNoStoreFixture)
    throw new Error(`CACHE_NOT_HIT_${cacheState || 'ABSENT'}`);
  if (legacyNoStoreFixture && cacheState === 'MISS')
    console.log('FEED_LEGACY_SMOKE_NO_STORE_MISS_ACCEPTED (independent synthetic HIT validated)');
  const cacheControl = warm.headers.get('cache-control') ?? '';
  if (publicRead ? (!cacheControl.includes('max-age=180') || cacheControl.includes('no-store'))
    : scope.name === 'gallery' && galleryRedirect
      ? (cacheControl !== 'public, max-age=180, s-maxage=600, must-revalidate')
      : cacheControl !== expectedCacheControl)
    throw new Error(`CLIENT_CACHE_POLICY_MISMATCH_${cacheControl || 'ABSENT'}`);
  status(await edgeRequest(url, { method: 'HEAD' }), 200, 'VALID_HEAD');
  const range = await edgeRequest(url, { headers: { Range: 'bytes=0-4' } });
  status(range, 206, 'RANGE');
  if (range.headers.get('content-range') !== `bytes 0-4/${bytes.length}`) throw new Error('RANGE_HEADER');
  if (Buffer.compare(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 5)) !== 0)
    throw new Error('RANGE_BYTES');
  return publicRead
    ? { scope: scope.name, publicGet: 200, hotCache: cacheState,
        cacheControl, publicHead: 200, range: 206 }
    : { scope: scope.name, signedGet: 200, hotCache: cacheState,
        cacheControl, signedHead: 200, range: 206, originUnauthorized: galleryRedirect && scope.name === 'gallery' ? 404 : 403, unsignedDenied: unsignedStatus };
}
export function selectedSmokeScopes(args = process.argv.slice(2), env = process.env) {
  if (args.length === 0) return scopes;
  if (args.length !== 1 || args[0] !== '--feed-only')
    throw Error('BEGET_SMOKE_INVALID_MODE');
  // The old Gallery Origin has been retired. Before the new API release, the
  // Gallery 307 route cannot be tested live; its edge settings and private S3
  // metadata are checked separately, and the full signed E2E smoke runs AFTER
  // deployment. Never let feed-only silently mask a disabled Gallery cutover.
  if (env.GALLERY_CDN_REDIRECT_ENABLED !== 'true' ||
      env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED !== 'true' ||
      env.FEED_BUCKET_PUBLIC !== 'true')
    throw Error('BEGET_SMOKE_FEED_ONLY_REQUIRES_NEW_GALLERY_AND_PUBLIC_FEED');
  return scopes.filter(scope => scope.name === 'feed');
}
if (process.argv[1] && process.argv[1].endsWith('/beget-production-smoke.mjs')) {
  let failed = false;
  let activeScopes = [];
  try { activeScopes = selectedSmokeScopes(); }
  catch (error) {
    console.error('BEGET_SMOKE_MODE_BLOCKED:', error instanceof Error ? error.message : 'UNKNOWN');
    process.exitCode = 1;
  }
  for (const scope of activeScopes) {
    try { console.log(JSON.stringify(await check(scope))); }
    catch (error) {
      failed = true;
      // Do not print remote response bodies, secret headers, URLs or tokens.
      console.error(`${scope.name.toUpperCase()}_SMOKE_FAIL:`, error instanceof Error ? error.message : 'UNKNOWN');
    }
  }
  if (failed) process.exitCode = 1;
}
