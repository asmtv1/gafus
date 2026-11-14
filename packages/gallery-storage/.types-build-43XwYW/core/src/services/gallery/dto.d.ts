import type { GalleryAlbumDto, GalleryPhotoDto, GalleryUploadDto } from "@gafus/types";
import type { AlbumRow, PhotoRow, UploadRow } from "./persistence";
import type { GalleryContext } from "./context";
import type { GalleryTx } from "./ports";
export declare function photoDto(ctx: GalleryContext, tx: GalleryTx, row: PhotoRow, actorId: string, knownUpload?: Pick<UploadRow, "id" | "errorCode"> | null): Promise<GalleryPhotoDto>;
export declare function albumDto(ctx: GalleryContext, tx: GalleryTx, row: AlbumRow, actorId: string): Promise<GalleryAlbumDto>;
export declare function uploadDto(ctx: GalleryContext, tx: GalleryTx, row: UploadRow, actorId: string, withPost?: boolean): Promise<GalleryUploadDto>;
