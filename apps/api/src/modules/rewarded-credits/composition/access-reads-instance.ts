/** Owner-scoped SQL reads for paid, private and occurrence-specific reward
 * access. Core owns the Gafus/Premium policy; no global Step/media bypass.
 */
import type { RewardedAccessReadPort } from "@gafus/core/services/rewardedCredits";
import {
  readOwnedCourseDayRewardedSteps, readOwnedRewardedUserStep,
  readRewardedPrivateCourseAssignment, readOwnedDailyRewardedUserStep,
  readPublishedDailyRewardedVideo, readOwnedRewardedVideoStep,
  readActiveLegacyRewardedGrant, readRewardedViewerRole,
  readRewardedCourseVideoOccurrences, readPendingRewardedStepNotificationUrl,
} from "@gafus/entitlements-server/rewarded-access-reads";
import { subscriptionAccessPort } from "../../app-subscription/composition/subscription-access-instance.js";

export const rewardedAccessReader: RewardedAccessReadPort = {
  getAppSubscriptionAccess: subscriptionAccessPort.getAppSubscriptionAccess,
  readOwnedCourseDayRewardedSteps, readOwnedRewardedUserStep,
  readRewardedPrivateCourseAssignment, readOwnedDailyRewardedUserStep,
  readPublishedDailyRewardedVideo, readOwnedRewardedVideoStep,
  readActiveLegacyRewardedGrant, readRewardedViewerRole,
  readRewardedCourseVideoOccurrences, readPendingRewardedStepNotificationUrl,
};
