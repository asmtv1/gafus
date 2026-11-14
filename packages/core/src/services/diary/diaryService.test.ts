import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDiaryEntries as coreReadDiary,
  saveDiaryEntry as coreSaveDiary,
  type DiaryPersistencePort,
} from "./diaryService";

const courseAccess = vi.fn();
vi.mock("../course/courseService", () => ({
  checkCourseAccessById: (...args: unknown[]) => courseAccess(...args),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const repo = {
  resolveDiaryCourseId: vi.fn(),
  readDiaryDayOccurrence: vi.fn(),
  writeDiaryUserDay: vi.fn(),
  readDiaryCourseEntries: vi.fn(),
} satisfies DiaryPersistencePort;
const save = (user: string, occurrence: string, text: string) =>
  coreSaveDiary(repo, user, occurrence, text);
const get = (user: string, course: string, upTo?: string) =>
  coreReadDiary(repo, user, course, upTo);
beforeEach(() => {
  vi.clearAllMocks();
  courseAccess.mockResolvedValue({ hasAccess: true });
  repo.resolveDiaryCourseId.mockResolvedValue("course-A");
  repo.readDiaryDayOccurrence.mockResolvedValue({ dayId: "day-A", courseId: "course-A" });
  repo.writeDiaryUserDay.mockResolvedValue({});
  repo.readDiaryCourseEntries.mockResolvedValue([]);
});

describe("Core diary policy with injected owner-scoped SQL", () => {
  it("rejects blank content before any SQL lookup", async () => {
    await expect(save("owner-A", "occ-A", "   ")).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("пустым"),
    });
    expect(repo.readDiaryDayOccurrence).not.toHaveBeenCalled();
    expect(repo.writeDiaryUserDay).not.toHaveBeenCalled();
  });
  it("rejects oversized content before any SQL lookup", async () => {
    await expect(save("owner-A", "occ-A", "x".repeat(10001))).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("10000"),
    });
    expect(repo.readDiaryDayOccurrence).not.toHaveBeenCalled();
  });
  it("does not mutate when course occurrence is absent", async () => {
    repo.readDiaryDayOccurrence.mockResolvedValue(null);
    await expect(save("owner-A", "missing", "текст")).resolves.toMatchObject({ success: false });
    expect(courseAccess).not.toHaveBeenCalled();
    expect(repo.writeDiaryUserDay).not.toHaveBeenCalled();
  });
  it("checks the exact owner's course access before touching the diary", async () => {
    courseAccess.mockResolvedValue({ hasAccess: false });
    await expect(save("owner-A", "occ-A", "текст")).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("доступа"),
    });
    expect(repo.readDiaryDayOccurrence).toHaveBeenCalledExactlyOnceWith("occ-A");
    expect(courseAccess).toHaveBeenCalledExactlyOnceWith("course-A", "owner-A");
    expect(repo.writeDiaryUserDay).not.toHaveBeenCalled();
  });
  it("writes only the requesting owner's day with trimmed content", async () => {
    await expect(save("owner-A", "occ-A", "  Запись  ")).resolves.toEqual({ success: true });
    expect(repo.writeDiaryUserDay).toHaveBeenCalledExactlyOnceWith("owner-A", "day-A", "Запись");
  });
  it("denies an unknown course before a member diary read", async () => {
    repo.resolveDiaryCourseId.mockResolvedValue(null);
    await expect(get("owner-A", "missing")).resolves.toMatchObject({
      entries: [],
      error: expect.stringContaining("найден"),
    });
    expect(courseAccess).not.toHaveBeenCalled();
    expect(repo.readDiaryCourseEntries).not.toHaveBeenCalled();
  });
  it("never reads another owner's diary when the course entitlement is denied", async () => {
    courseAccess.mockResolvedValue({ hasAccess: false });
    await expect(get("owner-A", "course-A")).resolves.toMatchObject({
      entries: [],
      error: expect.stringContaining("доступа"),
    });
    expect(repo.resolveDiaryCourseId).toHaveBeenCalledExactlyOnceWith("course-A");
    expect(repo.readDiaryCourseEntries).not.toHaveBeenCalled();
  });
  it("passes owner, resolved course and optional course-occurrence cutoff to SQL", async () => {
    const entry = {
      id: "entry-A",
      content: "training",
      createdAt: new Date("2026-11-01T12:00:00Z"),
      updatedAt: new Date("2026-11-01T12:00:00Z"),
      dayId: "day-A",
      dayOnCourseId: "occ-A",
      dayOrder: 1,
      dayTitle: "Урок 1",
    };
    repo.readDiaryCourseEntries.mockResolvedValue([entry]);
    await expect(get("owner-A", "course-type", "occ-A")).resolves.toEqual({ entries: [entry] });
    expect(repo.resolveDiaryCourseId).toHaveBeenCalledExactlyOnceWith("course-type");
    expect(courseAccess).toHaveBeenCalledExactlyOnceWith("course-A", "owner-A");
    expect(repo.readDiaryCourseEntries).toHaveBeenCalledExactlyOnceWith(
      "owner-A",
      "course-A",
      "occ-A",
    );
  });
});
