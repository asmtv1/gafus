/** Owner-scoped SQL reads for paid, private and occurrence-specific reward
 * access. Core owns the Gafus/Premium policy; no global Step/media bypass.
 */
import { registerRewardedAccessReadPort, type RewardedAccessReadPort } from "@gafus/core/services/rewardedCredits";
import {
  readOwnedCourseDayRewardedSteps, readOwnedRewardedUserStep,
  readRewardedPrivateCourseAssignment, readOwnedDailyRewardedUserStep,
  readPublishedDailyRewardedVideo, readOwnedRewardedVideoStep,
  readActiveLegacyRewardedGrant, readRewardedViewerRole,
  readRewardedCourseVideoOccurrences, readPendingRewardedStepNotificationUrl,
} from "@gafus/entitlements-server/rewarded-access-reads";

const rewardedAccessReader: RewardedAccessReadPort = {
  readOwnedCourseDayRewardedSteps, readOwnedRewardedUserStep,
  readRewardedPrivateCourseAssignment, readOwnedDailyRewardedUserStep,
  readPublishedDailyRewardedVideo, readOwnedRewardedVideoStep,
  readActiveLegacyRewardedGrant, readRewardedViewerRole,
  readRewardedCourseVideoOccurrences, readPendingRewardedStepNotificationUrl,
};
registerRewardedAccessReadPort(rewardedAccessReader);
