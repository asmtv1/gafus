/** Native disk cache *lookups* are private to the account, final object version,
 * and a 180s window. Signatures must not become cache keys or durable metadata.
 * The native SDK may retain orphaned physical bytes; logout clears its disk.
 */
const galleryPath = /^\/albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full)\.webp$/;
const galleryV2Path = /^\/gallery\/[A-Za-z0-9_-]{1,128}\/media\/[A-Za-z0-9_-]{1,128}\/v2\/(?:thumb|full)\.webp$/;
const galleryVetPath = /^\/users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/vet-visits\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/thumb\.webp$/;
const feedPath = /^\/posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full|poster)\.webp$/;
// Feed Media V2: one immutable media-version key shared by Web and Mobile.
const feedV2Path = /^\/media\/v2\/[A-Za-z0-9_-]{1,128}\/v[1-9][0-9]*\/(?:image\/[sml]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/;
const feedV2Signature = /^\?md5=[A-Za-z0-9_-]{22}&expires=\d{10}$/;
const dayMs = 86_400_000;
/** Opt-in public Feed V2 CDN token: exact immutable final key, with 24–48h
 * remaining. Reject private Gallery, short-lived and S3 fallback signatures.
 * A longer token is only emitted after the server's live Beget cache gates.
 */
export function isLongLivedPublicFeedCdnUrl(raw: string, now = Date.now()): boolean {
  if (!Number.isFinite(now) || now < 0) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        url.hash || url.hostname !== "quepraquiecebquomiel.begetcdn.cloud" ||
        !feedV2Path.test(url.pathname) || !feedV2Signature.test(url.search)) return false;
    const expiresMs = Number(url.searchParams.get("expires")) * 1000;
    return Number.isSafeInteger(expiresMs) &&
      expiresMs - now >= dayMs &&
      expiresMs - now <= 2 * dayMs;
  } catch { return false; }
}
const signature = /^\/md5\([A-Za-z0-9_-]{22},\d{10}\)/;
function authorizedFinalPath(scope: 'gallery' | 'feed', path: string): boolean {
  return scope === 'gallery' ? galleryPath.test(path) || galleryV2Path.test(path) || galleryVetPath.test(path) :
    feedPath.test(path) || feedV2Path.test(path);
}
export function scopedMediaCacheKey(urlString: string, accountId: string, now = Date.now()): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId) || !Number.isFinite(now) || now < 0)
    throw new Error('MEDIA_CACHE_ACCOUNT_REQUIRED');
  const url = new URL(urlString);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
    throw new Error('MEDIA_CACHE_UNTRUSTED_HOST');
  const hosts = {
    'fupiquafifeswu.begetcdn.cloud': 'gallery',
    'quepraquiecebquomiel.begetcdn.cloud': 'feed',
  } as const;
  const isCloudru = url.hostname === 's3.cloud.ru';
  const scope = isCloudru ? null : hosts[url.hostname as keyof typeof hosts];
  if (!isCloudru && !scope) throw new Error('MEDIA_CACHE_UNTRUSTED_HOST');
  let path: string;
  let kind: 'gallery' | 'feed';
  let signedExpirySec: number | undefined;
  if (isCloudru) {
    if (!url.searchParams.has('X-Amz-Signature')) throw new Error('MEDIA_CACHE_UNSIGNED');
    const match = /^\/(gafus-gallery-private|gafus-feed-private)(\/.*)$/.exec(url.pathname);
    if (!match) throw new Error('MEDIA_CACHE_UNTRUSTED_PATH');
    kind = match[1] === 'gafus-gallery-private' ? 'gallery' : 'feed';
    path = match[2]!;
  } else {
    kind = scope!;
    // V2 Feed URLs use query signatures rather than legacy Gallery's path
    // tokens. Do not persist signature tokens or accept arbitrary query keys.
    if (kind === 'feed' && feedV2Path.test(url.pathname)) {
      if (!feedV2Signature.test(url.search)) throw new Error('MEDIA_CACHE_UNSIGNED');
      signedExpirySec = Number(url.searchParams.get('expires'));
      path = url.pathname;
    } else {
      if (url.search || !signature.test(url.pathname)) throw new Error('MEDIA_CACHE_UNSIGNED');
      signedExpirySec = Number(url.pathname.match(/^\/md5\([A-Za-z0-9_-]{22},(\d{10})\)/)?.[1]);
      path = url.pathname.replace(signature, '');
    }
  }
  if (!authorizedFinalPath(kind, path)) throw new Error('MEDIA_CACHE_UNTRUSTED_PATH');
  // A stable disk key is safe only while the server-issued CDN token is valid.
  // Never let the 180-second cache slot outlive an expired (or nearly expired)
  // token; keep it memory-only until a fresh authenticated media read arrives.
  if (signedExpirySec !== undefined &&
      (!Number.isSafeInteger(signedExpirySec) || signedExpirySec * 1000 <= now + 15_000))
    throw new Error('MEDIA_CACHE_EXPIRED');
  const slot = Math.floor(now / (kind === 'feed' && isLongLivedPublicFeedCdnUrl(urlString, now)
    ? dayMs : 180_000));
  return `gafus-media-v2:${accountId}:${kind}:${url.hostname}:${path}:${slot}`;
}
