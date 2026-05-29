import type {
  SurveyAnswerValue,
  SurveyComparisonDto,
  SurveyResponseDto,
  SurveyTemplate,
} from "@gafus/types";

import { apiClient, type ApiResponse } from "./client";

export interface SurveyLoadResponse {
  template: SurveyTemplate;
  response: SurveyResponseDto | null;
}

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
  ): Promise<ApiResponse<SurveyComparisonDto | null>> => {
    const params = new URLSearchParams({ courseId, familySlug });
    return apiClient<SurveyComparisonDto | null>(`/api/v1/surveys/comparison?${params}`);
  },
};
