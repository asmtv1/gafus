import { describe, expect, it } from "vitest";
import { GOOGLE_PLAY_FULL_SUPPORT_BENEFITS } from "./googlePlayPremiumBenefits";

describe("Google Play full-support plan presentation", () => {
  it("always includes both chat consultations and calls, without waiting for /offer", () => {
    expect(GOOGLE_PLAY_FULL_SUPPORT_BENEFITS).toContain("Консультации с кинологом в чате");
    expect(GOOGLE_PLAY_FULL_SUPPORT_BENEFITS).toContain("Созвоны с кинологом");
    expect(GOOGLE_PLAY_FULL_SUPPORT_BENEFITS).toHaveLength(5);
  });
});
