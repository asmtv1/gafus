/**
 * Очередь мутаций прогресса для синхронизации при появлении сети.
 * Персист в AsyncStorage. При 401 подряд (3) — останавливаем и уведомляем.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";
import { trainingApi } from "@/shared/lib/api";

const MAX_401_BEFORE_STOP = 3;

export type QueuedAction =
  | { type: "startStep"; params: Parameters<typeof trainingApi.startStep>[0] }
  | { type: "pauseStep"; params: Parameters<typeof trainingApi.pauseStep>[0] }
  | { type: "resumeStep"; params: Parameters<typeof trainingApi.resumeStep>[0] }
  | { type: "resetStep"; params: Parameters<typeof trainingApi.resetStep>[0] }
  | { type: "completeTheoryStep"; params: Parameters<typeof trainingApi.completeTheoryStep>[0] }
  | { type: "completePracticeStep"; params: Parameters<typeof trainingApi.completePracticeStep>[0] };

interface ProgressSyncState {
  queue: QueuedAction[];
  consecutive401: number;
}

interface ProgressSyncActions {
  add: (action: QueuedAction) => void;
  processNext: () => Promise<"ok" | "done" | "unauthorized">;
  reset401: () => void;
}

type ProgressSyncStore = ProgressSyncState & ProgressSyncActions;

export const useProgressSyncStore = create<ProgressSyncStore>()(
  persist(
    (set, get) => ({
      queue: [],
      consecutive401: 0,

      add: (action) => {
        set((s) => ({ queue: [...s.queue, action] }));
      },

      reset401: () => set({ consecutive401: 0 }),

      processNext: async () => {
        const { queue } = get();
        if (queue.length === 0) return "done";
        const [head, ...rest] = queue;
        let result: { success: boolean; code?: string } = { success: false };
        try {
          switch (head.type) {
            case "startStep":
              result = await trainingApi.startStep(head.params);
              break;
            case "pauseStep":
              result = await trainingApi.pauseStep(head.params);
              break;
            case "resumeStep":
              result = await trainingApi.resumeStep(head.params);
              break;
            case "resetStep":
              result = await trainingApi.resetStep(head.params);
              break;
            case "completeTheoryStep":
              result = await trainingApi.completeTheoryStep(head.params);
              break;
            case "completePracticeStep":
              result = await trainingApi.completePracticeStep(head.params);
              break;
          }
        } catch {
          return "ok";
        }
        const code = (result as { code?: string }).code;
        if (code === "SESSION_EXPIRED" || code === "UNAUTHORIZED") {
          const next401 = get().consecutive401 + 1;
          set({ queue: rest, consecutive401: next401 });
          if (next401 >= MAX_401_BEFORE_STOP) return "unauthorized";
          return "ok";
        }
        if (result.success) {
          set({ queue: rest, consecutive401: 0 });
        } else {
          // 400, 404 и др. — retry бесполезен, удаляем чтобы не зациклиться
          set({ queue: rest });
          if (__DEV__) {
            console.warn("[progressSyncStore] Action failed, removed from queue:", head.type, result);
          }
        }
        return "ok";
      },
    }),
    {
      name: "progress-sync-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({ queue: s.queue }),
    },
  ),
);
