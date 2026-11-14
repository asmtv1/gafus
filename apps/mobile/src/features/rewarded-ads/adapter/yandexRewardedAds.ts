import Constants from "expo-constants";
import type { ApiResponse } from "@/shared/lib/api/client";
import type { RewardedAdSessionDto, RewardedGrantResultDto } from "../api/rewardedAdsApi";

// Expo Go has no Yandex Ads native bridge. The native module must only be
// evaluated after the user requests an ad (or warmup) in a supported binary.
export function warmUpYandexMobileAds(): Promise<void> {
  if (Constants.appOwnership === "expo") return Promise.resolve();
  return require("./yandexRewardedAdsNative").warmUpYandexMobileAds();
}

export async function showYandexRewardedAd(
  session: RewardedAdSessionDto,
): Promise<ApiResponse<RewardedGrantResultDto> | null> {
  if (Constants.appOwnership === "expo") {
    throw new Error("REWARDED_AD_UNAVAILABLE_IN_EXPO_GO");
  }
  return require("./yandexRewardedAdsNative").showYandexRewardedAd(session);
}
