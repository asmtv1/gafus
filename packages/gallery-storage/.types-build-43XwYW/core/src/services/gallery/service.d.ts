import type { GalleryAlbumCreateInput, GalleryAlbumUpdateInput, GalleryPhotoUpdateInput, GalleryUploadInput, GalleryUploadRetryInput, GalleryCoverInput, GalleryMoveInput, GalleryProfileAlbumsInput, GalleryAlbumPhotosInput, GalleryAlbumListDto, GalleryPhotoListDto, GalleryMoveDto } from "@gafus/types";
import type { GalleryDb, GalleryStoragePort, GalleryTx } from "./ports";
import type { EnqueueDeletedMediaPurge } from "../mediaDelivery/purgeQueue";
export interface CreateGalleryServiceInput {
    db: GalleryDb;
    storage: GalleryStoragePort;
    enqueueDeletedMediaPurge: EnqueueDeletedMediaPurge<GalleryTx, "gallery">;
    now?: () => Date;
}
export declare function createGalleryService({ db, storage, enqueueDeletedMediaPurge, now, }: CreateGalleryServiceInput): {
    claimUpload: (input: import("./worker").GalleryClaimUploadInput) => Promise<import("./ports").GalleryUploadClaim | null>;
    completeUpload: (input: import("./worker").GalleryCompleteUploadInput) => Promise<import("./ports").GalleryCallbackResult>;
    failUpload: (input: import("./worker").GalleryFailUploadInput) => Promise<import("./ports").GalleryCallbackResult>;
    claimStorageJobs: (input?: import("./worker").GalleryClaimStorageJobsInput) => Promise<import("./ports").GalleryStorageJobClaim[]>;
    completeStorageJob: (input: import("./worker").GalleryCompleteStorageJobInput) => Promise<import("./ports").GalleryCallbackResult>;
    failStorageJob: (input: import("./worker").GalleryFailStorageJobInput) => Promise<import("./ports").GalleryCallbackResult>;
    maintenance: (input?: import("./worker").GalleryMaintenanceInput) => Promise<import("./worker").GalleryMaintenanceResult>;
    listAlbums(actorId: string, input: GalleryProfileAlbumsInput): Promise<GalleryAlbumListDto>;
    createAlbum(actorId: string, input: GalleryAlbumCreateInput): Promise<import("@gafus/types").GalleryAlbumDto>;
    getAlbum(actorId: string, albumId: string): Promise<import("@gafus/types").GalleryAlbumDto>;
    updateAlbum(actorId: string, albumId: string, input: GalleryAlbumUpdateInput): Promise<import("@gafus/types").GalleryAlbumDto>;
    deleteAlbum(actorId: string, albumId: string): Promise<{
        id: string;
    }>;
    listPhotos(actorId: string, input: GalleryAlbumPhotosInput): Promise<GalleryPhotoListDto>;
    getPhoto(actorId: string, photoId: string): Promise<import("@gafus/types").GalleryPhotoDto>;
    /** Reuses the locked read authorization; never accept an object key from a client. */
    fallbackSource(actorId: string, photoId: string, variant: "thumb" | "full"): Promise<{
        key: string;
    }>;
    updatePhoto(actorId: string, photoId: string, input: GalleryPhotoUpdateInput): Promise<import("@gafus/types").GalleryPhotoDto>;
    deletePhoto(actorId: string, photoId: string): Promise<{
        id: string;
    }>;
    setCover(actorId: string, albumId: string, input: GalleryCoverInput): Promise<import("@gafus/types").GalleryAlbumDto>;
    reserveUpload(actorId: string, input: GalleryUploadInput): Promise<import("@gafus/types").GalleryUploadDto>;
    /** Single photo upload contract for all current Web and Mobile clients:
     * final WebP variants are produced on-device and verified by S3/Core.
     */
    reserveClientUpload(actorId: string, input: GalleryUploadInput): Promise<import("@gafus/types").GalleryUploadDto | {
        thumbUpload: {
            url: string;
            fields: Record<string, string>;
            method: "POST";
        };
        uploadId: string;
        albumId: string;
        status: import("@gafus/types").GalleryUploadStatus;
        errorCode?: string | null;
        errorMessage?: string | null;
        postUrl: string | null;
        postFields: Record<string, string> | null;
        expiresAt: string | null;
        reservationExpiresAt: string;
        photo: import("@gafus/types").GalleryPhotoDto | null;
    }>;
    /** Restore the second signed WebP POST after a process restart or a retry
     * reservation. Only the owner of a STILL RESERVED upload may renew it.
     * The original post's expiry is authoritative; no wider grant is issued.
     */
    getClientThumbUpload(actorId: string, uploadId: string): Promise<{
        url: string;
        fields: Record<string, string>;
        method: "POST";
    }>;
    confirmClientUpload(actorId: string, uploadId: string): Promise<import("@gafus/types").GalleryUploadDto>;
    getUpload(actorId: string, uploadId: string): Promise<import("@gafus/types").GalleryUploadDto>;
    confirmUpload(actorId: string, uploadId: string): Promise<import("@gafus/types").GalleryUploadDto>;
    cancelUpload(actorId: string, uploadId: string): Promise<import("@gafus/types").GalleryUploadDto>;
    retryUpload(actorId: string, uploadId: string, input: GalleryUploadRetryInput): Promise<import("@gafus/types").GalleryUploadDto>;
    movePhoto(actorId: string, photoId: string, input: GalleryMoveInput): Promise<GalleryMoveDto>;
};
export type GalleryService = ReturnType<typeof createGalleryService>;
