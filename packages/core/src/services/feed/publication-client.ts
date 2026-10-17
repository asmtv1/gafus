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
}
export interface PublicationAsset {
  requestId: string;
  bytes: number;
  previewUri?: string;
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
  /** Optional faster polling for active Mobile publication cards (default 5 seconds). */
  pollIntervalMs?: number;
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
  // Keep the original ten-minute wait budget for slow video transcoding, even
  // if a client polls more frequently to display completed photos sooner.
  const pollIntervalMs = deps.pollIntervalMs ?? 5000;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 1000 || pollIntervalMs > 5000)
    throw new Error("INVALID_PUBLICATION_POLL_INTERVAL");
  const maxPollAttempts = Math.ceil(600_000 / pollIntervalMs);
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
  const run = async (job: Job<T>) => {
    if (job.running) return;
    job.running = true;
    update(job, { phase: "uploading", error: undefined, progress: null });
    try {
      const { input } = job;
      const api = deps.api;
      const post = job.item.postId
        ? await api.getEditor(job.item.postId)
        : await api.createPost({ clientRequestId: job.createRequestId });
      update(job, { postId: post.id });
      if (post.status === "published") { succeed(job, post.id); return; }

      if (post.status !== "pending") {
        const pollPhotos = input.pollOptionImages ?? [];
        if (pollPhotos.length && (!input.poll || !deps.pollImageStatus)) {
          throw new Error("Загрузка фотографий для опроса недоступна.");
        }
        if (new Set(pollPhotos.map(item => item.optionIndex)).size !== pollPhotos.length ||
            pollPhotos.some(item => item.optionIndex < 0 || item.optionIndex >= (input.poll?.options.length ?? 0)) ||
            input.files.length + input.albumPhotoIds.length + pollPhotos.length > 10) {
          throw new Error("Недопустимые изображения опроса или слишком много вложений.");
        }
        const totalBytes = [...input.files, ...pollPhotos.map(item => item.asset)]
          .reduce((total, asset) => total + asset.bytes, 0);
        let doneBytes = input.files.reduce((total, asset) =>
          total + (job.completed.has(asset.requestId) ? asset.bytes : 0), 0);
        const attachmentIds: string[] = [];
        for (const asset of input.files) {
          let mediaId = job.completed.get(asset.requestId);
          if (!mediaId) {
            let currentBytes = 0;
            mediaId = await deps.upload(post.id, asset, (loaded, total) => {
              if (total <= 0 || !Number.isFinite(loaded)) return;
              currentBytes = Math.min(asset.bytes, Math.max(0, Math.round(loaded / total * asset.bytes)));
              const percent = totalBytes
                ? Math.min(100, Math.floor((doneBytes + currentBytes) / totalBytes * 100))
                : null;
              update(job, { phase: "uploading", progress: percent });
            });
            job.completed.set(asset.requestId, mediaId);
            doneBytes += asset.bytes;
          }
          attachmentIds.push(mediaId);
          if (totalBytes) update(job, { progress: Math.floor(doneBytes / totalBytes * 100) });
        }
        for (const { asset } of pollPhotos) {
          let mediaId = job.completed.get(asset.requestId);
          if (!mediaId) {
            let currentBytes = 0;
            mediaId = await deps.upload(post.id, asset, (loaded, total) => {
              if (total <= 0 || !Number.isFinite(loaded)) return;
              currentBytes = Math.min(asset.bytes, Math.max(0, Math.round(loaded / total * asset.bytes)));
              const percent = totalBytes ? Math.min(100, Math.floor((doneBytes + currentBytes) / totalBytes * 100)) : null;
              update(job, { phase: "uploading", progress: percent });
            });
            job.completed.set(asset.requestId, mediaId);
            doneBytes += asset.bytes;
          }
          if (totalBytes) update(job, { progress: Math.floor(doneBytes / totalBytes * 100) });
        }
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
        if (input.poll && !job.pollSaved) {
          if (!api.savePoll) throw new Error("Опросы пока недоступны в этом приложении.");
          // Photo workers can finish independently of post revision activation.
          // Do not persist option IDs until each uploaded photo is fully processed.
          for (const { asset } of pollPhotos) {
            const mediaId = job.completed.get(asset.requestId)!;
            let ready = false;
            for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
              const state = await deps.pollImageStatus!(post.id, asset, mediaId);
              if (state === "ready") { ready = true; break; }
              if (state === "failed") throw new Error("Не удалось обработать изображение варианта опроса.");
              update(job, { phase: "processing", progress: 100 });
              await sleep(pollIntervalMs);
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
      // Server publication is asynchronous (video transcoding, thumbnails, moderation).
      // Poll actual post status; a successful HTTP publish is NOT "published".
      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        const result = await api.getEditor(post.id);
        if (result.status === "published") { succeed(job, post.id); return; }
        if (result.status === "failed") {
          throw new Error(result.pendingRevision?.errorMessage ?? "Ошибка обработки вложения.");
        }
        await sleep(pollIntervalMs);
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
        },
        input, createRequestId: deps.makeId(), revisionRequestId: deps.makeId(),
        publishRequestId: deps.makeId(), copied: new Map(), completed: new Map(),
        saved: false, pollSaved: false, running: false,
      };
      jobs.set(id, job);
      emit();
      void run(job);
      return id;
    },
    retry: (id: string) => {
      const job = jobs.get(id);
      if (job && job.item.phase === "failed") void run(job);
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
