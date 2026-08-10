import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSessionMock, showYandexRewardedAdMock } = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  showYandexRewardedAdMock: vi.fn(),
}));

vi.mock("../api/rewardedAdsApi", () => ({
  rewardedAdsApi: { createSession: createSessionMock },
}));

vi.mock("../adapter/yandexRewardedAds", () => ({
  showYandexRewardedAd: showYandexRewardedAdMock,
}));

vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

import {
  classifyRewardedAccessError,
  getRewardedAccessErrorMessage,
  openTargetWithRewardedAd,
} from "./rewardedAccessFlow";

const target = { targetType: "ARTICLE" as const, targetId: "article-1" };
const session = {
  sessionId: "session-1",
  requestNonce: "nonce-1",
  provider: "YANDEX" as const,
  placementId: "placement-1",
  platform: "IOS" as const,
  expiresAt: "2026-08-05T12:00:00.000Z",
  testMode: false,
};
const grant = {
  accessId: "access-1",
  targetType: "ARTICLE" as const,
  targetId: "article-1",
  expiresAt: "2026-08-12T12:00:00.000Z",
  replay: false,
};

describe("rewarded access flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockResolvedValue({ success: true, data: session });
    showYandexRewardedAdMock.mockResolvedValue({ success: true, data: grant });
  });

  it("creates a target-bound session and returns the granted access", async () => {
    await expect(openTargetWithRewardedAd(target)).resolves.toEqual({
      success: true,
      data: grant,
    });
    expect(createSessionMock).toHaveBeenCalledWith(target);
    expect(showYandexRewardedAdMock).toHaveBeenCalledWith(session);
  });

  it("returns a separate incomplete-view message after dismissal without reward", async () => {
    showYandexRewardedAdMock.mockResolvedValue(null);

    await expect(openTargetWithRewardedAd(target)).resolves.toEqual({
      success: false,
      failure: "INCOMPLETE",
      message: "Материал не открыт: просмотр рекламы не был завершён",
    });
  });

  it("treats an already-active race as success so the screen can refetch", async () => {
    createSessionMock.mockResolvedValue({
      success: false,
      code: "TARGET_ALREADY_ACTIVE",
      error: "Доступ уже активен",
    });

    await expect(openTargetWithRewardedAd(target)).resolves.toEqual({
      success: true,
      data: null,
      alreadyActive: true,
    });
    expect(showYandexRewardedAdMock).not.toHaveBeenCalled();
  });

  it.each([
    [new Error("No fill"), "NO_FILL"],
    [new Error("Network request failed"), "NETWORK"],
    [new Error("Реклама не загрузилась"), "NETWORK"],
    [new Error("Unexpected native failure"), "INTERNAL"],
  ] as const)("classifies provider errors", (error, expected) => {
    expect(classifyRewardedAccessError(error)).toBe(expected);
  });

  it("uses the agreed user-facing error copy", () => {
    expect(getRewardedAccessErrorMessage("NO_FILL")).toBe(
      "Сейчас не можем подобрать для вас рекламу. Попробуйте позже",
    );
    expect(getRewardedAccessErrorMessage("NETWORK")).toBe(
      "Не удалось загрузить рекламу. Проверьте интернет и попробуйте ещё раз",
    );
    expect(getRewardedAccessErrorMessage("INTERNAL")).toBe(
      "Ошибка сервиса Гафус. Попробуйте ещё раз или обратитесь к администрации",
    );
  });
});
