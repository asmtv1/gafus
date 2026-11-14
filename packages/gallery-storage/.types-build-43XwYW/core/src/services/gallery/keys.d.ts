export declare function galleryPhotoPrefix(ownerId: string, albumId: string, photoId: string): string;
export declare function galleryPhotoKeys(ownerId: string, albumId: string, photoId: string): {
    thumbKey: string;
    fullKey: string;
};
export declare function gallerySourceKey(ownerId: string, albumId: string, uploadId: string, mime: "image/jpeg" | "image/png" | "image/webp"): string;
export declare function galleryAttemptKeys(ownerId: string, albumId: string, uploadId: string, token: string): {
    thumbKey: string;
    fullKey: string;
};
/** Gallery Media V2: immutable photo identity, independent of album membership. */
export declare function galleryPhotoV2Keys(ownerId: string, photoId: string): {
    thumbKey: string;
    fullKey: string;
};
export declare function isGalleryPhotoV2Key(key: string, ownerId: string, photoId: string): boolean;
