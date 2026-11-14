import type { GalleryAlbumRow, GalleryPhotoRow, GalleryUploadRow, GalleryJobRow, GalleryPhotoWhere } from "@gafus/media-shared/media-db-ports";
import type { GalleryTx } from "./ports";
export type AlbumRow = GalleryAlbumRow;
export type PhotoRow = GalleryPhotoRow;
export type UploadRow = GalleryUploadRow;
export type JobRow = GalleryJobRow;
export declare const alive: {
    readonly deletedAt: null;
};
export declare const published: {
    status: {
        in: ("ready" | "moving")[];
    };
};
export declare function lockGalleryOwner(tx: GalleryTx, ownerId: string): Promise<void>;
export declare function galleryActor(tx: GalleryTx, actorId: string): Promise<void>;
export declare function albumFor(tx: GalleryTx, actorId: string, id: string, edit?: boolean): Promise<AlbumRow>;
export declare function photoFor(tx: GalleryTx, actorId: string, id: string, edit?: boolean): Promise<{
    status: import("@prisma/client").$Enums.GalleryPhotoStatus;
    caption: string | null;
    albumId: string;
    width: number | null;
    height: number | null;
    ownerId: string;
    id: string;
    thumbKey: string | null;
    fullKey: string | null;
    reservationExpiresAt: Date;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function uploadFor(tx: GalleryTx, actorId: string, id: string): Promise<UploadRow>;
export declare function occupiedWhere(ownerId: string, at: Date): GalleryPhotoWhere;
export declare function usedSlots(tx: GalleryTx, ownerId: string, at: Date): Promise<number>;
export declare function checkQuota(tx: GalleryTx, ownerId: string, at: Date): Promise<void>;
export declare function enqueueDelete(tx: GalleryTx, ownerId: string, keys: (string | null | undefined)[], availableAt: Date, dedupeKey: string): Promise<{
    status: import("@prisma/client").$Enums.GalleryStorageJobStatus;
    photoId: string | null;
    uploadId: string | null;
    width: number | null;
    height: number | null;
    attemptToken: string | null;
    errorCode: string | null;
    ownerId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    dedupeKey: string;
    destinationAlbumId: string | null;
    kind: import("@prisma/client").$Enums.GalleryStorageJobKind;
    sourceKeys: string[];
    sourceETags: string[];
    targetKeys: string[];
    availableAt: Date;
    attempts: number;
    leaseUntil: Date | null;
} | undefined>;
export declare function afterLease(at: Date, lease: Date | null): Date;
export declare function uploadCleanup(tx: GalleryTx, upload: UploadRow, at: Date, publishedKeys?: string[]): Promise<void>;
export declare function invalidatePhoto(tx: GalleryTx, photo: PhotoRow, at: Date, tombstone?: boolean): Promise<void>;
export declare function expireUpload(tx: GalleryTx, upload: UploadRow, at: Date): Promise<{
    photo: {
        status: import("@prisma/client").$Enums.GalleryPhotoStatus;
        caption: string | null;
        albumId: string;
        width: number | null;
        height: number | null;
        ownerId: string;
        id: string;
        thumbKey: string | null;
        fullKey: string | null;
        reservationExpiresAt: Date;
        deletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    };
} & {
    status: import("@prisma/client").$Enums.GalleryUploadStatus;
    filename: string;
    declaredMime: string;
    declaredBytes: number;
    clientRequestId: string;
    photoId: string;
    attemptToken: string | null;
    sourceETag: string | null;
    errorCode: string | null;
    ownerId: string;
    id: string;
    reservationExpiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    attempts: number;
    leaseUntil: Date | null;
    requestFingerprint: string;
    retryOfId: string | null;
    retryCount: number;
    sourceKey: string;
    postExpiresAt: Date;
    nextAttemptAt: Date;
    stagedThumbKey: string | null;
    stagedFullKey: string | null;
}>;
export declare function leaseValid(row: {
    status: string;
    attemptToken: string | null;
    leaseUntil: Date | null;
}, token: string, at: Date): boolean;
export declare function cursorEncode(row: {
    id: string;
    createdAt: Date;
}): string;
export declare function cursorWhere(cursor?: string | null): {
    OR?: undefined;
} | {
    OR: ({
        createdAt: {
            lt: Date;
        };
        id?: undefined;
    } | {
        createdAt: Date;
        id: {
            lt: string;
        };
    })[];
};
