import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  construct: vi.fn((deps) => deps),
  coreDeps: vi.fn(() => ({checkCourseAccess: vi.fn()})),
  readContent: vi.fn(async () => ({id: "day-link"})),
  durableRevision: vi.fn(async () => "12"),
  readDayRow: vi.fn(async () => ({id: "day-link"})),
  occurrence: vi.fn(async () => false),
  grant: vi.fn(async () => false),
  video: vi.fn(async () => false),
}));
vi.mock("@gafus/core/services/training", () => ({
  getCoreTrainingDependencies: m.coreDeps,
  getTrainingDayContent: m.readContent,
}));
vi.mock("@gafus/core/services/contentAccess", () => ({
  hasActiveGafusCourseStepAccess: m.occurrence,
}));
vi.mock("@gafus/entitlements-server", () => ({
  readActiveCourseStepGafusGrant: m.grant,
  readAllowedVideoCourseStepAccess: m.video,
}));
vi.mock("@gafus/course-progress-server/training-service", () => ({
  createTrainingService: m.construct,
}));
vi.mock("@gafus/course-read-server/content-revision", () => ({
  readDurableCourseContentRevision: m.durableRevision,
}));
vi.mock("@gafus/course-read-server", () => ({
  readTrainingDayContent: m.readDayRow,
}));

describe("owner-scoped Training Service composition", () => {
  it("passes the exact content and committed revision SQL adapters into an independent Training Service", async () => {
    const { sqlTraining } = await import("./sql-training-instance.js");
    expect(sqlTraining).toBeDefined();
    expect(m.construct).toHaveBeenCalledOnce();
    expect(m.coreDeps).toHaveBeenCalledOnce();
    const dependencies = m.construct.mock.calls[0]?.[0];
    expect(dependencies).toHaveProperty("checkCourseAccess");
    const exactOccurrence = {userId: "actor-1", dayOnCourseId: "day-1", stepOnDayId: "step-1"};
    await expect(dependencies.hasActiveGafusCourseStepAccess(exactOccurrence)).resolves.toBe(false);
    expect(m.occurrence).toHaveBeenCalledWith(exactOccurrence, {
      readActiveCourseStepGafusGrant: m.grant,
      readAllowedVideoCourseStepAccess: m.video,
    });
    await expect(dependencies.getTrainingDayContent("type-a", "course-day-a"))
      .resolves.toEqual({id: "day-link"});
    expect(m.readContent).toHaveBeenCalledExactlyOnceWith("type-a", "course-day-a", {
      contentRows: {readTrainingDayContent: m.readDayRow},
      revisionRows: {readDurableCourseContentRevision: m.durableRevision},
    });
  });
});
