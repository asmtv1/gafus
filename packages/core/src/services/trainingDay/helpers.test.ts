import { describe, expect, it, vi } from "vitest";
import { getCoursesUsingDay, type TrainingDayCourseLookupPort } from "./helpers";

describe("training day read port", () => {
  it("skips adapter reads for empty day IDs", async () => {
    const read = vi.fn(async () => ["c"]);
    expect(await getCoursesUsingDay("", { listCourseIdsForTrainingDay: read })).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
  it("returns deduplicated course IDs in repository order", async () => {
    const read = vi.fn(async () => ["c-1", "c-2", "c-1"]);
    const port: TrainingDayCourseLookupPort = { listCourseIdsForTrainingDay: read };
    expect(await getCoursesUsingDay("day-7", port)).toEqual(["c-1", "c-2"]);
    expect(read).toHaveBeenCalledExactlyOnceWith("day-7");
  });
  it("never disguises a failed repository read as an empty course list", async () => {
    const read = vi.fn(async () => { throw new Error("COURSE_REPOSITORY_DOWN"); });
    await expect(getCoursesUsingDay("day-7", { listCourseIdsForTrainingDay: read }))
      .rejects.toThrow("COURSE_REPOSITORY_DOWN");
  });
});
