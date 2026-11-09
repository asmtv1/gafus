import type { createGalleryClient, GalleryUploadDto, GalleryUploadInput } from "@gafus/types";
import { reportClientError } from "@/shared/lib/tracer";
import { photoFailureCode } from "@/shared/lib/media/photoRetryMessage";
import {
  galleryRequests,
  taskAt,
  updateTask,
  useGallerySession,
  type TaskFence,
  type UploadTask,
} from "./session";

type UploadApi = Pick<
  ReturnType<typeof createGalleryClient>,
  "getUpload" | "reserveUpload" | "retryUpload" | "confirmUpload" | "cancelUpload"
>;
type ErrorText = (error: unknown) => string;
export function uploadPatch(upload: GalleryUploadDto): Partial<UploadTask> {
  const status =
    upload.status === "ready"
      ? "ready"
      : upload.status === "cancelled"
        ? "cancelled"
        : upload.status === "failed"
          ? "failed"
          : upload.status === "expired"
            ? "expired"
            : upload.status === "reserved"
              ? "failed"
              : "processing";
  return {
    upload: safeUpload(upload),
    albumId: upload.albumId,
    status,
    error:
      status === "failed"
        ? "Загрузка не завершена. Выберите файл заново."
        : status === "expired"
          ? "Время загрузки истекло. Выберите файл заново."
          : undefined,
  };
}
/** Keep status reconciliation alive after transient GET/network errors.
 * A failed readback is not an authoritative terminal upload status. */
export function galleryUploadPollDelay(
  foreground: boolean,
  taskStatus: UploadTask["status"],
  serverStatus: GalleryUploadDto["status"] | undefined,
  failed: boolean,
): number | false {
  if (!foreground || !["processing", "unknown"].includes(taskStatus)) return false;
  if (serverStatus && ["ready", "failed", "expired", "cancelled"].includes(serverStatus))
    return false;
  // Recheck GET only. Never replay a potentially committed S3 POST.
  return failed ? 15_000 : 5_000;
}

export async function pollTask(id: string, fence: TaskFence, api: UploadApi) {
  const task = taskAt(id, fence);
  if (!task?.upload) return;
  const upload = await api.getUpload(task.upload.uploadId);
  const current = taskAt(id, fence);
  if (!current) return;
  if (
    upload.uploadId !== current.upload?.uploadId ||
    upload.albumId !== current.upload.albumId ||
    (upload.status === "ready" &&
      (!upload.photo?.id || upload.photo.albumId !== upload.albumId))
  ) {
    // Never clear an uncertainty lock on a mismatched or incomplete GET.
    // Return the previously verified non-terminal receipt, not the malformed
    // READY response: React Query requires non-undefined query data.
    return current.upload;
  }
  // A RESERVED readback after a previously PROCESSING/UNKNOWN client commit
  // is inconclusive. The server may have rolled its lease back for a retry;
  // never mislabel it FAILED or permit a duplicate S3 upload.
  if (upload.status === "reserved") {
    if (current.status === "unknown") return upload;
    if (current.status === "processing") {
      updateTask(id, {
        upload: safeUpload(upload), status: "unknown",
        error: "Подтверждение прервалось. Проверьте статус или возобновите подтверждение без повторной отправки фото.",
      }, fence);
      return upload;
    }
    if (current.status === "ready") return current.upload;
  }
  updateTask(id, uploadPatch(upload), fence);
  return upload;
}
/** Manually recover an UNKNOWN client-only upload whose S3 transfer may have
 * succeeded. This never resends media: GET must first prove that the server
 * reservation is still live, then the server validates the already-staged
 * object before completing it. READY/PROCESSING receipts are not replayed. */
export async function reconfirmReservedClientUpload(
  id: string, fence: TaskFence, api: UploadApi,
): Promise<void> {
  const task = taskAt(id, fence);
  if (task?.status !== "unknown" || !task.upload) return;
  const expected = task.upload;
  const valid = (receipt: GalleryUploadDto) =>
    receipt.uploadId === expected.uploadId && receipt.albumId === expected.albumId &&
    (receipt.status !== "ready" ||
      (!!receipt.photo?.id && receipt.photo.albumId === expected.albumId));
  const before = await api.getUpload(expected.uploadId);
  if (!taskAt(id, fence)) return;
  if (!valid(before)) throw new Error("GALLERY_COMMIT_RECOVERY_READBACK_MISMATCH");
  if (before.status !== "reserved") {
    updateTask(id, uploadPatch(before), fence);
    return;
  }
  const deadline = Date.parse(before.reservationExpiresAt);
  if (!Number.isFinite(deadline) || deadline - Date.now() < 5_000)
    throw new Error("GALLERY_COMMIT_RECOVERY_RESERVATION_EXPIRED");
  // /client-complete performs a fresh S3 HEAD and is safe to call for the
  // same reservation after authoritative GET shows it is still RESERVED.
  await api.confirmUpload(expected.uploadId);
  if (!taskAt(id, fence)) return;
  const after = await api.getUpload(expected.uploadId);
  if (!taskAt(id, fence)) return;
  if (!valid(after) || after.status === "reserved")
    throw new Error("GALLERY_COMMIT_RECOVERY_NOT_CONFIRMED");
  updateTask(id, uploadPatch(after), fence);
}

/** Cancellation supersedes every transfer/confirmation/poll from the prior generation. */
export async function cancelTask(
  id: string,
  epoch: number,
  api: UploadApi,
  errorText: ErrorText,
  knownUpload?: GalleryUploadDto,
) {
  const state = useGallerySession.getState();
  const task = state.tasks.find((t) => t.id === id);
  if (state.epoch !== epoch || !task) return;
  const fence = { epoch, generation: task.generation + 1 };
  updateTask(
    id,
    { generation: fence.generation, cancelRequested: true, status: "cancelling", error: undefined },
    { epoch, generation: task.generation },
    true,
  );
  galleryRequests.get(id)?.abort();
  let upload = knownUpload ?? task.upload;
  let retryAcknowledged = !task.retryOperation;
  try {
    // A committed child may exist even though its response never reached this device.
    if (task.retryOperation) {
      upload = await api.retryUpload(task.retryOperation.parentId, {
        clientRequestId: task.retryOperation.requestId,
      });
      if (!taskAt(id, fence, true)) return;
      retryAcknowledged = true;
      updateTask(
        id,
        { upload: safeUpload(upload), albumId: upload.albumId, retryOperation: undefined },
        fence,
        true,
      );
    }
    if (upload) {
      const cancelled = await api.cancelUpload(upload.uploadId);
      if (!taskAt(id, fence, true)) return;
      upload = cancelled;
    }
    updateTask(
      id,
      { upload: upload ? safeUpload(upload) : undefined, status: "cancelled", error: undefined },
      fence,
      true,
    );
  } catch (error) {
    reportClientError(new Error("GALLERY_UPLOAD_CANCEL_UNKNOWN"), {
      issueKey: "GalleryUploadQueue",
      keys: { operation: "cancel" },
    });
    if (!taskAt(id, fence, true)) return;
    if (!retryAcknowledged) {
      updateTask(
        id,
        { status: "cancelling", error: `Не удалось проверить отмену. ${errorText(error)}` },
        fence,
        true,
      );
      return;
    }
    // A rejected cancellation may mean processing already finished. Read authoritative state.
    if (upload) {
      try {
        const current = await api.getUpload(upload.uploadId);
        if (!taskAt(id, fence, true)) return;
        updateTask(
          id,
          {
            ...uploadPatch(current),
            cancelRequested: current.status === "cancelled",
            error: current.status === "cancelled" ? undefined : errorText(error),
          },
          fence,
          true,
        );
        return;
      } catch (readError) {
        reportClientError(new Error("GALLERY_UPLOAD_CANCEL_READBACK_UNKNOWN"), {
          issueKey: "GalleryUploadQueue",
          keys: { operation: "cancel_readback" },
        });
        if (!taskAt(id, fence, true)) return;
        // Core hides tombstoned uploads; absence after a cancel attempt means no live upload remains.
        if (
          readError &&
          typeof readError === "object" &&
          "code" in readError &&
          readError.code === "NOT_FOUND"
        ) {
          updateTask(
            id,
            { status: "cancelled", error: undefined, retryOperation: undefined },
            fence,
            true,
          );
          return;
        }
      }
    }
    updateTask(
      id,
      { status: "cancelling", error: `Не удалось проверить отмену. ${errorText(error)}` },
      fence,
      true,
    );
  }
}
/** Provider POST fields and signed URLs are never written to the global upload task store. */
function safeUpload(upload: GalleryUploadDto): GalleryUploadDto {
  return {
    ...upload,
    postUrl: null,
    postFields: null,
    // The upload task needs status and photo identity, not a second copy of signed media URLs.
    photo: upload.photo
      ? {
          ...upload.photo,
          thumbUrl: null,
          fullUrl: null,
          uploadId: null,
          errorMessage: upload.photo.errorMessage ? "Ошибка обработки фотографии" : null,
        }
      : null,
    errorMessage: upload.errorMessage ? "Ошибка обработки фотографии" : null,
  };
}
export function unexpiredUpload(upload: GalleryUploadDto, now = Date.now()): boolean {
  // Core signs the POST only until postExpiresAt (DTO.expiresAt); the reservation
  // can outlive that signature. Both must remain valid for >=5 seconds.
  if (!upload.postUrl || !upload.postFields || !upload.expiresAt) return false;
  const reservationDeadline = Date.parse(upload.reservationExpiresAt);
  const signedPostDeadline = Date.parse(upload.expiresAt);
  return (
    Number.isFinite(reservationDeadline) &&
    Number.isFinite(signedPostDeadline) &&
    Math.min(reservationDeadline, signedPostDeadline) - now > 5_000
  );
}
interface PreparedUpload {
  input: Omit<GalleryUploadInput, "clientRequestId" | "albumId">;
  transfer: (upload: GalleryUploadDto, controller: AbortController) => Promise<void>;
  dispose: () => void;
}
export async function runUpload(
  id: string,
  fence: TaskFence,
  api: UploadApi,
  options: {
    acquire: () => Promise<() => void>;
    prepare: () => Promise<PreparedUpload>;
    active: () => boolean;
    requestId: () => string;
    errorText: ErrorText;
    current?: () => boolean;
  },
) {
  const current = () => options.current?.() ?? true;
  const requireForeground = () => {
    if (!options.active()) throw new Error("Вернитесь в приложение и выберите файл заново.");
  };
  if (!current() || !taskAt(id, fence)) return;
  const release = await options.acquire();
  let prepared: PreparedUpload | undefined;
  let controller: AbortController | undefined;
  // Once an S3 POST starts, a network error/abort is NOT evidence the object
  // was rejected. Never let a repick silently replay an uncertain write.
  let storageAttempted = false;
  try {
    if (!taskAt(id, fence) || !current()) return;
    requireForeground();
    updateTask(id, { status: "sending", error: undefined }, fence);
    prepared = await options.prepare();
    let task = taskAt(id, fence);
    if (!task) return;
    if (!current()) return;
    requireForeground();
    let upload: GalleryUploadDto | undefined;
    if (task.retryOperation) {
      // Replay before reading a parent whose photo may already be tombstoned.
      if (!current()) return;
      upload = await api.retryUpload(task.retryOperation.parentId, {
        clientRequestId: task.retryOperation.requestId,
      });
    } else if (task.upload || task.retrySourceId) {
      if (!current()) return;
      upload = await api.getUpload(task.upload?.uploadId ?? task.retrySourceId!);
      task = taskAt(id, fence);
      if (!task) return;
      if (!current()) return;
      if (["failed", "expired"].includes(upload.status)) {
        const retryOperation = { parentId: upload.uploadId, requestId: options.requestId() };
        updateTask(id, { retryOperation }, fence);
        if (!current()) return;
        upload = await api.retryUpload(retryOperation.parentId, {
          clientRequestId: retryOperation.requestId,
        });
      }
    } else {
      if (!current()) return;
      upload = await api.reserveUpload({
        ...prepared.input,
        albumId: task.albumId,
        clientRequestId: task.id,
      });
    }
    if (!taskAt(id, fence) || !current()) {
      const state = useGallerySession.getState();
      const current = state.tasks.find((t) => t.id === id);
      if (
        state.epoch === fence.epoch &&
        current?.cancelRequested &&
        current.upload?.uploadId !== upload.uploadId
      ) {
        await cancelTask(id, fence.epoch, api, options.errorText, upload);
      }
      return;
    }
    // Only an acknowledged child replaces the active parent and retires the replay pair.
    requireForeground();
    if (!upload.uploadId || !upload.albumId) throw new Error("GALLERY_UPLOAD_INVALID_RECEIPT");
    updateTask(
      id,
      { upload: safeUpload(upload), albumId: upload.albumId, retryOperation: undefined },
      fence,
    );
    if (upload.status !== "reserved") {
      updateTask(id, uploadPatch(safeUpload(upload)), fence);
      return;
    }
    if (!unexpiredUpload(upload)) {
      updateTask(
        id,
        { status: "expired", error: "Время загрузки истекло. Выберите файл заново." },
        fence,
      );
      return;
    }
    if (!current()) return;
    requireForeground();
    controller = new AbortController();
    galleryRequests.set(id, controller);
    storageAttempted = true;
    await prepared.transfer(upload, controller);
    if (!taskAt(id, fence)) return;
    if (controller.signal.aborted || !current()) {
      updateTask(id, {
        status: "unknown",
        error: "Отправка файла прервана. Проверьте статус, не загружая его повторно.",
      }, fence);
      return;
    }
    requireForeground();
    // Storage already accepted POST; signed postExpiresAt may now be elapsed.
    // The separate reservation deadline is the server's confirm boundary.
    const reservationDeadline = Date.parse(upload.reservationExpiresAt);
    if (!Number.isFinite(reservationDeadline) || reservationDeadline - Date.now() <= 5_000) {
      updateTask(
        id,
        { status: "expired", error: "Время загрузки истекло. Выберите файл заново." },
        fence,
      );
      return;
    }
    // Commit is NOT idempotent by the client on an uncertain reply. Do not replay it.
    let commitAttempted = false;
    try {
      if (!current()) return;
      commitAttempted = true;
      const complete = await api.confirmUpload(upload.uploadId);
      if (!taskAt(id, fence) || !current()) return;
      if (complete.uploadId !== upload.uploadId || complete.albumId !== upload.albumId)
        throw new Error("GALLERY_COMMIT_ACK_MISMATCH");
      const readback = await api.getUpload(upload.uploadId);
      if (!taskAt(id, fence) || !current()) return;
      if (
        readback.uploadId !== upload.uploadId ||
        readback.albumId !== upload.albumId ||
        !["uploaded", "processing", "ready", "failed", "expired", "cancelled"].includes(
          readback.status,
        ) ||
        (readback.status === "ready" &&
          (!readback.photo?.id || readback.photo.albumId !== upload.albumId))
      )
        throw new Error("GALLERY_COMMIT_READBACK_UNKNOWN");
      updateTask(id, uploadPatch(safeUpload(readback)), fence);
    } catch {
      reportClientError(new Error("GALLERY_UPLOAD_COMMIT_OR_READBACK_UNKNOWN"), {
        issueKey: "GalleryUploadQueue",
        keys: { operation: "commit_and_readback" },
      });
      if (!commitAttempted || !taskAt(id, fence) || !current()) return;
      // The commit response or first readback can be lost *after* the server
      // accepted it. A second GET is safe; a second POST is not.
      try {
        const authoritative = await api.getUpload(upload.uploadId);
        if (!taskAt(id, fence) || !current()) return;
        if (
          authoritative.uploadId === upload.uploadId &&
          authoritative.albumId === upload.albumId &&
          ["uploaded", "processing", "ready", "failed", "expired", "cancelled"].includes(authoritative.status) &&
          (authoritative.status !== "ready" ||
            (authoritative.photo?.id && authoritative.photo.albumId === upload.albumId))
        ) {
          updateTask(id, uploadPatch(safeUpload(authoritative)), fence);
          return;
        }
      } catch {
        // Missing readback is inconclusive, not permission to upload twice.
      }
      if (taskAt(id, fence) && current()) {
        updateTask(id, {
          status: "unknown",
          error: "Подтверждение пока не удалось проверить. Статус обновится автоматически; файл повторно не отправляется.",
        }, fence);
      }
    }
  } catch (error) {
    reportClientError(new Error("GALLERY_UPLOAD_PRECOMMIT_FAILED"), {
      issueKey: "GalleryUploadQueue",
      keys: { operation: "prepare_reserve_transfer", reason: photoFailureCode(error) },
    });
    if (taskAt(id, fence)) {
      updateTask(id, storageAttempted
        ? {
            status: "unknown",
            error: "Хранилище не подтвердило отправку. Проверьте статус без повторной загрузки.",
          }
        : { status: "failed", error: options.errorText(error) }, fence);
    }
  } finally {
    if (galleryRequests.get(id) === controller) galleryRequests.delete(id);
    try {
      prepared?.dispose();
    } finally {
      release();
    }
  }
}
