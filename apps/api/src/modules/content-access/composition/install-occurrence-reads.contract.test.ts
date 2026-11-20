import { beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
const mock = vi.hoisted(() => ({
  grant: vi.fn(async (_input: object, _target: Function) => false),
  video: vi.fn(async (_input: object, _target: Function, _policy: Function) => false),
}));
vi.mock("@gafus/entitlements-server", () => ({
  readActiveCourseStepGafusGrant: mock.grant,
  readAllowedVideoCourseStepAccess: mock.video,
}));
describe("API occurrence-scope entitlement reads composition", () => {
  it("keeps the retired installer available only as an explicit legacy test shim", async () => {
    const c = await import("@gafus/core/services/contentAccess");
    await import("./install-occurrence-reads.js");
    const input = {userId: "owner-legacy", dayOnCourseId: "day", stepOnDayId: "step"};
    await expect(c.hasActiveGafusCourseStepAccess(input)).resolves.toBe(false);
    expect(mock.grant).toHaveBeenCalledWith(input, expect.any(Function));
  });
  it("never uses global Step ID or skips Core policy callbacks", async () => {
    const c=await import("@gafus/core/services/contentAccess");
    const { occurrenceReadPort } = await import("./occurrence-reads-instance.js");
    const input={userId:"owner-A",dayOnCourseId:"day-A",stepOnDayId:"step-A"};
    await expect(c.hasActiveGafusCourseStepAccess(input, occurrenceReadPort)).resolves.toBe(false);
    expect(mock.grant).toHaveBeenCalledWith(input,expect.any(Function));
    const now=new Date("2026-11-12T07:00:00Z");
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId,input.dayOnCourseId,input.stepOnDayId,now,occurrenceReadPort))
      .resolves.toBe(false);
    expect(mock.video).toHaveBeenCalledWith({...input,now},expect.any(Function),expect.any(Function));
    await expect(c.hasActiveGafusCourseStepAccess(input))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
  });
});
