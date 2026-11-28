import { beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
function adapter() {
  return {
    readActiveCourseStepGafusGrant: vi.fn(async () => false),
    readAllowedVideoCourseStepAccess: vi.fn(async () => false),
  };
}
const resolveAccess = vi.fn();
const input = {userId:"owner-A",dayOnCourseId:"day-occurrence-A",stepOnDayId:"step-occurrence-B"};
describe("Course occurrence Gafus + video policy port", () => {
  it("fails closed for locked Gafus steps and video before SQL reader binding", async () => {
    const c=await import("./index");
    await expect(c.hasActiveGafusCourseStepAccess(input, undefined!))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId,input.dayOnCourseId,input.stepOnDayId,new Date(),resolveAccess,undefined!))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
  });
  it("preserves exact actor and day/step occurrence for authoritative read", async () => {
    const c=await import("./index");const p=adapter();
    const now=new Date("2026-11-12T06:00:00Z");
    await expect(c.hasActiveGafusCourseStepAccess({...input,now},p)).resolves.toBe(false);
    expect(p.readActiveCourseStepGafusGrant).toHaveBeenCalledExactlyOnceWith(
      {...input,now},c.resolveCourseStepTargetTx,
    );
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId,input.dayOnCourseId,input.stepOnDayId,now,resolveAccess,p))
      .resolves.toBe(false);
    expect(p.readAllowedVideoCourseStepAccess).toHaveBeenCalledExactlyOnceWith(
      {...input,now},c.resolveCourseStepTargetTx,resolveAccess,
    );
  });
  it("isolates explicit readers with identical IDs without a global binder", async () => {
    const c = await import("./index");
    const grant = adapter();
    grant.readActiveCourseStepGafusGrant.mockResolvedValue(true);
    grant.readAllowedVideoCourseStepAccess.mockResolvedValue(true);
    const deny = adapter();
    const now = new Date("2026-11-19T12:00:00Z");
    await expect(c.hasActiveGafusCourseStepAccess({...input, now}, grant)).resolves.toBe(true);
    await expect(c.hasActiveGafusCourseStepAccess({...input, now}, deny)).resolves.toBe(false);
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId, input.dayOnCourseId, input.stepOnDayId, now, resolveAccess, grant)).resolves.toBe(true);
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId, input.dayOnCourseId, input.stepOnDayId, now, resolveAccess, deny)).resolves.toBe(false);
    expect(grant.readActiveCourseStepGafusGrant).toHaveBeenCalledWith(
      {...input, now}, c.resolveCourseStepTargetTx,
    );
    expect(deny.readAllowedVideoCourseStepAccess).toHaveBeenCalledWith(
      {...input, now}, c.resolveCourseStepTargetTx, resolveAccess,
    );
    await expect(c.hasActiveGafusCourseStepAccess(input, undefined!))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
  });
});
