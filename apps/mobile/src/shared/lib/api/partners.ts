import { apiClient, type ApiResponse } from "./client";

export type PartnerDashboard = {
  referralCode: string;
  referrals: number;
  earnedKopecks: number;
  reservedKopecks: number;
  availableKopecks: number;
  active: boolean;
};

export const partnersApi = {
  getDashboard(): Promise<ApiResponse<PartnerDashboard>> {
    return apiClient<PartnerDashboard>("/api/v1/partners/me");
  },
  requestPayout(
    amountKopecks: number,
  ): Promise<ApiResponse<{ id: string; status: string; amountKopecks: number }>> {
    return apiClient("/api/v1/partners/payouts", {
      method: "POST",
      body: { amountKopecks },
    });
  },
};
