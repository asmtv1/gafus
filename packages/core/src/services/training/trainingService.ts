/** Pure training-domain dependencies. The application owns the SQL service instance. */
export type { StepOperation, StepOccurrenceBinding } from "./trainingServiceContract";
import type { CatalogReadService } from "../course";
import {
  type RewardedAccessPolicy,
  SubscriptionOrCreditsRequiredError,
} from "../rewardedCredits";
import { calculateCourseStatusFromDayStatuses } from "../../utils/training";
import { replacePersonalizationPlaceholders } from "../../utils/personalization";

/** The SQL-backed implementation is composed by its owning server process. */
const coreTrainingDependencies = {
  SubscriptionOrCreditsRequiredError,
  calculateCourseStatusFromDayStatuses,
  replacePersonalizationPlaceholders,
};
export function getCoreTrainingDependencies(access: Pick<CatalogReadService, "checkCourseAccess" | "checkCourseAccessById"> & Pick<RewardedAccessPolicy, "getPremiumOrRewardedAccess" | "requirePremiumOrRewardedUnlock">) {
  return { ...coreTrainingDependencies, ...access };
}
