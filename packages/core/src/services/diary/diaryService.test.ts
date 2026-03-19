import { describe, expect, it, beforeEach, vi } from "vitest";

import { getDiaryEntries, saveDiaryEntry } from "./diaryService";

const mockCheckCourseAccessById = vi.fn();
const mockCourseFindUnique = vi.fn();
const mockCourseFindFirst = vi.fn();
const mockDayOnCourseFindUnique = vi.fn();
const mockDayOnCourseFindMany = vi.fn();
const mockDiaryEntryUpsert = vi.fn();
const mockDiaryEntryFindMany = vi.fn();

vi.mock("../course/courseService", () => ({
  checkCourseAccessById: (...args: unknown[]) => mockCheckCourseAccessById(...args),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findUnique: (...args: unknown[]) => mockCourseFindUnique(...args),
      findFirst: (...args: unknown[]) => mockCourseFindFirst(...args),
    },
    dayOnCourse: {
      findUnique: (...args: unknown[]) => mockDayOnCourseFindUnique(...args),
      findMany: (...args: unknown[]) => mockDayOnCourseFindMany(...args),
    },
    diaryEntry: {
      upsert: (...args: unknown[]) => mockDiaryEntryUpsert(...args),
      findMany: (...args: unknown[]) => mockDiaryEntryFindMany(...args),
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

describe("saveDiaryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: true });
    mockDiaryEntryUpsert.mockResolvedValue({});
  });

  it("ошибка при пустом тексте", async () => {
    const r = await saveDiaryEntry("u1", "doc1", "   ");

    expect(r.success).toBe(false);
    expect(r.error).toContain("пустым");
  });

  it("ошибка при слишком длинном тексте", async () => {
    const r = await saveDiaryEntry("u1", "doc1", "x".repeat(10001));

    expect(r.success).toBe(false);
    expect(r.error).toContain("10000");
  });

  it("ошибка если день курса не найден", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue(null);

    const r = await saveDiaryEntry("u1", "doc1", "Текст");

    expect(r.success).toBe(false);
    expect(r.error).toContain("не найден");
  });

  it("ошибка без доступа к курсу", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue({
      dayId: "d1",
      courseId: "c1",
    });
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: false });

    const r = await saveDiaryEntry("u1", "doc1", "Запись");

    expect(r.success).toBe(false);
    expect(r.error).toContain("доступа");
  });

  it("успешный upsert", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue({
      dayId: "d1",
      courseId: "c1",
    });

    const r = await saveDiaryEntry("u1", "doc1", "  Запись  ");

    expect(r.success).toBe(true);
    expect(mockDiaryEntryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_dayId: { userId: "u1", dayId: "d1" } },
        create: expect.objectContaining({ content: "Запись" }),
      }),
    );
  });
});

describe("getDiaryEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: true });
    mockDiaryEntryFindMany.mockResolvedValue([]);
  });

  it("курс не найден", async () => {
    mockCourseFindUnique.mockResolvedValue(null);
    mockCourseFindFirst.mockResolvedValue(null);

    const r = await getDiaryEntries("u1", "unknown-type");

    expect(r.entries).toEqual([]);
    expect(r.error).toContain("не найден");
  });

  it("нет доступа", async () => {
    mockCourseFindUnique.mockResolvedValue({ id: "c1" });
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: false });

    const r = await getDiaryEntries("u1", "c1");

    expect(r.entries).toEqual([]);
    expect(r.error).toContain("доступа");
  });

  it("возвращает записи в порядке дней", async () => {
    mockCourseFindUnique.mockResolvedValue({ id: "c1" });
    mockDayOnCourseFindMany.mockResolvedValue([
      {
        id: "doc1",
        order: 1,
        dayId: "d1",
        day: { title: "День 1" },
      },
    ]);
    mockDiaryEntryFindMany.mockResolvedValue([
      {
        id: "e1",
        content: "текст",
        createdAt: new Date(),
        updatedAt: new Date(),
        dayId: "d1",
      },
    ]);

    const r = await getDiaryEntries("u1", "c1");

    expect(r.error).toBeUndefined();
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].dayTitle).toBe("День 1");
  });
});
