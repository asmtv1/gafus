import { z } from "zod/v3";
export declare const galleryIdSchema: z.ZodString;
export declare const galleryAlbumCreateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    name: string;
    description?: string | null | undefined;
    isVisible?: boolean | undefined;
}, {
    name: string;
    description?: string | null | undefined;
    isVisible?: boolean | undefined;
}>;
export declare const galleryAlbumUpdateSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    isVisible: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | null | undefined;
    isVisible?: boolean | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    isVisible?: boolean | undefined;
}>, {
    name?: string | undefined;
    description?: string | null | undefined;
    isVisible?: boolean | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    isVisible?: boolean | undefined;
}>;
export declare const galleryPhotoUpdateSchema: z.ZodObject<{
    caption: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    caption: string | null;
}, {
    caption: string | null;
}>;
export declare const galleryUploadSchema: z.ZodObject<{
    albumId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    filename: z.ZodString;
    declaredMime: z.ZodEnum<["image/jpeg", "image/png", "image/webp"]>;
    declaredBytes: z.ZodNumber;
    caption: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    clientRequestId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    filename: string;
    declaredMime: "image/jpeg" | "image/png" | "image/webp";
    declaredBytes: number;
    clientRequestId: string;
    caption?: string | null | undefined;
    albumId?: string | null | undefined;
}, {
    filename: string;
    declaredMime: "image/jpeg" | "image/png" | "image/webp";
    declaredBytes: number;
    clientRequestId: string;
    caption?: string | null | undefined;
    albumId?: string | null | undefined;
}>;
export declare const galleryUploadRetrySchema: z.ZodObject<{
    clientRequestId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    clientRequestId: string;
}, {
    clientRequestId: string;
}>;
export declare const galleryCoverSchema: z.ZodObject<{
    photoId: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    photoId: string | null;
}, {
    photoId: string | null;
}>;
export declare const galleryMoveSchema: z.ZodObject<{
    albumId: z.ZodString;
    clientRequestId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    albumId: string;
    clientRequestId: string;
}, {
    albumId: string;
    clientRequestId: string;
}>;
export declare const galleryListSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    pageSize: number;
    cursor?: string | null | undefined;
}, {
    cursor?: string | null | undefined;
    pageSize?: number | undefined;
}>;
export declare const galleryProfileAlbumsSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    username: z.ZodString;
}, "strict", z.ZodTypeAny, {
    pageSize: number;
    username: string;
    cursor?: string | null | undefined;
}, {
    username: string;
    cursor?: string | null | undefined;
    pageSize?: number | undefined;
}>;
export declare const galleryAlbumPhotosSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pageSize: z.ZodDefault<z.ZodNumber>;
} & {
    albumId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    albumId: string;
    pageSize: number;
    cursor?: string | null | undefined;
}, {
    albumId: string;
    cursor?: string | null | undefined;
    pageSize?: number | undefined;
}>;
export declare const galleryUploadCompleteSchema: z.ZodObject<{
    uploadId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    uploadId: string;
}, {
    uploadId: string;
}>;
export declare const galleryClaimUploadSchema: z.ZodObject<{
    uploadId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    uploadId: string;
}, {
    uploadId: string;
}>;
export declare const galleryCompleteUploadSchema: z.ZodEffects<z.ZodObject<{
    manifest: z.ZodOptional<z.ZodObject<{
        thumb: z.ZodObject<{
            etag: z.ZodString;
            bytes: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            contentType: z.ZodLiteral<"image/webp">;
        }, "strict", z.ZodTypeAny, {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        }, {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        }>;
        full: z.ZodObject<{
            etag: z.ZodString;
            bytes: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            contentType: z.ZodLiteral<"image/webp">;
        }, "strict", z.ZodTypeAny, {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        }, {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        }>;
    }, "strict", z.ZodTypeAny, {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    }, {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    }>>;
    uploadId: z.ZodString;
    attemptToken: z.ZodString;
    sourceETag: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    uploadId: string;
    width: number;
    height: number;
    attemptToken: string;
    sourceETag: string;
    manifest?: {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    } | undefined;
}, {
    uploadId: string;
    width: number;
    height: number;
    attemptToken: string;
    sourceETag: string;
    manifest?: {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    } | undefined;
}>, {
    uploadId: string;
    width: number;
    height: number;
    attemptToken: string;
    sourceETag: string;
    manifest?: {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    } | undefined;
}, {
    uploadId: string;
    width: number;
    height: number;
    attemptToken: string;
    sourceETag: string;
    manifest?: {
        thumb: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
        full: {
            etag: string;
            bytes: number;
            width: number;
            height: number;
            contentType: "image/webp";
        };
    } | undefined;
}>;
export declare const galleryFailUploadSchema: z.ZodObject<{
    uploadId: z.ZodString;
    attemptToken: z.ZodString;
    errorCode: z.ZodString;
    retryable: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    uploadId: string;
    attemptToken: string;
    errorCode: string;
    retryable: boolean;
}, {
    uploadId: string;
    attemptToken: string;
    errorCode: string;
    retryable: boolean;
}>;
export declare const zodExactDeleteScope: z.ZodObject<{
    jobId: z.ZodString;
    ownerId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    jobId: string;
    ownerId: string;
}, {
    jobId: string;
    ownerId: string;
}>;
export declare const galleryClaimStorageJobsSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export declare const galleryCompleteStorageJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    attemptToken: z.ZodString;
}, "strict", z.ZodTypeAny, {
    attemptToken: string;
    jobId: string;
}, {
    attemptToken: string;
    jobId: string;
}>;
export declare const galleryFailStorageJobSchema: z.ZodObject<{
    jobId: z.ZodString;
    attemptToken: z.ZodString;
} & {
    errorCode: z.ZodString;
    retryable: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    attemptToken: string;
    errorCode: string;
    retryable: boolean;
    jobId: string;
}, {
    attemptToken: string;
    errorCode: string;
    retryable: boolean;
    jobId: string;
}>;
export declare function galleryParse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T;
