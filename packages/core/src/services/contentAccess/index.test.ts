import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveCourseStepAccessTx,
  resolveMiniGuideAccessTx,
  type CourseStepTarget,
  type MiniGuideTarget,
} from "./index";

const mockFlag = vi.fn();
const mockRole = vi.fn();
const mockSubscription = vi.fn();
const mockAssignment = vi.fn();
const mockGafus = vi.fn();

vi.mock("../appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: (...args: unknown[]) => mockFlag(...args),
}));

const tx = {
  user: { findUnique: (...args: unknown[]) => mockRole(...args) },
  appSubscription: { findFirst: (...args: unknown[]) => mockSubscription(...args) },
  courseAccess: { findFirst: (...args: unknown[]) => mockAssignment(...args) },
  gafusTargetAccess: { findFirst: (...args: unknown[]) => mockGafus(...args) },
} as unknown as Parameters<typeof resolveCourseStepAccessTx>[0];
const now = new Date("2026-10-15T00:00:00Z");
const paidStep: CourseStepTarget = {
  type: "COURSE_STEP", targetKey: "course-step:d1:s1",
  courseId: "c1", dayOnCourseId: "d1", stepOnDayId: "s1",
  paidOrPrivate: true, isPrivate: false, isPaid: true,
  isDailyStep: false, monetized: true,
};
const miniGuide: MiniGuideTarget = {
  type: "MINI_GUIDE", targetKey: "mini-guide:c1", courseId: "c1",
  paidOrPrivate: false,
};

describe("course-step authorization stays consistent with course entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlag.mockResolvedValue(true);
    mockRole.mockResolvedValue({ role: "USER" });
    mockSubscription.mockResolvedValue(null);
    mockAssignment.mockResolvedValue(null);
    mockGafus.mockResolvedValue(null);
  });

  it("admin and trainer can view paid course steps and HLS media without subscription", async () => {
    for (const role of ["ADMIN", "TRAINER"] as const) {
      mockRole.mockResolvedValue({ role });
      const result = await resolveCourseStepAccessTx(tx, "user", paidStep, now);
      expect(result).toMatchObject({ allowed: true, source: "PREMIUM" });
    }
  });

  it("a private step still requires an assignment even for privileged roles", async () => {
    mockRole.mockResolvedValue({ role: "ADMIN" });
    const result = await resolveCourseStepAccessTx(tx, "user", {
      ...paidStep, isPrivate: true,
    }, now);
    expect(result).toMatchObject({ allowed: false, source: "DENIED" });
    expect(mockRole).not.toHaveBeenCalled();
  });

  it("the previous mini-guide rule remains unchanged for admin/trainer", async () => {
    mockRole.mockResolvedValue({ role: "ADMIN" });
    expect((await resolveMiniGuideAccessTx(tx, "user", miniGuide, now)).allowed).toBe(false);
    mockRole.mockResolvedValue({ role: "PARTNER" });
    expect((await resolveMiniGuideAccessTx(tx, "user", miniGuide, now)).allowed).toBe(true);
  });
});
