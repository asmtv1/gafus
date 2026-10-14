import { stableMediaExpiry } from "../mediaDelivery/signedExpiry";
import { GALLERY_LIMITS as L } from "../../../../types/src/gallery";
import type { GalleryAlbumDto, GalleryPhotoDto, GalleryUploadDto } from "@gafus/types";
import type { AlbumRow, PhotoRow, UploadRow } from "./persistence";
import { alive, published } from "./persistence";
import type { GalleryContext } from "./context";
import type { GalleryTx } from "./ports";
const processingErrorMessages: Readonly<Record<string, string>> = {
  IMAGE_SIZE: "Файл должен быть не больше 10 МиБ",
  IMAGE_FORMAT: "Допустимы JPG, PNG и WebP",
  IMAGE_PIXELS: "Изображение должно быть не больше 50 мегапикселей",
  IMAGE_ANIMATED: "Загрузите неподвижное изображение",
  INVALID_IMAGE: "Не удалось обработать изображение. Попробуйте другое фото",
  OUTPUT_TOO_LARGE: "Изображение слишком большое после обработки. Попробуйте другое фото",
  SOURCE_MISSING: "Исходное фото не загружено. Повторите загрузку",
  SOURCE_CHANGED: "Исходное фото изменилось. Повторите загрузку",
  ATTEMPTS_EXHAUSTED: "Не удалось обработать фото после нескольких попыток. Повторите загрузку",
  LEASE_EXPIRED: "Обработка заняла слишком много времени. Повторите загрузку",
  OUTPUT_MISSING: "Результат обработки недоступен. Повторите загрузку",
  COPY_MISMATCH: "Не удалось сохранить обработанное фото. Повторите загрузку",
  COPY_FAILED: "Не удалось сохранить обработанное фото. Повторите загрузку",
  STORAGE_UNAVAILABLE: "Хранилище временно недоступно. Повторите загрузку позже",
  TEMPORARY: "Не удалось обработать фото. Повторите загрузку позже",
  PROCESSING_FAILED: "Не удалось обработать фото. Повторите загрузку",
};
function processingFailure(code: string | null | undefined) {
  if (!code) return { errorCode: null, errorMessage: null };
  // Unknown provider codes/messages are never reflected to clients.
  const safeCode = Object.prototype.hasOwnProperty.call(processingErrorMessages, code)
    ? code
    : "PROCESSING_FAILED";
  return { errorCode: safeCode, errorMessage: processingErrorMessages[safeCode]! };
}
export async function photoDto(
  ctx: GalleryContext,
  tx: GalleryTx,
  row: PhotoRow,
  actorId: string,
  knownUpload?: Pick<UploadRow, "id" | "errorCode"> | null,
): Promise<GalleryPhotoDto> {
  const isOwner = row.ownerId === actorId;
  const upload = isOwner
    ? knownUpload === undefined
      ? await tx.galleryUpload.findUnique({
          where: { photoId: row.id },
          select: { id: true, errorCode: true },
        })
      : knownUpload
    : null;
  const visible =
    !row.deletedAt && ["ready", "moving"].includes(row.status) && row.thumbKey && row.fullKey;
  const expires = visible ? stableMediaExpiry(ctx.now(), L.urlSeconds) : null;
  const [thumbUrl, fullUrl] =
    visible && expires
      ? await Promise.all([
          ctx.storage.signCdn({ key: row.thumbKey!, expiresAt: expires }),
          ctx.storage.signCdn({ key: row.fullKey!, expiresAt: expires }),
        ])
      : [null, null];
  return {
    id: row.id,
    albumId: row.albumId,
    caption: row.caption,
    status: row.status === "moving" && !isOwner ? "ready" : row.status,
    uploadId: upload?.id ?? null,
    ...processingFailure(upload?.errorCode),
    thumbUrl,
    fullUrl,
    width: row.width,
    height: row.height,
    urlsExpireAt: expires?.toISOString() ?? null,
    expiresAt: ["pending", "processing"].includes(row.status)
      ? row.reservationExpiresAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    canEdit: row.ownerId === actorId,
  };
}
export async function albumDto(
  ctx: GalleryContext,
  tx: GalleryTx,
  row: AlbumRow,
  actorId: string,
): Promise<GalleryAlbumDto> {
  const photos = await tx.galleryPhoto.findMany({
    where: { albumId: row.id, ...alive, ...published },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const cover = photos.find((p) => p.id === row.coverPhotoId) ?? photos[0];
  const expires = cover?.thumbKey ? stableMediaExpiry(ctx.now(), L.urlSeconds) : null;
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerUsername: row.owner.username,
    name: row.name,
    description: row.description,
    isVisible: row.isVisible,
    coverPhotoId: row.coverPhotoId,
    coverDisplayPhotoId: cover?.id ?? null,
    coverThumbUrl:
      expires && cover?.thumbKey
        ? await ctx.storage.signCdn({ key: cover.thumbKey, expiresAt: expires })
        : null,
    urlsExpireAt: expires?.toISOString() ?? null,
    photoCount: photos.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: row.ownerId === actorId,
  };
}
export async function uploadDto(
  ctx: GalleryContext,
  tx: GalleryTx,
  row: UploadRow,
  actorId: string,
  withPost = false,
): Promise<GalleryUploadDto> {
  const at = ctx.now();
  const canPost =
    withPost &&
    row.status === "reserved" &&
    row.postExpiresAt > at &&
    row.reservationExpiresAt > at &&
    !row.photo.deletedAt;
  const post = canPost
    ? await ctx.storage.presignPost({
        key: row.sourceKey,
        expiresAt: row.postExpiresAt,
        maxBytes: L.photoBytes,
        contentType: row.declaredMime,
      })
    : null;
  // Called only after album authorization under its owner lock; deleted uploads return no photo.
  return {
    uploadId: row.id,
    albumId: row.photo.albumId,
    status: row.status,
    ...processingFailure(row.ownerId === actorId ? row.errorCode : null),
    postUrl: post?.url ?? null,
    postFields: post?.fields ?? null,
    expiresAt: canPost ? row.postExpiresAt.toISOString() : null,
    reservationExpiresAt: row.reservationExpiresAt.toISOString(),
    photo: row.photo.deletedAt ? null : await photoDto(ctx, tx, row.photo, actorId, row),
  };
}
