import { createHash, timingSafeEqual } from 'node:crypto';
import { assertFinalKey } from './keys.js';
export function yandexCdnToken(path: string, expires: number, secret: string): string {
  assertFinalKey(path.slice(1));
  if (!path.startsWith('/') || !Number.isSafeInteger(expires) || !/^[A-Za-z0-9_-]{6,32}$/.test(secret)) throw new Error('INVALID_CDN_SIGNING_INPUT');
  return createHash('md5').update(`${expires}${path} ${secret}`).digest('base64url');
}
export function signGalleryCdnUrl(baseUrl: string, key: string, expiresAt: Date, secret: string, now = Date.now()): string {
  assertFinalKey(key);
  const expires = Math.floor(expiresAt.getTime() / 1000);
  if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + 120) throw new Error('INVALID_CDN_EXPIRY');
  return `${baseUrl}/${key}?md5=${yandexCdnToken(`/${key}`, expires, secret)}&expires=${expires}`;
}
export function verifyGalleryCdnToken(path: string, query: Record<string, string | undefined>, secret: string, now = Date.now()): boolean {
  try {
    if (!/^\d{10}$/.test(query.expires ?? '') || !/^[A-Za-z0-9_-]{22}$/.test(query.md5 ?? '')) return false;
    const expires = Number(query.expires);
    if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + 120) return false;
    return constantTimeEqual(yandexCdnToken(path, expires, secret), query.md5!);
  } catch { return false; }
}
export function constantTimeEqual(a: string, b: string): boolean {
  // Fixed digest lengths avoid leaking secret length, including malformed input.
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}
