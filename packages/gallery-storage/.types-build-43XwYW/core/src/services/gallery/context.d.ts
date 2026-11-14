import type { GalleryDb, GalleryStoragePort, GalleryTx, GalleryObjectMetadata } from "./ports";
import type { EnqueueDeletedMediaPurge } from "../mediaDelivery/purgeQueue";
export interface GalleryContext {
    db: GalleryDb;
    storage: GalleryStoragePort;
    enqueueDeletedMediaPurge: EnqueueDeletedMediaPurge<GalleryTx, "gallery">;
    now: () => Date;
}
export declare function requireGalleryEnabled(ctx: GalleryContext): void;
export declare function galleryTransaction<T>(ctx: GalleryContext, fn: (tx: GalleryTx) => Promise<T>): Promise<T>;
export declare function outputHeads(ctx: GalleryContext, keys: string[]): Promise<GalleryObjectMetadata[]>;
