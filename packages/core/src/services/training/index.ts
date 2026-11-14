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
export { registerTrainingServicePort, getCoreTrainingDependencies } from "./trainingService";

export { getCourseCacheMetricsSnapshot, canReadCourseCacheMetrics } from "./trainingContentMetrics";
export { registerCourseContentRevisionReadPort, getVerifiedCourseContentRevision } from "./trainingContentRevision";
export type { CourseContentRevisionReadPort } from "./trainingContentRevision";
export { registerTrainingDayContentReadPort } from "./trainingDayContentReadPort";
export type { TrainingDayContentReadPort } from "./trainingDayContentReadPort";

export { onlineStepOccurrencesMatch, projectOnlineStepBinding } from "./onlineStepBinding";

export type { TrainingServiceApi } from "./trainingServiceContract";
