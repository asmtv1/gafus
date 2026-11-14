/** Platform-independent gallery contracts. Transport injects authentication and no-store policy. */
export declare const GALLERY_LIMITS: {
    readonly slots: 200;
    readonly albumName: 120;
    readonly caption: 2000;
    readonly photoBytes: number;
    readonly pixels: 50000000;
    readonly pageSize: 20;
    readonly maxPageSize: 50;
    readonly postSeconds: 600;
    readonly reservationSeconds: 900;
    readonly urlSeconds: 300;
    readonly leaseSeconds: 120;
    readonly attempts: 3;
    readonly storageAttempts: 5;
    readonly uploadRetries: 3;
};
export declare const GALLERY_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp"];
export type GalleryPhotoStatus = "pending" | "processing" | "ready" | "moving" | "failed";
export type GalleryUploadStatus = "reserved" | "uploaded" | "processing" | "ready" | "failed" | "cancelled" | "expired";
export interface GalleryAlbumDto {
    id: string;
    ownerId: string;
    ownerUsername: string;
    name: string;
    description: string | null;
    isVisible: boolean;
    coverPhotoId: string | null;
    /** Effective preview (first visible photo when no cover is explicitly selected). */
    coverDisplayPhotoId?: string | null;
    coverThumbUrl?: string | null;
    urlsExpireAt: string | null;
    photoCount: number;
    createdAt: string;
    updatedAt: string;
    canEdit: boolean;
}
export interface GalleryPhotoDto {
    id: string;
    albumId: string;
    caption: string | null;
    status: GalleryPhotoStatus;
    /** Core always populates these; optional for compatibility with existing DTO fixtures. */
    uploadId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    thumbUrl: string | null;
    fullUrl: string | null;
    width: number | null;
    height: number | null;
    urlsExpireAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    canEdit: boolean;
}
export interface GalleryUploadDto {
    uploadId: string;
    albumId: string;
    status: GalleryUploadStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    postUrl: string | null;
    postFields: Record<string, string> | null;
    expiresAt: string | null;
    reservationExpiresAt: string;
    photo: GalleryPhotoDto | null;
}
export interface GalleryListDto<T> {
    items: T[];
    nextCursor: string | null;
    usedSlots: number;
    limit: number;
    isOwner: boolean;
    enabled: boolean;
}
export type GalleryAlbumListDto = GalleryListDto<GalleryAlbumDto>;
export type GalleryPhotoListDto = GalleryListDto<GalleryPhotoDto>;
export interface GalleryErrorDto {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
}
export interface GalleryAlbumCreateInput {
    name: string;
    description?: string | null;
    isVisible?: boolean;
}
export type GalleryAlbumUpdateInput = Partial<GalleryAlbumCreateInput>;
export interface GalleryPhotoUpdateInput {
    caption: string | null;
}
export interface GalleryUploadInput {
    albumId?: string | null;
    filename: string;
    declaredMime: (typeof GALLERY_MIME_TYPES)[number];
    declaredBytes: number;
    caption?: string | null;
    clientRequestId: string;
}
export interface GalleryUploadCompleteInput {
    uploadId: string;
}
export interface GalleryUploadRetryInput {
    clientRequestId: string;
}
export interface GalleryCoverInput {
    photoId: string | null;
}
export interface GalleryMoveInput {
    albumId: string;
    clientRequestId: string;
}
export interface GalleryListQuery {
    cursor?: string | null;
    pageSize?: number;
}
export interface GalleryProfileAlbumsInput extends GalleryListQuery {
    username: string;
}
export interface GalleryAlbumPhotosInput extends GalleryListQuery {
    albumId: string;
}
export interface GalleryMoveDto {
    jobId: string | null;
    photo: GalleryPhotoDto;
}
export type GalleryTransport = <T>(path: string, options?: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
}) => Promise<T>;
export declare function createGalleryClient(transport: GalleryTransport): {
    listAlbums: (username: string, q?: GalleryListQuery) => Promise<GalleryAlbumListDto>;
    createAlbum: (body: GalleryAlbumCreateInput) => Promise<GalleryAlbumDto>;
    getAlbum: (albumId: string) => Promise<GalleryAlbumDto>;
    updateAlbum: (albumId: string, body: GalleryAlbumUpdateInput) => Promise<GalleryAlbumDto>;
    deleteAlbum: (albumId: string) => Promise<{
        id: string;
    }>;
    listPhotos: (albumId: string, q?: GalleryListQuery) => Promise<GalleryPhotoListDto>;
    reserveUpload: (body: GalleryUploadInput) => Promise<GalleryUploadDto>;
    confirmUpload: (uploadId: string) => Promise<GalleryUploadDto>;
    getUpload: (uploadId: string) => Promise<GalleryUploadDto>;
    cancelUpload: (uploadId: string) => Promise<GalleryUploadDto>;
    retryUpload: (uploadId: string, body: GalleryUploadRetryInput) => Promise<GalleryUploadDto>;
    getPhoto: (photoId: string) => Promise<GalleryPhotoDto>;
    requestMediaFallback: (photoId: string, variant: "thumb" | "full") => Promise<{
        url: string;
        source: "cloudru";
        expiresAt: string;
    }>;
    updatePhoto: (photoId: string, body: GalleryPhotoUpdateInput) => Promise<GalleryPhotoDto>;
    deletePhoto: (photoId: string) => Promise<{
        id: string;
    }>;
    setCover: (albumId: string, body: GalleryCoverInput) => Promise<GalleryAlbumDto>;
    movePhoto: (photoId: string, body: GalleryMoveInput) => Promise<GalleryMoveDto>;
};
