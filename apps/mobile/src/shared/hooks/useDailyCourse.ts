import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  dailyCourseApi,
  getDailyCourseStoreCourseId,
  type DailyCourseDayResponse,
  type TodayDailyCourseResponse,
} from "@/shared/lib/api";
import type { ApiResponse } from "@/shared/lib/api/client";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { useProgressSyncStore, useStepStore } from "@/shared/stores";

export function getMobileMoscowDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : now.toISOString().slice(0, 10);
}

export function useTodayDailyCourse() {
  const mskDate = getMobileMoscowDateKey();
  return useQuery<ApiResponse<TodayDailyCourseResponse>>({
    queryKey: ["dailyCourse", "today", mskDate],
    queryFn: () => dailyCourseApi.getToday(),
    staleTime: 60 * 1000,
  });
}

export function useDailyCourseDay(scheduleId: string) {
  const syncFromServer = useStepStore((s) => s.syncFromServer);
  return useQuery<ApiResponse<DailyCourseDayResponse>>({
    queryKey: ["dailyCourse", "day", scheduleId],
    queryFn: async () => {
      const response = await dailyCourseApi.getDay(scheduleId);
      if (response.success && response.data) {
        const courseId = getDailyCourseStoreCourseId(scheduleId);
        syncFromServer(
          courseId,
          scheduleId,
          response.data.steps.map((step, index) => ({
            stepIndex: index,
            status: step.isPausedOnServer ? "PAUSED" : step.status || "NOT_STARTED",
            remainingSec: step.remainingSecOnServer ?? step.remainingSec ?? null,
            durationSec: step.step?.durationSec ?? undefined,
          })),
        );
      }
      return response;
    },
    enabled: scheduleId.length > 0,
  });
}

export function useDailyCourseStartStep() {
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.startStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "dailyCourseStartStep", params: variables });
        return { success: true };
      }
      return dailyCourseApi.startStep(variables);
    },
    [addToQueue, isOffline],
  );
  return useMutation({ mutationFn });
}

export function useDailyCoursePauseStep() {
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.pauseStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "dailyCoursePauseStep", params: variables });
        return { success: true };
      }
      return dailyCourseApi.pauseStep(variables);
    },
    [addToQueue, isOffline],
  );
  return useMutation({ mutationFn });
}

export function useDailyCourseResumeStep() {
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.resumeStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "dailyCourseResumeStep", params: variables });
        return { success: true };
      }
      return dailyCourseApi.resumeStep(variables);
    },
    [addToQueue, isOffline],
  );
  return useMutation({ mutationFn });
}

export function useDailyCourseResetStep() {
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.resetStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "dailyCourseResetStep", params: variables });
        return { success: true };
      }
      return dailyCourseApi.resetStep(variables);
    },
    [addToQueue, isOffline],
  );
  return useMutation({ mutationFn });
}

export function useDailyCourseCompleteStep() {
  const queryClient = useQueryClient();
  const { isOffline } = useNetworkStatus();
  const addToQueue = useProgressSyncStore((s) => s.add);
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.completeStep>[0]) => {
      if (isOffline) {
        addToQueue({ type: "dailyCourseCompleteStep", params: variables });
        return { success: true };
      }
      return dailyCourseApi.completeStep(variables);
    },
    [addToQueue, isOffline],
  );
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dailyCourse", "day", variables.scheduleId] });
      queryClient.invalidateQueries({ queryKey: ["dailyCourse", "today"] });
    },
  });
}
