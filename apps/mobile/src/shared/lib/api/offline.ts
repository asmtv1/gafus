import { apiClient, type ApiResponse } from "./client";

/**
 * Ответ API download — совпадает с FullCourseData из core
 */
export interface FullCourseData {
  course: {
    id: string;
    type: string;
    name: string;
    description: string;
    shortDesc: string;
    duration: string;
    logoImg: string;
    isPrivate: boolean;
    isPaid: boolean;
    avgRating: number | null;
    trainingLevel: string;
    createdAt: string;
    updatedAt: string;
    authorUsername: string;
    videoUrl: string | null;
    equipment: string | null;
  };
  trainingDays: {
    id: string;
    order: number;
    title: string;
    description: string;
    equipment: string;
    type: string;
    showCoursePathExport?: boolean;
    steps: {
      id: string;
      order: number;
      title: string;
      description: string;
      type: string;
      durationSec: number | null;
      estimatedDurationSec: number | null;
      videoUrl: string | null;
      imageUrls: string[];
      pdfUrls: string[];
      checklist: unknown;
      requiresVideoReport: boolean;
      requiresWrittenFeedback: boolean;
      hasTestQuestions: boolean;
    }[];
  }[];
  mediaFiles: {
    videos: string[];
    images: string[];
    pdfs: string[];
  };
}

export interface VersionResponse {
  version: string;
}

export interface UpdatesResponse {
  hasUpdates: boolean;
  serverVersion: string;
}

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
    ),
};
