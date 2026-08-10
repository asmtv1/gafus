import { authOptions } from "@gafus/auth";
import {
  getRewardedAdsAdminDashboard,
  type RewardedAdsAdminDashboard,
  type RewardedAdsDashboardPeriodDays,
} from "@gafus/core/services/adminRewardedAds";
import { createAdminPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

const logger = createAdminPanelLogger("get-rewarded-ads-dashboard");

export type { RewardedAdsAdminDashboard, RewardedAdsDashboardPeriodDays };

export async function getAdminRewardedAdsDashboard(
  days: RewardedAdsDashboardPeriodDays,
): Promise<RewardedAdsAdminDashboard> {
  const session = (await getServerSession(authOptions)) as {
    user: { id: string; role: string };
  } | null;

  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");

  try {
    return await getRewardedAdsAdminDashboard({ days });
  } catch (error) {
    logger.error("Ошибка при получении dashboard rewarded-рекламы", error as Error);
    throw error;
  }
}
