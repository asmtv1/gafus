/** AG1-COURSE-030: atomic owner/key favorite add under overlapping mock calls. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { favoriteCourse: {
    findUnique: m.findUnique,
    create: m.create,
    createMany: m.createMany,
    deleteMany: m.deleteMany,
  } },
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
vi.mock("../contentAccess/policy", () => ({ resolveCourseEntitlement: vi.fn() }));
import { addFavoriteCourse, removeFavoriteCourse } from "./favoriteService";

describe("AG1-COURSE-030 atomic favorite add/remove", () => {
  const keys = new Set<string>();
  const key = (userId: string, courseId: string) => `${userId}\0${courseId}`;
  beforeEach(() => {
    vi.clearAllMocks();
    keys.clear();
    m.findUnique.mockImplementation(async ({ where }: {
      where: { userId_courseId: { userId: string; courseId: string } };
    }) => keys.has(key(where.userId_courseId.userId, where.userId_courseId.courseId)));
    m.create.mockImplementation(async ({ data }: {
      data: { userId: string; courseId: string };
    }) => {
      const k = key(data.userId, data.courseId);
      if (keys.has(k)) throw Object.assign(new Error("unique violation"), { code: "P2002" });
      keys.add(k);
    });
    m.createMany.mockImplementation(async ({ data, skipDuplicates }: {
      data: { userId: string; courseId: string }[];
      skipDuplicates: boolean;
    }) => {
      expect(skipDuplicates).toBe(true);
      let count = 0;
      for (const row of data) {
        const k = key(row.userId, row.courseId);
        if (!keys.has(k)) { keys.add(k); count++; }
      }
      return { count };
    });
    m.deleteMany.mockImplementation(async ({ where }: {
      where: { userId: string; courseId: string };
    }) => ({ count: Number(keys.delete(key(where.userId, where.courseId))) }));
  });

  it("concurrent repeated ADD is one owner-scoped write with no uniqueness conflict", async () => {
    await Promise.all(Array.from({ length: 8 }, () => addFavoriteCourse("owner-A", "course-1")));
    expect([...keys]).toEqual([key("owner-A", "course-1")]);
    expect(m.createMany).toHaveBeenCalledTimes(8);
    expect(m.createMany).toHaveBeenCalledWith({
      data: [{ userId: "owner-A", courseId: "course-1" }],
      skipDuplicates: true,
    });
    expect(m.findUnique).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("owner-B favorite is not altered by retry ADD/REMOVE from owner-A", async () => {
    await addFavoriteCourse("owner-B", "course-1");
    await addFavoriteCourse("owner-A", "course-1");
    await addFavoriteCourse("owner-A", "course-1");
    await removeFavoriteCourse("owner-A", "course-1");
    await removeFavoriteCourse("owner-A", "course-1");
    expect([...keys]).toEqual([key("owner-B", "course-1")]);
    expect(m.deleteMany).toHaveBeenCalledWith({
      where: { userId: "owner-A", courseId: "course-1" },
    });
  });
});
