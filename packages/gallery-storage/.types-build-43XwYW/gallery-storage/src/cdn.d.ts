export declare function yandexCdnToken(path: string, expires: number, secret: string): string;
/** CDNvideo/Beget signs secret + original path + UNIX expiry, never a query token. */
export declare function cdnvideoToken(path: string, expires: number, secret: string): string;
export declare function signGalleryCdnUrl(baseUrl: string, key: string, expiresAt: Date, secret: string, now?: number, provider?: 'beget'): string;
export declare function verifyGalleryCdnToken(path: string, query: Record<string, string | undefined>, secret: string, now?: number): boolean;
export declare function constantTimeEqual(a: string, b: string): boolean;
