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
