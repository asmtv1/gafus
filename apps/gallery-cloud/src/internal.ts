import { signGalleryRequest, type GalleryInternalPath } from '@gafus/gallery-storage/hmac';
import type { GalleryUploadClaim, GalleryStorageJobClaim, GalleryCallbackResult, GalleryCompleteUploadInput, GalleryFailUploadInput, GalleryCompleteStorageJobInput, GalleryFailStorageJobInput, GalleryMaintenanceResult } from '@gafus/core/services/gallery';
export interface GalleryInternalClient {
  claimUpload(uploadId: string): Promise<GalleryUploadClaim | null>;
  completeUpload(input: GalleryCompleteUploadInput): Promise<GalleryCallbackResult>;
  failUpload(input: GalleryFailUploadInput): Promise<GalleryCallbackResult>;
  claimJobs(limit: number, uploadId?: string): Promise<GalleryStorageJobClaim[]>;
  completeJob(input: GalleryCompleteStorageJobInput): Promise<GalleryCallbackResult>;
  failJob(input: GalleryFailStorageJobInput): Promise<GalleryCallbackResult>;
  maintenance(limit: number): Promise<GalleryMaintenanceResult>;
}
export class InternalHttpError extends Error { constructor(public status: number) { super(`INTERNAL_HTTP_${status}`); } }
export function createGalleryInternalClient(input: { baseUrl: string; secret: string; fetch?: typeof fetch }): GalleryInternalClient {
  const url = new URL(input.baseUrl);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password || Buffer.byteLength(input.secret) < 32) throw new Error('INVALID_INTERNAL_CONFIG');
  const request = async <T>(path: GalleryInternalPath, value: unknown): Promise<T> => {
    const body = JSON.stringify(value);
    // Retry ambiguous timeouts with a fresh nonce; core attempt tokens provide operation idempotency.
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await (input.fetch ?? fetch)(`${url.origin}${path}`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', ...signGalleryRequest({ method: 'POST', path, body, secret: input.secret }) }, body, signal: AbortSignal.timeout(5000) });
        if (!response.ok) { await response.body?.cancel(); throw new InternalHttpError(response.status); }
        const bytes = await response.text();
        if (Buffer.byteLength(bytes) > 65_536) throw new Error('INTERNAL_RESPONSE_SIZE');
        // Transport contract is bare JSON core return value, without an envelope.
        return JSON.parse(bytes) as T;
      } catch (error) {
        if (attempt >= 1 || (error instanceof InternalHttpError && error.status < 500 && error.status !== 429)) throw error;
      }
    }
  };
  return {
    claimUpload: (uploadId) => request('/internal/gallery/uploads/claim', { uploadId }),
    completeUpload: (v) => request('/internal/gallery/uploads/complete', v), failUpload: (v) => request('/internal/gallery/uploads/fail', v),
    claimJobs: (limit, uploadId) => request('/internal/gallery/jobs/claim', { limit, ...(uploadId ? { uploadId } : {}) }), completeJob: (v) => request('/internal/gallery/jobs/complete', v), failJob: (v) => request('/internal/gallery/jobs/fail', v), maintenance: (limit) => request('/internal/gallery/maintenance', { limit }),
  };
}
