import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("yandex-mobile-ads/src/MobileAds", () => ({
  MobileAds: {
    initialize: initializeMock,
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
    loadedAd = { show: showMock };
    initializeMock.mockResolvedValue(undefined);
    loadAdMock.mockResolvedValue(loadedAd);
    createLoaderMock.mockResolvedValue({ loadAd: loadAdMock });
    recordEventMock.mockResolvedValue({ success: true });
    grantMock.mockResolvedValue({
      success: true,
      data: {
        transactionId: "tx-1",
        grantedCredits: 5,
        balance: 5,
        pendingRefundCredits: 0,
        maxBalance: 5,
        adsWatchedToday: 1,
        dailyAdLimit: 3,
        canWatchAd: false,
        replay: false,
      },
    });
    showMock.mockImplementation(async () => {
      loadedAd.onAdShown?.();
      loadedAd.onRewarded?.({ amount: 1, type: "credit" });
    });
  });

  it("resolves with the grant result after the rewarded callback", async () => {
    const result = await showYandexRewardedAd({
      sessionId: "session-1",
      requestNonce: "nonce-1",
      provider: "YANDEX",
      placementId: "placement-1",
      platform: "ANDROID",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      testMode: true,
    });

    expect(loadAdMock).toHaveBeenCalledWith({ adUnitId: "placement-1" });
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
      data: { grantedCredits: 5, balance: 5 },
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
        transactionId: "tx-1",
        grantedCredits: 5,
        balance: 5,
        pendingRefundCredits: 0,
        maxBalance: 5,
        adsWatchedToday: 1,
        dailyAdLimit: 3,
        canWatchAd: false,
        replay: false,
      },
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      data: { grantedCredits: 5 },
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
      data: { grantedCredits: 5 },
    });
    expect(recordEventMock).toHaveBeenCalledWith({
      sessionId: "session-1",
      eventType: "REWARDED",
      payload: { amount: 1, type: "credit" },
    });
  });
});
