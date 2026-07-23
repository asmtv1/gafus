/**
 * Очередь мутаций прогресса для синхронизации при появлении сети.
 * Персист в AsyncStorage. При 401 подряд (3) — останавливаем и уведомляем.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { reportClientError } from "@/shared/lib/tracer";
import { dailyCourseApi, trainingApi } from "@/shared/lib/api";
import { zustandStorage } from "./storage";

const MAX_401_BEFORE_STOP = 3;

type QueuedActionPayload =
  | { type: "startStep"; params: Parameters<typeof trainingApi.startStep>[0] }
  | { type: "pauseStep"; params: Parameters<typeof trainingApi.pauseStep>[0] }
  | { type: "resumeStep"; params: Parameters<typeof trainingApi.resumeStep>[0] }
  | { type: "resetStep"; params: Parameters<typeof trainingApi.resetStep>[0] }
  | { type: "completeTheoryStep"; params: Parameters<typeof trainingApi.completeTheoryStep>[0] }
  | { type: "completePracticeStep"; params: Parameters<typeof trainingApi.completePracticeStep>[0] }
  | { type: "dailyCourseStartStep"; params: Parameters<typeof dailyCourseApi.startStep>[0] }
  | { type: "dailyCoursePauseStep"; params: Parameters<typeof dailyCourseApi.pauseStep>[0] }
  | { type: "dailyCourseResumeStep"; params: Parameters<typeof dailyCourseApi.resumeStep>[0] }
  | { type: "dailyCourseResetStep"; params: Parameters<typeof dailyCourseApi.resetStep>[0] }
  | { type: "dailyCourseCompleteStep"; params: Parameters<typeof dailyCourseApi.completeStep>[0] }
  | {
      type: "saveVideoProgress";
      params: { videoId: string; positionSec: number; updatedAt: number };
    };

export type QueuedAction = QueuedActionPayload & { queueId?: string };

interface ProgressSyncState {
  queue: QueuedAction[];
  consecutive401: number;
}

interface ProgressSyncActions {
  add: (action: QueuedAction) => void;
  processNext: () => Promise<"ok" | "done" | "retry" | "unauthorized">;
  reset401: () => void;
}

type ProgressSyncStore = ProgressSyncState & ProgressSyncActions;

export const useProgressSyncStore = create<ProgressSyncStore>()(
  persist(
    (set, get) => ({
      queue: [],
      consecutive401: 0,

      add: (action) => {
        const queuedAction = {
          ...action,
          queueId: action.queueId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        } as QueuedAction;
        set((s) => ({
          queue: [
            ...s.queue.filter(
              (queued) =>
                action.type !== "saveVideoProgress" ||
                queued.type !== "saveVideoProgress" ||
                queued.params.videoId !== action.params.videoId,
            ),
            queuedAction,
          ],
        }));
      },

      reset401: () => set({ consecutive401: 0 }),

      processNext: async () => {
        const { queue } = get();
        if (queue.length === 0) return "done";
        const [head] = queue;
        const removeHead = (stateQueue: QueuedAction[]): QueuedAction[] =>
          stateQueue.filter((queued) =>
            head.queueId ? queued.queueId !== head.queueId : queued !== head,
          );
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
            case "dailyCourseStartStep":
              result = await dailyCourseApi.startStep(head.params);
              break;
            case "dailyCoursePauseStep":
              result = await dailyCourseApi.pauseStep(head.params);
              break;
            case "dailyCourseResumeStep":
              result = await dailyCourseApi.resumeStep(head.params);
              break;
            case "dailyCourseResetStep":
              result = await dailyCourseApi.resetStep(head.params);
              break;
            case "dailyCourseCompleteStep":
              result = await dailyCourseApi.completeStep(head.params);
              break;
            case "saveVideoProgress":
              result = await trainingApi.saveVideoProgress(
                head.params.videoId,
                head.params.positionSec,
              );
              break;
          }
        } catch (error) {
          reportClientError(error, {
            issueKey: "ProgressSync",
            keys: { actionType: head.type },
          });
          return "retry";
        }
        const code = (result as { code?: string }).code;
        if (code === "SESSION_EXPIRED" || code === "UNAUTHORIZED") {
          const next401 = get().consecutive401 + 1;
          set((state) => ({
            queue: removeHead(state.queue),
            consecutive401: next401,
          }));
          if (next401 >= MAX_401_BEFORE_STOP) return "unauthorized";
          return "ok";
        }
        if (result.success) {
          set((state) => ({ queue: removeHead(state.queue), consecutive401: 0 }));
        } else {
          // Серверная/временная ошибка сохранения видео не должна терять офлайн-прогресс.
          // Терминальные access/validation ошибки удаляем, остальные ждут следующего reconnect.
          if (
            head.type === "saveVideoProgress" &&
            !["FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR", "BAD_REQUEST"].includes(code ?? "")
          ) {
            return "retry";
          }
          // 400, 404 и др. — retry бесполезен, удаляем чтобы не зациклиться
          set((state) => ({ queue: removeHead(state.queue) }));
          if (__DEV__) {
            console.warn(
              "[progressSyncStore] Action failed, removed from queue:",
              head.type,
              result,
            );
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
