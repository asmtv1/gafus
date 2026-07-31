import { describe, expect, it } from "vitest";

import {
  formatGafusesWord,
  getRewardedAdErrorMessage,
  getRewardedAccessSummary,
  getRewardedStatusMessage,
} from "./rewardedPaywallCopy";

describe("rewarded paywall copy", () => {
  it("uses the Gafus currency name with correct Russian word forms", () => {
    expect(formatGafusesWord(1)).toBe("гафус");
    expect(formatGafusesWord(2)).toBe("гафуса");
    expect(formatGafusesWord(5)).toBe("гафусов");
  });

  it("tells the user that a new ad will be available tomorrow after the daily limit", () => {
    expect(
      getRewardedStatusMessage({
        isLoading: false,
        status: {
          canWatchAdReason: "DAILY_LIMIT_REACHED",
          settings: {
            platformEnabled: true,
          },
        },
      }),
    ).toBe("Лимит рекламы на сегодня исчерпан. Новая реклама будет доступна завтра.");
  });

  it("explains missing gafuses for a consultation booking target", () => {
    expect(
      getRewardedAccessSummary({
        target: {
          targetType: "CONSULTATION_BOOKING",
          cost: 5,
          unlocked: false,
          missingCredits: 2,
        },
        wallet: {
          balance: 3,
        },
      }),
    ).toEqual({
      title: "Не хватает гафусов для записи",
      subtitle: "Запись к кинологу стоит 5 гафусов. У вас 3, не хватает 2.",
    });
  });

  it("hides Yandex no-fill JSON behind a helpful message", () => {
    expect(
      getRewardedAdErrorMessage(
        new Error(
          '{"description":"Ad request completed successfully, but there are no ads available.","adUnitId":"R-M-19370406-1"}',
        ),
      ),
    ).toBe("Сейчас нет доступной рекламы. Попробуйте позже.");
  });
});
