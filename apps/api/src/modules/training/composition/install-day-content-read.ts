/** One exact courseType+dayOnCourseId SQL projection, with no learner
 * progress/paid authorization, so content caching stays actor-neutral.
 * Core validates the committed PostgreSQL content revision before reuse.
 */
import { registerTrainingDayContentReadPort } from "@gafus/core/services/training";
import { readTrainingDayContent } from "@gafus/course-read-server";

const dayContentReadPort = { readTrainingDayContent };
registerTrainingDayContentReadPort(dayContentReadPort);
