import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  canCreatePaidCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseDraftWithRelations,
} from "./trainerCourseService";
import { NotFoundError, ConflictError } from "../../errors/ServiceError";

const mockHandlePrismaError = vi.fn(() => {
  throw new NotFoundError("Курс");
});

vi.mock("@gafus/core/errors", () => ({
  handlePrismaError: (...args: unknown[]) => mockHandlePrismaError(...args),
}));

const mockCourseCreate = vi.fn();
const mockCourseFindUnique = vi.fn();
const mockCourseUpdate = vi.fn();
const mockCourseDelete = vi.fn();
const mockDayOnCourseFindMany = vi.fn();
const mockDayOnCourseUpdate = vi.fn();
const mockDayOnCourseDeleteMany = vi.fn();
const mockDayOnCourseCreateMany = vi.fn();
const mockCourseAccessFindMany = vi.fn();
const mockCourseAccessDeleteMany = vi.fn();
const mockCourseAccessCreate = vi.fn();
const mockCourseAccessCreateMany = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockFavoriteCourseDeleteMany = vi.fn();
const mockCourseReviewDeleteMany = vi.fn();
const mockUserCourseDeleteMany = vi.fn();

const txStub = {
  course: {
    create: (...args: unknown[]) => mockCourseCreate(...args),
    update: (...args: unknown[]) => mockCourseUpdate(...args),
  },
  dayOnCourse: {
    findMany: (...args: unknown[]) => mockDayOnCourseFindMany(...args),
    update: (...args: unknown[]) => mockDayOnCourseUpdate(...args),
    deleteMany: (...args: unknown[]) => mockDayOnCourseDeleteMany(...args),
    createMany: (...args: unknown[]) => mockDayOnCourseCreateMany(...args),
  },
  courseAccess: {
    findMany: (...args: unknown[]) => mockCourseAccessFindMany(...args),
    create: (...args: unknown[]) => mockCourseAccessCreate(...args),
    createMany: (...args: unknown[]) => mockCourseAccessCreateMany(...args),
    deleteMany: (...args: unknown[]) => mockCourseAccessDeleteMany(...args),
  },
  payment: {
    findMany: (...args: unknown[]) => mockPaymentFindMany(...args),
  },
};

const mockTransaction = vi.fn((fn: (tx: typeof txStub) => Promise<unknown>) =>
  fn(txStub),
);

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
    course: {
      findUnique: (...args: unknown[]) => mockCourseFindUnique(...args),
      findFirst: vi.fn(),
      create: (...args: unknown[]) => mockCourseCreate(...args),
      update: (...args: unknown[]) => mockCourseUpdate(...args),
      delete: (...args: unknown[]) => mockCourseDelete(...args),
    },
    dayOnCourse: {
      findMany: (...args: unknown[]) => mockDayOnCourseFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDayOnCourseDeleteMany(...args),
    },
    courseAccess: {
      deleteMany: (...args: unknown[]) => mockCourseAccessDeleteMany(...args),
    },
    favoriteCourse: {
      deleteMany: (...args: unknown[]) => mockFavoriteCourseDeleteMany(...args),
    },
    courseReview: {
      deleteMany: (...args: unknown[]) => mockCourseReviewDeleteMany(...args),
    },
    userCourse: {
      deleteMany: (...args: unknown[]) => mockUserCourseDeleteMany(...args),
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

describe("canCreatePaidCourse", () => {
  it("returns true for ADMIN role", () => {
    expect(canCreatePaidCourse("u1", "ADMIN", "any")).toBe(true);
  });

  it("returns true for gafus username", () => {
    expect(canCreatePaidCourse("u1", "TRAINER", "gafus")).toBe(true);
  });

  it("returns false for other trainer", () => {
    expect(canCreatePaidCourse("u1", "TRAINER", "other")).toBe(false);
  });
});

describe("createCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseCreate.mockResolvedValue({});
  });

  it("returns success when valid input", async () => {
    const result = await createCourse(
      {
        id: "course-1",
        name: "Курс",
        shortDesc: "Короткое",
        description: "Описание",
        duration: "30 дней",
        trainingLevel: "beginner",
        trainingDays: [],
      },
      "author-1",
    );

    expect(result.success).toBe(true);
    expect(result.id).toBe("course-1");
  });

  it("creates course with trainingDays and access when private with allowedUsers", async () => {
    const result = await createCourse(
      {
        id: "course-1",
        name: "Курс",
        shortDesc: "",
        description: "",
        duration: "30 дней",
        trainingLevel: "beginner",
        trainingDays: ["day1", "day2"],
        isPublic: false,
        allowedUsers: ["u1", "u2"],
      },
      "author-1",
    );

    expect(result.success).toBe(true);
    expect(mockCourseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dayLinks: {
            create: [
              { day: { connect: { id: "day1" } }, order: 1 },
              { day: { connect: { id: "day2" } }, order: 2 },
            ],
          },
          access: {
            create: [
              { user: { connect: { id: "u1" } } },
              { user: { connect: { id: "u2" } } },
            ],
          },
        }),
      }),
    );
  });

  it("returns handlePrismaError message on P2002 during createCourse", async () => {
    mockCourseCreate.mockRejectedValueOnce(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new ConflictError("Уже существует");
    });

    const result = await createCourse(
      {
        id: "course-1",
        name: "N",
        shortDesc: "",
        description: "",
        duration: "30 дней",
        trainingLevel: "beginner",
      },
      "author-1",
    );

    expect(result).toEqual({ success: false, error: "Уже существует" });
  });
});

describe("updateCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseUpdate.mockResolvedValue({});
    mockDayOnCourseFindMany.mockResolvedValue([]);
    mockDayOnCourseCreateMany.mockResolvedValue({});
    mockCourseAccessDeleteMany.mockResolvedValue({});
  });

  it("does not remove access for paid users when updating allowedUsers", async () => {
    mockCourseAccessFindMany.mockResolvedValue([
      { userId: "paid-u" },
      { userId: "u1" },
    ]);
    mockPaymentFindMany.mockResolvedValue([{ userId: "paid-u" }]);
    mockCourseAccessCreate.mockResolvedValue({});

    const result = await updateCourse({
      id: "c1",
      name: "Курс",
      shortDesc: "Кратко",
      description: "Описание",
      duration: "30 дней",
      logoImg: "",
      isPublic: true,
      isPaid: true,
      priceRub: null,
      trainingDays: [],
      equipment: "",
      trainingLevel: "beginner",
      allowedUsers: ["u1"],
    });

    expect(result.success).toBe(true);
    expect(mockCourseAccessFindMany).toHaveBeenCalled();
    expect(mockPaymentFindMany).toHaveBeenCalled();
  });

  it("returns success on simple update", async () => {
    const result = await updateCourse({
      id: "c1",
      name: "Курс",
      shortDesc: "Кратко",
      description: "Описание",
      duration: "30 дней",
      logoImg: "",
      isPublic: true,
      isPaid: false,
      trainingDays: ["day1"],
      equipment: "",
      trainingLevel: "beginner",
    });

    expect(result.success).toBe(true);
    expect(mockCourseUpdate).toHaveBeenCalled();
    expect(mockDayOnCourseFindMany).toHaveBeenCalled();
  });

  it("returns error when prisma throws known error", async () => {
    const err = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["name"] },
    });
    mockCourseUpdate.mockRejectedValue(err);

    const result = await updateCourse({
      id: "c1",
      name: "Курс",
      shortDesc: "Кратко",
      description: "Описание",
      duration: "30 дней",
      logoImg: "",
      isPublic: true,
      isPaid: false,
      trainingDays: [],
      equipment: "",
      trainingLevel: "beginner",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("deleteCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCourseAccessDeleteMany.mockResolvedValue({});
    mockFavoriteCourseDeleteMany.mockResolvedValue({});
    mockCourseReviewDeleteMany.mockResolvedValue({});
    mockUserCourseDeleteMany.mockResolvedValue({});
    mockDayOnCourseDeleteMany.mockResolvedValue({});
    mockCourseDelete.mockResolvedValue({});
  });

  it("returns success with logoImg when course exists", async () => {
    mockCourseFindUnique.mockResolvedValue({
      logoImg: "https://cdn/logo.jpg",
    });

    const result = await deleteCourse("c1");

    expect(result.success).toBe(true);
    expect(result.logoImg).toBe("https://cdn/logo.jpg");
    expect(mockCourseDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("returns error when course not found", async () => {
    mockCourseFindUnique.mockResolvedValue(null);

    const result = await deleteCourse("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
    expect(mockCourseDelete).not.toHaveBeenCalled();
  });

  it("returns error on prisma failure", async () => {
    mockCourseFindUnique.mockResolvedValue({ logoImg: "" });
    mockCourseAccessDeleteMany.mockRejectedValue(new Error("DB error"));

    const result = await deleteCourse("c1");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns handlePrismaError message when prisma throws with code", async () => {
    mockCourseFindUnique.mockResolvedValue({ logoImg: "" });
    mockCourseAccessDeleteMany.mockRejectedValueOnce(
      Object.assign(new Error("P2025"), { code: "P2025" }),
    );
    mockHandlePrismaError.mockImplementationOnce(() => {
      throw new NotFoundError("Курс");
    });

    const result = await deleteCourse("c1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("не найден");
  });
});

describe("getCourseDraftWithRelations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CourseDraftDto when course found and authorId matches", async () => {
    mockCourseFindUnique.mockResolvedValue({
      id: "c1",
      name: "Курс",
      shortDesc: "",
      description: "",
      duration: "30",
      videoUrl: null,
      logoImg: "",
      isPrivate: false,
      isPaid: false,
      priceRub: null,
      showInProfile: true,
      isPersonalized: false,
      equipment: "",
      trainingLevel: "beginner",
      authorId: "trainer-1",
      dayLinks: [
        {
          id: "dl1",
          dayId: "day1",
          order: 1,
          day: { id: "day1", title: "День 1" },
        },
      ],
      access: [],
    });

    const result = await getCourseDraftWithRelations("c1", "trainer-1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("c1");
    expect(result?.dayLinks).toHaveLength(1);
    expect(result?.dayLinks[0].day.title).toBe("День 1");
  });

  it("returns null when course not found", async () => {
    mockCourseFindUnique.mockResolvedValue(null);

    const result = await getCourseDraftWithRelations("nonexistent", "trainer-1");

    expect(result).toBeNull();
  });

  it("returns null when trainerId does not match authorId", async () => {
    mockCourseFindUnique.mockResolvedValue({
      id: "c1",
      authorId: "other-trainer",
    } as Record<string, unknown>);

    const result = await getCourseDraftWithRelations("c1", "trainer-1");

    expect(result).toBeNull();
  });

  it("returns null when prisma throws", async () => {
    mockCourseFindUnique.mockRejectedValue(new Error("DB timeout"));

    const result = await getCourseDraftWithRelations("c1", "trainer-1");

    expect(result).toBeNull();
  });
});

