export declare const INTERNAL_GALLERY_PATHS: readonly ["/internal/gallery/uploads/claim", "/internal/gallery/uploads/complete", "/internal/gallery/uploads/fail", "/internal/gallery/jobs/claim", "/internal/gallery/jobs/complete", "/internal/gallery/jobs/fail", "/internal/gallery/maintenance"];
export type GalleryInternalPath = typeof INTERNAL_GALLERY_PATHS[number];
export interface NonceStore {
    /** Atomic SET NX with expiry, shared by all transport replicas. Fail closed on errors.
     * true only for a previously unseen nonce; retain until expiresAt (epoch milliseconds). */
    consume(nonce: string, expiresAt: number): Promise<boolean>;
}
export declare function canonicalGalleryRequest(method: string, path: string, body: string | Uint8Array, timestamp: string, nonce: string): string;
export declare function signGalleryRequest(input: {
    method: string;
    path: GalleryInternalPath;
    body: string | Uint8Array;
    secret: string;
    timestamp?: number;
    nonce?: string;
}): {
    'x-gallery-timestamp': string;
    'x-gallery-nonce': string;
    'x-gallery-signature': string;
};
export declare function createGalleryRequestVerifier(input: {
    secret: string;
    nonces: NonceStore;
    now?: () => number;
}): (request: {
    method: string;
    path: string;
    body: string | Uint8Array;
    headers: Record<string, string | undefined>;
}) => Promise<boolean>;
