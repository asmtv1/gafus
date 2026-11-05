/**
 * Cross-platform Moments publication workflow. No React, browser, React Native, or
 * server dependencies: clients supply API, file transport, and identity adapters.
 * This manager lives outside screens, so navigation does not cancel in-flight work.
 */
import type { FeedPostEditorDto, FeedMediaDto, FeedPollSaveInput } from "@gafus/types";

export type PublicationPhase = "uploading" | "processing" | "published" | "failed";
export interface PublicationItem {
  id: string;
  ownerId: string;
  postId?: string;
  text: string;
  previewUri?: string;
  attachmentCount: number;
  phase: PublicationPhase;
  /** Actual bytes acknowledged by upload progress events / completed uploads. */
  progress: number | null;
  error?: string;
  /** Local owner-only per-file state; never injected into a published feed item. */
  files?: PublicationFileState[];
}
export interface PublicationFileState {
  requestId: string;
  kind?: "video" | "photo";
  name?: string;
  previewUri?: string;
  phase: "waiting" | "uploading" | "ready" | "failed";
  error?: string;
}
export interface PublicationAsset {
  requestId: string;
  bytes: number;
  previewUri?: string;
  filename?: string;
  kind?: "photo" | "video";
}
export interface PublicationApi {
  createPost(input: { clientRequestId: string }): Promise<FeedPostEditorDto>;
  getEditor(postId: string): Promise<FeedPostEditorDto>;
  copyAlbumPhoto(postId: string, input: { photoId: string; clientRequestId: string }): Promise<FeedMediaDto>;
  saveRevision(postId: string, input: {
    clientRequestId: string; expectedVersion: number; text: string; attachmentIds: string[]; pollOnly?: true;
  }): Promise<FeedPostEditorDto>;
  publishPost(postId: string, input: { clientRequestId: string }): Promise<FeedPostEditorDto>;
  savePoll?: (postId: string, input: FeedPollSaveInput) => Promise<unknown>;
}
export interface PublicationInput<T extends PublicationAsset> {
  ownerId: string;
  text: string;
  files: T[];
  albumPhotoIds: string[];
  poll?: Omit<FeedPollSaveInput, "expectedVersion">;
  /** Local assets indexed by their option position; not serialized to server. */
  pollOptionImages?: { optionIndex: number; asset: T }[];
}
export interface PublicationDependencies<T extends PublicationAsset> {
  api: PublicationApi;
  upload: (postId: string, asset: T, report: (loaded: number, total: number) => void) => Promise<string>;
  makeId: () => string;
  /** Web polls every 5 s; Mobile every 2 s. Shared processing budget remains 10 min. */
  pollIntervalMs?: number;
  /** Save the text to the server before attachments, so an S3 failure cannot strand an empty draft. */
  preserveDraftTextBeforeUpload?: boolean;
  /** Poll photo upload status must be checked before poll creation/publishing. */
  pollImageStatus?: (postId: string, asset: T, mediaId: string) => Promise<"ready" | "pending" | "failed">;
  onPublished?: (postId: string) => void;
  onRemove?: (item: PublicationItem) => void;
  onAssetsReleased?: (input: PublicationInput<T>) => void;
}

type Job<T extends PublicationAsset> = {
  item: PublicationItem;
  input: PublicationInput<T>;
  createRequestId: string;
  revisionRequestId: string;
  initialTextRequestId: string;
  initialTextBaseVersion?: number;
  initialTextSaved?: boolean;
  publishRequestId: string;
  copied: Map<string, { requestId: string; mediaId?: string }>;
  completed: Map<string, string>;
  saved: boolean;
  pollSaved: boolean;
  revisionBaseVersion?: number;
  running: boolean;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function publicationPhaseLabel(item: PublicationItem): string {
  switch (item.phase) {
    case "uploading": return item.progress === null
      ? "Подготавливаем публикацию…" : `Загружаем… ${item.progress}%`;
    case "processing": return "Обрабатываем публикацию…";
    case "published": return "Опубликовано!";
    case "failed": return "Не удалось опубликовать";
  }
}

export function createFeedPublicationManager<T extends PublicationAsset>(deps: PublicationDependencies<T>) {
  const pollIntervalMs = deps.pollIntervalMs ?? 5_000;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 60_000) {
    throw new RangeError("Invalid Moments polling interval");
  }
  // This budget is shared by poll-option images and final revision activation.
  const waitForNextPoll = async (deadline: number) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await sleep(Math.min(pollIntervalMs, remaining));
    return Date.now() < deadline;
  };
  // One manager-level upload budget shared by all queued posts and poll photos.
  // Releasing a slot passes ownership to the oldest waiter; pending jobs never
  // exceed five concurrent S3 transfers even when several posts run at once.
  let inFlightUploads = 0;
  const uploadWaiters: (() => void)[] = [];
  const withUploadSlot = async <U>(upload: () => Promise<U>): Promise<U> => {
    if (inFlightUploads < 5) inFlightUploads++;
    else await new Promise<void>(resolve => uploadWaiters.push(resolve));
    try { return await upload(); }
    finally {
      const next = uploadWaiters.shift();
      if (next) next(); // hand over the occupied slot, keeping count unchanged
      else inFlightUploads--;
    }
  };
  const jobs = new Map<string, Job<T>>();
  const listeners = new Set<() => void>();
  let snapshot: PublicationItem[] = [];
  const emit = () => {
    snapshot = Array.from(jobs.values()).map(job => ({ ...job.item })).reverse();
    for (const listener of listeners) listener();
  };
  const update = (job: Job<T>, patch: Partial<PublicationItem>) => {
    job.item = { ...job.item, ...patch };
    emit();
  };
  const updateFile = (job: Job<T>, requestId: string,
    patch: Partial<PublicationFileState>) => {
    if (!job.item.files?.some(file => file.requestId === requestId)) return;
    update(job, { files: job.item.files.map(file => file.requestId === requestId
      ? { ...file, ...patch } : file) });
  };
  const succeed = (job: Job<T>, postId: string) => {
    update(job, { phase: "published", progress: 100, error: undefined, postId });
    deps.onPublished?.(postId);
    setTimeout(() => {
      if (jobs.get(job.item.id) === job && job.item.phase === "published") {
        jobs.delete(job.item.id);
        deps.onRemove?.(job.item);
        deps.onAssetsReleased?.(job.input);
        emit();
      }
    }, 6000);
  };
  const run = async (job: Job<T>, onlyRequestId?: string) => {
    if (job.running) return;
    job.running = true;
    update(job, { phase: "uploading", error: undefined, progress: null });
    try {
      const { input } = job;
      const api = deps.api;
      let post = job.item.postId
        ? await api.getEditor(job.item.postId)
        : await api.createPost({ clientRequestId: job.createRequestId });
      update(job, { postId: post.id });
      if (post.status === "published") { succeed(job, post.id); return; }

      let processingDeadline: number | undefined;
      if (post.status !== "pending") {
        const pollPhotos = input.pollOptionImages ?? [];
        if (deps.preserveDraftTextBeforeUpload && !job.initialTextSaved && input.text.trim() &&
            input.files.length + input.albumPhotoIds.length + pollPhotos.length > 0) {
          job.initialTextBaseVersion ??= post.version;
          // This revision can be replayed with the same idempotency key if its ACK was lost.
          // The final revision replaces it once all media IDs are known.
          post = await api.saveRevision(post.id, {
            clientRequestId: job.initialTextRequestId,
            expectedVersion: job.initialTextBaseVersion,
            text: input.text,
            attachmentIds: [],
          });
          job.initialTextSaved = true;
        }
        if (pollPhotos.length && (!input.poll || !deps.pollImageStatus)) {
          throw new Error("Загрузка фотографий для опроса недоступна.");
        }
        if (new Set(pollPhotos.map(item => item.optionIndex)).size !== pollPhotos.length ||
            pollPhotos.some(item => item.optionIndex < 0 || item.optionIndex >= (input.poll?.options.length ?? 0)) ||
            input.files.length + input.albumPhotoIds.length + pollPhotos.length > 10) {
          throw new Error("Недопустимые изображения опроса или слишком много вложений.");
        }
        const assets = [...input.files, ...pollPhotos.map(item => item.asset)];
        if (new Set(assets.map(asset => asset.requestId)).size !== assets.length) {
          throw new Error("Повторяющиеся идентификаторы загружаемых файлов.");
        }
        const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0);
        const loaded = new Map(assets.map(asset => [asset.requestId,
          job.completed.has(asset.requestId) ? asset.bytes : 0]));
        const refreshProgress = () => {
          if (!totalBytes) return;
          const transferred = [...loaded.values()].reduce((sum, bytes) => sum + bytes, 0);
          update(job, { phase: "uploading", progress: Math.min(100,
            Math.floor(transferred / totalBytes * 100)) });
        };
        const queued = assets.filter(asset => !job.completed.has(asset.requestId) &&
          (!onlyRequestId || asset.requestId === onlyRequestId));
        let cursor = 0;
        let failed: { error: unknown } | null = null;
        const uploadNext = async () => {
          while (cursor < queued.length && !failed) {
            const asset = queued[cursor++]!;
            updateFile(job, asset.requestId, { phase: "uploading", error: undefined });
            try {
              await withUploadSlot(async () => {
                if (failed) {
                  // A previous upload has failed while this item waited for a
                  // slot. Leave this particular file WAITING, not spinning.
                  updateFile(job, asset.requestId, { phase: "waiting" });
                  return;
                }
                const mediaId = await deps.upload(post.id, asset, (bytes, total) => {
                  if (total <= 0 || !Number.isFinite(bytes)) return;
                  const previous = loaded.get(asset.requestId) ?? 0;
                  loaded.set(asset.requestId, Math.max(previous, Math.min(asset.bytes,
                    Math.max(0, Math.round(bytes / total * asset.bytes)))));
                  refreshProgress();
                });
                job.completed.set(asset.requestId, mediaId);
                updateFile(job, asset.requestId, { phase: "ready", error: undefined });
                loaded.set(asset.requestId, asset.bytes);
                refreshProgress();
              });
            } catch (error) {
              updateFile(job, asset.requestId, { phase: "failed",
                error: error instanceof Error ? error.message : "Ошибка передачи видео" });
              failed ??= { error };
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(5, queued.length) }, () => uploadNext()));
        if (failed) throw (failed as { error: unknown }).error;
        // An explicit arrow on a single failed thumbnail must NEVER start any
        // neighboring unfinished photo/video. Keep them queued for a separate
        // "continue" action. The accepted mediaId remains attached to this draft.
        if (onlyRequestId && assets.some(asset => !job.completed.has(asset.requestId))) {
          update(job, {phase:"failed", progress:null,
            error:"Выбранный файл повторно отправлен. Остальные незавершённые вложения можно продолжить отдельно."});
          return;
        }
        // Completion can arrive out of order. Revision attachments retain the
        // exact user's file order; poll-photo assets stay independent of it.
        const attachmentIds = input.files.map(asset => job.completed.get(asset.requestId)!);
        for (const photoId of input.albumPhotoIds) {
          const copy = job.copied.get(photoId) ?? { requestId: deps.makeId() };
          job.copied.set(photoId, copy);
          if (!copy.mediaId) {
            const result = await api.copyAlbumPhoto(post.id, {
              photoId, clientRequestId: copy.requestId,
            });
            copy.mediaId = result.id;
          }
          attachmentIds.push(copy.mediaId);
        }
        update(job, { phase: "processing", progress: totalBytes ? 100 : null });
        processingDeadline = Date.now() + 10 * 60_000;
        if (input.poll && !job.pollSaved) {
          if (!api.savePoll) throw new Error("Опросы пока недоступны в этом приложении.");
          // Photo workers can finish independently of post revision activation.
          // Do not persist option IDs until each uploaded photo is fully processed.
          for (const { asset } of pollPhotos) {
            const mediaId = job.completed.get(asset.requestId)!;
            let ready = false;
            while (Date.now() < processingDeadline) {
              const state = await deps.pollImageStatus!(post.id, asset, mediaId);
              if (state === "ready") { ready = true; break; }
              if (state === "failed") throw new Error("Не удалось обработать изображение варианта опроса.");
              update(job, { phase: "processing", progress: 100 });
              if (!(await waitForNextPoll(processingDeadline))) break;
            }
            if (!ready) throw new Error("Изображения опроса обрабатываются слишком долго. Повторите публикацию.");
          }
          const imageIds = new Map(pollPhotos.map(({ optionIndex, asset }) =>
            [optionIndex, job.completed.get(asset.requestId)!]));
          await api.savePoll(post.id, {
            ...input.poll, expectedVersion: post.version,
            options: input.poll.options.map((option, index) => ({
              ...option, ...(imageIds.has(index) ? { imageMediaId: imageIds.get(index) } : {}),
            })),
          });
          job.pollSaved = true;
        }
        if (!job.saved) {
          // Preserve the original expected version for idempotent revision replay.
          job.revisionBaseVersion ??= post.version;
          await api.saveRevision(post.id, {
            clientRequestId: job.revisionRequestId,
            expectedVersion: job.revisionBaseVersion,
            text: input.text,
            attachmentIds,
            ...(input.poll && !input.text.trim() && !attachmentIds.length ? { pollOnly: true as const } : {}),
          });
          job.saved = true;
        }
        await api.publishPost(post.id, { clientRequestId: job.publishRequestId });
      }
      update(job, { phase: "processing", progress: input.files.length ? 100 : null });
      // Recovered pending posts also get a bounded client wait, without
      // cancelling any server-side work if the budget expires.
      const publicationDeadline = processingDeadline ?? Date.now() + 10 * 60_000;
      // Server publication is asynchronous (video transcoding, thumbnails, moderation).
      // Poll actual post status; a successful HTTP publish is NOT "published".
      while (Date.now() < publicationDeadline) {
        const result = await api.getEditor(post.id);
        if (result.status === "published") { succeed(job, post.id); return; }
        if (result.status === "failed") {
          throw new Error(result.pendingRevision?.errorMessage ?? "Ошибка обработки вложения.");
        }
        if (!(await waitForNextPoll(publicationDeadline))) break;
      }
      throw new Error("Обработка занимает больше обычного. Проверьте публикацию и повторите проверку.");
    } catch (error) {
      update(job, { phase: "failed", error: error instanceof Error ? error.message : "Неизвестная ошибка." });
    } finally { job.running = false; }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enqueue: (input: PublicationInput<T>) => {
      const id = deps.makeId();
      const job: Job<T> = {
        item: {
          id, ownerId: input.ownerId, text: input.text || input.poll?.question || "",
          attachmentCount: input.files.length + input.albumPhotoIds.length + (input.pollOptionImages?.length ?? 0),
          previewUri: input.files[0]?.previewUri ?? input.pollOptionImages?.[0]?.asset.previewUri,
          phase: "uploading", progress: null,
          files: input.files.map(file => ({ requestId: file.requestId,
            kind: file.kind, name: file.filename, previewUri: file.previewUri,
            phase: "waiting" as const })),
        },
        input, createRequestId: deps.makeId(), revisionRequestId: deps.makeId(),
        initialTextRequestId: deps.makeId(), publishRequestId: deps.makeId(),
        copied: new Map(), completed: new Map(),
        saved: false, pollSaved: false, running: false,
      };
      jobs.set(id, job);
      emit();
      void run(job);
      return id;
    },
    retry: (id: string) => {
      const job = jobs.get(id);
      if (job && job.item.phase === "failed" &&
          job.item.files?.some(file => file.phase === "failed" || file.phase === "waiting"))
        void run(job);
    },
    retryFile: (id: string, requestId: string) => {
      const job = jobs.get(id);
      if (!job || job.running || job.item.phase !== "failed" ||
          !job.input.files.some(file => file.requestId === requestId) ||
          !job.item.files?.some(file => file.requestId === requestId && file.phase === "failed")) return;
      // The per-file arrow MUST target this one requestId, even when several
      // neighbors failed or waited for an upload slot. No already-ready file runs.
      void run(job,requestId);
    },
    dismiss: (id: string) => {
      const job = jobs.get(id);
      if (job && !job.running) {
        jobs.delete(id);
        deps.onRemove?.(job.item);
        deps.onAssetsReleased?.(job.input);
        emit();
      }
    },
  };
}
