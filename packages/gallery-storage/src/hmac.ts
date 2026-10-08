import { createHash, createHmac, randomUUID } from 'node:crypto';
import { constantTimeEqual } from './cdn.js';
export const INTERNAL_GALLERY_PATHS = [
  '/internal/gallery/uploads/claim', '/internal/gallery/uploads/complete', '/internal/gallery/uploads/fail',
  '/internal/gallery/jobs/claim', '/internal/gallery/jobs/complete', '/internal/gallery/jobs/fail', '/internal/gallery/maintenance',
] as const;
export type GalleryInternalPath = typeof INTERNAL_GALLERY_PATHS[number];
export interface NonceStore {
  /** Atomic SET NX with expiry, shared by all transport replicas. Fail closed on errors.
   * true only for a previously unseen nonce; retain until expiresAt (epoch milliseconds). */
  consume(nonce: string, expiresAt: number): Promise<boolean>;
}
export function canonicalGalleryRequest(method: string, path: string, body: string | Uint8Array, timestamp: string, nonce: string): string {
  if (method !== 'POST' || !(INTERNAL_GALLERY_PATHS as readonly string[]).includes(path) || !/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce))
    throw new Error('INVALID_SIGNING_INPUT');
  return `gallery-v1\n${timestamp}\n${nonce}\n${method}\n${path}\n${createHash('sha256').update(body).digest('hex')}`;
}
function validateSecret(secret: string) { if (Buffer.byteLength(secret) < 32) throw new Error('INVALID_HMAC_SECRET'); }
export function signGalleryRequest(input: { method: string; path: GalleryInternalPath; body: string | Uint8Array; secret: string; timestamp?: number; nonce?: string }) {
  validateSecret(input.secret);
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000)), nonce = input.nonce ?? randomUUID();
  const signature = createHmac('sha256', input.secret).update(canonicalGalleryRequest(input.method, input.path, input.body, timestamp, nonce)).digest('hex');
  return { 'x-gallery-timestamp': timestamp, 'x-gallery-nonce': nonce, 'x-gallery-signature': signature };
}
export function createGalleryRequestVerifier(input: { secret: string; nonces: NonceStore; now?: () => number }) {
  validateSecret(input.secret);
  return async (request: { method: string; path: string; body: string | Uint8Array; headers: Record<string, string | undefined> }): Promise<boolean> => {
    const timestamp = request.headers['x-gallery-timestamp'] ?? '', nonce = request.headers['x-gallery-nonce'] ?? '', signature = request.headers['x-gallery-signature'] ?? '';
    const now = (input.now ?? Date.now)();
    if (Buffer.byteLength(request.body) > 16_384 || !/^[a-f0-9]{64}$/.test(signature) || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 60) return false;
    let expected: string;
    try { expected = createHmac('sha256', input.secret).update(canonicalGalleryRequest(request.method, request.path, request.body, timestamp, nonce)).digest('hex'); }
    catch { return false; }
    if (!constantTimeEqual(expected, signature)) return false;
    // A future timestamp remains valid until timestamp + 60s; never expire a nonce sooner.
    return input.nonces.consume(`gallery-v1:${nonce}`, (Number(timestamp) + 61) * 1000);
  };
}
