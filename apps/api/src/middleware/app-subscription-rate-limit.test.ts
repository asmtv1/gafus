import { describe, expect, it } from "vitest";

import { shouldRateLimitAppSubscriptionPath } from "./app-subscription-rate-limit";

describe("app subscription rate limit routing", () => {
  it("rate limits only paid app subscription mutations", () => {
    expect(shouldRateLimitAppSubscriptionPath("POST", "/api/v1/app-subscription/yookassa/start")).toBe(true);
    expect(shouldRateLimitAppSubscriptionPath("POST", "/api/v1/app-subscription/yookassa/cancel")).toBe(true);
    expect(shouldRateLimitAppSubscriptionPath("POST", "/api/v1/app-subscription/apple/verify")).toBe(true);
    expect(shouldRateLimitAppSubscriptionPath("POST", "/api/v1/app-subscription/apple/restore")).toBe(true);

    expect(shouldRateLimitAppSubscriptionPath("GET", "/api/v1/app-subscription/status")).toBe(false);
    expect(shouldRateLimitAppSubscriptionPath("GET", "/api/v1/app-subscription/offer")).toBe(false);
  });
});
