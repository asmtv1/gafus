import { describe, expect, it } from "vitest";
import { getVariantsByLevel, checkConditions } from "./message-library";
import { findInactiveUsers } from "./analyzer";
import { checkAndCloseReturnedCampaigns } from "./campaign-manager";

describe("reengagement core-backed compatibility exports", () => {
  it("exposes the legacy pure message-selection API", () => {
    expect(getVariantsByLevel(1).length).toBeGreaterThan(0);
    expect(typeof checkConditions).toBe("function");
  });

  it("exposes legacy analyzer and campaign API", () => {
    expect(typeof findInactiveUsers).toBe("function");
    expect(typeof checkAndCloseReturnedCampaigns).toBe("function");
  });
});
