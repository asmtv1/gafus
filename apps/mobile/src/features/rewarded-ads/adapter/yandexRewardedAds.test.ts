import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createLoaderMock, grantMock, initializeMock, loadAdMock, recordEventMock, showMock } =
  vi.hoisted(() => ({
    createLoaderMock: vi.fn(),
    grantMock: vi.fn(),
    initializeMock: vi.fn(),
    loadAdMock: vi.fn(),
    recordEventMock: vi.fn(),
    showMock: vi.fn(),
  }));

let loadedAd: {
  onAdShown?: () => void;
  onAdDismissed?: () => void;
  onAdFailedToShow?: (error: { code?: string; description?: string }) => void;
  onRewarded?: (reward: unknown) => void;
  show: typeof showMock;
};

vi.mock("../api/rewardedAdsApi", () => ({
  rewardedAdsApi: {
    grant: grantMock,
    recordEvent: recordEventMock,
  },
}));

vi.mock("yandex-mobile-ads/src/YandexMobileAdsModule", () => ({
  default: {
    YandexMobileAds: {},
    YandexRewardedAdModule: {},
    YandexInterstitialAdModule: {},
    YandexBannerAdSizeModule: {},
    YandexAppOpenAdModule: {},
  },
}));

vi.mock("yandex-mobile-ads/src/MobileAds", () => ({
  default: {
    initialize: initializeMock,
    pluginVersion: "test",
  },
  MobileAds: {
    initialize: initializeMock,
    pluginVersion: "test",
  },
}));

vi.mock("yandex-mobile-ads/src/rewarded/RewardedAdLoader", () => ({
  RewardedAdLoader: {
    create: createLoaderMock,
  },
}));

import { showYandexRewardedAd } from "./yandexRewardedAds";

describe("showYandexRewardedAd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    loadedAd = { show: showMock };
    initializeMock.mockResolvedValue(undefined);
    loadAdMock.mockResolvedValue(loadedAd);
    createLoaderMock.mockResolvedValue({ loadAd: loadAdMock });
    recordEventMock.mockResolvedValue({ success: true });
    grantMock.mockResolvedValue({
      success: true,
      data: {
        accessId: "access-1",
        targetType: "ARTICLE",
        targetId: "article-1",
        expiresAt: "2026-08-12T10:00:00.000Z",
        replay: false,
      },
    });
    showMock.mockImplementation(async () => {
      loadedAd.onAdShown?.();
      loadedAd.onRewarded?.({ amount: 1, type: "credit" });
      loadedAd.onAdDismissed?.();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the grant result after the rewarded ad is dismissed", async () => {
    const result = await showYandexRewardedAd({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      provider: "YANDEX",
      placementId: "placement-1",
      platform: "ANDROID",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      testMode: true,
    });

    expect(loadAdMock).toHaveBeenCalledWith(expect.objectContaining({ _adUnitId: "placement-1" }));
    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "LOADED",
    });
    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "SHOWN",
    });
    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "REWARDED",
      payload: { amount: 1, type: "credit" },
    });
    expect(grantMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      providerPayload: { amount: 1, type: "credit" },
    });
    expect(result).toMatchObject({
      success: true,
      data: { accessId: "access-1", targetType: "ARTICLE", targetId: "article-1" },
    });
  });

  it("waits for grant when dismissed fires after rewarded", async () => {
    let resolveGrant: (value: unknown) => void = () => undefined;
    grantMock.mockReturnValue(
      new Promise((resolve) => {
        resolveGrant = resolve;
      }),
    );
    showMock.mockImplementation(async () => {
      loadedAd.onAdShown?.();
      loadedAd.onRewarded?.({ amount: 1, type: "credit" });
      loadedAd.onAdDismissed?.();
    });

    const resultPromise = showYandexRewardedAd({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      provider: "YANDEX",
      placementId: "placement-1",
      platform: "ANDROID",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      testMode: true,
    });

    await Promise.resolve();
    resolveGrant({
      success: true,
      data: {
        accessId: "access-1",
        targetType: "ARTICLE",
        targetId: "article-1",
        expiresAt: "2026-08-12T10:00:00.000Z",
        replay: false,
      },
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      data: { accessId: "access-1" },
    });
  });

  it("resolves from callbacks when ad.show never settles after a rewarded view", async () => {
    showMock.mockImplementation(() => {
      loadedAd.onAdShown?.();
      loadedAd.onRewarded?.({ amount: 1, type: "credit" });
      loadedAd.onAdDismissed?.();
      return new Promise(() => undefined);
    });

    const result = await showYandexRewardedAd({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      provider: "YANDEX",
      placementId: "placement-1",
      platform: "IOS",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      testMode: true,
    });

    expect(result).toMatchObject({
      success: true,
      data: { accessId: "access-1", targetType: "ARTICLE", targetId: "article-1" },
    });
  });

  it("rejects when iOS show resolves without any lifecycle callbacks", async () => {
    showMock.mockResolvedValue(undefined);

    const resultPromise = showYandexRewardedAd({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      provider: "YANDEX",
      placementId: "placement-1",
      platform: "IOS",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      testMode: true,
    });
    const rejectionAssertion = expect(resultPromise).rejects.toThrow(
      "Реклама не открылась. Попробуйте ещё раз.",
    );

    await vi.advanceTimersByTimeAsync(8_000);

    await rejectionAssertion;
    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "FAILED",
      payload: {
        code: "REWARDED_AD_SHOW_TIMEOUT",
        message: "Реклама не открылась. Попробуйте ещё раз.",
      },
    });
  });

  it("waits until SHOWN is recorded before recording REWARDED", async () => {
    let resolveShown: (value: unknown) => void = () => undefined;
    recordEventMock.mockImplementation(({ eventType }) => {
      if (eventType === "SHOWN") {
        return new Promise((resolve) => {
          resolveShown = resolve;
        });
      }
      return Promise.resolve({ success: true });
    });
    showMock.mockImplementation(async () => {
      loadedAd.onAdShown?.();
      loadedAd.onRewarded?.({ amount: 1, type: "credit" });
      loadedAd.onAdDismissed?.();
    });

    const resultPromise = showYandexRewardedAd({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      provider: "YANDEX",
      placementId: "placement-1",
      platform: "ANDROID",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      testMode: true,
    });

    await vi.waitFor(() => {
      expect(recordEventMock).toHaveBeenCalledWith({
        sessionId: "session-1",
        eventType: "SHOWN",
      });
    });
    expect(recordEventMock).not.toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "REWARDED",
      payload: { amount: 1, type: "credit" },
    });

    resolveShown({ success: true });
    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      data: { accessId: "access-1" },
    });
    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "REWARDED",
      payload: { amount: 1, type: "credit" },
    });
  });

  it("marks the server session as failed when the ad cannot be loaded", async () => {
    const loadError = new Error("no fill");
    loadAdMock.mockRejectedValueOnce(loadError);

    await expect(
      showYandexRewardedAd({
        sessionId: "session-1",
        requestNonce: "nonce-1",
        provider: "YANDEX",
        placementId: "placement-1",
        platform: "ANDROID",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        testMode: true,
      }),
    ).rejects.toThrow("no fill");

    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "FAILED",
      payload: {
        code: "REWARDED_AD_LOAD_FAILED",
        message: "no fill",
      },
    });
  });
});
