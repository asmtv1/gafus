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
  it("never uses global Step ID or skips Core policy callbacks", async () => {
    const c=await import("@gafus/core/services/contentAccess");
    const { occurrenceReadPort } = await import("./occurrence-reads-instance.js");
    const input={userId:"owner-A",dayOnCourseId:"day-A",stepOnDayId:"step-A"};
    await expect(c.hasActiveGafusCourseStepAccess(input, occurrenceReadPort)).resolves.toBe(false);
    expect(mock.grant).toHaveBeenCalledWith(input,expect.any(Function));
    const now=new Date("2026-11-12T07:00:00Z");
    await expect(c.hasAllowedVideoCourseStepAccess(input.userId,input.dayOnCourseId,input.stepOnDayId,now,c.createTransactionalContentPolicy(async()=>true).resolveCourseStepAccessTx,occurrenceReadPort))
      .resolves.toBe(false);
    expect(mock.video).toHaveBeenCalledWith({...input,now},expect.any(Function),expect.any(Function));
    await expect(c.hasActiveGafusCourseStepAccess(input,undefined!))
      .rejects.toThrow("COURSE_OCCURRENCE_READ_PORT_UNBOUND");
  });
});
