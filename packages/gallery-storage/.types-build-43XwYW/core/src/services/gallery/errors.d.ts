export declare class GalleryError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, status?: number, details?: Record<string, unknown> | undefined);
}
