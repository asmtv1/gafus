import { describe, expect, it } from "vitest";

import { canCaptureAppScreen } from "./screenCapturePolicy";

const verified = {
  isLoading: false,
  isAuthenticated: true,
  verifiedSessionEpoch: "verified-session",
} as const;

describe("mobile screenshot and recording role policy", () => {
  it.each(["ADMIN", "TRAINER", "PARTNER"] as const)("allows verified %s accounts", (role) => {
    expect(canCaptureAppScreen({ ...verified, role })).toBe(true);
  });

  it.each(["USER", "MODERATOR", null, undefined] as const)("protects %s accounts", (role) => {
    expect(canCaptureAppScreen({ ...verified, role })).toBe(false);
  });

  it("keeps screens protected during session restore, while logged out and without verification", () => {
    expect(canCaptureAppScreen({ ...verified, role: "ADMIN", isLoading: true })).toBe(false);
    expect(canCaptureAppScreen({ ...verified, role: "ADMIN", isAuthenticated: false })).toBe(false);
    expect(canCaptureAppScreen({ ...verified, role: "ADMIN", verifiedSessionEpoch: null })).toBe(false);
  });
});
