import { describe, expect, it, vi } from "vitest";
import { getCourseEditorSnapshot, type CourseEditorSnapshotPort } from "./courseEditorSnapshotService";

describe("course editor snapshot explicit read port", () => {
  it("passes the exact course and actor to the selected port and returns its response unchanged", async () => {
    const actor = { id: "trainer-1", role: "TRAINER" };
    const response = { status: "not_found" as const };
    const first = vi.fn<CourseEditorSnapshotPort>(async () => response);
    const second = vi.fn<CourseEditorSnapshotPort>(async () => ({ status: "unknown" }));

    await expect(getCourseEditorSnapshot("course-1", actor, first)).resolves.toBe(response);
    await expect(getCourseEditorSnapshot("course-1", actor, second)).resolves.toEqual({ status: "unknown" });
    expect(first).toHaveBeenCalledExactlyOnceWith("course-1", actor);
    expect(second).toHaveBeenCalledExactlyOnceWith("course-1", actor);
  });

  it("does not turn an invalid/not-found read into a successful editor response", async () => {
    const actor = { id: "learner-1", role: "USER" };
    for (const status of ["invalid", "not_found", "unknown"] as const) {
      const read: CourseEditorSnapshotPort = async () => ({ status });
      await expect(getCourseEditorSnapshot("course-1", actor, read)).resolves.toEqual({ status });
    }
  });

  it("propagates a failed storage read instead of fabricating a saved snapshot", async () => {
    const failure = new Error("isolated READ_FAILED");
    const read: CourseEditorSnapshotPort = async () => { throw failure; };
    await expect(getCourseEditorSnapshot("course-1", { id: "trainer-1", role: "TRAINER" }, read))
      .rejects.toBe(failure);
  });
});
