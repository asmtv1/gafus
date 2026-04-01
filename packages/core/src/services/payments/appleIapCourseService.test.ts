import { afterEach, describe, expect, it, vi } from "vitest";

describe("verifyAppleCoursePurchase", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot };
  });

  it("без APPLE_BUNDLE_ID возвращает CONFIG_APPLE_IAP", async () => {
    delete process.env.APPLE_BUNDLE_ID;
    const { verifyAppleCoursePurchase } = await import("./appleIapCourseService");
    const result = await verifyAppleCoursePurchase({
      userId: "user_test",
      signedTransactionInfo: "dummy.jws",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("CONFIG_APPLE_IAP");
    }
  });
});
