/** Compatibility Core entrypoint: persistence and domain transaction are server-owned. */
import type { TrainingServiceApi } from "./trainingServiceContract";
export type { StepOperation, StepOccurrenceBinding } from "./trainingServiceContract";
import { checkCourseAccess, checkCourseAccessById } from "../course";
import { hasActiveGafusCourseStepAccess } from "../contentAccess";
import {
  getPremiumOrRewardedAccess,
  requirePremiumOrRewardedUnlock,
  SubscriptionOrCreditsRequiredError,
} from "../rewardedCredits";
import { calculateCourseStatusFromDayStatuses } from "../../utils/training";
import { replacePersonalizationPlaceholders } from "../../utils/personalization";
import { getTrainingDayContent } from "./trainingDayContent";

/** The SQL-backed implementation is composed by an owning server process.
 * Registration is write-once; a missing binder fails closed instead of
 * inventing a success, dropping a reward or weakening content ACL. */
const coreTrainingDependencies = {
  checkCourseAccess,
  checkCourseAccessById,
  hasActiveGafusCourseStepAccess,
  getPremiumOrRewardedAccess,
  requirePremiumOrRewardedUnlock,
  SubscriptionOrCreditsRequiredError,
  calculateCourseStatusFromDayStatuses,
  replacePersonalizationPlaceholders,
  getTrainingDayContent,
};
export function getCoreTrainingDependencies() { return coreTrainingDependencies; }
let installed: Readonly<TrainingServiceApi> | null = null;
export function registerTrainingServicePort(port: TrainingServiceApi): void {
  if (installed && installed !== port) throw new Error("TRAINING_SERVICE_PORT_ALREADY_BOUND");
  installed = port;
}
function requireTrainingService(): Readonly<TrainingServiceApi> {
  if (!installed) throw new Error("TRAINING_SERVICE_PORT_UNBOUND");
  return installed;
}
export const getTrainingDays: TrainingServiceApi["getTrainingDays"] = (...args) =>
  requireTrainingService().getTrainingDays(...args);
export const getTrainingDayWithUserSteps: TrainingServiceApi["getTrainingDayWithUserSteps"] = (...args) =>
  requireTrainingService().getTrainingDayWithUserSteps(...args);
export const resolveCourseStepRewardedTarget: TrainingServiceApi["resolveCourseStepRewardedTarget"] = (...args) =>
  requireTrainingService().resolveCourseStepRewardedTarget(...args);
export const getTrainingDayWithMonetizedSteps: TrainingServiceApi["getTrainingDayWithMonetizedSteps"] = (...args) =>
  requireTrainingService().getTrainingDayWithMonetizedSteps(...args);
export const requireCourseStepPremiumOrRewardedUnlock: TrainingServiceApi["requireCourseStepPremiumOrRewardedUnlock"] = (...args) =>
  requireTrainingService().requireCourseStepPremiumOrRewardedUnlock(...args);
export const requireCourseStepOperationAccess: TrainingServiceApi["requireCourseStepOperationAccess"] = (...args) =>
  requireTrainingService().requireCourseStepOperationAccess(...args);
export const validateTheoryStepForCompletion: TrainingServiceApi["validateTheoryStepForCompletion"] = (...args) =>
  requireTrainingService().validateTheoryStepForCompletion(...args);
export const getCourseTypeByDayOnCourseId: TrainingServiceApi["getCourseTypeByDayOnCourseId"] = (...args) =>
  requireTrainingService().getCourseTypeByDayOnCourseId(...args);
export const getStepInfoByIndex: TrainingServiceApi["getStepInfoByIndex"] = (...args) =>
  requireTrainingService().getStepInfoByIndex(...args);
export const validateStepTypeAndGetInfo: TrainingServiceApi["validateStepTypeAndGetInfo"] = (...args) =>
  requireTrainingService().validateStepTypeAndGetInfo(...args);
export const checkDayAccess: TrainingServiceApi["checkDayAccess"] = (...args) =>
  requireTrainingService().checkDayAccess(...args);
export const updateStepAndDay: TrainingServiceApi["updateStepAndDay"] = (...args) =>
  requireTrainingService().updateStepAndDay(...args);
export const applyStepAndDayTx: TrainingServiceApi["applyStepAndDayTx"] = (...args) =>
  requireTrainingService().applyStepAndDayTx(...args);
export const applyStepDayAndCourseTx: TrainingServiceApi["applyStepDayAndCourseTx"] = (...args) =>
  requireTrainingService().applyStepDayAndCourseTx(...args);
export const syncUserCourseStatusFromDays: TrainingServiceApi["syncUserCourseStatusFromDays"] = (...args) =>
  requireTrainingService().syncUserCourseStatusFromDays(...args);
export const syncUserCourseStatusFromDaysTx: TrainingServiceApi["syncUserCourseStatusFromDaysTx"] = (...args) =>
  requireTrainingService().syncUserCourseStatusFromDaysTx(...args);
