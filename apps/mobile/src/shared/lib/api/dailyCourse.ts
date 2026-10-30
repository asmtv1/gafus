import { apiClient, type ApiResponse } from "./client";
import type { UserStep } from "./training";
import type {
  DailyCourseDayWire,
  DailyCourseDayStepWire,
  TodayDailyCourseWire,
} from "../../../../../../packages/types/src/data/training";

/** Existing Mobile export for the canonical read-only `/today` JSON response. */
export type TodayDailyCourseResponse = TodayDailyCourseWire;

/** Mobile retains its existing nested UserStep/offline-compatible shape.
 * Only matching GET /daily-course/day wire fields become canonical aliases.
 */
export interface DailyCourseDayResponse extends Pick<DailyCourseDayWire,
  "scheduleId" | "mskDate" | "trainingDayId" | "title" | "description" | "type"
> {
  // Keep Mobile's narrower legacy status view rather than widening to PAUSED.
  userStatus: Extract<`${DailyCourseDayWire["userStatus"]}`,
    "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "RESET"
  >;
  steps: (UserStep & Pick<DailyCourseDayStepWire,
    "id" | "stepId" | "stepIndex" | "remainingSec" | "completedAt"
  >)[];
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
};

export function getDailyCourseStoreCourseId(scheduleId: string): string {
  return `daily-course:${scheduleId}`;
}
