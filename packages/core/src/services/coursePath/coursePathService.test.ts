import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiaryPersistencePort } from "../diary";
import { getCoursePathData, type CoursePathReadPorts } from "./coursePathService";

const mocks = vi.hoisted(() => ({ diary: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock("../diary", () => ({ getDiaryEntries: mocks.diary }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: mocks.error, warn: mocks.warn, info: vi.fn() }),
}));

const diaryPersistence = {} as DiaryPersistencePort;
const viewerId = "owner-user";
const courseId = "course-a";
function fixture(): CoursePathReadPorts {
  return {
    checkCourseAccess: vi.fn(async () => ({ hasAccess: true })),
    readCoursePathHeader: vi.fn(async () => ({ name: "Course A", type: "GENERAL" })),
    readOwnedCoursePathProgress: vi.fn(async () => ({
      startedAt: new Date("2026-01-03T00:00:00.000Z"), completedAt: null,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.diary.mockResolvedValue({ entries: [], error: null });
});

describe("course-path pure read application boundary", () => {
  it("checks the exact viewer's entitlement before reading the course or diary", async () => {
    const reads = fixture();
    vi.mocked(reads.checkCourseAccess).mockResolvedValueOnce({ hasAccess: false });
    await expect(getCoursePathData(diaryPersistence, viewerId, courseId, reads))
      .resolves.toEqual({ success: false, error: "Нет доступа к курсу" });
    expect(reads.checkCourseAccess).toHaveBeenCalledExactlyOnceWith(courseId, viewerId);
    expect(reads.readCoursePathHeader).not.toHaveBeenCalled();
    expect(reads.readOwnedCoursePathProgress).not.toHaveBeenCalled();
    expect(mocks.diary).not.toHaveBeenCalled();
  });

  it("returns only this viewer's progress and a bounded diary excerpt", async () => {
    const reads = fixture();
    const longContent = "a".repeat(251);
    mocks.diary.mockResolvedValueOnce({
      error: null, entries: [{ id: "diary-1", content: longContent, dayOnCourseId: "day-1" }],
    });
    const result = await getCoursePathData(diaryPersistence, viewerId, courseId, reads);
    expect(result).toMatchObject({
      success: true, data: {
        courseName: "Course A", courseType: "GENERAL",
        startedAt: new Date("2026-01-03T00:00:00.000Z"), completedAt: null,
        entries: [{ id: "diary-1", contentExcerpt: "a".repeat(250) + "..." }],
      },
    });
    expect(mocks.diary).toHaveBeenCalledExactlyOnceWith(diaryPersistence, viewerId, courseId);
    expect(reads.readOwnedCoursePathProgress).toHaveBeenCalledExactlyOnceWith(viewerId, courseId);
  });

  it("keeps missing-course responses opaque and skips diary/progress reads", async () => {
    const reads = fixture();
    vi.mocked(reads.readCoursePathHeader).mockResolvedValueOnce(null);
    expect(await getCoursePathData(diaryPersistence, viewerId, courseId, reads))
      .toEqual({ success: false, error: "Курс не найден" });
    expect(mocks.diary).not.toHaveBeenCalled();
    expect(reads.readOwnedCoursePathProgress).not.toHaveBeenCalled();
  });

  it("preserves explicit diary read errors without fetching course progress", async () => {
    const reads = fixture();
    mocks.diary.mockResolvedValueOnce({ error: "Дневник недоступен", entries: [] });
    expect(await getCoursePathData(diaryPersistence, viewerId, courseId, reads))
      .toEqual({ success: false, error: "Дневник недоступен" });
    expect(reads.readOwnedCoursePathProgress).not.toHaveBeenCalled();
  });

  it("masks provider exceptions rather than returning private SQL/actor details", async () => {
    const reads = fixture();
    vi.mocked(reads.readCoursePathHeader).mockRejectedValueOnce(new Error("PRIVATE_SQL_VALUE"));
    expect(await getCoursePathData(diaryPersistence, viewerId, courseId, reads))
      .toEqual({ success: false, error: "Не удалось получить данные пути" });
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("Failed to get course path data");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("PRIVATE_SQL_VALUE");
  });
});
