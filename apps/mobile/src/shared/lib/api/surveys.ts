import type {
  SurveyAnswerValue,
  SurveyBySlugRead,
  SurveyComparisonRead,
  SurveyResponseDto,
} from "@gafus/types";

import { apiClient, type ApiResponse } from "./client";

export type SurveyLoadResponse = SurveyBySlugRead["data"];

export interface SubmitSurveyPayload {
  courseId: string;
  stepId: string;
  userStepId: string;
  petId?: string | null;
  answers: Record<string, SurveyAnswerValue>;
}

export interface SubmitSurveyResponse {
  success: boolean;
  response?: SurveyResponseDto;
  error?: string;
  code?: string;
}

export const surveyApi = {
  getSurvey: (
    slug: string,
    stepId: string,
  ): Promise<ApiResponse<SurveyLoadResponse>> => {
    const params = new URLSearchParams({ stepId });
    return apiClient<SurveyLoadResponse>(`/api/v1/surveys/${encodeURIComponent(slug)}?${params}`);
  },

  submit: (
    slug: string,
    payload: SubmitSurveyPayload,
  ): Promise<ApiResponse<SubmitSurveyResponse>> =>
    apiClient<SubmitSurveyResponse>(`/api/v1/surveys/${encodeURIComponent(slug)}/response`, {
      method: "POST",
      body: payload,
    }),

  getComparison: (
    courseId: string,
    familySlug: string,
  ): Promise<ApiResponse<SurveyComparisonRead["data"]>> => {
    const params = new URLSearchParams({ courseId, familySlug });
    return apiClient<SurveyComparisonRead["data"]>(`/api/v1/surveys/comparison?${params}`);
  },
};
