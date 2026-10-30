/** Defer the existing personalization Core write until the HTTP command. */
import { saveCoursePersonalization } from "@gafus/core/services/course";
import { createWriteCoursePersonalizationApplication } from "../application/write-personalization.js";

export const writeCoursePersonalizationApplication = createWriteCoursePersonalizationApplication({
  persist: (userId, courseId, payload) => saveCoursePersonalization(userId, courseId, payload),
});
