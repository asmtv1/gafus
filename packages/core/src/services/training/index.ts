import * as trainingService from "./trainingService";

export const {
  updateStepAndDay,
  validateTheoryStepForCompletion,
  getTrainingDays,
  getTrainingDayWithMonetizedSteps,
  getTrainingDayWithUserSteps,
  resolveCourseStepRewardedTarget,
  requireCourseStepPremiumOrRewardedUnlock,
  syncUserCourseStatusFromDays,
  getCourseTypeByDayOnCourseId,
  getStepInfoByIndex,
  validateStepTypeAndGetInfo,
  checkDayAccess,
} = trainingService;
export type { StepOperation } from "./trainingService";
