/**
 * Store офлайн-курсов: очередь скачивания, список скачанных, прогресс.
 * Индекс строится из завершённых файлов текущего владельца; очередь хранится отдельно по владельцу.
 */
import { create } from "zustand";
import { zustandStorage } from "./storage";
import { reportClientError } from "@/shared/lib/error-reporting";
import { deleteCourseData, getCourseMeta, getOfflineCourseTypes, assertSafeOfflineSegment } from "@/shared/lib/offline/offlineStorage";
import {
  downloadCourseForOffline,
  hasEnoughDiskSpace,
  type DownloadCourseProgress,
} from "@/shared/lib/offline/downloadCourseForOffline";

import { captureOfflineCourseScope, subscribeOfflineCourseSession, type OfflineCourseScope } from "@/shared/lib/offline/offlineCourseSession";

let downloadAbortController: AbortController | null = null;
let activeScope: OfflineCourseScope | null = null;
let hydration: Promise<void> = Promise.resolve();
let queueWrites: Promise<void> = Promise.resolve();

const queueKey = (scope: OfflineCourseScope) => `offline-storage-v2:${scope.principalId}`;
function persistQueue(scope: OfflineCourseScope, state: OfflineState) {
  const queue = state.status.status === "downloading"
    ? [state.status.courseType, ...state.downloadQueue] : state.downloadQueue;
  const value = JSON.stringify({ ownerId: scope.principalId, queue });
  queueWrites = queueWrites.catch(() => undefined).then(async () => {
    await zustandStorage.setItem(queueKey(scope), value);
  }).catch(error => { reportClientError(error, { issueKey: "OfflineDownloadQueuePersist" }); });
}

function validQueue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => {
    if (typeof item !== "string") return false;
    try { assertSafeOfflineSegment(item); return true; } catch { return false; }
  }))].slice(0, 500);
}

interface DownloadedCourse {
  version: string;
}

interface OfflineState {
  downloadQueue: string[];
  downloaded: Record<string, DownloadedCourse>;
  status:
    | { status: "idle" }
    | { status: "downloading"; courseType: string; progress: DownloadCourseProgress };
}

interface OfflineActions {
  startDownload: (courseType: string) => Promise<void>;
  cancelDownload: () => void;
  removeFromQueue: (courseType: string) => void;
  removeDownload: (courseType: string) => Promise<void>;
  setDownloadProgress: (progress: DownloadCourseProgress) => void;
}

type OfflineStore = OfflineState & OfflineActions;

const initialState: OfflineState = {
  downloadQueue: [],
  downloaded: {},
  status: { status: "idle" },
};

async function processQueue(
  set: (fn: (s: OfflineState) => Partial<OfflineState>) => void,
  get: () => OfflineStore,
  scope: OfflineCourseScope,
): Promise<void> {
  if (!scope.canWrite()) return;
  const state = get();
  if (state.status.status !== "idle") return;
  const next = state.downloadQueue[0];
  if (!next) return;

  set((s) => ({
    downloadQueue: s.downloadQueue.slice(1),
    status: {
      status: "downloading",
      courseType: next,
      progress: { phase: "meta", current: 0, total: 1 },
    },
  }));

  persistQueue(scope, get());
  const controller = new AbortController();
  downloadAbortController = controller;
  let result: Awaited<ReturnType<typeof downloadCourseForOffline>>;
  try {
    result = await downloadCourseForOffline(
      next,
      (progress) => {
        if (scope.isCurrent() && downloadAbortController === controller) get().setDownloadProgress(progress);
      },
      controller.signal,
    );
  } catch (error) {
    if (!scope.isCurrent()) return;
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "OfflineDownloadQueue",
      keys: { courseType: next },
    });
    // A native filesystem rejection is NOT an ACK. Keep the queue item and
    // never delete/reassign unknown-owner legacy files as an error fallback.
    set((s) => ({
      downloadQueue: s.downloadQueue.includes(next) ? s.downloadQueue : [next, ...s.downloadQueue],
      status: { status: "idle" },
    }));
    persistQueue(scope, get());
    return;
  } finally {
    if (downloadAbortController === controller) {
      downloadAbortController = null;
    }
  }

  if (!scope.isCurrent()) return;
  if (result.success) {
    set((s) => ({
      downloaded: { ...s.downloaded, [next]: { version: result.version } },
      status: { status: "idle" },
    }));
  } else {
    set(() => ({ status: { status: "idle" } }));
  }
  persistQueue(scope, get());
  void processQueue(set, get, scope);
}

export const useOfflineStore = create<OfflineStore>()((set, get) => ({
      ...initialState,

      setDownloadProgress: (progress) => {
        const s = get().status;
        if (s.status === "downloading") {
          set({ status: { ...s, progress } });
        }
      },

      startDownload: async (courseType: string) => {
        const scope = captureOfflineCourseScope();
        if (!scope?.canWrite()) return;
        try { assertSafeOfflineSegment(courseType); } catch { return; }
        await hydration;
        if (!scope.canWrite()) return;
        const hasSpace = await hasEnoughDiskSpace();
        if (!scope.canWrite()) return;
        if (!hasSpace) {
          if (__DEV__) {
            console.warn("[offlineStore] Недостаточно места на диске");
          }
          return;
        }
        const state = get();
        if (Object.hasOwn(state.downloaded, courseType)) return;
        if (state.status.status === "downloading") {
          if (state.status.courseType === courseType) return;
          if (!state.downloadQueue.includes(courseType)) {
            set((s) => ({ downloadQueue: [...s.downloadQueue, courseType] }));
            persistQueue(scope, get());
          }
          return;
        }
        set((s) => ({
          downloadQueue: [courseType, ...s.downloadQueue.filter((c) => c !== courseType)],
        }));
        persistQueue(scope, get());
        await processQueue(set, get, scope);
      },

      cancelDownload: () => {
        if (downloadAbortController) {
          downloadAbortController.abort();
        }
      },

      removeFromQueue: (courseType: string) => {
        const scope = captureOfflineCourseScope();
        if (!scope?.isCurrent()) return;
        set((s) => ({
          downloadQueue: s.downloadQueue.filter((c) => c !== courseType),
        }));
        persistQueue(scope, get());
      },

      removeDownload: async (courseType: string) => {
        const scope = captureOfflineCourseScope();
        if (!scope?.isCurrent()) return;
        await hydration;
        if (!scope.isCurrent()) return;
        const state = get();
        // A directory without an indexed download may be someone's legacy
        // data; deleting it without an approved ownership migration is unsafe.
        if (!Object.hasOwn(state.downloaded, courseType)) return;
        // Do not race an active native media writer or its cancellation cleanup.
        if (state.status.status === "downloading" && state.status.courseType === courseType) return;
        await deleteCourseData(courseType, scope);
        if (!scope.isCurrent()) return;
        set((s) => {
          const next = { ...s.downloaded };
          delete next[courseType];
          return { downloaded: next };
        });
      },
    }));

/** No global persisted index: it previously exposed the previous account's
 * downloads and queue. Rebuild from committed metadata under the captured owner.
 * Ownerless v1 storage and native files are preserved, never reassigned. */
function refreshOfflineOwner() {
  const scope = captureOfflineCourseScope();
  if (activeScope?.isCurrent() && scope?.principalId === activeScope.principalId) return;
  activeScope = scope;
  downloadAbortController?.abort();
  downloadAbortController = null;
  useOfflineStore.setState(initialState);
  hydration = (async () => {
    if (!scope) return;
    await queueWrites;
    const raw = await zustandStorage.getItem(queueKey(scope));
    let queue: string[] = [];
    if (raw) {
      try {
        const saved = JSON.parse(raw) as { ownerId?: string; queue?: unknown };
        if (saved.ownerId === scope.principalId) queue = validQueue(saved.queue);
      } catch { /* Invalid local queue stays quarantined. */ }
    }
    const courses = await getOfflineCourseTypes(scope);
    const downloaded: Record<string, DownloadedCourse> = Object.create(null);
    for (const courseType of courses) {
      if (!scope.isCurrent()) return;
      const meta = await getCourseMeta(courseType, scope);
      if (meta) downloaded[courseType] = { version: meta.version };
    }
    if (scope.isCurrent()) useOfflineStore.setState({
      downloaded, downloadQueue: queue.filter(courseType => !Object.hasOwn(downloaded, courseType)),
    });
  })().catch(error => {
    if (scope?.isCurrent()) reportClientError(error, { issueKey: "OfflineCourseIndexHydration" });
  });
}

subscribeOfflineCourseSession(refreshOfflineOwner);
refreshOfflineOwner();
