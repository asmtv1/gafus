import type { GalleryUploadDto, GalleryUploadInput } from "@gafus/types";
export type UploadEntry = {
  key: string;
  name: string;
  file?: File;
  upload?: GalleryUploadDto;
  uploadId?: string;
  state: string;
  error?: string;
  progress: number;
  processingStartedAt?: number;
  generation?: number;
  pendingRetry?: { parentId: string; clientRequestId: string };
  needsConfirm?: boolean;
  reservationStarted?: boolean;
};
type UploadApi = {
  reserveUpload(input: GalleryUploadInput): Promise<GalleryUploadDto>;
  getUpload(id: string): Promise<GalleryUploadDto>;
  retryUpload(id: string, input: { clientRequestId: string }): Promise<GalleryUploadDto>;
  confirmUpload(id: string): Promise<GalleryUploadDto>;
  cancelUpload(id: string): Promise<GalleryUploadDto>;
};
/** The entry is the operation journal: mutate it before a request, publish only behind a fence. */
export function createUploadTask(options: {
  api: UploadApi;
  albumId?: string;
  valid: () => boolean;
  publish: () => void;
  changed?: () => void;
  pollVisible?: () => boolean;
  transfer: (upload: GalleryUploadDto, file: File, valid: () => boolean) => Promise<void>;
  abort: () => void;
  message: (error: unknown) => string;
}) {
  const { api } = options;
  const fence = (entry: UploadEntry) => {
    const generation = entry.generation ?? 0;
    return () => options.valid() && generation === (entry.generation ?? 0);
  };
  const cancelled = (entry: UploadEntry) => {
    entry.state = "cancelled";
    entry.file = undefined;
    entry.upload = undefined;
    entry.pendingRetry = undefined;
    entry.needsConfirm = false;
    entry.reservationStarted = false;
    entry.processingStartedAt = undefined;
    entry.error = undefined;
    options.publish();
    options.changed?.();
  };
  const adopt = (entry: UploadEntry, upload: GalleryUploadDto) => {
    if (upload.status === "cancelled") {
      entry.uploadId = upload.uploadId;
      cancelled(entry);
      return;
    }
    const previousState = entry.state;
    const previousError = entry.error;
    const previousPhotoStatus = entry.upload?.photo?.status;
    entry.upload = upload;
    entry.uploadId = upload.uploadId;
    if (upload.status === "uploaded" || upload.status === "processing") {
      entry.processingStartedAt ??= Date.now();
    } else {
      entry.processingStartedAt = undefined;
    }
    entry.state = upload.status;
    entry.error =
      upload.status === "failed"
        ? upload.errorMessage || "Обработка фотографии не удалась."
        : undefined;
    // Polling the same pending state must not invalidate every gallery query.
    // A real status/photo change still refreshes album counts and images.
    if (
      previousState !== entry.state ||
      previousError !== entry.error ||
      previousPhotoStatus !== upload.photo?.status
    ) {
      options.publish();
      options.changed?.();
    }
  };
  const resolve = async (
    entry: UploadEntry,
    valid: () => boolean,
  ): Promise<GalleryUploadDto | undefined> => {
    // A committed retry tombstones its parent. Replay the exact operation before reading it.
    if (entry.pendingRetry) {
      const operation = entry.pendingRetry;
      const upload = await api.retryUpload(operation.parentId, {
        clientRequestId: operation.clientRequestId,
      });
      if (!valid()) return;
      entry.pendingRetry = undefined;
      entry.needsConfirm = false;
      entry.uploadId = upload.uploadId;
      entry.upload = upload;
      options.changed?.();
      return upload;
    }
    const reserving = !entry.uploadId;
    if (reserving) entry.reservationStarted = true;
    const upload = entry.uploadId
      ? await api.getUpload(entry.uploadId)
      : await api.reserveUpload({
          albumId: options.albumId ?? null,
          filename: entry.file!.name,
          declaredMime: entry.file!.type as GalleryUploadInput["declaredMime"],
          declaredBytes: entry.file!.size,
          clientRequestId: entry.key,
        });
    if (!valid()) return;
    entry.uploadId = upload.uploadId;
    entry.upload = upload;
    if (reserving) options.changed?.();
    return upload;
  };
  return {
    async run(entry: UploadEntry) {
      const valid = fence(entry);
      entry.state = "uploading";
      entry.error = undefined;
      options.publish();
      try {
        let upload = await resolve(entry, valid);
        if (!valid() || !upload) return;
        if (["failed", "expired"].includes(upload.status)) {
          entry.pendingRetry = { parentId: upload.uploadId, clientRequestId: crypto.randomUUID() };
          options.publish();
          upload = await resolve(entry, valid);
          if (!valid() || !upload) return;
        }
        if (upload.status !== "reserved") {
          adopt(entry, upload);
          return;
        }
        if (!entry.needsConfirm) {
          if (!entry.file || !upload.postUrl || !upload.postFields)
            throw new Error("Выберите файл повторно для загрузки.");
          await options.transfer(upload, entry.file, valid);
          if (!valid()) return;
          entry.needsConfirm = true;
        }
        const confirmed = await api.confirmUpload(upload.uploadId);
        if (!valid()) return;
        entry.needsConfirm = false;
        entry.progress = 100;
        adopt(entry, confirmed);
      } catch (error) {
        if (valid()) {
          entry.state = "failed";
          entry.error = options.message(error);
          options.publish();
        }
      }
    },
    async poll(entry: UploadEntry) {
      const operationValid = fence(entry);
      const valid = () => operationValid() && (options.pollVisible?.() ?? true);
      try {
        const upload = await api.getUpload(entry.uploadId!);
        if (valid()) adopt(entry, upload);
      } catch (error) {
        if (valid()) {
          entry.error = options.message(error);
          options.publish();
        }
      }
    },
    async cancel(entry: UploadEntry) {
      entry.generation = (entry.generation ?? 0) + 1;
      const valid = fence(entry);
      options.abort();
      const previous = entry.state;
      if (!entry.uploadId && !entry.reservationStarted && !entry.pendingRetry) {
        cancelled(entry);
        return;
      }
      const resolveCancellation = async () => {
        // Only an authoritative read can establish a tombstone. Pending retry POSTs
        // must still replay their original operation before reading the child.
        const readingUpload = !!entry.uploadId && !entry.pendingRetry;
        try {
          return await resolve(entry, valid);
        } catch (error) {
          if (
            valid() &&
            readingUpload &&
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "NOT_FOUND"
          ) {
            cancelled(entry);
            return;
          }
          throw error;
        }
      };
      entry.state = "cancelling";
      options.publish();
      try {
        // Resolve ambiguous reservation/retry with its original idempotency key.
        const upload = await resolveCancellation();
        if (!valid() || !upload) return;
        const cancelled = await api.cancelUpload(upload.uploadId);
        if (!valid()) return;
        adopt(entry, cancelled);
      } catch (error) {
        if (!valid()) return;
        try {
          const upload = await resolveCancellation();
          if (!valid()) return;
          if (upload) adopt(entry, upload);
          if (entry.state === "cancelled") return;
        } catch (reconciliationError) {
          if (!valid()) return;
          entry.state = "cancel_unknown";
          entry.error = options.message(reconciliationError);
          options.publish();
          return;
        }
        if (!valid()) return;
        // Reconciled reserved uploads can be resumed explicitly, never silently cancelled.
        if (entry.state === "reserved" || (previous === "queued" && !entry.uploadId))
          entry.state = "failed";
        entry.error = options.message(error);
        options.publish();
      }
    },
  };
}
