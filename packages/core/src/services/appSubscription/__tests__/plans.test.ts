import { describe, expect, it } from "vitest";

import {
  getAppSubscriptionPlanConfig,
  isOfflineCourseDownloadIncludedPlanCode,
} from "../plans";

describe("offline course download plan entitlement", () => {
  it.each([
    ["WEEKLY", false],
    ["TWO_WEEKS", false],
    ["MONTHLY", true],
    ["THREE_MONTHS", true],
    ["UNKNOWN", false],
    [null, false],
  ] as const)("returns %s entitlement as %s", (planCode, expected) => {
    expect(isOfflineCourseDownloadIncludedPlanCode(planCode)).toBe(expected);
  });

  it("exposes the entitlement in tariff presentation", () => {
    expect(getAppSubscriptionPlanConfig(null, "TWO_WEEKS").offlineCourseDownloadIncluded).toBe(
      false,
    );
    expect(getAppSubscriptionPlanConfig(null, "MONTHLY").offlineCourseDownloadIncluded).toBe(
      true,
    );
    expect(
      getAppSubscriptionPlanConfig(null, "THREE_MONTHS").offlineCourseDownloadIncluded,
    ).toBe(true);
  });
});
