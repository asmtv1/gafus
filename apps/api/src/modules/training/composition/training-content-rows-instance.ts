/** Owner-neutral course-day SQL projection + committed PostgreSQL revision.
 * No global Core registrar runs during API startup: one explicit Training
 * Service receives both dependencies and can reject stale cache reuse. */
import type {
  CourseContentRevisionReadPort,
  TrainingDayContentReadPort,
} from "@gafus/core/services/training";
import { readDurableCourseContentRevision } from "@gafus/course-read-server/content-revision";
import { readTrainingDayContent } from "@gafus/course-read-server";

export const contentRevisionReadPort: CourseContentRevisionReadPort = {
  readDurableCourseContentRevision,
};
export const dayContentReadPort: TrainingDayContentReadPort = {
  readTrainingDayContent,
};
