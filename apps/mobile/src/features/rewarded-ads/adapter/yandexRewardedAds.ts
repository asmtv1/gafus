import {
  rewardedAdsApi,
  type RewardedAdSessionDto,
  type RewardedGrantResultDto,
} from "../api/rewardedAdsApi";
import type { ApiResponse } from "@/shared/lib/api/client";

let initialized = false;

async function initializeMobileAds() {
  if (initialized) return;
  const { MobileAds } = await import("yandex-mobile-ads");
  await MobileAds.initialize();
  initialized = true;
}

export async function showYandexRewardedAd(
  session: RewardedAdSessionDto,
): Promise<ApiResponse<RewardedGrantResultDto> | null> {
  await initializeMobileAds();
  const { RewardedAdLoader } = await import("yandex-mobile-ads");
  const loader = await RewardedAdLoader.create();
  const ad = await loader.loadAd({ adUnitId: session.placementId });
  let granted = false;
  let finished = false;
  let resolveGrant: (result: ApiResponse<RewardedGrantResultDto> | null) => void;
  let rejectGrant: (error: Error) => void;
  let shownRecordPromise: Promise<ApiResponse<void>> | null = null;
  const grantPromise = new Promise<ApiResponse<RewardedGrantResultDto> | null>(
    (resolve, reject) => {
      resolveGrant = resolve;
      rejectGrant = reject;
    },
  );
  const recordShownOnce = () => {
    shownRecordPromise ??= rewardedAdsApi.recordEvent({
      sessionId: session.sessionId,
      eventType: "SHOWN",
    });
    return shownRecordPromise;
  };

  ad.onAdShown = () => {
    void recordShownOnce();
  };
  ad.onAdDismissed = () => {
    void rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "DISMISSED" });
    if (!finished && !granted) {
      finished = true;
      resolveGrant(null);
    }
  };
  ad.onAdFailedToShow = (error) => {
    void rewardedAdsApi.recordEvent({
      sessionId: session.sessionId,
      eventType: "FAILED",
      payload: { code: error?.code, message: error?.description },
    });
    if (!finished) {
      finished = true;
      rejectGrant(new Error(error?.description ?? error?.code ?? "REWARDED_AD_FAILED_TO_SHOW"));
    }
  };
  ad.onRewarded = (reward) => {
    if (granted) return;
    granted = true;
    void (async () => {
      await recordShownOnce();
      await rewardedAdsApi.recordEvent({
        sessionId: session.sessionId,
        eventType: "REWARDED",
        payload: reward,
      });
      const result = await rewardedAdsApi.grant({
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        providerPayload: reward,
      });
      if (!finished) {
        finished = true;
        resolveGrant(result);
      }
    })().catch((error) => {
      if (!finished) {
        finished = true;
        rejectGrant(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  await rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "LOADED" });
  await ad.show();
  return grantPromise;
}
