import { describe, it, expect } from "vitest";
import { rewardedPeriodFromSearch, rewardedPeriodUrl } from "./rewardedPeriod";

describe("Next rewarded ad analytics deep links", () => {
  it("restores canonical 7, 30, 90 day windows", () => {
    for (const days of ["7", "30", "90"] as const) {
      expect(rewardedPeriodFromSearch(`?period=${days}`)).toBe(days);
      expect(rewardedPeriodUrl(days)).toBe(`/main-panel/rewarded-ads?period=${days}`);
    }
  });
  it("does not forward unsupported numbers or URL syntax", () => {
    expect(rewardedPeriodFromSearch("?period=120")).toBe("30");
    expect(rewardedPeriodFromSearch("?period=%2F%2Fhack")).toBe("30");
    expect(rewardedPeriodFromSearch("?days=7")).toBe("30");
  });
});
