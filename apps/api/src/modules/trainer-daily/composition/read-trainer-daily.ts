/** AG1-001/TR014: deferred forwarding to the four existing Core getters only. */
import {
  getDailyCourseBundles,
  getDailyCourseBundleStepCandidates,
  getDailyCourseScheduleRange,
  getDailyCourseCandidates,
} from "@gafus/core/services/dailyCourse";
import { createReadTrainerDailyApplication } from "../application/read-trainer-daily.js";

export const readTrainerDailyApplication = createReadTrainerDailyApplication({
  readBundles: (actor) => getDailyCourseBundles(actor),
  readBundleStepCandidates: (actor) => getDailyCourseBundleStepCandidates(actor),
  readScheduleRange: (actor, range) => getDailyCourseScheduleRange(actor, range),
  readCandidates: (actor) => getDailyCourseCandidates(actor),
});
