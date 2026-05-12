import { apiClient, type ApiResponse } from "./client";

export interface OnboardingTourStatusDto {
  hasSeenV1: boolean;
  completedAt: string | null;
}

export const onboardingTourApi = {
  getStatus: async (): Promise<ApiResponse<OnboardingTourStatusDto>> => {
    return apiClient<OnboardingTourStatusDto>("/api/v1/user/onboarding-tour");
  },

  complete: async (): Promise<ApiResponse<OnboardingTourStatusDto>> => {
    return apiClient<OnboardingTourStatusDto>("/api/v1/user/onboarding-tour/complete", {
      method: "POST",
      body: {},
    });
  },
};
