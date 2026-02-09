/**
 * Store офлайн-курсов: очередь скачивания, список скачанных, прогресс.
 * Персист в AsyncStorage (очередь + список). Метаданные курсов — в FileSystem (meta.json).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";
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

  downloadAbortController = new AbortController();
  const result = await downloadCourseForOffline(
    next,
    (progress) => {
      get().setDownloadProgress(progress);
    },
    downloadAbortController.signal,
  );
  downloadAbortController = null;

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
