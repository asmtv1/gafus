import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCatalogCourseRows,
  readCatalogFavoriteRows,
  readCatalogProgressRows,
  readCourseAccessById,
  readCourseAccessByType,
  readCourseMetadataRow,
  readCourseOutlineRow,
} from "./legacyCatalogRows";

const mocks = vi.hoisted(() => ({
  courses: vi.fn(),
  byUnique: vi.fn(),
  byFirst: vi.fn(),
  progress: vi.fn(),
  favorites: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findMany: mocks.courses,
      findUnique: mocks.byUnique,
      findFirst: mocks.byFirst,
    },
    userCourse: { findMany: mocks.progress },
    favoriteCourse: { findMany: mocks.favorites },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.courses.mockResolvedValue([]);
  mocks.progress.mockResolvedValue([]);
  mocks.favorites.mockResolvedValue([]);
});

describe("legacy course catalog read repository", () => {
  it("reads only actor-scoped access and favorites in a shared public catalog", async () => {
    await readCatalogCourseRows("actor-1");
    expect(mocks.courses).toHaveBeenCalledOnce();
    const { select } = mocks.courses.mock.calls[0]![0];
    expect(select.access).toEqual({ where: { userId: "actor-1" }, select: { userId: true } });
    expect(select.favoritedBy).toEqual({ where: { userId: "actor-1" }, select: { userId: true } });
    expect(select.userCourses).toBeUndefined();
    expect(select.dayLinks.select.day.select.stepLinks.select.step.select).toEqual({ title: true });
  });

  it("never reads unscoped access, favorite or progress for anonymous catalog", async () => {
    await readCatalogCourseRows();
    const { select } = mocks.courses.mock.calls[0]![0];
    expect(select.access.where.userId).toBe("");
    expect(select.favoritedBy.where.userId).toBe("");
    await expect(readCatalogProgressRows()).resolves.toEqual([]);
    await expect(readCatalogFavoriteRows()).resolves.toEqual([]);
    expect(mocks.progress).not.toHaveBeenCalled();
    expect(mocks.favorites).not.toHaveBeenCalled();
  });

  it("scopes progress and favorites by actor, projecting only course state", async () => {
    await readCatalogProgressRows("actor-1");
    await readCatalogFavoriteRows("actor-1");
    expect(mocks.progress).toHaveBeenCalledWith({
      where: { userId: "actor-1" },
      select: { courseId: true, status: true, startedAt: true, completedAt: true },
    });
    expect(mocks.favorites).toHaveBeenCalledWith({
      where: { userId: "actor-1" }, select: { courseId: true },
    });
  });

  it("projects only course entitlement flags and never membership lists", async () => {
    await readCourseAccessByType("public-type");
    await readCourseAccessById("course-id");
    expect(mocks.byUnique).toHaveBeenNthCalledWith(1, {
      where: { type: "public-type" },
      select: { id: true, isPrivate: true, isPaid: true },
    });
    expect(mocks.byUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "course-id" },
      select: { id: true, isPrivate: true, isPaid: true },
    });
  });

  it("reads metadata and public outline without learner progress or media secrets", async () => {
    await readCourseMetadataRow("type-1");
    await readCourseOutlineRow("type-1");
    const meta = mocks.byFirst.mock.calls[0]![0];
    expect(meta.where).toEqual({ type: "type-1" });
    expect(Object.keys(meta.select).sort()).toEqual([
      "description", "equipment", "id", "isPaid", "isPrivate", "logoImg",
      "name", "shortDesc", "trainingLevel", "videoUrl",
    ].sort());
    const outline = mocks.byFirst.mock.calls[1]![0];
    expect(outline.where).toEqual({ type: "type-1" });
    expect(outline.select.dayLinks.orderBy).toEqual({ order: "asc" });
    expect(outline.select.dayLinks.select.day.select.stepLinks.select.step.select).toEqual({
      type: true, durationSec: true, estimatedDurationSec: true,
    });
  });
});
