/**
 * REVIEW ONLY. Not routed, exported to clients, or activated.
 * Millisecond observedUpdatedAt CAS is not robust against all concurrent legacy
 * full-form writers or a PostgreSQL column truncating milliseconds.
 * Preserve UNKNOWN after ambiguous commit and require the separate SQL migration
 * and all-writers proof before an authenticated transport is permitted.
 */
import { createTrainerCourseNameOnlyService } from
  "@gafus/core/services/trainerCourse";
import { writeCourseNameObservedCas, readCourseObservedRevision } from
  "@gafus/course-progress-server/course-version-rows";
import { invalidateCourseContentCache, publishCourseContentChange } from
  "@gafus/core/services/training/cache-publication";

export const trainerNameOnlyCasReview = createTrainerCourseNameOnlyService({
  writeObservedCas: writeCourseNameObservedCas,
  readObservedRevision: readCourseObservedRevision,
  invalidateCache: invalidateCourseContentCache,
  publishContentChange: publishCourseContentChange,
});
