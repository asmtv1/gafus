import { describe, expect, it } from "vitest";

import { getAppSubscriptionStatusLabel } from "./statusPresentation";

describe("getAppSubscriptionStatusLabel", () => {
  it("shows expired label for stored ACTIVE rows that are no longer active now", () => {
    expect(
      getAppSubscriptionStatusLabel({
        status: "ACTIVE",
        isActiveNow: false,
        isLifetime: false,
        activeUntil: "2026-05-30T11:45:00.000Z",
      }),
    ).toBe("Истекла");
  });

  it("keeps active label for rows that are active now", () => {
    expect(
      getAppSubscriptionStatusLabel({
        status: "ACTIVE",
        isActiveNow: true,
        isLifetime: false,
        activeUntil: "2026-06-06T11:45:00.000Z",
      }),
    ).toBe("Активна");
  });

  it("uses stored non-active statuses directly", () => {
    expect(
      getAppSubscriptionStatusLabel({
        status: "PAST_DUE",
        isActiveNow: false,
        isLifetime: false,
        activeUntil: "2026-05-30T11:45:00.000Z",
      }),
    ).toBe("Проблема оплаты");
  });
});
