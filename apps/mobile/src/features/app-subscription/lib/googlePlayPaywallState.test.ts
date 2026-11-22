import { describe, expect, it } from "vitest";
import { isGooglePlayPaymentPending, isOtherProviderPaymentPending } from "./googlePlayPaywallState";

describe("Android Google Play checkout pending gate", () => {
  it("does not block Play because of a previous pending YooKassa payment", () => {
    const status = { provider: "YOOKASSA", status: "PENDING" } as const;
    expect(isGooglePlayPaymentPending(status, false)).toBe(false);
    expect(isOtherProviderPaymentPending(status)).toBe(true);
  });
  it("protects an unfinished Google Play purchase against duplicate charge", () => {
    const status = { provider: "GOOGLE_PLAY", status: "PENDING" } as const;
    expect(isGooglePlayPaymentPending(status, false)).toBe(true);
    expect(isOtherProviderPaymentPending(status)).toBe(false);
  });
  it("honors pending purchase notification before the server has updated", () => {
    expect(isGooglePlayPaymentPending(null, true)).toBe(true);
    expect(isGooglePlayPaymentPending(null, false)).toBe(false);
  });
});
