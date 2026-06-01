import { apiClient, type ApiResponse } from "./client";
import type { UserStep } from "./training";

export interface TodayDailyCourseResponse {
  mskDate: string;
  scheduleId: string | null;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "RESET";
  day: {
    id: string;
    title: string;
    description: string;
    type: string;
    estimatedDuration: number;
    theoryMinutes: number;
    stepsCount: number;
  } | null;
  stepsSummary: {
    total: number;
    completed: number;
  };
}

export interface DailyCourseDayResponse {
  scheduleId: string;
  mskDate: string;
  trainingDayId: string;
  title: string;
  description: string;
  type: string;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "RESET";
  steps: UserStep[];
}

export interface DailyCourseStepActionParams {
  scheduleId: string;
  stepIndex: number;
}

export interface DailyCourseStartStepParams extends DailyCourseStepActionParams {
  status: "IN_PROGRESS";
  durationSec: number;
}

export interface DailyCoursePauseStepParams extends DailyCourseStepActionParams {
  timeLeftSec: number;
}

export const dailyCourseApi = {
  getToday: async (): Promise<ApiResponse<TodayDailyCourseResponse>> => {
    return apiClient<TodayDailyCourseResponse>("/api/v1/daily-course/today");
  },

  getDay: async (
    scheduleId: string,
    createIfMissing = true,
  ): Promise<ApiResponse<DailyCourseDayResponse>> => {
    const params = new URLSearchParams({
      scheduleId,
      createIfMissing: String(createIfMissing),
    });
    return apiClient<DailyCourseDayResponse>(`/api/v1/daily-course/day?${params}`);
  },

  startStep: async (params: DailyCourseStartStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/start", {
      method: "POST",
      body: params,
    });
  },

  pauseStep: async (params: DailyCoursePauseStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/pause", {
      method: "POST",
      body: params,
    });
  },

  resumeStep: async (params: DailyCourseStepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/resume", {
      method: "POST",
      body: params,
    });
  },

  resetStep: async (params: DailyCourseStepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/reset", {
      method: "POST",
      body: params,
    });
  },

  completeStep: async (params: DailyCourseStepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/complete", {
      method: "POST",
      body: params,
    });
  },

  unlockStep: async (
    params: DailyCourseStepActionParams,
  ): Promise<
    ApiResponse<{
      targetType: "DAILY_COURSE_STEP";
      targetId: string;
      unlocked: true;
      spentCredits: number;
      balance: number;
      pendingRefundCredits: number;
    }>
  > => {
    return apiClient("/api/v1/daily-course/step/unlock", {
      method: "POST",
      body: params,
    });
  },
};

export function getDailyCourseStoreCourseId(scheduleId: string): string {
  return `daily-course:${scheduleId}`;
}
