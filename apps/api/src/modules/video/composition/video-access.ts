import { transactionalContentPolicy } from "../../content-access/composition/transactional-policy-instance.js";
/**
 * API composition for video playback. Query projections run in the
 * course-read-server adapter; Core owns occurrence-aware entitlement policy.
 */
import { createVideoAccessService } from "@gafus/core/services/video";
import {
  readTrainerVideoManifest,
  readTrainerVideoOwnership,
  readTrainerVideoStepOccurrences,
  readVideoCourseDayOccurrences,
  hasPublishedDailyCourseVideo,
} from "@gafus/course-read-server/video-access-read";
import { hasAllowedVideoCourseStepAccess } from "@gafus/core/services/contentAccess";
import { occurrenceReadPort } from "../../content-access/composition/occurrence-reads-instance.js";

export const { checkVideoAccess, getVideoManifestInfo } = createVideoAccessService({
  manifest: readTrainerVideoManifest,
  owner: readTrainerVideoOwnership,
  stepOccurrences: readTrainerVideoStepOccurrences,
  dayOccurrences: readVideoCourseDayOccurrences,
  hasPublishedDailyCourseVideo,
  allowedCourseStep: (userId, dayOnCourseId, stepOnDayId, now) =>
    hasAllowedVideoCourseStepAccess(userId, dayOnCourseId, stepOnDayId, now, transactionalContentPolicy.resolveCourseStepAccessTx, occurrenceReadPort),
});
