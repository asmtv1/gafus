import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isSubscriptionRequiredCode,
  notifySubscriptionRequired,
  setSubscriptionRequiredHandler,
  shouldNotifySubscriptionRequired,
} from "./subscriptionRequired";

describe("subscription required API event", () => {
  afterEach(() => {
    setSubscriptionRequiredHandler(null);
  });

  it("notifies the registered handler with the required reason", () => {
    const handler = vi.fn();
    setSubscriptionRequiredHandler(handler);

    notifySubscriptionRequired();

    expect(handler).toHaveBeenCalledWith("required");
  });

  it("returns an unregister function that clears the active handler", () => {
    const handler = vi.fn();
    const unregister = setSubscriptionRequiredHandler(handler);

    unregister();
    notifySubscriptionRequired("required");

    expect(handler).not.toHaveBeenCalled();
  });

  it("notifies for subscription-or-credits 402 responses by default", () => {
    expect(
      shouldNotifySubscriptionRequired({
        httpStatus: 402,
        code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
      }),
    ).toBe(true);
  });

  it.each(["SUBSCRIPTION_REQUIRED", "SUBSCRIPTION_OR_CREDITS_REQUIRED"])(
    "recognizes the %s business response",
    (code) => {
      expect(isSubscriptionRequiredCode(code)).toBe(true);
    },
  );

  it("does not classify an infrastructure failure as a subscription response", () => {
    expect(isSubscriptionRequiredCode("INTERNAL_SERVER_ERROR")).toBe(false);
  });

  it("can suppress passive subscription-or-credits 402 responses", () => {
    expect(
      shouldNotifySubscriptionRequired({
        httpStatus: 402,
        code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
        suppressSubscriptionPaywall: true,
      }),
    ).toBe(false);
  });
});
