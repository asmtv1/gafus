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

const mockCourseFindMany = vi.fn();
const mockCourseFindUnique = vi.fn();
const mockCourseFindFirst = vi.fn();
const mockCourseUpdate = vi.fn();
const mockUserCourseFindMany = vi.fn();
const mockFavoriteCourseFindMany = vi.fn();
const mockHandlePrismaError = vi.fn();

// Detailed entitlement matrix is tested separately in contentAccess/policy.test.ts.
vi.mock("../contentAccess/policy", () => ({
  resolveCourseEntitlement: async (course: {
    isPrivate: boolean; isPaid: boolean; access?: unknown[];
  } | null, userId?: string) => ({
    allowed: Boolean(course && (
      course.isPrivate ? userId && (course.access?.length ?? 0) > 0
      : !course.isPaid || userId === "subscriber"
    )),
  }),
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
