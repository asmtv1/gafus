import { reportClientError } from "@/shared/lib/tracer";
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "@/shared/lib/api";
import { useStepStore } from "@/shared/stores";
import { getIsOffline } from "@/shared/stores/networkStatusStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { commitVerifiedPractice } from "@/shared/lib/offline/newOnlyV2PracticeCommit";
import { useAuthStore } from "@/shared/stores/authStore";
import { getCourseMeta } from "@/shared/lib/offline/offlineStorage";
import { mapMetaToTrainingDayResponse } from "@/shared/lib/offline/mapOfflineMetaToTraining";
import type { ApiResponse } from "@/shared/lib/api/client";
import type { TrainingDayResponse, UserStep } from "@/shared/lib/api/training";

/**
 * Хук для загрузки дня тренировки с шагами.
 * При ошибке сети отдаёт офлайн-данные из getCourseMeta, если курс скачан.
 */
export function useTrainingDay(courseType: string, dayOnCourseId: string) {
  const syncFromServer = useStepStore((s) => s.syncFromServer);
  const getStepState = useStepStore((s) => s.getStepState);
  const isNetworkErrorResponse = (response: ApiResponse<TrainingDayResponse>): boolean => {
    return response.code === "NETWORK_ERROR" || response.error === "Нет подключения к интернету";
  };

  return useQuery<ApiResponse<TrainingDayResponse>>({
    queryKey: ["trainingDay", courseType, dayOnCourseId],
    queryFn: async () => {
      try {
        const response = await trainingApi.getDay(courseType, dayOnCourseId);

        if (response.success && response.data) {
          // Синхронизируем состояния шагов с сервера
          const steps = response.data.steps.map((s: UserStep, index: number) => ({
            stepIndex: index,
            status: s.status || "NOT_STARTED",
            remainingSec: s.remainingSec ?? s.remainingSecOnServer ?? null,
            durationSec: s.step?.durationSec ?? undefined,
          }));
          syncFromServer(response.data.courseId ?? courseType, dayOnCourseId, steps);
          return response;
        }

        if (isNetworkErrorResponse(response)) {
          const meta = await getCourseMeta(courseType);
          const dayData = meta
            ? mapMetaToTrainingDayResponse(meta, dayOnCourseId, getStepState)
            : null;
          if (dayData) {
            return { success: true, data: dayData };
          }
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
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "load", dayOnCourseId, courseType },
        });
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
  const mutationFn = useCallback(async (variables: Parameters<typeof trainingApi.startStep>[0]) => {
    if (getIsOffline()) {
      if (
        !/^c[a-z0-9]{8,}$/.test(variables.courseId) ||
        !/^c[a-z0-9]{8,}$/.test(variables.dayOnCourseId) ||
        !Number.isSafeInteger(variables.stepIndex) ||
        variables.stepIndex < 0 ||
        !Number.isFinite(variables.durationSec) ||
        variables.durationSec < 0 ||
        variables.status !== "IN_PROGRESS"
      )
        throw new Error("OFFLINE_START_UNSUPPORTED_PAYLOAD");
      await newOnlyV2NativeQueues.enqueue("progress", "startStep", {
        courseId: variables.courseId,
        dayOnCourseId: variables.dayOnCourseId,
        stepIndex: variables.stepIndex,
        status: variables.status,
        durationSec: variables.durationSec,
      });
      return { success: true, code: "OFFLINE_QUEUED" as const };
    }
    return trainingApi.startStep(variables);
  }, []);
  return useMutation({ mutationFn });
}

/**
 * Хук для паузы шага. При офлайне ставит действие в очередь синхронизации.
 */
export function usePauseStep() {
  const pauseStepLocal = useStepStore((s) => s.pauseStep);
  const mutationFn = useCallback(async (variables: Parameters<typeof trainingApi.pauseStep>[0]) => {
    if (getIsOffline()) {
      if (
        !/^c[a-z0-9]{8,}$/.test(variables.courseId) ||
        !/^c[a-z0-9]{8,}$/.test(variables.dayOnCourseId) ||
        !Number.isSafeInteger(variables.stepIndex) ||
        variables.stepIndex < 0 ||
        !Number.isSafeInteger(variables.timeLeftSec) ||
        variables.timeLeftSec < 0
      )
        throw new Error("OFFLINE_PAUSE_UNSUPPORTED_PAYLOAD");
      await newOnlyV2NativeQueues.enqueue("progress", "pauseStep", {
        courseId: variables.courseId,
        dayOnCourseId: variables.dayOnCourseId,
        stepIndex: variables.stepIndex,
        timeLeftSec: variables.timeLeftSec,
      });
      return { success: true, code: "OFFLINE_QUEUED" as const };
    }
    return trainingApi.pauseStep(variables);
  }, []);
  return useMutation({
    mutationFn,
    onSuccess: (result, variables) => {
      if (result.success)
        pauseStepLocal(
          variables.courseId,
          variables.dayOnCourseId,
          variables.stepIndex,
          variables.timeLeftSec,
        );
    },
  });
}

/**
 * Хук для возобновления шага. При офлайне ставит действие в очередь синхронизации.
 */
export function useResumeStep() {
  const resumeStepLocal = useStepStore((s) => s.resumeStep);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.resumeStep>[0]) => {
      if (getIsOffline()) {
        if (
          !/^c[a-z0-9]{8,}$/.test(variables.courseId) ||
          !/^c[a-z0-9]{8,}$/.test(variables.dayOnCourseId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_RESUME_UNSUPPORTED_PAYLOAD");
        await newOnlyV2NativeQueues.enqueue("progress", "resumeStep", {
          courseId: variables.courseId,
          dayOnCourseId: variables.dayOnCourseId,
          stepIndex: variables.stepIndex,
        });
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return trainingApi.resumeStep(variables);
    },
    [],
  );
  return useMutation({
    mutationFn,
    onSuccess: (response, variables) => {
      if (response.success)
        resumeStepLocal(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
    },
  });
}

/**
 * Хук для сброса шага (таймера).
 * При офлайне ставит действие в очередь синхронизации.
 */
export function useResetStep() {
  const resetStepLocal = useStepStore((s) => s.resetStep);
  const mutationFn = useCallback(async (variables: Parameters<typeof trainingApi.resetStep>[0]) => {
    if (getIsOffline()) {
      if (
        !/^c[a-z0-9]{8,}$/.test(variables.courseId) ||
        !/^c[a-z0-9]{8,}$/.test(variables.dayOnCourseId) ||
        !Number.isSafeInteger(variables.stepIndex) ||
        variables.stepIndex < 0 ||
        (variables.durationSec !== undefined &&
          (!Number.isSafeInteger(variables.durationSec) || variables.durationSec < 0))
      )
        throw new Error("OFFLINE_RESET_UNSUPPORTED_PAYLOAD");
      await newOnlyV2NativeQueues.enqueue("progress", "resetStep", {
        courseId: variables.courseId,
        dayOnCourseId: variables.dayOnCourseId,
        stepIndex: variables.stepIndex,
        ...(variables.durationSec === undefined ? {} : { durationSec: variables.durationSec }),
      });
      return { success: true, code: "OFFLINE_QUEUED" as const };
    }
    return trainingApi.resetStep(variables);
  }, []);
  return useMutation({
    mutationFn,
    onSuccess: (response, variables) => {
      if (response.success)
        resetStepLocal(
          variables.courseId,
          variables.dayOnCourseId,
          variables.stepIndex,
          variables.durationSec ?? 0,
        );
    },
  });
}

/**
 * Хук для завершения теоретического шага. При офлайне ставит действие в очередь синхронизации.
 */
export function useCompleteTheoryStep() {
  const queryClient = useQueryClient();
  const completeStep = useStepStore((s) => s.completeStep);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.completeTheoryStep>[0]) => {
      if (getIsOffline()) {
        if (
          !/^c[a-z0-9]{8,}$/.test(variables.courseId) ||
          !/^c[a-z0-9]{8,}$/.test(variables.dayOnCourseId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_THEORY_UNSUPPORTED_PAYLOAD");
        await newOnlyV2NativeQueues.enqueue("progress", "completeTheoryStep", {
          courseId: variables.courseId,
          dayOnCourseId: variables.dayOnCourseId,
          stepIndex: variables.stepIndex,
        });
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return trainingApi.completeTheoryStep(variables);
    },
    [],
  );
  return useMutation({
    mutationFn,
    onSuccess: (response, variables) => {
      if (!response.success) return;
      completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
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
  const mutationFn = useCallback(
    async (variables: Parameters<typeof trainingApi.completePracticeStep>[0]) => {
      if (getIsOffline()) {
        // Only the new owner-scoped v2 queue can accept fresh offline writes.
        // Match the exact practice-only journal DTO; no legacy queueId or UI fields.
        if (
          !/^c[a-z0-9]{8,}$/.test(variables.courseId) ||
          !/^c[a-z0-9]{8,}$/.test(variables.dayOnCourseId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        ) {
          throw new Error("OFFLINE_PRACTICE_UNSUPPORTED_PAYLOAD");
        }
        await commitVerifiedPractice(
          newOnlyV2NativeQueues,
          useAuthStore.getState().user?.id ?? null,
          {
            courseId: variables.courseId,
            dayOnCourseId: variables.dayOnCourseId,
            stepIndex: variables.stepIndex,
          },
          () => useAuthStore.getState().user?.id ?? null,
        );
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return trainingApi.completePracticeStep(variables);
    },
    [],
  );

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      // Offline UI succeeds only after the awaited new-only v2 durable write.
      if (!getIsOffline()) {
        completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
      }
    },
    onSuccess: (response, variables) => {
      if (response.success && response.code === "OFFLINE_QUEUED") {
        completeStep(variables.courseId, variables.dayOnCourseId, variables.stepIndex);
      }
      queryClient.invalidateQueries({ queryKey: ["trainingDays"] });
    },
  });
}
