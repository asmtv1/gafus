import { describe, expect, it } from "vitest";
import { buildDailyCourseImportPreview, type DailyCourseImportConflictDto } from "./dailyCourseImportPreview";
import type { ParsedDailyCourseImportDay } from "./importParser";
const today = "2099-05-18";
function day(date: string, overrides: Partial<ParsedDailyCourseImportDay> = {}): ParsedDailyCourseImportDay {
  return {
    date, bundleTitle: "Synthetic daily bundle", type: "daily_course",
    equipment: "none", description: "synthetic", steps: [], errors: [], isEmpty: false,
    ...overrides,
  };
}
const conflict: DailyCourseImportConflictDto = {
  scheduleId: "synthetic_schedule", bundleTitle: "Already scheduled", isPublished: true,
};
describe("pure Daily Course file-import preview and conflict policy", () => {
  it("allows an error-free new date today or later, but never a past date", () => {
    const preview = buildDailyCourseImportPreview({
      days: [day("2099-05-17"), day(today), day("2099-05-19")], hasErrors: false,
    }, today, new Map());
    expect(preview.days.map((entry) => entry.canImport)).toEqual([false, true, true]);
    expect(preview.days[0]?.isPast).toBe(true);
    expect(preview.summary.importableDays).toBe(2);
  });
  it("never marks an occupied date importable; only future clean conflicts can be proposed for replacement", () => {
    const conflicts = new Map([
      [today, conflict], ["2099-05-19", conflict], ["2099-05-20", conflict],
    ]);
    const preview = buildDailyCourseImportPreview({
      days: [day(today), day("2099-05-19"), day("2099-05-20", { errors: ["bad bundle"] })],
      hasErrors: false,
    }, today, conflicts);
    expect(preview.days.map((entry) => entry.canImport)).toEqual([false, false, false]);
    expect(preview.days.map((entry) => entry.canReplaceConflict)).toEqual([false, true, false]);
    expect(preview.summary.conflictDays).toBe(3);
    expect(preview.summary.errorDays).toBe(1);
    expect(preview.hasErrors).toBe(true);
  });
  it("an empty day never imports and a step error propagates into the summary", () => {
    const broken = day("2099-05-19");
    broken.steps = [{ order: 1, title: "Synthetic", type: "TRAINING", description: "synthetic",
      durationSec: 60, estimatedDurationSec: null, requiresWrittenFeedback: false,
      hasTestQuestions: false, requiresVideoReport: false, surveySlug: null,
      questions: [], errors: ["Invalid field"] }];
    const preview = buildDailyCourseImportPreview({
      days: [day(today, { isEmpty: true }), broken], hasErrors: false,
    }, today, new Map());
    expect(preview.summary).toEqual({ totalDays: 2, emptyDays: 1, importableDays: 0,
      conflictDays: 0, errorDays: 1 });
    expect(preview.hasErrors).toBe(true);
  });
});
