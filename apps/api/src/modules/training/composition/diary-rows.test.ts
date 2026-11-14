import { describe, expect, it, vi } from "vitest";

const p = vi.hoisted(() => ({
  resolve: vi.fn(),
  occurrence: vi.fn(),
  writeSql: vi.fn(),
  entries: vi.fn(),
  readCore: vi.fn(),
  writeCore: vi.fn(),
}));
vi.mock("@gafus/course-progress-server/diary-entries", () => ({
  resolveDiaryCourseId: p.resolve,
  readDiaryDayOccurrence: p.occurrence,
  writeDiaryUserDay: p.writeSql,
  readDiaryCourseEntries: p.entries,
}));
vi.mock("@gafus/core/services/diary", () => ({
  getDiaryEntries: p.readCore,
  saveDiaryEntry: p.writeCore,
}));
import { diaryPersistence, getDiaryEntries, saveDiaryEntry } from "./diary-rows.js";

describe("API diary SQL composition", () => {
  it("keeps owner and course occurrence intact for read policy", async () => {
    p.readCore.mockResolvedValueOnce({ entries: [] });
    await expect(getDiaryEntries("owner-A", "course-A", "occ-A")).resolves.toEqual({ entries: [] });
    expect(p.readCore).toHaveBeenCalledExactlyOnceWith(
      diaryPersistence,
      "owner-A",
      "course-A",
      "occ-A",
    );
    expect(diaryPersistence.readDiaryCourseEntries).toBe(p.entries);
    expect(diaryPersistence.resolveDiaryCourseId).toBe(p.resolve);
  });
  it("passes exact actor and content through policy before SQL, never bypassing it", async () => {
    p.writeCore.mockResolvedValueOnce({ success: false, error: "FORBIDDEN" });
    await expect(saveDiaryEntry("owner-A", "occ-A", "текст")).resolves.toMatchObject({
      success: false,
    });
    expect(p.writeCore).toHaveBeenCalledExactlyOnceWith(
      diaryPersistence,
      "owner-A",
      "occ-A",
      "текст",
    );
    expect(p.writeSql).not.toHaveBeenCalled();
  });
});
