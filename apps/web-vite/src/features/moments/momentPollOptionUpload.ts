import {
  FEED_LIMITS, type FeedPollDraft, type FeedMimeType,
} from "@gafus/types";
import type { MomentInlinePollDraft } from "./MomentInlinePoll";
import { uploadMomentPhoto, validateMomentPhoto } from "./feedMediaTransfer";
import { feedClient } from "./feedClient";
import { momentUploadPool } from "./momentUploadPool";

const POST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DONE = new Set(["failed", "cancelled", "expired"]);
const WAIT_MS = 5_000;
const POLL_ATTEMPTS = 120;

/** A poll option photo is an owned Feed photo, NOT a public gallery URL.
 * Core requires its processing status READY before it accepts imageMediaId.
 * Never persist signed upload/read URLs or use a forged media ID.
 */
export async function uploadMomentPollOptionImages(input: {
  postId: string;
  poll: MomentInlinePollDraft;
  attachmentCount: number;
  onProgress: (message: string) => void;
  active: () => boolean;
  wait?: (ms: number) => Promise<void>;
  maxWaitAttempts?: number;
}): Promise<FeedPollDraft> {
  if (!POST_ID.test(input.postId) ||
      !Number.isSafeInteger(input.attachmentCount) || input.attachmentCount < 0 ||
      input.poll.options.some(option => option.imageMediaId != null))
    throw new Error("Недопустимый набор фотографий опроса");
  const photos = input.poll.options.flatMap((option, optionIndex) => option.imageAsset
    ? [{ optionIndex, asset: option.imageAsset }] : []);
  if (photos.length + input.attachmentCount > FEED_LIMITS.maxAttachments ||
      new Set(photos.map(item => item.asset.requestId)).size !== photos.length)
    throw new Error("Слишком много фотографий и видео в одной публикации");
  // Upload tickets are reserved with stable user-action UUIDs. On retry,
  // a previously completed upload returns the original server media ID.
  const wait = input.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const attempts = input.maxWaitAttempts ?? POLL_ATTEMPTS;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > POLL_ATTEMPTS)
    throw new Error("Некорректная проверка готовности фотографий");
  // One deadline for the entire poll, not ten minutes for EACH option photo.
  const deadline = Date.now() + POLL_ATTEMPTS * WAIT_MS;
  const readyPhotos = await momentUploadPool(photos, async ({ optionIndex, asset }, position) => {
    if (!input.active()) throw new Error("Редактор закрыт до завершения загрузки");
    validateMomentPhoto(asset.file, input.attachmentCount + position);
    input.onProgress(`Загружаем фото варианта ${optionIndex + 1} из ${input.poll.options.length}…`);
    const mediaId = await uploadMomentPhoto({
      postId: input.postId, file: asset.file, clientRequestId: asset.requestId,
      existingCount: input.attachmentCount + position,
      onProgress: percent => input.onProgress(`Фото варианта ${optionIndex + 1}: ${percent}%`),
    });
    if (!POST_ID.test(mediaId)) throw new Error("Фото опроса не подтверждено сервером");
    let ready = false;
    for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt++) {
      if (!input.active()) throw new Error("Редактор закрыт до завершения загрузки");
      const state = await feedClient.reserveUpload(input.postId, {
        filename: asset.file.name,
        kind: "photo",
        declaredMime: asset.file.type as FeedMimeType,
        declaredBytes: asset.file.size,
        clientRequestId: asset.requestId,
      });
      if (state.mediaId !== mediaId || state.postId !== input.postId ||
          state.kind !== "photo")
        throw new Error("Не совпадает резервирование фотографии опроса");
      if (state.status === "ready") { ready = true; break; }
      if (DONE.has(state.status))
        throw new Error("Не удалось обработать изображение варианта опроса");
      input.onProgress(`Обрабатываем фото варианта ${optionIndex + 1}…`);
      if (attempt + 1 < attempts && Date.now() < deadline)
        await wait(Math.min(WAIT_MS, Math.max(0, deadline - Date.now())));
    }
    if (!ready) throw new Error("Обработка фото опроса не завершена; черновик сохранён");
    return { optionIndex, mediaId };
  });
  const results = new Map(readyPhotos.map(item => [item.optionIndex, item.mediaId]));
  return {
    ...input.poll,
    options: input.poll.options.map(({ imageAsset: _asset, ...option }, index) => ({
      ...option, ...(results.has(index) ? { imageMediaId: results.get(index)! } : {}),
    })),
  };
}
