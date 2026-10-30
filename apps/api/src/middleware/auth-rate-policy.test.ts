import { describe, expect, it } from "vitest";
import { authRateLimitScope } from "./auth-rate-policy";

describe("auth limiter budget policy", () => {
  it.each(["/login", "/register", "/password-reset-request", "/reset-password", "/change-password", "/set-password", "/vk", "/vk-consent", "/email-change-request", "/registration-promo-preview"])(
    "keeps %s on brute-force protected budget", path => {
      expect(authRateLimitScope(`/api/v1/auth${path}`, "POST")).toBe("credential");
    },
  );
  it.each(["/refresh", "/logout", "/logout-all"])(
    "independently limits %s without consuming login attempts", path => {
      expect(authRateLimitScope(`/api/v1/auth${path}`, "POST")).toBe("session");
      expect(authRateLimitScope(`/api/v1/auth${path}`, "GET")).toBe("credential");
    },
  );
  it("handles identity GET separately while protecting invalid method fallbacks", () => {
    expect(authRateLimitScope("/api/v1/auth/me", "GET")).toBe("identity");
    expect(authRateLimitScope("/api/v1/auth/username-available", "GET")).toBe("availability");
    expect(authRateLimitScope("/api/v1/auth/username-available", "POST")).toBe("credential");
  });
});
