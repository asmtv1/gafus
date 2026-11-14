import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { dayOnCourse: { findFirst: m.read } } }));
import { readTrainingDayContent } from "./trainingDayContentRead.js";

describe("Course-day read adapter is content-only and caller-scoped", () => {
  beforeEach(() => {
    m.read.mockReset();
    m.read.mockResolvedValue(null);
  });
  it("selects the requested course type and exact course-day link with no personal progress", async () => {
    await readTrainingDayContent("PAID", "day-link-A");
    expect(m.read).toHaveBeenCalledTimes(1);
    const call = m.read.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: "day-link-A", course: { type: "PAID" } });
    expect(call.select).toMatchObject({
      id: true, courseId: true,
      course: { select: { duration: true, isPersonalized: true } },
      day: { select: { stepLinks: { select: {
        id: true, order: true, step: { select: { description: true, videoUrls: true, pdfUrls: true } },
      } } } },
    });
    const snapshot = JSON.stringify(call.select);
    for (const forbidden of ["userTrainings", "userCourses", "courseAccess", "access", "userSteps", "ownerId", "password"])
      expect(snapshot).not.toContain(`"${forbidden}"`);
  });
  it("returns null for absent records without converting them to a false authorization", async () => {
    await expect(readTrainingDayContent("course", "missing")).resolves.toBeNull();
  });
  it("propagates a failed DB read so Core can invalidate the cache and fail closed", async () => {
    m.read.mockRejectedValueOnce(new Error("local database outage"));
    await expect(readTrainingDayContent("course", "day-A")).rejects.toThrow("local database outage");
  });
});
