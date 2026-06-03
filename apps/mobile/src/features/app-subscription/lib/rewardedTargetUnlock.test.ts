import { describe, expect, it } from "vitest";

import { shouldTriggerRewardedTargetUnlock } from "./rewardedTargetUnlock";

describe("shouldTriggerRewardedTargetUnlock", () => {
  it("allows target unlock with existing credits even when ads are unavailable because the balance is full", () => {
    expect(
      shouldTriggerRewardedTargetUnlock({
        hasUnlockCallback: true,
        status: {
          target: {
            unlocked: false,
            canUnlockWithCurrentBalance: true,
          },
        },
      }),
    ).toBe(true);
  });

  it("does not trigger without a target-specific unlock callback", () => {
    expect(
      shouldTriggerRewardedTargetUnlock({
        hasUnlockCallback: false,
        status: {
          target: {
            unlocked: false,
            canUnlockWithCurrentBalance: true,
          },
        },
      }),
    ).toBe(false);
  });
});
