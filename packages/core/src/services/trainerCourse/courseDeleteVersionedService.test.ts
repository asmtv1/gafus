import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCourseVersioned } from "./courseDeleteVersionedService";

const m = vi.hoisted(() => ({
  rows: [] as { id: string; version: number; logoImg: string }[],
  query: vi.fn(),
  courseAccess: vi.fn(), favoriteCourse: vi.fn(), courseReview: vi.fn(),
  userCourse: vi.fn(), dayOnCourse: vi.fn(), course: vi.fn(),
  cache: vi.fn(), publish: vi.fn(async () => undefined),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: m.query,
        courseAccess: { deleteMany: m.courseAccess },
        favoriteCourse: { deleteMany: m.favoriteCourse },
        courseReview: { deleteMany: m.courseReview },
        userCourse: { deleteMany: m.userCourse },
        dayOnCourse: { deleteMany: m.dayOnCourse },
        course: { deleteMany: m.course },
      }),
  },
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateCourseContentCache: m.cache,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: m.publish,
}));
const actor = { id: "trainer_1", role: "TRAINER" as const };
const id = "course_1";
beforeEach(() => {
  vi.clearAllMocks();
  m.query.mockResolvedValue([{ id, version: 3, logoImg: "https://cdn.invalid/img.jpg" }]);
  for (const mock of [
    m.courseAccess, m.favoriteCourse, m.courseReview, m.userCourse, m.dayOnCourse,
  ]) mock.mockResolvedValue({ count: 1 });
  m.course.mockResolvedValue({ count: 1 });
});
describe("atomic owner-scoped course deletion with version match", () => {
  it("does not delete dependencies for stale version", async () => {
    expect(await deleteCourseVersioned(id, 2, actor)).toEqual({ status: "stale" });
    expect(m.courseAccess).not.toHaveBeenCalled();
    expect(m.cache).not.toHaveBeenCalled();
  });
  it("does not delete a missing or foreign course", async () => {
    m.query.mockResolvedValueOnce([]);
    expect(await deleteCourseVersioned(id, 3, actor)).toEqual({ status: "not_found" });
    expect(m.course).not.toHaveBeenCalled();
  });
  it("deletes all relation groups and owner course only within scoped transaction", async () => {
    expect(await deleteCourseVersioned(id, 3, actor)).toEqual({
      status: "deleted", logoImg: "https://cdn.invalid/img.jpg",
    });
    expect(m.courseAccess).toHaveBeenCalledWith({ where: { courseId: id } });
    expect(m.favoriteCourse).toHaveBeenCalledWith({ where: { courseId: id } });
    expect(m.courseReview).toHaveBeenCalledWith({ where: { courseId: id } });
    expect(m.userCourse).toHaveBeenCalledWith({ where: { courseId: id } });
    expect(m.dayOnCourse).toHaveBeenCalledWith({ where: { courseId: id } });
    expect(m.course).toHaveBeenCalledWith({
      where: { id, authorId: actor.id },
    });
    expect(m.cache).toHaveBeenCalledWith(id);
    expect(m.publish).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid IDs/versions before querying database", async () => {
    expect((await deleteCourseVersioned("../escape", 3, actor)).status).toBe("invalid");
    expect((await deleteCourseVersioned(id, 0, actor)).status).toBe("invalid");
    expect(m.query).not.toHaveBeenCalled();
  });
  it("fails closed if delete count races, no committed-success cache publication", async () => {
    m.course.mockResolvedValueOnce({ count: 0 });
    expect(await deleteCourseVersioned(id, 3, actor)).toEqual({ status: "unknown" });
    expect(m.cache).not.toHaveBeenCalled();
    expect(m.publish).not.toHaveBeenCalled();
  });
});
