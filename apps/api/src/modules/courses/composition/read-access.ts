/** Lazy binding of existing course entitlement Core reads only. */
import { checkCourseAccess, checkCourseAccessById } from "@gafus/core/services/course";
import { createReadCourseAccessApplication } from "../application/read-access.js";

export const readCourseAccessApplication = createReadCourseAccessApplication({
  byType: (courseType, userId) => checkCourseAccess(courseType, userId),
  byId: (courseId, userId) => checkCourseAccessById(courseId, userId),
});
