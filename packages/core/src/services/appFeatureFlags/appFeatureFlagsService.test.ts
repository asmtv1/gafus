import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => new Map<string, boolean>());

vi.mock("@gafus/prisma", () => ({
  prisma: {
    appFeatureFlag: {
      findUnique: vi.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(flags.has(where.key) ? { enabled: flags.get(where.key) } : null),
      ),
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { key: string };
          create: { enabled: boolean };
          update: { enabled: boolean };
        }) => {
          flags.set(where.key, update.enabled ?? create.enabled);
          return Promise.resolve({});
        },
      ),
    },
  },
}));

import {
  APP_FEATURE_APP_SUBSCRIPTION_GATING,
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
  APP_FEATURE_MOBILE_VK_LOGIN_IOS,
  getMobileAppPublicConfig,
  setAppFeatureFlagEnabled,
} from "./appFeatureFlagsService";

describe("app feature flags", () => {
  beforeEach(() => {
    flags.clear();
  });

  it("uses separate keys for the iOS RU card hint and paywall button", () => {
    expect(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT).toBe(
      "mobile_ios_ru_card_payment_hint",
    );
    expect(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT).toBe("mobile_ios_ru_card_payment");
    expect(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT).not.toBe(
      APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT,
    );
  });

  it("returns public mobile flags from independent stored values", async () => {
    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_VK_LOGIN_IOS, true);
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_PAYWALL, true);
    await setAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, false);
    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT, true);
    await setAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, false);

    await expect(getMobileAppPublicConfig()).resolves.toEqual({
      vkLoginEnabledOnIos: true,
      appSubscriptionPaywallEnabled: true,
      appSubscriptionGatingEnabled: false,
      iosRuCardPaymentEnabled: false,
      iosRuCardPaymentHintEnabled: true,
    });
  });

  it("defaults app subscription paywall and gating to enabled when no flag row exists", async () => {
    await expect(getMobileAppPublicConfig()).resolves.toMatchObject({
      appSubscriptionPaywallEnabled: true,
      appSubscriptionGatingEnabled: true,
    });
  });
});
