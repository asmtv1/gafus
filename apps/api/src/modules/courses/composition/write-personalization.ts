/** Defer the existing personalization write adapter until the HTTP command. */
import { saveCoursePersonalization } from "@gafus/course-server/personalization";
import { createWriteCoursePersonalizationApplication } from "../application/write-personalization.js";

export const writeCoursePersonalizationApplication = createWriteCoursePersonalizationApplication({
  persist: (userId, courseId, payload) => saveCoursePersonalization(userId, courseId, payload),
});
