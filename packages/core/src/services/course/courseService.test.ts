import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  checkCourseAccess,
  checkCourseAccessById,
  deleteCourseLogoFromRecord,
  getCourseMetadata,
  getCourseOutline,
  getCoursesWithProgress,
  updateCourseLogoUrl,
} from "./courseService";
// The original Prisma projections remain authoritative but are now bound
// at the Core/application boundary; existing wire/owner assertions unchanged.
import { registerCatalogReadPort } from "./catalogReadPort";
import {
  readCatalogCourseRows, readCatalogProgressRows, readCatalogFavoriteRows,
  readCourseAccessByType, readCourseAccessById,
  readCourseMetadataRow, readCourseOutlineRow,
} from "@gafus/course-read-server/legacy-catalog-rows";
registerCatalogReadPort({
  readCatalogCourseRows, readCatalogProgressRows, readCatalogFavoriteRows,
  readCourseAccessByType, readCourseAccessById,
  readCourseMetadataRow, readCourseOutlineRow,
});


const mockCourseFindMany = vi.fn();
const mockCourseFindUnique = vi.fn();
const mockCourseFindFirst = vi.fn();
const mockCourseUpdate = vi.fn();
const mockUserCourseFindMany = vi.fn();
const mockFavoriteCourseFindMany = vi.fn();
const mockHandlePrismaError = vi.fn();
const mockSetCourseLogoVersioned = vi.fn();

// Detailed entitlement matrix is tested separately in contentAccess/policy.test.ts.
vi.mock("../contentAccess/policy", () => ({
  resolveCourseEntitlement: async (
    course: {
      isPrivate: boolean;
      isPaid: boolean;
      access?: unknown[];
    } | null,
    userId?: string,
  ) => ({
    allowed: Boolean(
      course &&
        (course.isPrivate
          ? userId && (course.access?.length ?? 0) > 0
          : !course.isPaid || userId === "subscriber"),
    ),
  }),
}));

vi.mock("../trainerCourse/courseVersionService", () => ({
  setCourseLogoVersioned: (...args: unknown[]) => mockSetCourseLogoVersioned(...args),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findMany: (...args: unknown[]) => mockCourseFindMany(...args),
      findUnique: (...args: unknown[]) => mockCourseFindUnique(...args),
      findFirst: (...args: unknown[]) => mockCourseFindFirst(...args),
      update: (...args: unknown[]) => mockCourseUpdate(...args),
    },
    userCourse: {
      findMany: (...args: unknown[]) => mockUserCourseFindMany(...args),
    },
    favoriteCourse: {
      findMany: (...args: unknown[]) => mockFavoriteCourseFindMany(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/core/errors", () => ({
  handlePrismaError: (...args: unknown[]) => mockHandlePrismaError(...args),
}));

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

describe("checkCourseAccessById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("без userId: платный курс — нет доступа", async () => {
    mockCourseFindUnique.mockResolvedValue({ isPrivate: false, isPaid: true });

    await expect(checkCourseAccessById("c1", undefined)).resolves.toEqual({
      hasAccess: false,
    });
  });

  it("без userId: публичный бесплатный — доступ есть", async () => {
    mockCourseFindUnique.mockResolvedValue({ isPrivate: false, isPaid: false });

    await expect(checkCourseAccessById("c1", undefined)).resolves.toEqual({
      hasAccess: true,
    });
  });

  it("с userId: приватный с записью в access", async () => {
    mockCourseFindUnique.mockResolvedValue({
      isPrivate: true,
      isPaid: false,
      access: [{ userId: "u1" }],
    });

    await expect(checkCourseAccessById("c1", "u1")).resolves.toEqual({
      hasAccess: true,
    });
  });

  it("курс не найден", async () => {
    mockCourseFindUnique.mockResolvedValue(null);

    await expect(checkCourseAccessById("x", "u1")).resolves.toEqual({
      hasAccess: false,
    });
  });
});

describe("getCoursesWithProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserCourseFindMany.mockResolvedValue([]);
    mockFavoriteCourseFindMany.mockResolvedValue([]);
  });

  it("публичный курс попадает в выдачу", async () => {
    mockCourseFindMany.mockResolvedValue([minimalCourse()]);

    const rows = await getCoursesWithProgress("u1");

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c1");
    expect(rows[0].hasAccess).toBe(true);
  });

  it("использует агрегированное число начавших, не загружая участников курса", async () => {
    mockCourseFindMany.mockResolvedValue([
      minimalCourse({
        _count: { userCourses: 2 },
      }),
    ]);
    mockUserCourseFindMany.mockResolvedValue([]);
    mockFavoriteCourseFindMany.mockResolvedValue([]);

    const result = await getCoursesWithProgress("u1");

    expect(result[0]?.startedUsersCount).toBe(2);
  });

  it("G1 private favorite membership: only current actor; anonymous sees no member IDs", async () => {
    const privateRow = minimalCourse({
      id: "course-privacy",
      isPrivate: false,
      favoritedBy: [{ userId: "viewer" }, { userId: "FOREIGN_MEMBER_SECRET" }],
    });
    mockCourseFindMany.mockResolvedValue([privateRow]);
    mockUserCourseFindMany.mockResolvedValue([]);
    mockFavoriteCourseFindMany.mockResolvedValue([{ courseId: "course-privacy" }]);

    const signed = await getCoursesWithProgress("viewer");
    expect(signed).toHaveLength(1);
    expect(signed[0]).toMatchObject({
      isFavorite: true,
      favoritedBy: [{ userId: "viewer" }],
    });
    expect(JSON.stringify(signed)).not.toContain("FOREIGN_MEMBER_SECRET");
    expect(mockCourseFindMany.mock.calls[0][0].select.favoritedBy).toEqual({
      where: { userId: "viewer" },
      select: { userId: true },
    });

    mockCourseFindMany.mockClear();
    const guest = await getCoursesWithProgress();
    expect(guest).toHaveLength(1);
    expect(guest[0]).toMatchObject({ isFavorite: false, favoritedBy: [] });
    expect(JSON.stringify(guest)).not.toContain("FOREIGN_MEMBER_SECRET");
    expect(mockCourseFindMany.mock.calls[0][0].select.favoritedBy).toEqual({
      where: { userId: "" },
      select: { userId: true },
    });
  });

  it("узкий nested select: несколько дней/шагов, nullable отзывы, исходный порядок и DTO", async () => {
    const reviewedAt = new Date("2026-08-07T12:30:00.000Z");
    const laterReviewAt = new Date("2026-09-01T09:15:00.000Z");
    const favoritedBy = [{ userId: "u1" }];
    mockCourseFindMany.mockResolvedValue([
      minimalCourse({
        id: "nested-c",
        author: { username: "author", profile: { avatarUrl: "/author.png" } },
        favoritedBy,
        reviews: [
          {
            rating: null,
            comment: null,
            createdAt: reviewedAt,
            user: { username: "first-reviewer", profile: null },
          },
          {
            rating: 4.5,
            comment: "Хорошо",
            createdAt: laterReviewAt,
            user: { username: "second-reviewer", profile: { avatarUrl: "/review.png" } },
          },
        ],
        dayLinks: [
          {
            id: "dl-2",
            order: 20,
            day: {
              id: "day-2",
              title: "Второй",
              stepLinks: [
                { id: "sl-2", order: 2, step: { title: "Второй шаг" } },
                { id: "sl-1", order: 1, step: { title: "Первый шаг" } },
              ],
            },
          },
          {
            id: "dl-1",
            order: 10,
            day: { id: "day-1", title: "Первый", stepLinks: [] },
          },
        ],
        _count: { userCourses: 7 },
      }),
    ]);
    mockFavoriteCourseFindMany.mockResolvedValue([{ courseId: "nested-c" }]);

    const rows = await getCoursesWithProgress("u1");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "nested-c",
      authorUsername: "author",
      authorAvatarUrl: "/author.png",
      userStatus: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      startedUsersCount: 7,
      isFavorite: true,
      hasAccess: true,
      userCourses: [],
    });
    expect(rows[0].reviews).toEqual([
      {
        rating: 0,
        comment: "",
        createdAt: reviewedAt,
        user: { username: "first-reviewer", profile: null },
      },
      {
        rating: 4.5,
        comment: "Хорошо",
        createdAt: laterReviewAt,
        user: { username: "second-reviewer", profile: { avatarUrl: "/review.png" } },
      },
    ]);
    expect(rows[0].dayLinks).toEqual([
      {
        id: "dl-2",
        order: 20,
        day: {
          id: "day-2",
          title: "Второй",
          stepLinks: [
            { id: "sl-2", order: 2, step: { title: "Второй шаг" } },
            { id: "sl-1", order: 1, step: { title: "Первый шаг" } },
          ],
        },
      },
      {
        id: "dl-1",
        order: 10,
        day: { id: "day-1", title: "Первый", stepLinks: [] },
      },
    ]);
    expect(rows[0]).toHaveProperty("favoritedBy", favoritedBy);

    expect(mockCourseFindMany).toHaveBeenCalledOnce();
    const query = mockCourseFindMany.mock.calls[0][0];
    expect(query).toEqual({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        shortDesc: true,
        duration: true,
        logoImg: true,
        isPrivate: true,
        isPaid: true,
        avgRating: true,
        trainingLevel: true,
        equipment: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            username: true,
            profile: { select: { avatarUrl: true } },
          },
        },
        reviews: {
          select: {
            rating: true,
            comment: true,
            createdAt: true,
            user: {
              select: {
                username: true,
                profile: { select: { avatarUrl: true } },
              },
            },
          },
        },
        favoritedBy: { where: { userId: "u1" }, select: { userId: true } },
        _count: {
          select: {
            userCourses: {
              where: { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
            },
          },
        },
        dayLinks: {
          select: {
            id: true,
            order: true,
            day: {
              select: {
                id: true,
                title: true,
                stepLinks: {
                  select: {
                    id: true,
                    order: true,
                    step: { select: { title: true } },
                  },
                },
              },
            },
          },
        },
        access: { where: { userId: "u1" }, select: { userId: true } },
      },
    });
  });

  it("несколько курсов: прогресс по id, отсутствие прогресса и порядок не меняются", async () => {
    mockCourseFindMany.mockResolvedValue([
      minimalCourse({ id: "c3", name: "Без прогресса" }),
      minimalCourse({ id: "c2", name: "В процессе" }),
      minimalCourse({ id: "c1", name: "Завершён" }),
    ]);
    const c2Started = new Date("2026-10-01T09:00:00.000Z");
    const c1Started = new Date("2026-09-01T09:00:00.000Z");
    const c1Completed = new Date("2026-10-10T09:00:00.000Z");
    mockUserCourseFindMany.mockResolvedValue([
      { courseId: "c2", status: "IN_PROGRESS", startedAt: c2Started, completedAt: null },
      { courseId: "c1", status: "COMPLETED", startedAt: c1Started, completedAt: c1Completed },
    ]);
    mockFavoriteCourseFindMany.mockResolvedValue([{ courseId: "c2" }]);

    const rows = await getCoursesWithProgress("u1");

    expect(rows.map(({ id }) => id)).toEqual(["c3", "c2", "c1"]);
    expect(rows.map(({ userStatus }) => userStatus)).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
    expect(rows.map(({ startedAt }) => startedAt)).toEqual([null, c2Started, c1Started]);
    expect(rows.map(({ completedAt }) => completedAt)).toEqual([null, null, c1Completed]);
    expect(rows.map(({ isFavorite }) => isFavorite)).toEqual([false, true, false]);
    expect(rows.every(({ hasAccess }) => hasAccess)).toBe(true);
    expect(mockUserCourseFindMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "u1" },
      select: {
        courseId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });
  });

  it("дублирующийся progress courseId: первый ответ Prisma выигрывает как Array.find", async () => {
    mockCourseFindMany.mockResolvedValue([minimalCourse({ id: "c1" })]);
    const firstStarted = new Date("2026-09-01T00:00:00.000Z");
    const firstCompleted = new Date("2026-10-01T00:00:00.000Z");
    mockUserCourseFindMany.mockResolvedValue([
      {
        courseId: "c1",
        status: "COMPLETED",
        startedAt: firstStarted,
        completedAt: firstCompleted,
      },
      {
        courseId: "c1",
        status: "IN_PROGRESS",
        startedAt: new Date("2026-10-20T00:00:00.000Z"),
        completedAt: null,
      },
    ]);

    const rows = await getCoursesWithProgress("u1");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "c1",
      userStatus: "COMPLETED",
      startedAt: firstStarted,
      completedAt: firstCompleted,
    });
  });

  it("приватный курс скрыт без userId", async () => {
    mockCourseFindMany.mockResolvedValue([minimalCourse({ isPrivate: true, access: [] })]);

    const rows = await getCoursesWithProgress(undefined);

    expect(rows).toHaveLength(0);
  });

  it("приватный курс виден при наличии доступа", async () => {
    mockCourseFindMany.mockResolvedValue([
      minimalCourse({
        isPrivate: true,
        access: [{ userId: "u1" }],
      }),
    ]);

    const rows = await getCoursesWithProgress("u1");

    expect(rows).toHaveLength(1);
  });
});

describe("checkCourseAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("по type без userId: платный — false", async () => {
    mockCourseFindUnique.mockResolvedValue({ isPrivate: false, isPaid: true });

    await expect(checkCourseAccess("t1", undefined)).resolves.toEqual({
      hasAccess: false,
    });
  });

  it("по type с userId и доступом", async () => {
    mockCourseFindUnique.mockResolvedValue({
      id: "c1",
      isPrivate: true,
      isPaid: true,
      access: [{ userId: "u1" }],
    });

    await expect(checkCourseAccess("t1", "u1")).resolves.toEqual({ hasAccess: true });
  });
});

describe("getCourseMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает поля курса или undefined", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "c1",
      name: "Курс",
      shortDesc: "Кратко",
      logoImg: "",
      description: "D",
      isPaid: false,
      isPrivate: false,
      priceRub: null,
      videoUrl: null,
      equipment: "",
      trainingLevel: "BEGINNER",
    });

    const meta = await getCourseMetadata("type-1");

    expect(meta?.name).toBe("Курс");
  });
});

describe("getCourseOutline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("пустой массив если курс не найден", async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    await expect(getCourseOutline("missing")).resolves.toEqual([]);
  });

  it("возвращает дни по порядку", async () => {
    mockCourseFindFirst.mockResolvedValue({
      dayLinks: [
        { id: "day1", order: 1, day: { title: "День 1", type: "regular", equipment: "Поводок", stepLinks: [{step: {type: "TRAINING", durationSec: 600}}] } },
        { id: "day2", order: 2, day: { title: "День 2", type: "introduction", equipment: "", stepLinks: [{step: {type: "THEORY", estimatedDurationSec: 120}}] } },
      ],
    });

    await expect(getCourseOutline("t1")).resolves.toEqual([
      { id: "day1", title: "День 1", order: 1, type: "regular", equipment: "Поводок", estimatedDuration: 10, theoryMinutes: 0 },
      { id: "day2", title: "День 2", order: 2, type: "introduction", equipment: "", estimatedDuration: 0, theoryMinutes: 2 },
    ]);
  });
});

describe("updateCourseLogoUrl / deleteCourseLogoFromRecord versioned CAS adapter", () => {
  const actor = { id: "trainer-1", role: "TRAINER" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unknown or foreign course maps to NOT_FOUND without Prisma mutation", async () => {
    mockSetCourseLogoVersioned.mockResolvedValue({ status: "not_found" });
    const result = await updateCourseLogoUrl("c1", "https://cdn/l.png", 7, actor);
    expect(result).toEqual({ success: false, code: "NOT_FOUND", error: "Курс не найден" });
    expect(mockSetCourseLogoVersioned).toHaveBeenCalledExactlyOnceWith(
      { courseId: "c1", logoUrl: "https://cdn/l.png", expectedVersion: 7 },
      actor,
    );
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it("CAS success preserves previous logo and returns the new course version", async () => {
    mockSetCourseLogoVersioned.mockResolvedValue({
      status: "updated",
      data: { previousLogoUrl: "https://old/logo.png", version: 8 },
    });
    const result = await updateCourseLogoUrl("c1", "https://new/logo.png", 7, actor);
    expect(result).toEqual({
      success: true,
      previousLogoUrl: "https://old/logo.png",
      version: 8,
    });
    expect(mockSetCourseLogoVersioned).toHaveBeenCalledExactlyOnceWith(
      { courseId: "c1", logoUrl: "https://new/logo.png", expectedVersion: 7 },
      actor,
    );
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it("delete uses same versioned CAS with empty logo URL", async () => {
    mockSetCourseLogoVersioned.mockResolvedValue({
      status: "updated",
      data: { previousLogoUrl: "https://old/a.png", version: 11 },
    });
    const result = await deleteCourseLogoFromRecord("c1", 10, actor);
    expect(result).toEqual({
      success: true,
      previousLogoUrl: "https://old/a.png",
      version: 11,
    });
    expect(mockSetCourseLogoVersioned).toHaveBeenCalledExactlyOnceWith(
      { courseId: "c1", logoUrl: "", expectedVersion: 10 },
      actor,
    );
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it("stale CAS denies update without a false success", async () => {
    mockSetCourseLogoVersioned.mockResolvedValue({ status: "stale" });
    const result = await updateCourseLogoUrl("c1", "https://new/a.png", 1, actor);
    expect(result).toEqual({
      success: false,
      code: "STALE_VERSION",
      error: "Версия курса устарела",
    });
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it("invalid version remains rejected and never reported as success", async () => {
    mockSetCourseLogoVersioned.mockResolvedValue({ status: "invalid" });
    const result = await updateCourseLogoUrl("c1", "https://new/a.png", 0, actor);
    expect(result).toEqual({
      success: false,
      code: "BAD_QUERY",
      error: "Требуется актуальная версия курса",
    });
  });

  it("unrecognized CAS result fails closed without claiming a Prisma error contract", async () => {
    mockSetCourseLogoVersioned.mockResolvedValue({ status: "unknown" });
    const result = await updateCourseLogoUrl("c1", "https://new/a.png", 7, actor);
    expect(result).toEqual({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      error: "Результат обновления курса неизвестен",
    });
  });
});
