/** Process composition for Course.version CAS and row-locked logo replacement.
 * Both SQL operations and owner checks remain in the Persistence adapter;
 * Core keeps validation, explicit result codes and post-commit cache signals.
 * The installer must run before Hono routes are loaded.
 */
import { registerCourseVersionRowsPort } from "@gafus/core/services/trainerCourse";
import {
  readCourseVersionRows,
  writeCourseNameVersionRows,
  setCourseLogoVersionRows,
} from "@gafus/course-progress-server/course-version-rows";

const courseVersionRowsPort = {
  readCourseVersionRows,
  writeCourseNameVersionRows,
  setCourseLogoVersionRows,
};
registerCourseVersionRowsPort(courseVersionRowsPort);
