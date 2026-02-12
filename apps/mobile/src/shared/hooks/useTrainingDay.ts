import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "@/shared/lib/api";
import { useProgressSyncStore, useStepStore } from "@/shared/stores";
import { getCourseMeta } from "@/shared/lib/offline/offlineStorage";
import { mapMetaToTrainingDayResponse } from "@/shared/lib/offline/mapOfflineMetaToTraining";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import type { ApiResponse } from "@/shared/lib/api/client";
import type { TrainingDayResponse } from "@/shared/lib/api/training";

/**
 * Хук для загрузки дня тренировки с шагами.
 * При ошибке сети отдаёт офлайн-данные из getCourseMeta, если курс скачан.
 */
export function useTrainingDay(courseType: string, dayOnCourseId: string) {
  const syncFromServer = useStepStore((s) => s.syncFromServer);
  const getStepState = useStepStore((s) => s.getStepState);

  return useQuery<ApiResponse<TrainingDayResponse>>({
    queryKey: ["trainingDay", courseType, dayOnCourseId],
    queryFn: async () => {
      try {
        const response = await trainingApi.getDay(courseType, dayOnCourseId);

        if (response.success && response.data) {
          // Синхронизируем состояния шагов с сервера
          const steps = response.data.steps.map((s: any, index: number) => ({
            stepIndex: index,
            status: s.status || "NOT_STARTED",
            remainingSec: s.remainingSec ?? s.remainingSecOnServer ?? null,
            durationSec: s.step?.durationSec ?? s.durationSec ?? undefined,
          }));
          syncFromServer(response.data.courseId ?? courseType, dayOnCourseId, steps);
        }

        return response;
      } catch (error) {
        const meta = await getCourseMeta(courseType);
        const dayData = meta
          ? mapMetaToTrainingDayResponse(meta, dayOnCourseId, getStepState)
          : null;
        if (dayData) {
          return { success: true, data: dayData };
        }
        if (__DEV__) {
          console.error("[useTrainingDay] Исключение при загрузке:", error);
        }
        throw error;
      }
    },
    enabled: !!courseType && !!dayOnCourseId,
  });
}

/**
 * Хук для старта шага. При офлайне ставит действие в очередь синхронизации.
 */
export function useStartStep() {
  const queryClient = useQueryClient();
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.startStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "startStep", params: variables });
        return { success: true };
      }
      return trainingApi.startStep(variables);
    },
    [isOffline, addToQueue],
  );

  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Инвалидируем кэш дня
      queryClient.invalidateQueries({
        queryKey: ["trainingDay"],
      });
    },
  });
}

/**
 * Хук для паузы шага. При офлайне ставит действие в очередь синхронизации.
 */
export function usePauseStep() {
  const queryClient = useQueryClient();
  const pauseStepLocal = useStepStore((s) => s.pauseStep);
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.pauseStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "pauseStep", params: variables });
        return { success: true };
      }
      return trainingApi.pauseStep(variables);
    },
    [isOffline, addToQueue],
  );

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      pauseStepLocal(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex,
        variables.timeLeftSec,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
    },
  });
}

/**
 * Хук для возобновления шага. При офлайне ставит действие в очередь синхронизации.
 */
export function useResumeStep() {
  const queryClient = useQueryClient();
  const resumeStepLocal = useStepStore((s) => s.resumeStep);
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.resumeStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "resumeStep", params: variables });
        return { success: true };
      }
      return trainingApi.resumeStep(variables);
    },
    [isOffline, addToQueue],
  );

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      resumeStepLocal(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
    },
  });
}

/**
 * Хук для сброса шага (таймера).
 * При офлайне ставит действие в очередь синхронизации.
 */
export function useResetStep() {
  const queryClient = useQueryClient();
  const resetStepLocal = useStepStore((s) => s.resetStep);
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.resetStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "resetStep", params: variables });
        return { success: true };
      }
      return trainingApi.resetStep(variables);
    },
    [isOffline, addToQueue],
  );

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      resetStepLocal(
        variables.courseId,
        variables.dayOnCourseId,
        variables.stepIndex,
        variables.durationSec ?? 0,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
    },
  });
}

/**
 * Хук для завершения теоретического шага. При офлайне ставит действие в очередь синхронизации.
 */
export function useCompleteTheoryStep() {
  const queryClient = useQueryClient();
  const completeStep = useStepStore((s) => s.completeStep);
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.completeTheoryStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "completeTheoryStep", params: variables });
        return { success: true };
      }
      return trainingApi.completeTheoryStep(variables);
    },
    [isOffline, addToQueue],
  );

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
    },
  });
}

/**
 * Хук для завершения практического шага. При офлайне ставит действие в очередь синхронизации.
 */
export function useCompletePracticeStep() {
  const queryClient = useQueryClient();
  const completeStep = useStepStore((s) => s.completeStep);
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.completePracticeStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "completePracticeStep", params: variables });
        return { success: true };
      }
      return trainingApi.completePracticeStep(variables);
    },
    [isOffline, addToQueue],
  );

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingDay"] });
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
    },
  });
}
