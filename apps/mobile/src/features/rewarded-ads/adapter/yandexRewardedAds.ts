import {
  rewardedAdsApi,
  type RewardedAdSessionDto,
  type RewardedGrantResultDto,
} from "../api/rewardedAdsApi";
import type { ApiResponse } from "@/shared/lib/api/client";
import AdRequestConfiguration from "yandex-mobile-ads/src/common/AdRequestConfiguration";
import { MobileAds } from "yandex-mobile-ads/src/MobileAds";
import YandexMobileAdsModule from "yandex-mobile-ads/src/YandexMobileAdsModule";
import { RewardedAdLoader } from "yandex-mobile-ads/src/rewarded/RewardedAdLoader";

let initialized = false;
const SHOW_CALLBACK_TIMEOUT_MS = 8_000;
const LOAD_TIMEOUT_MS = 15_000;

function logRewardedDebug(message: string, details?: Record<string, unknown>) {
  console.log(`[rewarded-ads:yandex] ${message}`, details ?? {});
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getNativeYandexModulesSnapshot() {
  const modules = YandexMobileAdsModule ?? {};
  const nativeModuleNames = Object.keys(modules);
  return {
    yandexModuleNames: nativeModuleNames,
    hasYandexMobileAds: Boolean(modules.YandexMobileAds),
    hasYandexRewardedAdModule: Boolean(modules.YandexRewardedAdModule),
    hasYandexInterstitialAdModule: Boolean(modules.YandexInterstitialAdModule),
    hasYandexBannerAdSizeModule: Boolean(modules.YandexBannerAdSizeModule),
    hasYandexAppOpenAdModule: Boolean(modules.YandexAppOpenAdModule),
  };
}

async function initializeMobileAds() {
  if (initialized) {
    logRewardedDebug("MobileAds already initialized", getNativeYandexModulesSnapshot());
    return;
  }
  logRewardedDebug("initializing MobileAds", getNativeYandexModulesSnapshot());
  try {
    await MobileAds.initialize();
    initialized = true;
    logRewardedDebug("MobileAds initialized", getNativeYandexModulesSnapshot());
  } catch (error) {
    logRewardedDebug("MobileAds initialize failed", {
      ...getNativeYandexModulesSnapshot(),
      error: formatError(error),
    });
    throw error;
  }
}

export async function showYandexRewardedAd(
  session: RewardedAdSessionDto,
): Promise<ApiResponse<RewardedGrantResultDto> | null> {
  logRewardedDebug("show requested", {
    sessionId: session.sessionId,
    platform: session.platform,
    placementId: session.placementId,
    testMode: session.testMode,
    expiresAt: session.expiresAt,
  });
  let failedRecordPromise: Promise<ApiResponse<void>> | null = null;
  const recordFailedOnce = (code: string, error: unknown) => {
    logRewardedDebug("recording FAILED", {
      sessionId: session.sessionId,
      code,
      error: formatError(error),
    });
    failedRecordPromise ??= rewardedAdsApi.recordEvent({
      sessionId: session.sessionId,
      eventType: "FAILED",
      payload: { code, message: getErrorMessage(error) },
    });
    return failedRecordPromise;
  };
  const recordFailedAndRethrow = async (code: string, error: unknown): Promise<never> => {
    try {
      await recordFailedOnce(code, error);
    } catch (recordError) {
      logRewardedDebug("FAILED event record failed", {
        sessionId: session.sessionId,
        error: formatError(recordError),
      });
    }
    throw error;
  };

  await initializeMobileAds().catch((error) =>
    recordFailedAndRethrow("REWARDED_AD_INITIALIZE_FAILED", error),
  );
  logRewardedDebug("creating rewarded loader", getNativeYandexModulesSnapshot());
  const loader = await RewardedAdLoader.create().catch((error) => {
    logRewardedDebug("rewarded loader create failed", {
      ...getNativeYandexModulesSnapshot(),
      error: formatError(error),
    });
    return recordFailedAndRethrow("REWARDED_AD_LOADER_CREATE_FAILED", error);
  });
  logRewardedDebug("rewarded loader created", {
    sessionId: session.sessionId,
    hasLoader: Boolean(loader),
  });
  logRewardedDebug("loading rewarded ad", {
    sessionId: session.sessionId,
    placementId: session.placementId,
  });
  const adRequest = new AdRequestConfiguration({ adUnitId: session.placementId });
  let loadTimeout: ReturnType<typeof setTimeout> | null = null;
  const adLoadPromise = loader.loadAd(adRequest);
  const ad = await Promise.race([
    adLoadPromise,
    new Promise<never>((_, reject) => {
      loadTimeout = setTimeout(() => {
        reject(new Error("Реклама не загрузилась. Попробуйте ещё раз."));
      }, LOAD_TIMEOUT_MS);
    }),
  ])
    .finally(() => {
      if (loadTimeout) clearTimeout(loadTimeout);
    })
    .catch((error) => {
      logRewardedDebug("rewarded ad load failed", {
        sessionId: session.sessionId,
        placementId: session.placementId,
        error: formatError(error),
      });
      return recordFailedAndRethrow("REWARDED_AD_LOAD_FAILED", error);
    });
  logRewardedDebug("rewarded ad loaded", {
    sessionId: session.sessionId,
    hasAd: Boolean(ad),
  });
  let granted = false;
  let finished = false;
  let resolveGrant: (result: ApiResponse<RewardedGrantResultDto> | null) => void;
  let rejectGrant: (error: Error) => void;
  let shownRecordPromise: Promise<ApiResponse<void>> | null = null;
  let lifecycleCallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  const grantPromise = new Promise<ApiResponse<RewardedGrantResultDto> | null>(
    (resolve, reject) => {
      resolveGrant = resolve;
      rejectGrant = reject;
    },
  );
  const clearLifecycleCallbackTimeout = () => {
    if (lifecycleCallbackTimeout) {
      clearTimeout(lifecycleCallbackTimeout);
      lifecycleCallbackTimeout = null;
    }
  };
  const recordShownOnce = () => {
    logRewardedDebug("recording SHOWN", { sessionId: session.sessionId });
    shownRecordPromise ??= rewardedAdsApi.recordEvent({
      sessionId: session.sessionId,
      eventType: "SHOWN",
    });
    return shownRecordPromise;
  };

  ad.onAdShown = () => {
    clearLifecycleCallbackTimeout();
    logRewardedDebug("callback onAdShown", { sessionId: session.sessionId });
    void recordShownOnce();
  };
  ad.onAdDismissed = () => {
    clearLifecycleCallbackTimeout();
    logRewardedDebug("callback onAdDismissed", {
      sessionId: session.sessionId,
      granted,
      finished,
    });
    void rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "DISMISSED" });
    if (!finished && !granted) {
      finished = true;
      resolveGrant(null);
    }
  };
  ad.onAdFailedToShow = (error) => {
    clearLifecycleCallbackTimeout();
    logRewardedDebug("callback onAdFailedToShow", {
      sessionId: session.sessionId,
      error,
    });
    void recordFailedOnce(error?.code ?? "REWARDED_AD_FAILED_TO_SHOW", error?.description ?? error);
    if (!finished) {
      finished = true;
      rejectGrant(new Error(error?.description ?? error?.code ?? "REWARDED_AD_FAILED_TO_SHOW"));
    }
  };
  ad.onRewarded = (reward) => {
    clearLifecycleCallbackTimeout();
    logRewardedDebug("callback onRewarded", {
      sessionId: session.sessionId,
      granted,
      reward,
    });
    if (granted) return;
    granted = true;
    void (async () => {
      await recordShownOnce();
      logRewardedDebug("recording REWARDED", { sessionId: session.sessionId, reward });
      await rewardedAdsApi.recordEvent({
        sessionId: session.sessionId,
        eventType: "REWARDED",
        payload: reward,
      });
      logRewardedDebug("granting rewarded credits", { sessionId: session.sessionId });
      const result = await rewardedAdsApi.grant({
        sessionId: session.sessionId,
        requestNonce: session.requestNonce,
        providerPayload: reward,
      });
      logRewardedDebug("rewarded credits grant result", {
        sessionId: session.sessionId,
        success: result.success,
        grantedCredits: result.data?.grantedCredits,
        balance: result.data?.balance,
        error: result.error,
      });
      if (!finished) {
        finished = true;
        resolveGrant(result);
      }
    })().catch((error) => {
      logRewardedDebug("rewarded grant flow failed", {
        sessionId: session.sessionId,
        error: formatError(error),
      });
      if (!finished) {
        finished = true;
        rejectGrant(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  logRewardedDebug("recording LOADED", { sessionId: session.sessionId });
  await rewardedAdsApi.recordEvent({ sessionId: session.sessionId, eventType: "LOADED" });
  logRewardedDebug("showing rewarded ad", { sessionId: session.sessionId });
  lifecycleCallbackTimeout = setTimeout(() => {
    if (finished) return;
    const error = new Error("Реклама не открылась. Попробуйте ещё раз.");
    logRewardedDebug("rewarded ad show timed out waiting for callbacks", {
      sessionId: session.sessionId,
      timeoutMs: SHOW_CALLBACK_TIMEOUT_MS,
    });
    void recordFailedOnce("REWARDED_AD_SHOW_TIMEOUT", error);
    finished = true;
    rejectGrant(error);
  }, SHOW_CALLBACK_TIMEOUT_MS);
  void ad
    .show()
    .then(() => {
      logRewardedDebug("ad.show resolved, waiting for callbacks", { sessionId: session.sessionId });
    })
    .catch(async (error) => {
      if (finished) {
        logRewardedDebug("ad.show failed after rewarded flow finished", {
          sessionId: session.sessionId,
          error: formatError(error),
        });
        return;
      }
      try {
        await recordFailedOnce("REWARDED_AD_SHOW_FAILED", error);
      } catch (recordError) {
        logRewardedDebug("FAILED event record failed", {
          sessionId: session.sessionId,
          error: formatError(recordError),
        });
      }
      if (!finished) {
        finished = true;
        rejectGrant(error instanceof Error ? error : new Error(String(error)));
      }
    });
  return grantPromise;
}
