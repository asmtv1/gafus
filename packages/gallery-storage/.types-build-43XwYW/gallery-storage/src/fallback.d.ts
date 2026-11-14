/** Infrastructure-only signer: callers MUST obtain the key from core authorization. */
export declare function signGalleryCloudruFallback(key: string, ttlSeconds?: number, env?: Record<string, string | undefined>): Promise<string>;
/** CDN-origin signer, not a viewer endpoint. Only the protected API route calls it. */
export declare function signGalleryCloudruCdnOrigin(key: string, method: 'GET' | 'HEAD', env?: Record<string, string | undefined>): Promise<string>;
