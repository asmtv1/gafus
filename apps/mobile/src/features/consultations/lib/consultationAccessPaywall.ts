import { getRewardedAccessSummary, openAppSubscriptionPaywall } from "@/features/app-subscription";
import { rewardedAdsApi } from "@/features/rewarded-ads";

type OpenConsultationAccessPaywallParams = {
  targetId: string;
  onRewardedGrant: () => Promise<void> | void;
};

export async function openConsultationAccessPaywall({
  targetId,
  onRewardedGrant,
}: OpenConsultationAccessPaywallParams): Promise<void> {
  const rewardedTarget = {
    targetType: "CONSULTATION_BOOKING" as const,
    targetId,
  };
  const statusResponse = await rewardedAdsApi.getStatus(rewardedTarget);
  const accessSummary =
    statusResponse.success && statusResponse.data
      ? getRewardedAccessSummary(statusResponse.data)
      : null;

  openAppSubscriptionPaywall({
    reason: "required",
    rewardedTarget,
    accessSummary,
    onRewardedGrant,
  });
}
