import type { createGalleryClient, GalleryUploadDto, GalleryUploadInput } from "@gafus/types";
import { galleryRequests, taskAt, updateTask, useGallerySession, type TaskFence, type UploadTask } from "./session";

type UploadApi = Pick<ReturnType<typeof createGalleryClient>, "getUpload" | "reserveUpload" | "retryUpload" | "confirmUpload" | "cancelUpload">;
type ErrorText = (error: unknown) => string;
export function uploadPatch(upload: GalleryUploadDto): Partial<UploadTask> {
  const status = upload.status === "ready" ? "ready" : upload.status === "cancelled" ? "cancelled"
    : upload.status === "failed" ? "failed" : upload.status === "expired" ? "expired"
    : upload.status === "reserved" ? "failed" : "processing";
  return { upload, albumId: upload.albumId, status,
    error: status === "failed" ? upload.errorMessage ?? "Загрузка не завершена. Выберите файл заново."
      : status === "expired" ? "Время загрузки истекло. Выберите файл заново." : undefined };
}
export async function pollTask(id: string, fence: TaskFence, api: UploadApi) {
  const task = taskAt(id, fence);
  if (!task?.upload) return;
  const upload = await api.getUpload(task.upload.uploadId);
  if (!taskAt(id, fence)) return;
  updateTask(id, uploadPatch(upload), fence);
  return upload;
}
/** Cancellation supersedes every transfer/confirmation/poll from the prior generation. */
export async function cancelTask(id: string, epoch: number, api: UploadApi, errorText: ErrorText, knownUpload?: GalleryUploadDto) {
  const state = useGallerySession.getState();
  const task = state.tasks.find(t => t.id === id);
  if (state.epoch !== epoch || !task) return;
  const fence = { epoch, generation: task.generation + 1 };
  updateTask(id, { generation: fence.generation, cancelRequested: true, status: "cancelling", error: undefined },
    { epoch, generation: task.generation }, true);
  galleryRequests.get(id)?.abort();
  let upload = knownUpload ?? task.upload;
  let retryAcknowledged = !task.retryOperation;
  try {
    // A committed child may exist even though its response never reached this device.
    if (task.retryOperation) {
      upload = await api.retryUpload(task.retryOperation.parentId, { clientRequestId: task.retryOperation.requestId });
      if (!taskAt(id, fence, true)) return;
      retryAcknowledged = true;
      updateTask(id, { upload, albumId: upload.albumId, retryOperation: undefined }, fence, true);
    }
    if (upload) {
      const cancelled = await api.cancelUpload(upload.uploadId);
      if (!taskAt(id, fence, true)) return;
      upload = cancelled;
    }
    updateTask(id, { upload, status: "cancelled", error: undefined }, fence, true);
  } catch (error) {
    if (!taskAt(id, fence, true)) return;
    if (!retryAcknowledged) {
      updateTask(id, { status: "cancelling", error: `Не удалось проверить отмену. ${errorText(error)}` }, fence, true);
      return;
    }
    // A rejected cancellation may mean processing already finished. Read authoritative state.
    if (upload) {
      try {
        const current = await api.getUpload(upload.uploadId);
        if (!taskAt(id, fence, true)) return;
        updateTask(id, { ...uploadPatch(current), cancelRequested: current.status === "cancelled",
          error: current.status === "cancelled" ? undefined : errorText(error) }, fence, true);
        return;
      } catch (readError) {
        if (!taskAt(id, fence, true)) return;
        // Core hides tombstoned uploads; absence after a cancel attempt means no live upload remains.
        if (readError && typeof readError === "object" && "code" in readError && readError.code === "NOT_FOUND") {
          updateTask(id, { status: "cancelled", error: undefined, retryOperation: undefined }, fence, true);
          return;
        }
      }
    }
    updateTask(id, { status: "cancelling", error: `Не удалось проверить отмену. ${errorText(error)}` }, fence, true);
  }
}
interface PreparedUpload {
  input: Omit<GalleryUploadInput, "clientRequestId" | "albumId">;
  transfer: (upload: GalleryUploadDto, controller: AbortController) => Promise<void>;
  dispose: () => void;
}
export async function runUpload(id: string, fence: TaskFence, api: UploadApi, options: {
  acquire: () => Promise<() => void>;
  prepare: () => Promise<PreparedUpload>;
  active: () => boolean;
  requestId: () => string;
  errorText: ErrorText;
}) {
  const release = await options.acquire();
  let prepared: PreparedUpload | undefined;
  let controller: AbortController | undefined;
  try {
    if (!taskAt(id, fence)) return;
    if (!options.active()) throw new Error("Вернитесь в приложение и выберите файл заново.");
    updateTask(id, { status: "sending", error: undefined }, fence);
    prepared = await options.prepare();
    let task = taskAt(id, fence);
    if (!task) return;
    if (!options.active()) throw new Error("Вернитесь в приложение и выберите файл заново.");
    let upload: GalleryUploadDto | undefined;
    if (task.retryOperation) {
      // Replay before reading a parent whose photo may already be tombstoned.
      upload = await api.retryUpload(task.retryOperation.parentId, { clientRequestId: task.retryOperation.requestId });
    } else if (task.upload || task.retrySourceId) {
      upload = await api.getUpload(task.upload?.uploadId ?? task.retrySourceId!);
      task = taskAt(id, fence);
      if (!task) return;
      if (!options.active()) throw new Error("Вернитесь в приложение и выберите файл заново.");
      if (["failed", "expired"].includes(upload.status)) {
        const retryOperation = { parentId: upload.uploadId, requestId: options.requestId() };
        updateTask(id, { retryOperation }, fence);
        upload = await api.retryUpload(retryOperation.parentId, { clientRequestId: retryOperation.requestId });
      }
    } else {
      upload = await api.reserveUpload({ ...prepared.input, albumId: task.albumId, clientRequestId: task.id });
    }
    if (!taskAt(id, fence)) {
      const state = useGallerySession.getState();
      const current = state.tasks.find(t => t.id === id);
      if (state.epoch === fence.epoch && current?.cancelRequested && current.upload?.uploadId !== upload.uploadId) {
        await cancelTask(id, fence.epoch, api, options.errorText, upload);
      }
      return;
    }
    // Only an acknowledged child replaces the active parent and retires the replay pair.
    updateTask(id, { upload, albumId: upload.albumId, retryOperation: undefined }, fence);
    if (upload.status !== "reserved") { updateTask(id, uploadPatch(upload), fence); return; }
    if (!options.active()) throw new Error("Вернитесь в приложение и выберите файл заново.");
    controller = new AbortController();
    galleryRequests.set(id, controller);
    await prepared.transfer(upload, controller);
    if (!taskAt(id, fence) || controller.signal.aborted) return;
    if (!options.active()) throw new Error("Вернитесь в приложение и выберите файл заново.");
    const complete = await api.confirmUpload(upload.uploadId);
    if (!taskAt(id, fence)) return;
    updateTask(id, uploadPatch(complete), fence);
  } catch (error) {
    updateTask(id, { status: "failed", error: options.errorText(error) }, fence);
  } finally {
    if (galleryRequests.get(id) === controller) galleryRequests.delete(id);
    try { prepared?.dispose(); } finally { release(); }
  }
}
