import { describe, expect, it, vi } from "vitest";
const registry = vi.hoisted(() => ({ register: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@gafus/core/services/trainerCourse", () => ({ registerTrainerCourseRowsPort: registry.register }));
vi.mock("@gafus/course-progress-server/trainer-course-rows", () => ({
  createTrainerCourseRow: registry.create,
  updateTrainerCourseRows: registry.update,
  readCourseRowLogo: vi.fn(), readCourseRowAuthor: vi.fn(), readCourseDraftRow: vi.fn(),
  readCourseRowVisibleAfterStale: vi.fn(), deleteTrainerCourseRowDependencies: vi.fn(),
  CourseVersionNoMatch: class CourseVersionNoMatch extends Error {},
}));
describe("Trainer course CAS SQL composition", () => {
  it("binds original transactional update and checks exact stale error class", async () => {
    await import("./install-trainer-course-rows");
    expect(registry.register).toHaveBeenCalledTimes(1);
    const port = registry.register.mock.calls[0]?.[0];
    const input = { id: "course-A", expectedVersion: 5 };
    const actor = { id: "trainer-A", role: "TRAINER" };
    registry.update.mockResolvedValueOnce(6);
    await expect(port.updateRows(input, actor, true)).resolves.toBe(6);
    expect(registry.update).toHaveBeenCalledExactlyOnceWith(input, actor, true);
    const { CourseVersionNoMatch } = await import("@gafus/course-progress-server/trainer-course-rows");
    expect(port.isVersionMismatch(new CourseVersionNoMatch())).toBe(true);
    expect(port.isVersionMismatch(new Error("COURSE_VERSION_UNEXPECTED_UPDATE"))).toBe(false);
  });
});
