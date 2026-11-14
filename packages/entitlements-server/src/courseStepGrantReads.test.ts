import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ grant: vi.fn(), guide: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { gafusTargetAccess: { findFirst: f.grant }, course: { findFirst: f.guide } },
}));
import {
  readActiveCourseStepGafusGrant,
  readAllowedVideoCourseStepAccess,
} from "./courseStepGrantReads.js";
const at = new Date("2026-11-10T00:00:00Z");
const input = {
  userId: "viewer-A",
  dayOnCourseId: "course-occ-A",
  stepOnDayId: "step-occ-A",
  now: at,
};
const target = {
  type: "COURSE_STEP" as const,
  targetKey: "course-step:course-occ-A:step-occ-A",
  courseId: "course-A",
  isPrivate: false,
  monetized: true,
};
const resolve = vi.fn(async (_db: unknown, courseId: string, stepId: string) =>
  courseId === input.dayOnCourseId && stepId === input.stepOnDayId ? target : null,
);

beforeEach(() => {
  vi.clearAllMocks();
  f.grant.mockResolvedValue(null);
  f.guide.mockResolvedValue(null);
  resolve.mockImplementation(async (_db: unknown, courseId: string, stepId: string) =>
    courseId === input.dayOnCourseId && stepId === input.stepOnDayId ? target : null,
  );
});

describe("Gafus entitlement adapter requires exact course and step occurrence", () => {
  it("never authorizes absent actors, foreign step occurrences or private/non-monetized steps", async () => {
    expect(await readActiveCourseStepGafusGrant({ ...input, userId: "" }, resolve)).toBe(false);
    expect(
      await readActiveCourseStepGafusGrant({ ...input, stepOnDayId: "unrelated" }, resolve),
    ).toBe(false);
    resolve.mockResolvedValueOnce({ ...target, isPrivate: true });
    expect(await readActiveCourseStepGafusGrant(input, resolve)).toBe(false);
    resolve.mockResolvedValueOnce({ ...target, monetized: false });
    expect(await readActiveCourseStepGafusGrant(input, resolve)).toBe(false);
    expect(f.grant).not.toHaveBeenCalled();
  });
  it("uses exactly one actor, course-step grant key and as-of cutoff", async () => {
    f.grant.mockResolvedValueOnce({ id: "owned-grant" });
    expect(await readActiveCourseStepGafusGrant(input, resolve)).toBe(true);
    expect(f.grant).toHaveBeenCalledExactlyOnceWith({
      where: {
        userId: "viewer-A",
        targetType: "COURSE_STEP",
        targetKey: target.targetKey,
        expiresAt: { gt: at },
      },
      select: { id: true },
    });
    expect(f.guide).not.toHaveBeenCalled();
  });
  it("allows a guide grant only for the target course with guide content", async () => {
    f.guide.mockResolvedValueOnce({ id: "course-A" });
    f.grant.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "guide-grant" });
    expect(await readActiveCourseStepGafusGrant(input, resolve)).toBe(true);
    expect(f.guide).toHaveBeenCalledExactlyOnceWith({
      where: { id: "course-A", guideContent: { not: "" } },
      select: { id: true },
    });
    expect(f.grant).toHaveBeenLastCalledWith({
      where: {
        userId: "viewer-A",
        targetType: "MINI_GUIDE",
        targetKey: "mini-guide:course-A",
        expiresAt: { gt: at },
      },
      select: { id: true },
    });
  });
  it("does not attempt cross-course or implicit guide grant when guide is not found", async () => {
    expect(await readActiveCourseStepGafusGrant(input, resolve)).toBe(false);
    expect(f.grant).toHaveBeenCalledTimes(1);
  });
});

describe("video access uses the same Core entitlement calculation", () => {
  it("is fail-closed for missing actor and missing occurrence before invoking the policy", async () => {
    const allowed = vi.fn(async () => ({ allowed: true }));
    expect(await readAllowedVideoCourseStepAccess({ ...input, userId: "" }, resolve, allowed)).toBe(
      false,
    );
    expect(
      await readAllowedVideoCourseStepAccess(
        { ...input, stepOnDayId: "foreign" },
        resolve,
        allowed,
      ),
    ).toBe(false);
    expect(allowed).not.toHaveBeenCalled();
  });
  it("delegates to the policy including private/paid rules, never infers from media ID", async () => {
    const policy = vi.fn(async () => ({ allowed: false }));
    expect(await readAllowedVideoCourseStepAccess(input, resolve, policy)).toBe(false);
    expect(policy).toHaveBeenCalledTimes(1);
    const [_db, actor, actualTarget, now] = policy.mock.calls[0]!;
    expect(actor).toBe("viewer-A");
    expect(actualTarget).toEqual(target);
    expect(now).toEqual(at);
  });
});
