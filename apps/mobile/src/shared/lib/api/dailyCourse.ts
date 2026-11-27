import { apiClient, type ApiResponse } from "./client";
import type { UserStep } from "./training";
import type {
  DailyCourseDayWire,
  DailyCourseDayStepWire,
  TodayDailyCourseWire,
} from "@gafus/types/training";

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
  > & { bundleStepId?: string })[];
}

export interface DailyCourseStepActionParams {
  scheduleId: string;
  stepIndex: number;
  expectedBundleStepId?: string;
  expectedStepId?: string;
  offlineProgressVersion?: string;
}

export interface DailyCourseStartStepParams extends DailyCourseStepActionParams {
  status: "IN_PROGRESS";
  durationSec: number;
}

export interface DailyCoursePauseStepParams extends DailyCourseStepActionParams {
  timeLeftSec: number;
}

function withoutOfflineProgressVersion<T extends { offlineProgressVersion?: string }>(params: T) {
  const { offlineProgressVersion: _version, ...body } = params;
  return body;
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
    return apiClient<DailyCourseDayResponse>(`/api/v1/daily-course/day?${params}`, { headers: { "X-Gafus-Sync-Protocol": "2" } });
  },

  startStep: async (params: DailyCourseStartStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/start", {
      method: "POST",
      body: withoutOfflineProgressVersion(params),
    });
  },

  pauseStep: async (params: DailyCoursePauseStepParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/pause", {
      method: "POST",
      body: withoutOfflineProgressVersion(params),
    });
  },

  resumeStep: async (params: DailyCourseStepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/resume", {
      method: "POST",
      body: withoutOfflineProgressVersion(params),
    });
  },

  resetStep: async (params: DailyCourseStepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/reset", {
      method: "POST",
      body: withoutOfflineProgressVersion(params),
    });
  },

  completeStep: async (params: DailyCourseStepActionParams): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/daily-course/step/complete", {
      method: "POST",
      body: withoutOfflineProgressVersion(params),
    });
  },
};

export function getDailyCourseStoreCourseId(scheduleId: string): string {
  return `daily-course:${scheduleId}`;
}
