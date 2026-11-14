import {describe,it,expect,beforeEach,vi} from "vitest";
const mockCourseFindMany=vi.hoisted(()=>vi.fn());
const mockUserCourseFindMany=vi.hoisted(()=>vi.fn());
const mockFavoriteCourseFindMany=vi.hoisted(()=>vi.fn());
vi.mock("@gafus/prisma",()=>({prisma:{
 course:{findMany:mockCourseFindMany},
 favoriteCourse:{findMany:mockFavoriteCourseFindMany},
 userCourse:{findMany:mockUserCourseFindMany},
}}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({
 info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn(),
})}));
import {getFavoritesCourses} from "./favoriteService.js";
const premiumForActor = vi.fn(async (actorId:string)=>actorId==="subscriber");
function minimalCourse(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Курс",
    type: "t1",
    description: "",
    shortDesc: "",
    duration: "30",
    logoImg: "",
    isPrivate: false,
    isPaid: false,
    priceRub: null,
    avgRating: null,
    trainingLevel: "BEGINNER",
    equipment: "",
    createdAt: new Date(),
    author: { username: "a", profile: { avatarUrl: null } },
    reviews: [],
    favoritedBy: [],
    access: [],
    _count: { userCourses: 0 },
    dayLinks: [],
    ...overrides,
  };
}


describe("getFavoritesCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseFindMany.mockResolvedValue([]);
    mockUserCourseFindMany.mockResolvedValue([]);
    mockFavoriteCourseFindMany.mockResolvedValue([]);
  });

  it("несколько избранных: порядок, ids, количество и отсутствие прогресса сохраняются", async () => {
    const old = new Date("2026-10-01T09:00:00.000Z");
    const done = new Date("2026-10-18T12:00:00.000Z");
    mockFavoriteCourseFindMany.mockResolvedValue([
      { courseId: "c2" },
      { courseId: "missing" },
      { courseId: "c1" },
    ]);
    mockCourseFindMany.mockResolvedValue([
      minimalCourse({
        id: "c1",
        name: "Первый",
        _count: { userCourses: 2 }, // IN_PROGRESS + COMPLETED; NOT_STARTED excluded
        reviews: [
          {
            rating: null,
            comment: null,
            createdAt: old,
            user: { username: "private", profile: null },
          },
          { rating: 4, comment: "Комментарий", createdAt: done },
        ],
      }),
      minimalCourse({ id: "c2", name: "Без прогресса", _count: { userCourses: 0 } }),
    ]);
    mockUserCourseFindMany.mockResolvedValue([
      { courseId: "c1", status: "COMPLETED", startedAt: old, completedAt: done },
      { courseId: "unrelated", status: "IN_PROGRESS", startedAt: old, completedAt: null },
    ]);

    const result = await getFavoritesCourses("u1", premiumForActor);

    expect(result.favoriteIds).toEqual(["c2", "missing", "c1"]);
    expect(result.data.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(result.data.map((c) => c.userStatus)).toEqual(["COMPLETED", "NOT_STARTED"]);
    expect(result.data.map((c) => c.startedAt)).toEqual([old, null]);
    expect(result.data.map((c) => c.completedAt)).toEqual([done, null]);
    expect(result.data.map((c) => c.startedUsersCount)).toEqual([2, 0]);
    expect(result.data[0]?.reviews).toEqual([
      {
        rating: 0,
        comment: "",
        createdAt: old,
        user: { username: "", profile: null },
      },
      {
        rating: 4,
        comment: "Комментарий",
        createdAt: done,
        user: { username: "", profile: null },
      },
    ]);
    expect(result.data[1]?.reviews).toEqual([]);
    expect(result.data.map((c) => c.isFavorite)).toEqual([true, true]);
    expect(result.data.every((c) => c.hasAccess)).toBe(true);
    expect(mockCourseFindMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: { in: ["c2", "missing", "c1"] },
        OR: [{ isPrivate: false }, { access: { some: { userId: "u1" } } }],
      },
      select: expect.objectContaining({
        author: {
          select: {
            username: true,
            profile: { select: { avatarUrl: true } },
          },
        },
        reviews: { select: { rating: true, comment: true, createdAt: true } },
        access: { where: { userId: "u1" }, select: { userId: true } },
        _count: {
          select: {
            userCourses: {
              where: { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
            },
          },
        },
      }),
    });
    expect(mockFavoriteCourseFindMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "u1" },
      select: { courseId: true },
    });
    expect(mockUserCourseFindMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "u1" },
      select: { courseId: true, status: true, startedAt: true, completedAt: true },
    });
  });

  it("дубли progress courseId: первое совпадение сохраняет status/date/null", async () => {
    const startedAt = new Date("2026-09-15T09:00:00.000Z");
    mockFavoriteCourseFindMany.mockResolvedValue([{ courseId: "c1" }]);
    mockCourseFindMany.mockResolvedValue([minimalCourse({ id: "c1", _count: { userCourses: 0 } })]);
    mockUserCourseFindMany.mockResolvedValue([
      { courseId: "c1", status: "IN_PROGRESS", startedAt, completedAt: null },
      { courseId: "c1", status: "COMPLETED", startedAt, completedAt: new Date() },
    ]);

    const result = await getFavoritesCourses("u1", premiumForActor);

    expect(result.favoriteIds).toEqual(["c1"]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "c1",
      userStatus: "IN_PROGRESS",
      startedAt,
      completedAt: null,
      startedUsersCount: 0,
      isFavorite: true,
    });
  });
  it("пустое избранное: [] и счётчики не требуют загрузки дочерних rows", async () => {
    mockFavoriteCourseFindMany.mockResolvedValue([]);
    mockCourseFindMany.mockResolvedValue([]);
    mockUserCourseFindMany.mockResolvedValue([]);

    const result = await getFavoritesCourses("u1", premiumForActor);

    expect(result).toEqual({ data: [], favoriteIds: [] });
    expect(mockCourseFindMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: { in: [] },
        OR: [{ isPrivate: false }, { access: { some: { userId: "u1" } } }],
      },
      select: expect.objectContaining({
        reviews: { select: { rating: true, comment: true, createdAt: true } },
        _count: {
          select: {
            userCourses: { where: { status: { in: ["IN_PROGRESS", "COMPLETED"] } } },
          },
        },
      }),
    });
  });
});
