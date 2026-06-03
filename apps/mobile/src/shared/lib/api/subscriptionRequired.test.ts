import { afterEach, describe, expect, it, vi } from "vitest";

import {
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
