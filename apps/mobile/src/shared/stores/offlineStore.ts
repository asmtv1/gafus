/**
 * Store офлайн-курсов: очередь скачивания, список скачанных, прогресс.
 * Персист в AsyncStorage (очередь + список). Метаданные курсов — в FileSystem (meta.json).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";
import { reportClientError } from "@/shared/lib/tracer";
import { deleteCourseData } from "@/shared/lib/offline/offlineStorage";
import {
  downloadCourseForOffline,
  hasEnoughDiskSpace,
  type DownloadCourseProgress,
} from "@/shared/lib/offline/downloadCourseForOffline";

let downloadAbortController: AbortController | null = null;

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
): Promise<void> {
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

  const controller = new AbortController();
  downloadAbortController = controller;
  let result: Awaited<ReturnType<typeof downloadCourseForOffline>>;
  try {
    result = await downloadCourseForOffline(
      next,
      (progress) => {
        get().setDownloadProgress(progress);
      },
      controller.signal,
    );
  } catch (error) {
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
    return;
  } finally {
    if (downloadAbortController === controller) {
      downloadAbortController = null;
    }
  }

  if (result.success) {
    set((s) => ({
      downloaded: { ...s.downloaded, [next]: { version: result.version } },
      status: { status: "idle" },
    }));
  } else {
    set(() => ({ status: { status: "idle" } }));
  }
  processQueue(set, get);
}

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setDownloadProgress: (progress) => {
        const s = get().status;
        if (s.status === "downloading") {
          set({ status: { ...s, progress } });
        }
      },

      startDownload: async (courseType: string) => {
        const hasSpace = await hasEnoughDiskSpace();
        if (!hasSpace) {
          if (__DEV__) {
            console.warn("[offlineStore] Недостаточно места на диске");
          }
          return;
        }
        const state = get();
        if (state.downloaded[courseType]) return;
        if (state.status.status === "downloading") {
          if (state.status.courseType === courseType) return;
          if (!state.downloadQueue.includes(courseType)) {
            set((s) => ({ downloadQueue: [...s.downloadQueue, courseType] }));
          }
          return;
        }
        set((s) => ({
          downloadQueue: [courseType, ...s.downloadQueue.filter((c) => c !== courseType)],
        }));
        await processQueue(set, get);
      },

      cancelDownload: () => {
        if (downloadAbortController) {
          downloadAbortController.abort();
        }
      },

      removeFromQueue: (courseType: string) => {
        set((s) => ({
          downloadQueue: s.downloadQueue.filter((c) => c !== courseType),
        }));
      },

      removeDownload: async (courseType: string) => {
        const state = get();
        // A directory without an indexed download may be someone's legacy
        // data; deleting it without an approved ownership migration is unsafe.
        if (!state.downloaded[courseType]) return;
        // Do not race an active native media writer or its cancellation cleanup.
        if (state.status.status === "downloading" && state.status.courseType === courseType) return;
        await deleteCourseData(courseType);
        set((s) => {
          const next = { ...s.downloaded };
          delete next[courseType];
          return { downloaded: next };
        });
      },
    }),
    {
      name: "offline-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        downloadQueue: state.downloadQueue,
        downloaded: state.downloaded,
      }),
    },
  ),
);
