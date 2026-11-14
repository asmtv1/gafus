import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  read: vi.fn(async () => [{ id: "courseA", name: "old", version: 2 }]),
  write: vi.fn(async () => [{ id: "courseA", name: "new", version: 3 }]),
  logo: vi.fn(async () => ({ status: "stale" as const })),
}));
vi.mock("@gafus/course-progress-server/course-version-rows", () => ({
  readCourseVersionRows: mock.read,
  writeCourseNameVersionRows: mock.write,
  setCourseLogoVersionRows: mock.logo,
}));

describe("API Course.version application composition", () => {
  it("keeps owner-scoped reads and CAS version result unchanged", async () => {
    const c = await import("@gafus/core/services/trainerCourse");
    await import("./install-core-version-rows");
    const actor = { id: "ownerA", role: "TRAINER" };
    await expect(c.readCourseNameVersion("courseA", actor)).resolves.toEqual({
      status: "found", data: { id: "courseA", name: "old", version: 2 },
    });
    expect(mock.read).toHaveBeenCalledWith("courseA", actor);
    await expect(c.updateCourseNameVersioned({ courseId: "courseA", name: "new", expectedVersion: 2 }, actor))
      .resolves.toEqual({ status: "updated", data: { id: "courseA", name: "new", version: 3 } });
    expect(mock.write).toHaveBeenCalledWith({ courseId: "courseA", name: "new", expectedVersion: 2 }, actor);
    // The separate source-alias for @gafus/core/services/course in API Vitest
    // resolves a second Core module instance. Logo policy/response is asserted
    // in Core's source contract test, not via this mixed-alias test runner.
    expect(mock.logo).not.toHaveBeenCalled();
  });
});
