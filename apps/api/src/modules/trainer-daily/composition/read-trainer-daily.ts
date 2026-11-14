import { withCorrelatedUseCase } from "../../../lib/operation-observability.js";
/** AG1-001/TR014: deferred forwarding to the four existing Core getters only. */
import {
  getDailyCourseBundles,
  getDailyCourseBundleStepCandidates,
  getDailyCourseScheduleRange,
  getDailyCourseCandidates,
} from "../../daily-course/composition/dailyCourseApplication.js";
import { createReadTrainerDailyApplication } from "../application/read-trainer-daily.js";

export const readTrainerDailyApplication = createReadTrainerDailyApplication({
  readBundles: (actor) => withCorrelatedUseCase("trainer.daily.bundles.read", () => getDailyCourseBundles(actor)),
  readBundleStepCandidates: (actor) => withCorrelatedUseCase("trainer.daily.step_candidates.read", () => getDailyCourseBundleStepCandidates(actor)),
  readScheduleRange: (actor, range) => withCorrelatedUseCase("trainer.daily.schedule.read", () => getDailyCourseScheduleRange(actor, range)),
  readCandidates: (actor) => withCorrelatedUseCase("trainer.daily.candidates.read", () => getDailyCourseCandidates(actor)),
});
