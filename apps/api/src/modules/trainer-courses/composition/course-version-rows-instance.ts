/** Explicit production Course.version adapter. SQL owner predicates, CAS,
 * row lock and trigger remain inside course-progress-server. */
import type { CourseVersionRowsPort } from "@gafus/core/services/trainerCourse";
import {
  readCourseVersionRows,
  writeCourseNameVersionRows,
  setCourseLogoVersionRows,
} from "@gafus/course-progress-server/course-version-rows";
export const courseVersionRowsPort: CourseVersionRowsPort = {
  readCourseVersionRows,
  writeCourseNameVersionRows,
  setCourseLogoVersionRows,
};
