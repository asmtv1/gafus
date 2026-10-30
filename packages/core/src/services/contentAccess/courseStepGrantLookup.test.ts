import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasActiveGafusCourseStepAccess } from "./index";

const lookupDay = vi.fn();
const lookupStep = vi.fn();
const lookupGuide = vi.fn();
const lookupGrant = vi.fn();
vi.mock("@gafus/prisma", () => ({
  prisma: {
    dayOnCourse: { findUnique: (...a: unknown[]) => lookupDay(...a) },
    stepOnDay: { findUnique: (...a: unknown[]) => lookupStep(...a) },
    course: { findFirst: (...a: unknown[]) => lookupGuide(...a) },
    gafusTargetAccess: { findFirst: (...a: unknown[]) => lookupGrant(...a) },
  },
}));

describe("Gafus access to a real step occurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupDay.mockResolvedValue({
      dayId: "day",
      courseId: "course",
      course: { isPrivate: false, isPaid: true },
    });
    lookupStep.mockResolvedValue({
      dayId: "day",
      step: { type: "PRACTICE", isDailyCourse: false },
    });
    lookupGuide.mockResolvedValue(null);
    lookupGrant.mockResolvedValue(null);
  });
  const input = { userId: "viewer", dayOnCourseId: "occurrence", stepOnDayId: "step" };

  it("accepts an ordinary step-specific Gafus grant", async () => {
    lookupGrant.mockResolvedValueOnce({ id: "owned-step-grant" });
    expect(await hasActiveGafusCourseStepAccess(input)).toBe(true);
    expect(lookupGuide).not.toHaveBeenCalled();
  });

  it("accepts one active mini-guide grant for every child step", async () => {
    lookupGuide.mockResolvedValue({ id: "course" });
    lookupGrant.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "owned-guide-grant" });
    expect(await hasActiveGafusCourseStepAccess(input)).toBe(true);
    expect(lookupGrant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "viewer",
          targetType: "MINI_GUIDE",
          targetKey: "mini-guide:course",
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  it("rejects when guide access is absent or expired", async () => {
    lookupGuide.mockResolvedValue({ id: "course" });
    expect(await hasActiveGafusCourseStepAccess(input)).toBe(false);
  });

  it("does not grant a child step of an unrelated non-guide course", async () => {
    expect(await hasActiveGafusCourseStepAccess(input)).toBe(false);
    expect(lookupGrant).toHaveBeenCalledTimes(1);
  });

  it("does not bypass course privacy even when a grant exists", async () => {
    lookupDay.mockResolvedValue({
      dayId: "day",
      courseId: "private",
      course: { isPrivate: true, isPaid: true },
    });
    lookupGrant.mockResolvedValue({ id: "stale-grant" });
    expect(await hasActiveGafusCourseStepAccess(input)).toBe(false);
    expect(lookupGrant).not.toHaveBeenCalled();
  });

  it("does not use a step occurrence from another day", async () => {
    lookupStep.mockResolvedValue({
      dayId: "different-day",
      step: { type: "PRACTICE", isDailyCourse: false },
    });
    expect(await hasActiveGafusCourseStepAccess(input)).toBe(false);
    expect(lookupGrant).not.toHaveBeenCalled();
  });
});
