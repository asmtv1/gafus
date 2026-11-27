import { getAppFeatureFlagEnabled, APP_FEATURE_APP_SUBSCRIPTION_GATING } from "@gafus/feature-flags-server";
import { rewardedAccessReader } from "./access-reads-instance.js";
/** Real read-side adapter for occurrence-specific Gafus grants.
 * Core owns the policy, Persistence owns SQL and the grant read; never infer
 * private entitlement from a URL or a UserStep belonging to another user.
 */
import {
  createGafusInteropService, createRewardedAccessPolicy,
} from "@gafus/core/services/rewardedCredits";
import {
  readGafusUserStepOccurrence, readGafusVideoOccurrences,
} from "@gafus/course-read-server/gafus-entitlement-reads";
import { hasActiveGafusCourseStepAccess } from "@gafus/core/services/contentAccess";
import { occurrenceReadPort } from "../../content-access/composition/occurrence-reads-instance.js";

export const gafusInteropApplication = createGafusInteropService({
  readUserStepOccurrence: readGafusUserStepOccurrence,
  readVideoOccurrences: readGafusVideoOccurrences,
  hasActiveCourseStepGrant: (input) => hasActiveGafusCourseStepAccess(input, occurrenceReadPort),
});

export const rewardedAccessPolicy = createRewardedAccessPolicy(
  rewardedAccessReader, () => getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true),
  input => hasActiveGafusCourseStepAccess(input, occurrenceReadPort),
);
export const { hasRewardedTargetUnlock, getPremiumOrRewardedAccess, requirePremiumOrRewardedUnlock,
  requirePremiumOrRewardedAccessForStepNotification } = rewardedAccessPolicy;

export const {
  requirePremiumOrRewardedAccessForUserStep,
  requirePremiumOrRewardedAccessForVideoUrl,
} = rewardedAccessPolicy.createGafusRewardedAccessService(gafusInteropApplication);
