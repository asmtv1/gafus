import { apiClient, apiClientMultipart, type ApiResponse } from "./client";

export interface ExamResultData {
  id: string;
  testAnswers: Record<string, number> | null;
  testScore: number | null;
  testMaxScore: number | null;
  videoReportUrl: string | null;
  writtenFeedback: string | null;
  overallScore: number | null;
  isPassed: boolean | null;
  trainerComment: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewedBy: { username: string; profile: { fullName: string | null } | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitExamParams {
  userStepId: string;
  stepId: string;
  testAnswers?: Record<string, number>;
  testScore?: number;
  testMaxScore?: number;
  videoReportUrl?: string | null;
  writtenFeedback?: string;
  overallScore?: number;
  isPassed?: boolean;
}

export const examApi = {
  getResult: async (userStepId: string): Promise<ApiResponse<ExamResultData>> => {
    return apiClient<ExamResultData>(`/api/v1/exam/result?userStepId=${userStepId}`);
  },

  submit: async (params: SubmitExamParams): Promise<ApiResponse<{ id: string }>> => {
    return apiClient<{ id: string }>("/api/v1/exam/submit", {
      method: "POST",
      body: params,
    });
  },

  /** Multipart: поля video + userStepId (как веб uploadExamVideo). */
  uploadVideo: async (
    userStepId: string,
    file: { uri: string; name: string; type: string },
  ): Promise<ApiResponse<{ videoUrl: string }>> => {
    return apiClientMultipart<{ videoUrl: string }>("/api/v1/exam/upload-video", () => {
      const formData = new FormData();
      formData.append("userStepId", userStepId);
      formData.append("video", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as unknown as Blob);
      return formData;
    });
  },
};
