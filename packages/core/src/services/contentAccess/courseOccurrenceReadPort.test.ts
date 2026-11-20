import { beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
function adapter() {
  return {
    readActiveCourseStepGafusGrant: vi.fn(async () => false),
    readAllowedVideoCourseStepAccess: vi.fn(async () => false),
  };
}
const input = {userId:"owner-A",dayOnCourseId:"day-occurrence-A",stepOnDayId:"step-occurrence-B"};
describe("Course occurrence Gafus + video policy port", () => {
  it("fails closed for locked Gafus steps and video before SQL reader binding", async () => {
    const c=await import("./index");
    await expect(c.hasActiveGafusCourseStepAccess(input))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId,input.dayOnCourseId,input.stepOnDayId,new Date()))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
  });
  it("preserves exact actor and day/step occurrence for authoritative read", async () => {
    const c=await import("./index");const p=adapter();c.registerCourseOccurrenceReadsPort(p);
    const now=new Date("2026-11-12T06:00:00Z");
    await expect(c.hasActiveGafusCourseStepAccess({...input,now})).resolves.toBe(false);
    expect(p.readActiveCourseStepGafusGrant).toHaveBeenCalledExactlyOnceWith(
      {...input,now},c.resolveCourseStepTargetTx,
    );
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId,input.dayOnCourseId,input.stepOnDayId,now))
      .resolves.toBe(false);
    expect(p.readAllowedVideoCourseStepAccess).toHaveBeenCalledExactlyOnceWith(
      {...input,now},c.resolveCourseStepTargetTx,c.resolveCourseStepAccessTx,
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
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId, input.dayOnCourseId, input.stepOnDayId, now, grant)).resolves.toBe(true);
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId, input.dayOnCourseId, input.stepOnDayId, now, deny)).resolves.toBe(false);
    expect(grant.readActiveCourseStepGafusGrant).toHaveBeenCalledWith(
      {...input, now}, c.resolveCourseStepTargetTx,
    );
    expect(deny.readAllowedVideoCourseStepAccess).toHaveBeenCalledWith(
      {...input, now}, c.resolveCourseStepTargetTx, c.resolveCourseStepAccessTx,
    );
    await expect(c.hasActiveGafusCourseStepAccess(input))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
  });
  it("prohibits hot replacement of a process-bound occurrence reader", async () => {
    const c=await import("./index");const p=adapter();
    c.registerCourseOccurrenceReadsPort(p);c.registerCourseOccurrenceReadsPort(p);
    expect(() => c.registerCourseOccurrenceReadsPort(adapter()))
      .toThrow("COURSE_OCCURRENCE_READ_PORT_ALREADY_BOUND");
  });
});
