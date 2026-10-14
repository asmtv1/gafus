/** Read-only Beget/CDNvideo and Cloud.ru Origin proof; never prints signed URLs.
 * Use existing production Gallery/Feed CDN signing secrets through a protected environment.
 * Does not modify production buckets, Beget resources, DNS or flags.
 */
import { createHash } from 'node:crypto';
const scopes = [
  { name: 'gallery', host: 'mepsuduyokabib.begetcdn.cloud',
    origin: 'gafus-gallery-origin.containerapps.ru', secret: 'GALLERY_CDN_SECRET',
    keyVar: 'BEGET_GALLERY_SMOKE_FINAL_KEY', shaVar: 'BEGET_GALLERY_SMOKE_SHA256' },
  { name: 'feed', host: 'garaquachegasourn.begetcdn.cloud',
    origin: 'gafus-feed-origin.containerapps.ru', secret: 'FEED_CDN_SECRET',
    keyVar: 'BEGET_FEED_SMOKE_FINAL_KEY', shaVar: 'BEGET_FEED_SMOKE_SHA256' },
];
const expectedCacheControl = 'private, max-age=180, must-revalidate';
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
async function check(scope) {
  const secret = process.env[scope.secret] ?? '';
  const allowedSecret = scope.name === 'gallery'
    ? /^[A-Za-z0-9_-]{24,128}$/ : /^[A-Za-z0-9_-]{24,32}$/;
  if (!allowedSecret.test(secret)) throw new Error(`${scope.name.toUpperCase()}_CDN_SECRET_MISSING`);
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
  const url = smokeSignedUrl(scope.host, path, secret, expiry);
  const header = 'x-cdn-edge-cache';
  status(await fetchSafe(`https://${scope.origin}${path}`, { method: 'HEAD' }), 403, 'DIRECT_ORIGIN_UNAUTHORIZED');
  const unsigned = await fetchSafe(`https://${scope.host}${path}`, { method: 'HEAD' });
  if (![403, 410].includes(unsigned.status)) throw new Error(`UNSIGNED_CDN_${unsigned.status}`);
  status(await fetchSafe(smokeSignedUrl(scope.host, path, secret, expiry - 700), { method: 'HEAD' }), 410, 'EXPIRED_SIGNATURE');
  const forged = url.replace(/md5\([A-Za-z0-9_-]{22}/, `md5(${'A'.repeat(22)}`);
  // Rare case the forged token equals the correct token: always mutate it.
  const forgedUrl = forged === url ? url.replace(/md5\(([A-Za-z0-9_-])/, (_, char) => `md5(${char === 'A' ? 'B' : 'A'}`) : forged;
  const invalid = await fetchSafe(forgedUrl, { method: 'HEAD' });
  if (invalid.status !== 403 && invalid.status !== 410) throw new Error(`FORGED_SIGNATURE_${invalid.status}`);
  const cold = await fetchSafe(url);
  status(cold, 200, 'VALID_GET');
  const bytes = new Uint8Array(await cold.arrayBuffer());
  if (!bytes.length || bytes.length > 1_750_000 ||
      !cold.headers.get('content-type')?.includes('image/webp') ||
      createHash('sha256').update(bytes).digest('hex') !== expectedDigest)
    throw new Error('WRONG_FIXTURE_OR_MIME');
  const warm = await fetchSafe(url);
  status(warm, 200, 'WARM_GET');
  const warmBytes = new Uint8Array(await warm.arrayBuffer());
  if (Buffer.compare(bytes, warmBytes) !== 0) throw new Error('CACHE_BYTES_CHANGED');
  const cacheState = warm.headers.get(header)?.toUpperCase() ?? '';
  if (cacheState !== 'HIT') throw new Error(`CACHE_NOT_HIT_${cacheState || 'ABSENT'}`);
  const cacheControl = warm.headers.get('cache-control') ?? '';
  if (cacheControl !== expectedCacheControl) throw new Error(`CLIENT_CACHE_POLICY_MISMATCH_${cacheControl || 'ABSENT'}`);
  status(await fetchSafe(url, { method: 'HEAD' }), 200, 'VALID_HEAD');
  const range = await fetchSafe(url, { headers: { Range: 'bytes=0-4' } });
  status(range, 206, 'RANGE');
  if (range.headers.get('content-range') !== `bytes 0-4/${bytes.length}`) throw new Error('RANGE_HEADER');
  if (Buffer.compare(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 5)) !== 0)
    throw new Error('RANGE_BYTES');
  return { scope: scope.name, signedGet: 200, hotCache: cacheState,
    cacheControl, signedHead: 200, range: 206, originUnauthorized: 403, unsignedDenied: unsigned.status };
}
if (process.argv[1] && process.argv[1].endsWith('/beget-production-smoke.mjs')) {
  let failed = false;
  for (const scope of scopes) {
    try { console.log(JSON.stringify(await check(scope))); }
    catch (error) {
      failed = true;
      // Do not print remote response bodies, secret headers, URLs or tokens.
      console.error(`${scope.name.toUpperCase()}_SMOKE_FAIL:`, error instanceof Error ? error.message : 'UNKNOWN');
    }
  }
  if (failed) process.exitCode = 1;
}
