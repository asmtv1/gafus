/** Bind the authoritative transactionally updated PostgreSQL course content
 * revision. Redis publication remains a best-effort hint, never the truth.
 * The Core reader fails closed to direct uncached reads on DB failure.
 */
import { registerCourseContentRevisionReadPort } from "@gafus/core/services/training";
import { readDurableCourseContentRevision } from "@gafus/course-read-server/content-revision";

const contentRevisionReadPort = { readDurableCourseContentRevision };
registerCourseContentRevisionReadPort(contentRevisionReadPort);
