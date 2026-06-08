import { describe, expect, it } from "vitest";

import { shouldAutoStartMobileOnboardingTour } from "../tour-autostart";

describe("mobile onboarding tour autostart", () => {
  it("does not start before the server tour status is loaded", () => {
    expect(
      shouldAutoStartMobileOnboardingTour({
        hasLoadedStatus: false,
        hasSeenV1: false,
        isActive: false,
        isAuthenticated: true,
      }),
    ).toBe(false);
  });

  it("starts only for authenticated users who have not seen the loaded tour status", () => {
    expect(
      shouldAutoStartMobileOnboardingTour({
        hasLoadedStatus: true,
        hasSeenV1: false,
        isActive: false,
        isAuthenticated: true,
      }),
    ).toBe(true);

    expect(
      shouldAutoStartMobileOnboardingTour({
        hasLoadedStatus: true,
        hasSeenV1: true,
        isActive: false,
        isAuthenticated: true,
      }),
    ).toBe(false);
  });
});
