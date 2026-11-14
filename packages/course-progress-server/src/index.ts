export {completeUserCourseRecord,completeExistingUserCourseRecord,countCourseDays,readCourseDayIds,readOwnTrainingStatuses} from "./completion";
export type {CourseCompletionRecord} from "./completion";

export {readCourseVersionRows,writeCourseNameVersionRows,setCourseLogoVersionRows,writeCourseNameObservedCas,readCourseObservedRevision} from "./courseVersionRows";
export type {CourseVersionRow,CourseVersionRowActor} from "./courseVersionRows";

export {resolveDiaryCourseId,readDiaryDayOccurrence,writeDiaryUserDay,readDiaryCourseEntries} from "./diary-entries";
export type {DiaryEntryWithDay} from "./diary-entries";

export {
  readOwnedCourseProgressRow, readCourseDaysProgressRows,
  readSharedCompletedTrainingRows, readOwnedCourseTrainingStatuses,
  readTrainingStartedSteps, writeOwnedUserCourseProgress,
  readProgressDisplayAccount, readOwnedCourseTrainingTimeline,
  readOwnedCourseTrainingDayRows,
} from "./userProgressRows";

/** Owner-bound learner progress aggregation; reads and optional writes are server-owned. */
export { getDetailedUserProgress } from "./userProgressApplication";
export type { UserDayProgress, UserDetailedProgress } from "./userProgressApplication";
