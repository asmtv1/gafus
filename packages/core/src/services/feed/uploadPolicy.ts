import { FeedError } from "./errors";

interface UploadReservation {
  status: string;
  reservationExpiresAt: Date;
  postExpiresAt: Date;
  declaredMime: string;
  declaredBytes: number;
}

interface UploadedObject {
  contentType: string;
  bytes: number;
  etag: string;
}

export function assertPhotoRenditionReservation(row: UploadReservation, now: () => Date) {
  if (
    row.status !== "reserved" ||
    row.reservationExpiresAt <= now() ||
    row.postExpiresAt <= now() ||
    row.declaredMime !== "image/webp" ||
    row.declaredBytes > 1_750_000
  )
    throw new FeedError("VALIDATION_ERROR", "Недопустимая загрузка готовых фото", 409);
}

export function assertPhotoCanComplete(row: UploadReservation, now: () => Date) {
  if (
    row.status !== "reserved" ||
    row.declaredMime !== "image/webp" ||
    row.reservationExpiresAt <= now() ||
    row.declaredBytes > 1_750_000
  )
    throw new FeedError("VALIDATION_ERROR", "Файл нельзя подтвердить", 409);
}

export function assertUploadedPhotoMatches(
  row: UploadReservation,
  head: UploadedObject | null,
): asserts head is UploadedObject {
  if (!head || head.contentType !== "image/webp" || head.bytes !== row.declaredBytes || !head.etag)
    throw new FeedError("VALIDATION_ERROR", "Файл не прошёл проверку S3", 422);
}

export function assertVideoPosterReservation(row: UploadReservation, now: () => Date) {
  if (
    row.declaredMime !== "video/mp4" ||
    row.status !== "reserved" ||
    row.reservationExpiresAt <= now() ||
    row.postExpiresAt <= now()
  )
    throw new FeedError("VALIDATION_ERROR", "Загрузка обложки устарела", 409);
}

export function assertVideoCanComplete(row: UploadReservation, now: () => Date) {
  if (row.status === "processing" || row.status === "uploaded")
    throw new FeedError("VERSION_CONFLICT", "Подтверждение видео ещё выполняется", 409);
  if (row.status !== "reserved" || row.reservationExpiresAt <= now())
    throw new FeedError("UPLOAD_EXPIRED", "Загрузка устарела. Повторите отправку этого видео", 409);
}

export function assertUploadedVideoMatches(
  row: UploadReservation,
  metadata: UploadedObject | null,
): asserts metadata is UploadedObject {
  if (
    !metadata ||
    metadata.contentType !== "video/mp4" ||
    metadata.bytes !== row.declaredBytes ||
    !metadata.etag
  )
    throw new FeedError("VALIDATION_ERROR", "S3 не подтвердил загрузку MP4", 422);
}
