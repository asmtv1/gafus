import { afterEach, describe, expect, it, vi } from "vitest";

import { notifySubscriptionRequired, setSubscriptionRequiredHandler } from "./subscriptionRequired";

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
});
