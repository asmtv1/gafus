import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({
  complete: vi.fn(),
  completeExisting: vi.fn(),
  count: vi.fn(),
  days: vi.fn(),
  trainings: vi.fn(),
}));
vi.mock("@gafus/course-progress-server/completion", () => ({
  completeUserCourseRecord: rows.complete,
  completeExistingUserCourseRecord: rows.completeExisting,
  countCourseDays: rows.count,
  readCourseDayIds: rows.days,
  readOwnTrainingStatuses: rows.trainings,
}));

import {
  completeUserCourse,
  checkAndCompleteCourse,
} from "./course-completion";

describe("course-completion Application composition", () => {
  it("wires the same owner/course IDs into the persistence transaction", async () => {
    rows.complete.mockResolvedValue({ id: "enrollment-1", courseId: "course-1" });
    await expect(completeUserCourse("owner-1", "course-1")).resolves.toMatchObject({
      success: true,
      data: { id: "enrollment-1" },
    });
    expect(rows.complete).toHaveBeenCalledExactlyOnceWith("owner-1", "course-1");
  });

  it("checks every expected day and never completes a partially done course", async () => {
    rows.completeExisting.mockReset();
    rows.days.mockResolvedValue([{ id: "day-1" }, { id: "day-2" }]);
    rows.trainings.mockResolvedValue([{ dayOnCourseId: "day-1", status: "COMPLETED" }]);
    await expect(checkAndCompleteCourse("owner-1", "course-1")).resolves.toMatchObject({
      success: false,
      reason: "Not all days completed",
    });
    expect(rows.completeExisting).not.toHaveBeenCalled();
  });
});
