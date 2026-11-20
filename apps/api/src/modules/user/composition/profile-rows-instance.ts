/** Canonical owner-scoped profile SQL projections and avatar transaction.
 * Original identity-write server keeps SELECT allowlists and a PostgreSQL
 * row lock around avatar URL replacement. Core is the only public DTO owner,
 * and performs storage upload/compensation outside that database lock.
 */
import type { ProfileRowsPort } from "@gafus/core/services/user";
import {
  readUserProfileRow, upsertProfileFields, readProfileActorExists,
  readUserIdByUsernameRow, readPublicProfileRow, replaceProfileAvatarRow,
  readUserWithTrainingsRow, readUserProfileForApiRow,
  readOnboardingTourStatusRow, markOnboardingTourSeenRow,
  readPaidChatDisplayEntitlement,
} from "@gafus/identity-write-server/profile-rows";
export const profileRows: ProfileRowsPort = {
  readUserProfileRow, upsertProfileFields, readProfileActorExists,
  readUserIdByUsernameRow, readPublicProfileRow, replaceProfileAvatarRow,
  readUserWithTrainingsRow, readUserProfileForApiRow,
  readOnboardingTourStatusRow, markOnboardingTourSeenRow,
  readPaidChatDisplayEntitlement,
};
