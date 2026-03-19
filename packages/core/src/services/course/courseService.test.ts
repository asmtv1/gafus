import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  checkCourseAccess,
  checkCourseAccessById,
  deleteCourseLogoFromRecord,
  getAllCoursesForCache,
  getCourseByIdOrType,
  getCourseMetadata,
  getCourseOutline,
  getCoursesWithProgress,
  getUserCoursesProgressForCache,
  updateCourseLogoUrl,
} from "./courseService";

const mockCourseFindMany = vi.fn();
const mockCourseFindUnique = vi.fn();
const mockCourseFindFirst = vi.fn();
const mockCourseUpdate = vi.fn();
const mockUserCourseFindMany = vi.fn();
const mockFavoriteCourseFindMany = vi.fn();
const mockHandlePrismaError = vi.fn();

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
    userCourses: [],
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

  it("приватный курс скрыт без userId", async () => {
    mockCourseFindMany.mockResolvedValue([minimalCourse({ isPrivate: true, access: [] })]);

    const rows = await getCoursesWithProgress(undefined);

    expect(rows).toHaveLength(0);
  });

  it("приватный курс виден при наличии доступа", async () => {
    mockCourseFindMany.mockResolvedValue([
      minimalCourse({
        isPrivate: true,
        access: [{ user: { id: "u1" } }],
      }),
    ]);

    const rows = await getCoursesWithProgress("u1");

    expect(rows).toHaveLength(1);
  });
});

function courseForCache() {
  return {
    id: "c-cache",
    name: "N",
    type: "type-x",
    description: "d",
    shortDesc: "s",
    duration: "7",
    logoImg: "",
    isPrivate: false,
    avgRating: 4.5 as number | null,
    createdAt: new Date("2024-06-01"),
    author: { username: "author", profile: { avatarUrl: "https://a/u.png" as string | null } },
    reviews: [
      {
        rating: 5,
        comment: "ok",
        createdAt: new Date(),
        user: { username: "u", profile: { avatarUrl: null as string | null } },
      },
    ],
    access: [{ user: { id: "u1" } }],
    dayLinks: [
      {
        order: 1,
        day: {
          id: "d1",
          title: "День 1",
          stepLinks: [{ id: "sl1", order: 1, step: { title: "Шаг" } }],
        },
      },
    ],
  };
}

describe("getAllCoursesForCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("маппинг курсов для кэша", async () => {
    mockCourseFindMany.mockResolvedValue([courseForCache()]);

    const r = await getAllCoursesForCache();

    expect(r.success).toBe(true);
    if (r.success && r.data) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].authorUsername).toBe("author");
      expect(r.data[0].dayLinks[0].day.title).toBe("День 1");
    }
  });

  it("ошибка при сбое запроса", async () => {
    mockCourseFindMany.mockRejectedValue(new Error("db fail"));

    const r = await getAllCoursesForCache();

    expect(r.success).toBe(false);
    expect(r.error).toContain("db fail");
  });
});

describe("getUserCoursesProgressForCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("без userId — пустые данные без запросов", async () => {
    const r = await getUserCoursesProgressForCache(null);

    expect(r.success).toBe(true);
    if (r.success && r.data) {
      expect(r.data.userCourses).toEqual([]);
      expect(r.data.favoriteCourseIds).toEqual([]);
    }
    expect(mockUserCourseFindMany).not.toHaveBeenCalled();
  });

  it("с userId — агрегирует курсы и избранное", async () => {
    mockUserCourseFindMany.mockResolvedValue([
      {
        courseId: "c1",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        completedAt: null,
      },
    ]);
    mockFavoriteCourseFindMany.mockResolvedValue([{ courseId: "c1" }, { courseId: "c2" }]);

    const r = await getUserCoursesProgressForCache("u1");

    expect(r.success).toBe(true);
    if (r.success && r.data) {
      expect(r.data.userCourses).toHaveLength(1);
      expect(r.data.favoriteCourseIds).toEqual(["c1", "c2"]);
    }
  });
});

describe("getCourseByIdOrType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("null если нет параметров", async () => {
    await expect(getCourseByIdOrType()).resolves.toBeNull();
    expect(mockCourseFindFirst).not.toHaveBeenCalled();
  });

  it("поиск по id", async () => {
    mockCourseFindFirst.mockResolvedValue({ id: "cid", type: "t1" });

    await expect(getCourseByIdOrType("cid", undefined)).resolves.toEqual({
      id: "cid",
      type: "t1",
    });
    expect(mockCourseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cid" } }),
    );
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
        { order: 1, day: { title: "День 1" } },
        { order: 2, day: { title: "День 2" } },
      ],
    });

    await expect(getCourseOutline("t1")).resolves.toEqual([
      { title: "День 1", order: 1 },
      { title: "День 2", order: 2 },
    ]);
  });
});

describe("updateCourseLogoUrl / deleteCourseLogoFromRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseUpdate.mockResolvedValue({});
  });

  it("updateCourseLogoUrl: курс не найден", async () => {
    mockCourseFindUnique.mockResolvedValue(null);

    const r = await updateCourseLogoUrl("c1", "https://cdn/l.png");

    expect(r.success).toBe(false);
    expect(mockCourseUpdate).not.toHaveBeenCalled();
  });

  it("updateCourseLogoUrl: успех и previousLogoUrl", async () => {
    mockCourseFindUnique.mockResolvedValue({ logoImg: "https://old/logo.png" });

    const r = await updateCourseLogoUrl("c1", "https://new/logo.png");

    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.previousLogoUrl).toBe("https://old/logo.png");
    }
    expect(mockCourseUpdate).toHaveBeenCalled();
  });

  it("deleteCourseLogoFromRecord: успех", async () => {
    mockCourseFindUnique.mockResolvedValue({ logoImg: "https://x/a.png" });

    const r = await deleteCourseLogoFromRecord("c1");

    expect(r.success).toBe(true);
    expect(mockCourseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { logoImg: "" },
      }),
    );
  });

  it("updateCourseLogoUrl: handlePrismaError при коде Prisma", async () => {
    mockCourseFindUnique.mockResolvedValue({ logoImg: "" });
    mockCourseUpdate.mockRejectedValue(Object.assign(new Error("e"), { code: "P2025" }));
    mockHandlePrismaError.mockImplementation(() => {
      throw new Error("Курс не найден");
    });

    const r = await updateCourseLogoUrl("c1", "https://n.png");

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toContain("не найден");
    }
  });
});
