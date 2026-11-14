/** Server composition for the shared daily-course policy and SQL transaction.
 * Core exports only reusable pure schemas, cache policy and UI-independent math.
 */
import { createDailyCourseService } from "@gafus/course-progress-server/daily-course-service";
import { estimateDayDurations } from "@gafus/core/utils/training";
import { invalidateStepsContentCache, publishCourseContentChange } from "@gafus/core/services/training/cache-publication";

export * from "@gafus/course-progress-server/daily-course-service";
export {
  dailyCourseDateSchema, dailyCourseRangeSchema,
  deleteDailyCourseBundleSchema, deleteDailyCourseScheduleSchema,
  upsertDailyCourseBundleSchema, upsertDailyCourseScheduleSchema,
} from "@gafus/core/services/dailyCourse";
export type {
  DailyCourseRangeInput, DeleteDailyCourseBundleInput,
  DeleteDailyCourseScheduleInput, UpsertDailyCourseBundleInput,
  UpsertDailyCourseScheduleInput,
  DailyCourseImportQuestion, DailyCourseImportStepType,
  ParsedDailyCourseImportDay, ParsedDailyCourseImportFile,
  ParsedDailyCourseImportStep,
} from "@gafus/core/services/dailyCourse";

export const {
  getTodayDailyCourse,
  getDailyCourseDayWithUserSteps,
  updateDailyCourseStepAndDay,
  getDailyCourseScheduleStatistics,
  getDailyCourseScheduleRange,
  getDailyCourseCandidates,
  getDailyCourseBundles,
  getDailyCourseBundleStepCandidates,
  upsertDailyCourseBundle,
  deleteDailyCourseBundle,
  upsertDailyCourseSchedule,
  deleteDailyCourseSchedule,
  previewDailyCourseCleanup,
  cleanupDailyCourseContent,
  previewDailyCourseImportFile,
  importDailyCourseFile,
} = createDailyCourseService({
  estimateDayDurations,
  invalidateStepsContentCache,
  publishCourseContentChange,
});
