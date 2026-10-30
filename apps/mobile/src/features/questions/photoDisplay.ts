import type { QuestionPhotoDto } from "@gafus/types";

/** Shared with the Web's Questions V2 media-state contract. A provider
 * mismatch is not a Sharp error and cannot be repaired by retrying a GET. */
export function questionPhotoTerminalNotice(photos: readonly QuestionPhotoDto[]):string|null {
  if(photos.some(photo=>photo.status==="UNAVAILABLE"))
    return "Фотография из прежнего хранилища недоступна в локальной копии. Для её восстановления нужен исходный файл.";
  if(photos.some(photo=>photo.status==="FAILED"))
    return "Фото не удалось обработать. Повторное обновление не исправит файл — замените его при редактировании ответа или вопроса.";
  return null;
}
export function questionPhotoPending(photos: readonly QuestionPhotoDto[]):boolean {
  return photos.some(photo => photo.status==="AWAITING_UPLOAD" ||
    photo.status==="QUEUED" || photo.status==="PROCESSING");
}
