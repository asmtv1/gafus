import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  hashAdvisoryLockKey, getYookassaPaymentMethodDisplayTitle,
  normalizeFingerprintPart, amountsEqual,
} from "./paymentPure";
describe("pure payment boundary; stable semantics across extraction", () => {
  it("keeps existing deterministic signed 32-bit advisory lock key", () => {
    const key="app-subscription:yookassa:start:user1";
    expect(hashAdvisoryLockKey(key)).toBe(createHash("sha256").update(key).digest().readInt32BE(0));
    expect(hashAdvisoryLockKey(key)).toBe(hashAdvisoryLockKey(key));
    expect(hashAdvisoryLockKey(key)).not.toBe(hashAdvisoryLockKey(key+"2"));
  });
  it("preserves SBP/card display priority without leaking credentials", () => {
    expect(getYookassaPaymentMethodDisplayTitle({ type:" sbp ",title:"Ignored",last4:"1234" })).toBe("СБП");
    expect(getYookassaPaymentMethodDisplayTitle({ title:"  Кошелёк  ",last4:"1234" })).toBe("Кошелёк");
    expect(getYookassaPaymentMethodDisplayTitle({ last4:" 1234 " })).toBe("Карта *1234");
    expect(getYookassaPaymentMethodDisplayTitle({})).toBeNull();
  });
  it("trims and normalizes optional card fingerprint fields", () => {
    expect(normalizeFingerprintPart("  Us ","lower")).toBe("us");
    expect(normalizeFingerprintPart("  ru ","upper")).toBe("RU");
    expect(normalizeFingerprintPart(undefined)).toBe("");
  });
  it("keeps payment amount tolerance and rejects nonfinite values", () => {
    expect(amountsEqual("100.000",100)).toBe(true);
    expect(amountsEqual("100.0009",100)).toBe(true);
    expect(amountsEqual("100.01",100)).toBe(false);
    expect(amountsEqual("nan",1)).toBe(false);
  });
});

import { Status as AppleSubscriptionStatus } from "@apple/app-store-server-library";
import { msToDate, mapAppleServerStatus, applePaymentStatus } from "./paymentPure";

describe("pure Apple subscription lifecycle (extracted without provider I/O)", () => {
  const now = new Date("2026-11-03T18:00:00.000Z");
  const activeExpiry = now.getTime() + 86_400_000;
  const pastExpiry = now.getTime() - 86_400_000;
  it.each([
    [AppleSubscriptionStatus.ACTIVE, undefined, activeExpiry, "ACTIVE"],
    [AppleSubscriptionStatus.BILLING_GRACE_PERIOD, undefined, pastExpiry, "ACTIVE"],
    [AppleSubscriptionStatus.BILLING_RETRY, undefined, activeExpiry, "PAST_DUE"],
    [AppleSubscriptionStatus.EXPIRED, undefined, activeExpiry, "EXPIRED"],
    [AppleSubscriptionStatus.REVOKED, undefined, activeExpiry, "REVOKED"],
    [AppleSubscriptionStatus.ACTIVE, now.getTime(), activeExpiry, "REVOKED"],
    [undefined, undefined, activeExpiry, "ACTIVE"],
    [undefined, undefined, pastExpiry, "EXPIRED"],
    [undefined, undefined, undefined, "EXPIRED"],
  ] as const)("maps explicit/fallback Apple status %s revocation %s expiry %s to %s", (
    appleStatus, revocationDate, expiresDate, expected,
  ) => {
    const result = mapAppleServerStatus({ appleStatus, transaction: {
      revocationDate, expiresDate,
    }, now });
    expect(result).toBe(expected);
  });
  it("maps every final entitlement status to its exact persisted payment state", () => {
    expect(applePaymentStatus("ACTIVE")).toBe("SUCCEEDED");
    expect(applePaymentStatus("PAST_DUE")).toBe("FAILED");
    expect(applePaymentStatus("EXPIRED")).toBe("CANCELED");
    expect(applePaymentStatus("REVOKED")).toBe("REFUNDED");
  });
  it("rejects malformed millisecond timestamps before Apple status fallback", () => {
    expect(msToDate(undefined)).toBeNull();
    expect(msToDate(-1)).toBeNull();
    expect(msToDate(Number.POSITIVE_INFINITY)).toBeNull();
    expect(msToDate(now.getTime())?.toISOString()).toBe(now.toISOString());
  });
});
