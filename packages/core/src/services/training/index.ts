import * as trainingService from "./trainingService";

export const {
  updateStepAndDay,
  validateTheoryStepForCompletion,
  getTrainingDays,
  getTrainingDayWithUserSteps,
  syncUserCourseStatusFromDays,
  getCourseTypeByDayOnCourseId,
  getStepInfoByIndex,
  validateStepTypeAndGetInfo,
  checkDayAccess,
} = trainingService;
export type { StepOperation } from "./trainingService";
