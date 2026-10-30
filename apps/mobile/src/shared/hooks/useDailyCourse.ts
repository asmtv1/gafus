import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  dailyCourseApi,
  getDailyCourseStoreCourseId,
  type DailyCourseDayResponse,
  type TodayDailyCourseResponse,
} from "@/shared/lib/api";
import type { ApiResponse } from "@/shared/lib/api/client";
import { useStepStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { commitVerifiedDailyCompletion } from "@/shared/lib/offline/newOnlyV2DailyCompleteReceipt";
import { useAuthStore } from "@/shared/stores/authStore";
import { getIsOffline } from "@/shared/stores/networkStatusStore";

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
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.startStep>[0]) => {
      if (getIsOffline()) {
        if (
          typeof variables.scheduleId !== "string" ||
          !/^c[a-z0-9]{8,}$/.test(variables.scheduleId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_DAILY_INVALID_PAYLOAD");
        const payload = Object.fromEntries(
          Object.entries(variables).filter(([, v]) => v !== undefined),
        );
        if (
          variables.status !== "IN_PROGRESS" ||
          !Number.isSafeInteger(variables.durationSec) ||
          variables.durationSec < 0
        )
          throw new Error("OFFLINE_DAILY_INVALID_TIME");
        await newOnlyV2NativeQueues.enqueue("progress", "dailyCourseStartStep", payload);
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return dailyCourseApi.startStep(variables);
    },
    [],
  );
  return useMutation({ mutationFn });
}

export function useDailyCoursePauseStep() {
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.pauseStep>[0]) => {
      if (getIsOffline()) {
        if (
          typeof variables.scheduleId !== "string" ||
          !/^c[a-z0-9]{8,}$/.test(variables.scheduleId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_DAILY_INVALID_PAYLOAD");
        const payload = Object.fromEntries(
          Object.entries(variables).filter(([, v]) => v !== undefined),
        );
        if (!Number.isSafeInteger(variables.timeLeftSec) || variables.timeLeftSec < 0)
          throw new Error("OFFLINE_DAILY_INVALID_TIME");
        await newOnlyV2NativeQueues.enqueue("progress", "dailyCoursePauseStep", payload);
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return dailyCourseApi.pauseStep(variables);
    },
    [],
  );
  return useMutation({ mutationFn });
}

export function useDailyCourseResumeStep() {
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.resumeStep>[0]) => {
      if (getIsOffline()) {
        if (
          typeof variables.scheduleId !== "string" ||
          !/^c[a-z0-9]{8,}$/.test(variables.scheduleId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_DAILY_INVALID_PAYLOAD");
        const payload = Object.fromEntries(
          Object.entries(variables).filter(([, v]) => v !== undefined),
        );
        await newOnlyV2NativeQueues.enqueue("progress", "dailyCourseResumeStep", payload);
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return dailyCourseApi.resumeStep(variables);
    },
    [],
  );
  return useMutation({ mutationFn });
}

export function useDailyCourseResetStep() {
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.resetStep>[0]) => {
      if (getIsOffline()) {
        if (
          typeof variables.scheduleId !== "string" ||
          !/^c[a-z0-9]{8,}$/.test(variables.scheduleId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_DAILY_INVALID_PAYLOAD");
        const payload = Object.fromEntries(
          Object.entries(variables).filter(([, v]) => v !== undefined),
        );
        await newOnlyV2NativeQueues.enqueue("progress", "dailyCourseResetStep", payload);
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return dailyCourseApi.resetStep(variables);
    },
    [],
  );
  return useMutation({ mutationFn });
}

export function useDailyCourseCompleteStep() {
  const mutationFn = useCallback(
    async (variables: Parameters<typeof dailyCourseApi.completeStep>[0]) => {
      if (getIsOffline()) {
        if (
          typeof variables.scheduleId !== "string" ||
          !/^c[a-z0-9]{8,}$/.test(variables.scheduleId) ||
          !Number.isSafeInteger(variables.stepIndex) ||
          variables.stepIndex < 0
        )
          throw new Error("OFFLINE_DAILY_INVALID_PAYLOAD");
        await commitVerifiedDailyCompletion(
          newOnlyV2NativeQueues,
          useAuthStore.getState().user?.id ?? null,
          { scheduleId: variables.scheduleId, stepIndex: variables.stepIndex },
          () => useAuthStore.getState().user?.id ?? null,
        );
        return { success: true, code: "OFFLINE_QUEUED" as const };
      }
      return dailyCourseApi.completeStep(variables);
    },
    [],
  );
  // The mounted consumer invalidates only after owner/epoch/occurrence-attested result.
  return useMutation({ mutationFn });
}
