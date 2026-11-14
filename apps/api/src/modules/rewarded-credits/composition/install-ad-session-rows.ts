/** Owning API composition: ad Persistence. The Core facade has no
 * SQL imports; this binds the ORIGINAL transactional implementation. */
import { registerRewardedAdRowsPort, type RewardedAdRowsPort } from "@gafus/core/services/rewardedCredits";
import * as sql from "@gafus/gafus-server/rewarded-ad-rows";

/** Exact SQL rows still carry Prisma delegate/transaction types. The bridge at
 * this application-owned boundary is solely a TypeScript representation
 * conversion; it does not wrap/replace the SQL, lock, CAS, or owner checks.
 * Non-cast methods remain checked structurally by the Port contract. */
const rows: RewardedAdRowsPort = {
  countRewardedDayRows: sql.countRewardedDayRows as unknown as RewardedAdRowsPort["countRewardedDayRows"],
  existsPublicRewardedArticle: sql.existsPublicRewardedArticle,
  existsPublicRewardedStep: sql.existsPublicRewardedStep,
  findActiveRewardedAccess: sql.findActiveRewardedAccess as unknown as RewardedAdRowsPort["findActiveRewardedAccess"],
  findBlockingAdSession: sql.findBlockingAdSession as unknown as RewardedAdRowsPort["findBlockingAdSession"],
  createAdSessionRow: sql.createAdSessionRow as unknown as RewardedAdRowsPort["createAdSessionRow"],
  findRewardedAdSessionRow: sql.findRewardedAdSessionRow as unknown as RewardedAdRowsPort["findRewardedAdSessionRow"],
  withRewardedDailyLock: sql.withRewardedDailyLock,
  readShownRewardedEvent: sql.readShownRewardedEvent as unknown as RewardedAdRowsPort["readShownRewardedEvent"],
  readDailyRewardedSettings: sql.readDailyRewardedSettings as unknown as RewardedAdRowsPort["readDailyRewardedSettings"],
  appendRewardedAdEvent: sql.appendRewardedAdEvent as unknown as RewardedAdRowsPort["appendRewardedAdEvent"],
  markAdSessionRewarded: sql.markAdSessionRewarded as unknown as RewardedAdRowsPort["markAdSessionRewarded"],
  markAdSessionNonRewardedStatus: sql.markAdSessionNonRewardedStatus,
  findRewardedGrantBySession: sql.findRewardedGrantBySession as unknown as RewardedAdRowsPort["findRewardedGrantBySession"],
  markAdSessionExpired: sql.markAdSessionExpired as unknown as RewardedAdRowsPort["markAdSessionExpired"],
  withRewardedAccessLock: sql.withRewardedAccessLock,
  createRewardedAccessGrant: sql.createRewardedAccessGrant as unknown as RewardedAdRowsPort["createRewardedAccessGrant"],
  markAdSessionGranted: sql.markAdSessionGranted as unknown as RewardedAdRowsPort["markAdSessionGranted"],
};
registerRewardedAdRowsPort(rows);
