import { rewardedAdsApi, type RewardedAdSessionDto } from "../api/rewardedAdsApi";

let initialized = false;

async function initializeMobileAds() {
  if (initialized) return;
  const { MobileAds } = await import("yandex-mobile-ads");
  await MobileAds.initialize();
  initialized = true;
}

export async function showYandexRewardedAd(session: RewardedAdSessionDto) {
  await initializeMobileAds();
  const { RewardedAdLoader } = await import("yandex-mobile-ads");
  const loader = await RewardedAdLoader.create();
  const ad = await loader.loadAd({ adUnitId: session.placementId });
  let granted = false;

  ad.onAdShown = () => {
    void rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "SHOWN" });
  };
  ad.onAdDismissed = () => {
    void rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "DISMISSED" });
  };
  ad.onAdFailedToShow = (error) => {
    void rewardedAdsApi.recordEvent({
      sessionId: session.sessionId,
      eventType: "FAILED",
      payload: { code: error?.code, message: error?.description },
    });
  };
  ad.onRewarded = (reward) => {
    if (granted) return;
    granted = true;
    void rewardedAdsApi.recordEvent({
      sessionId: session.sessionId,
      eventType: "REWARDED",
      payload: reward,
    });
    void rewardedAdsApi.grant({
      sessionId: session.sessionId,
      requestNonce: session.requestNonce,
      providerPayload: reward,
    });
  };

  await rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "LOADED" });
  await ad.show();
}
