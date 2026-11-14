/** Infra composition owns the two database-backed analytics adapters. */
import { getReengagementMetrics } from "@gafus/admin-reengagement-server";
import { getRewardedAdsAdminDashboard } from "@gafus/admin-rewarded-ads-server";
import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
import { createAdminAnalyticsQueries } from "../application/read-admin-analytics.js";

export const adminAnalyticsQueries = createAdminAnalyticsQueries({
  reengagement: () =>
    withCorrelatedUseCase("admin.analytics.reengagement.read", getReengagementMetrics),
  rewarded: (input) =>
    withCorrelatedUseCase("admin.analytics.rewarded.read", () =>
      getRewardedAdsAdminDashboard(input),
    ),
});
