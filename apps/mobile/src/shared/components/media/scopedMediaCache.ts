/** Native disk cache *lookups* are private to the account, final object version,
 * and a 180s window. Signatures must not become cache keys or durable metadata.
 * The native SDK may retain orphaned physical bytes; logout clears its disk.
 */
const galleryPath = /^\/albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full)\.webp$/;
const galleryVetPath = /^\/users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/vet-visits\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/thumb\.webp$/;
const feedPath = /^\/posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full|poster)\.webp$/;
const signature = /^\/md5\([A-Za-z0-9_-]{22},\d{10}\)/;
function authorizedFinalPath(scope: 'gallery' | 'feed', path: string): boolean {
  return scope === 'gallery' ? galleryPath.test(path) || galleryVetPath.test(path) : feedPath.test(path);
}
export function scopedMediaCacheKey(urlString: string, accountId: string, now = Date.now()): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId) || !Number.isFinite(now) || now < 0)
    throw new Error('MEDIA_CACHE_ACCOUNT_REQUIRED');
  const url = new URL(urlString);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
    throw new Error('MEDIA_CACHE_UNTRUSTED_HOST');
  const hosts = {
    'mepsuduyokabib.begetcdn.cloud': 'gallery',
    'garaquachegasourn.begetcdn.cloud': 'feed',
  } as const;
  const isCloudru = url.hostname === 's3.cloud.ru';
  const scope = isCloudru ? null : hosts[url.hostname as keyof typeof hosts];
  if (!isCloudru && !scope) throw new Error('MEDIA_CACHE_UNTRUSTED_HOST');
  let path: string;
  let kind: 'gallery' | 'feed';
  if (isCloudru) {
    if (!url.searchParams.has('X-Amz-Signature')) throw new Error('MEDIA_CACHE_UNSIGNED');
    const match = /^\/(gafus-gallery-private|gafus-feed-private)(\/.*)$/.exec(url.pathname);
    if (!match) throw new Error('MEDIA_CACHE_UNTRUSTED_PATH');
    kind = match[1] === 'gafus-gallery-private' ? 'gallery' : 'feed';
    path = match[2]!;
  } else {
    kind = scope!;
    if (url.search || !signature.test(url.pathname)) throw new Error('MEDIA_CACHE_UNSIGNED');
    path = url.pathname.replace(signature, '');
  }
  if (!authorizedFinalPath(kind, path)) throw new Error('MEDIA_CACHE_UNTRUSTED_PATH');
  const slot = Math.floor(now / 180_000);
  return `gafus-media-v2:${accountId}:${kind}:${url.hostname}:${path}:${slot}`;
}
