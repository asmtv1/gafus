/** Only the composition root binds public marketing query adapters to application. */
import { getCourseMetadata, getCourseOutline } from "./catalog-read-instance.js";
import { isPublicPaidCourse, projectPublicPaidCourseOutline } from "@gafus/core/services/course/publicOutlinePolicy";
import { createPublicPaidCourseOutlineApplication } from "../application/read-public-outline.js";

export const publicPaidCourseOutlineApplication = createPublicPaidCourseOutlineApplication({
  metadata: getCourseMetadata,
  outline: getCourseOutline,
  isPublicPaidCourse,
  projectPublicPaidCourseOutline,
});
