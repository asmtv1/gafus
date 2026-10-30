import { describe, expect, it } from "vitest";
import { normalizedSubscriptionsSearch, subscriptionTabFromSearch, subscriptionTabUrl, subscriptionApiUrl } from "./subscriptionNavigation";

describe("Next-compatible AppSubscription deep links with server-safe query", () => {
  it("restores all three tabs from address and generates canonical URLs", () => {
    for (const tab of ["payments", "promo-codes", "npd"] as const) {
      expect(subscriptionTabFromSearch(`?tab=${tab}`)).toBe(tab);
      expect(subscriptionTabUrl(tab)).toBe(`/main-panel/app-subscriptions?tab=${tab}`);
      expect(subscriptionApiUrl(`?tab=${tab}`)).toBe(`/api/v1/admin/app-subscriptions?tab=${tab}`);
    }
  });
  it("preserves exact Next payment filter semantics without leaking hostile params", () => {
    const state = normalizedSubscriptionsSearch("?tab=payments&paymentPage=3&paymentPageSize=50&paymentStatus=SUCCEEDED&paymentSearch=%20%40dog%20&extra=private");
    expect(state).toBe("tab=payments&paymentPage=3&paymentPageSize=50&paymentStatus=SUCCEEDED&paymentSearch=%40dog");
    expect(subscriptionApiUrl("?tab=other&paymentPage=-1&secret=1")).toBe("/api/v1/admin/app-subscriptions?tab=payments");
  });
  it("restores NPD status, dates, page; rejects malformed dates, size and overlong query", () => {
    const state = normalizedSubscriptionsSearch("?tab=npd&npdPage=2&npdPageSize=100&npdStatus=FAILED&npdFrom=2026-10-01&npdTo=2026-10-25&npdSearch=one&paymentStatus=PENDING");
    expect(state).toBe("tab=npd&npdPage=2&npdPageSize=100&npdStatus=FAILED&npdSearch=one&npdFrom=2026-10-01&npdTo=2026-10-25");
    expect(normalizedSubscriptionsSearch("?tab=npd&npdFrom=2026-02-30&npdPage=10001&npdPageSize=999&npdStatus=bad"))
      .toBe("tab=npd");
  });
  it("keeps archive state only on promo tab and canonicalizes unknown tab", () => {
    expect(normalizedSubscriptionsSearch("?tab=promo-codes&includeArchived=true&paymentSearch=private"))
      .toBe("tab=promo-codes&includeArchived=1");
    expect(normalizedSubscriptionsSearch("?tab=payments&includeArchived=true")).toBe("tab=payments");
    expect(normalizedSubscriptionsSearch("?tab=%2F%2Fout&includeArchived=true")).toBe("tab=payments");
  });
});
