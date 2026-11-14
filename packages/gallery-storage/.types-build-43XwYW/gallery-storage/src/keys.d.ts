export declare const sourcePattern: RegExp;
export declare const finalPattern: RegExp;
export declare const clientThumbPattern: RegExp;
export declare const v2FinalPattern: RegExp;
export declare const vetPreviewPattern: RegExp;
export declare function assertGalleryKey(key: string): void;
export declare function assertFinalKey(key: string): void;
export declare function sourceUploadId(key: string): string | null;
/** Validate the raw route before URL parsing or decoding, which could normalize traversal. */
export declare function originKey(rawPath: string): string;
