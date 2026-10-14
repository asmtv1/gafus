import * as trainingService from "./trainingService";

export const {
  updateStepAndDay,
  validateTheoryStepForCompletion,
  getTrainingDays,
  getTrainingDayWithMonetizedSteps,
  getTrainingDayWithUserSteps,
  resolveCourseStepRewardedTarget,
  requireCourseStepOperationAccess,
  requireCourseStepPremiumOrRewardedUnlock,
  syncUserCourseStatusFromDays,
  getCourseTypeByDayOnCourseId,
  getStepInfoByIndex,
  validateStepTypeAndGetInfo,
  checkDayAccess,
} = trainingService;
export type { StepOperation } from "./trainingService";

export { getCourseCacheMetricsSnapshot, canReadCourseCacheMetrics } from "./trainingContentMetrics";
