import { describe, expect, it } from "vitest";
import {
  cleanupScheduleWhere, cleanupBundleWhere, cleanupAllDailyCourseStepWhere,
  cleanupLinkedDailyCourseStepWhere, scopedScheduleIdWhere, scopedBundleIdWhere,
  scopedSafeDailyCourseStepIdWhere,
} from "./dailyCourseCleanupScope";

const trainer = { id: "trainer-1", role: "TRAINER" };
const admin = { id: "admin-1", role: "ADMIN" };

describe("daily-course cleanup ownership boundary", () => {
  it("future cleanup is owner-scoped and only touches dates AFTER today", () => {
    expect(cleanupScheduleWhere(trainer,"future","2026-11-02")).toEqual({
      date: { gt: new Date("2026-11-02T00:00:00.000Z") },
      bundle: { authorId: trainer.id },
    });
    expect(cleanupScheduleWhere(admin,"future","2026-11-02")).toEqual({
      date: { gt: new Date("2026-11-02T00:00:00.000Z") },
    });
  });

  it("trainer cleanup cannot read or delete unrelated bundles and schedules", () => {
    expect(cleanupBundleWhere(trainer,"future",["schedule-1"])).toEqual({
      authorId: trainer.id, schedules: { some: { id: { in: ["schedule-1"] } } },
    });
    expect(scopedScheduleIdWhere(trainer,["schedule-1"])).toEqual({
      id: { in: ["schedule-1"] }, bundle: { authorId: trainer.id },
    });
    expect(scopedBundleIdWhere(trainer,["bundle-1"])).toEqual({
      id: { in: ["bundle-1"] }, authorId: trainer.id,
    });
  });

  it("even ADMIN cannot delete regular-course steps or linked shared steps", () => {
    expect(cleanupAllDailyCourseStepWhere(admin)).toEqual({ isDailyCourse: true });
    expect(cleanupLinkedDailyCourseStepWhere(trainer,["s1"])).toEqual({
      id: { in: ["s1"] }, isDailyCourse: true, authorId: trainer.id,
    });
    expect(scopedSafeDailyCourseStepIdWhere(admin,["s1"])).toEqual({
      id: { in: ["s1"] }, isDailyCourse: true, stepLinks: { none: {} },
    });
    expect(scopedSafeDailyCourseStepIdWhere(trainer,["s1"])).toEqual({
      id: { in: ["s1"] }, isDailyCourse: true, authorId: trainer.id,
      stepLinks: { none: {} },
    });
  });
});
