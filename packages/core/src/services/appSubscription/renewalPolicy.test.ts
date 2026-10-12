import { describe, it, expect } from "vitest";
import {
  buildRenewalIdempotenceKey,
  getNextRenewalAttemptAt,
  renewalAmountsEqualToKopecks,
  isRenewalUniqueViolation,
  MAX_RENEWAL_ATTEMPTS,
} from "./renewalPolicy";

describe("YooKassa renewal policy", () => {
  const periodEnd = new Date("2026-10-11T00:00:00.000Z");
  it("keeps idempotence keys stable for retries but unique per attempt", () => {
    const first = buildRenewalIdempotenceKey("buyer", "sub", periodEnd, 1);
    expect(first).toHaveLength(64);
    expect(first).toBe(buildRenewalIdempotenceKey("buyer", "sub", periodEnd, 1));
    expect(first).not.toBe(buildRenewalIdempotenceKey("buyer", "sub", periodEnd, 2));
  });
  it("caps retries and increases backoff by attempt number", () => {
    const now = new Date("2026-10-11T00:00:00.000Z");
    expect(getNextRenewalAttemptAt(now, 1).getTime() - now.getTime()).toBe(10 * 60_000);
    expect(getNextRenewalAttemptAt(now, 2).getTime() - now.getTime()).toBe(30 * 60_000);
    expect(getNextRenewalAttemptAt(now, 3).getTime() - now.getTime()).toBe(120 * 60_000);
    expect(getNextRenewalAttemptAt(now, 4).getTime() - now.getTime()).toBe(360 * 60_000);
    expect(getNextRenewalAttemptAt(now, MAX_RENEWAL_ATTEMPTS).getTime() - now.getTime()).toBe(1440 * 60_000);
    expect(getNextRenewalAttemptAt(now, 500).getTime() - now.getTime()).toBe(1440 * 60_000);
  });
  it("compares monetary amounts in whole kopecks", () => {
    expect(renewalAmountsEqualToKopecks("1465.00", 1465)).toBe(true);
    expect(renewalAmountsEqualToKopecks("1464.99", 1465)).toBe(false);
    expect(renewalAmountsEqualToKopecks("oops", 1465)).toBe(false);
  });
  it("only interprets Prisma P2002 as unique collision", () => {
    expect(isRenewalUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isRenewalUniqueViolation({ code: "P2003" })).toBe(false);
    expect(isRenewalUniqueViolation(new Error("failed"))).toBe(false);
  });
});
