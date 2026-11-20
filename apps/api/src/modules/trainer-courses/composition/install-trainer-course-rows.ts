/** Deprecated Core registrar only for older isolated tests. Production
 * provides trainerCourseRows to each HTTP composition factory. */
import { registerTrainerCourseRowsPort } from "@gafus/core/services/trainerCourse";
import { trainerCourseRows } from "./trainer-course-rows-instance.js";
registerTrainerCourseRowsPort(trainerCourseRows);
