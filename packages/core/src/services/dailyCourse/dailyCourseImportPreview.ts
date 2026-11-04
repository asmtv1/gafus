/** Pure daily course import preview/policy. No DB, clock, I/O or actor access.
 * The caller loads current conflicts via an owner-scoped service and provides
 * a dateKey explicitly. This preserves the existing add-only route policy.
 */
import type { ParsedDailyCourseImportDay, ParsedDailyCourseImportFile } from "./importParser";

export interface DailyCourseImportConflictDto {
  scheduleId: string;
  bundleTitle: string;
  isPublished: boolean;
}

export interface DailyCourseImportPreviewDayDto extends ParsedDailyCourseImportDay {
  isPast: boolean;
  conflict: DailyCourseImportConflictDto | null;
  canReplaceConflict: boolean;
  canImport: boolean;
}

export interface DailyCourseImportPreviewDto {
  days: DailyCourseImportPreviewDayDto[];
  hasErrors: boolean;
  summary: {
    totalDays: number;
    emptyDays: number;
    importableDays: number;
    conflictDays: number;
    errorDays: number;
  };
}


export function buildDailyCourseImportPreview(
  parsed: ParsedDailyCourseImportFile,
  today: string,
  conflictByDate: ReadonlyMap<string, DailyCourseImportConflictDto>,
): DailyCourseImportPreviewDto {
  const days = parsed.days.map((day): DailyCourseImportPreviewDayDto => {
    const conflict = conflictByDate.get(day.date) ?? null;
    const hasErrors = day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0);
    const isPast = day.date < today;
    return {
      ...day,
      isPast,
      conflict,
      canReplaceConflict: Boolean(conflict && day.date > today && !hasErrors),
      canImport: !day.isEmpty && !hasErrors && !isPast && !conflict,
    };
  });
  const errorDays = days.filter(
    (day) => day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0),
  ).length;
  return {
    days,
    hasErrors: parsed.hasErrors || errorDays > 0,
    summary: {
      totalDays: days.length,
      emptyDays: days.filter((day) => day.isEmpty).length,
      importableDays: days.filter((day) => day.canImport).length,
      conflictDays: days.filter((day) => day.conflict).length,
      errorDays,
    },
  };
}
