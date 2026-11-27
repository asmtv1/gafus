import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** Lazy binding of existing course entitlement Core reads only. */
import { checkCourseAccess, checkCourseAccessById } from "./catalog-read-instance.js";
import { createReadCourseAccessApplication } from "../application/read-access.js";

export const readCourseAccessApplication = createReadCourseAccessApplication({
  byType: (courseType, userId) => withCorrelatedUseCase("courses.entitlement.type.read", () => checkCourseAccess(courseType, userId)),
  byId: (courseId, userId) => withCorrelatedUseCase("courses.entitlement.id.read", () => checkCourseAccessById(courseId, userId)),
});
