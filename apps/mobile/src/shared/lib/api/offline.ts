import { apiClient, type ApiResponse } from "./client";

import type { FullCourseData, VersionResponse, UpdatesResponse } from "@gafus/types/offline-course";
export type { FullCourseData, VersionResponse, UpdatesResponse } from "@gafus/types/offline-course";

export const offlineApi = {
  getVersion: (courseType: string): Promise<ApiResponse<VersionResponse>> =>
    apiClient<VersionResponse>(`/api/v1/offline/course/version?courseType=${encodeURIComponent(courseType)}`),

  checkUpdates: (
    courseType: string,
    clientVersion: string,
  ): Promise<ApiResponse<UpdatesResponse>> => {
    const params = new URLSearchParams({
      courseType,
      clientVersion,
    });
    return apiClient<UpdatesResponse>(`/api/v1/offline/course/updates?${params}`);
  },

  downloadCourse: (courseType: string): Promise<ApiResponse<FullCourseData>> =>
    apiClient<FullCourseData>(
      `/api/v1/offline/course/download?courseType=${encodeURIComponent(courseType)}`,
      { headers: { "X-Gafus-Sync-Protocol": "2" } },
    ),
};
