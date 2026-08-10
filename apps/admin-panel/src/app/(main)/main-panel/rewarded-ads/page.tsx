import type { Metadata } from "next";

import RewardedAdsMonitor from "@/features/rewarded-ads/components/RewardedAdsMonitor";
import {
  getAdminRewardedAdsDashboard,
  type RewardedAdsDashboardPeriodDays,
} from "@/features/rewarded-ads/lib/getRewardedAdsDashboard";
import PageLayout from "@/shared/components/PageLayout";

export const metadata: Metadata = {
  title: "Мониторинг рекламы | Админ панель",
  description: "Воронка rewarded-рекламы, просмотры, скипы и оценка выручки",
};

const AVAILABLE_PERIODS = new Set([7, 30, 90]);

function parsePeriod(value: string | string[] | undefined): RewardedAdsDashboardPeriodDays {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return AVAILABLE_PERIODS.has(parsed) ? (parsed as RewardedAdsDashboardPeriodDays) : 30;
}

export default async function RewardedAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const { period } = await searchParams;
  const dashboard = await getAdminRewardedAdsDashboard(parsePeriod(period));

  return (
    <PageLayout
      title="Мониторинг рекламы"
      subtitle="Просмотры, скипы, выдача доступа и эффективность рекламы по материалам"
    >
      <RewardedAdsMonitor dashboard={dashboard} />
    </PageLayout>
  );
}
