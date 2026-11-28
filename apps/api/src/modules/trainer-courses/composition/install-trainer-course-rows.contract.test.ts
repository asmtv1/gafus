import { describe, expect, it, vi } from "vitest";
import { updateTrainerCourseSchema } from "@gafus/core/services/trainerCourse";
const registry = vi.hoisted(() => ({ register: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@gafus/course-progress-server/trainer-course-rows", () => ({
  createTrainerCourseRow: registry.create,
  updateTrainerCourseRows: registry.update,
  readCourseRowLogo: vi.fn(), readCourseRowAuthor: vi.fn(), readCourseDraftRow: vi.fn(),
  readCourseRowVisibleAfterStale: vi.fn(), deleteTrainerCourseRowDependencies: vi.fn(),
  CourseVersionNoMatch: class CourseVersionNoMatch extends Error {},
}));
describe("Trainer course CAS SQL composition", () => {
  it("binds original transactional update and checks exact stale error class", async () => {
    const { trainerCourseRows: port } = await import("./trainer-course-rows-instance");
    const input = updateTrainerCourseSchema.parse({ id: "course-A", expectedVersion: 5, name: "QA course", duration: "7 дней", logoImg: "", isPublic: false });
    const actor = { id: "trainer-A", role: "TRAINER" };
    registry.update.mockResolvedValueOnce(6);
    await expect(port.updateRows(input, actor, true)).resolves.toBe(6);
    expect(registry.update).toHaveBeenCalledExactlyOnceWith(input, actor, true);
    const { CourseVersionNoMatch } = await import("@gafus/course-progress-server/trainer-course-rows");
    expect(port.isVersionMismatch(new CourseVersionNoMatch())).toBe(true);
    expect(port.isVersionMismatch(new Error("COURSE_VERSION_UNEXPECTED_UPDATE"))).toBe(false);
  });
});
