/** Offline read-only runtime-image release check for the extracted package graph.
 * Only loads JSON and resolves on-disk compiled JS/declarations; never imports
 * service modules or connects to DB, Redis, Cloud.ru or any external provider.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// Frozen original nine-package export graph. Preserve its exact 48-export
// minimum; adding new domains must not hide missing legacy entrypoints.
const legacyPackages = [
  '@gafus/core-client',
  '@gafus/achievements-server',
  '@gafus/consent-server',
  '@gafus/mobile-intro-server',
  '@gafus/notifications-server',
  '@gafus/feature-flags-server',
  '@gafus/admin-rewarded-ads-server',
  '@gafus/tracking-server',
  '@gafus/admin-reengagement-server',
];
// The new Chat2 Web/Mobile mode is an intentionally approved addition to the
// original nine-package 48-export baseline. Verify it separately so missing
// old exports cannot be obscured by new ones.
const chat2ClientExport = '@gafus/core-client/chat2/realtime-subscription';
// Walk tracking is a new shared public API, not a historical legacy entry.
const walkTrackingExport = '@gafus/core-client/walk-tracking';
// Chat2 additions replace retired VK/Stream entrypoints without weakening the 9/49 baseline.
const chat2SendAttemptExport = '@gafus/core-client/chat2/send-attempt';
const chatOutboxDiagnosticsExport = '@gafus/notifications-server/chat-outbox-diagnostics';
// Independent accepted addition: isolated reminder SQL port, not part of the
// 48 frozen legacy public APIs. Must exist in every production runtime image.
const trainingReminderExport = '@gafus/notifications-server/trainingReminderClaims';
const trainingReminderDeliveryExport = '@gafus/notifications-server/training-reminder-delivery';
// New application composition is separate from the immutable original 9/49 graph.
const trainingReminderApplicationExport = '@gafus/notifications-server/training-reminder-application';
// Admin broadcast is a distinct lazy, explicitly confirmed server-only side
// effect. It is never exposed via browser or the broad Core domain barrel.
const adminBroadcastExport = '@gafus/notifications-server/adminBroadcastService';
const pushSubscriptionsExport = '@gafus/notifications-server/push-subscriptions';
const gafusDeliveryExport = '@gafus/notifications-server/gafus-delivery';
const publicPlatformStatsExport = '@gafus/statistics/platform-stats';
const staffUserSearchExport = '@gafus/statistics/user-search';
const smartPersistenceExport = '@gafus/feed-server/smart-persistence';
const retiredFeedPhotoExport = '@gafus/feed-server/retired-photo-queue';
const gafusReactionProgressExport = '@gafus/feed-server/gafus-reaction-progress';
const questionNotificationExport = '@gafus/questions-server/notifications';
const trainerEditorCountsExport = '@gafus/statistics/trainer-editor-counts';
const trainerVideoPlaybackExport = '@gafus/statistics/trainer-video-playback';
const feedRuntimeExport = '@gafus/feed-server/runtime-services';
const feedBackgroundExport = '@gafus/feed-server/background-operations';
const consultationAdminExport = '@gafus/consultation-server/admin-bookings';
const consultationReadbackExport = '@gafus/consultation-server/booking-readback';
const consultationVoxExport = '@gafus/consultation-server/vox';
const examCleanupExport = '@gafus/exam-server/cleanup';
const galleryRuntimeExport = '@gafus/gallery-server/runtime-service';
const galleryCloudRecoveryExport = '@gafus/gallery-server/cloud-recovery';
const questionsPhotosExport = '@gafus/questions-server/photos';
const coursePublicCatalogExport = '@gafus/course-server/public-catalog';
const coursePersonalizationExport = '@gafus/course-server/personalization';
const courseReviewsExport = '@gafus/course-server/reviews';
const courseFavoritesExport = '@gafus/course-server/favorites';
const courseMiniGuidesExport = '@gafus/course-server/mini-guides';
const courseCacheRevisionExport = '@gafus/course-server/cache-revision';
const onlineStepBindingExport = '@gafus/course-server/online-step-binding';
const consultationMailDeliveryExport = '@gafus/consultation-server/mail-delivery';
const petsWeightExport = '@gafus/pets-server/weight';
const dogWalksExport = '@gafus/tracking-server/walks';
const mediaPurgeExport = '@gafus/media-server/purge-repository';
const trainerTranscodingExport = '@gafus/media-server/trainer-transcoding';
const videoProgressExport = '@gafus/course-server/video-progress';
const articleLikesExport = '@gafus/article-server/likes';
const articleRowsExport = '@gafus/article-server/article-rows';
const promoCodeRowsExport = '@gafus/subscription-finance-server/promo-code-rows';
const profitDashboardRowsExport = '@gafus/subscription-finance-server/profit-dashboard-rows';
const profitVideoRowsExport = '@gafus/subscription-finance-server/profit-video-rows';
const gafusAdminRowsExport = '@gafus/gafus-server/admin-rows';
const trainerVideoRowsExport = '@gafus/media-server/trainer-video-rows';
const partnerRowsExport = '@gafus/subscription-finance-server/partner-rows';
const slotRowsExport = '@gafus/consultation-query-server/slot-rows';
const preventionRowsExport = '@gafus/pets-server/prevention-rows';
const accountDeletionRowsExport = '@gafus/identity-write-server/account-deletion-rows';
const rewardedWalletRowsExport = '@gafus/gafus-server/rewarded-wallet-rows';
const authRowsExport = '@gafus/identity-write-server/auth-rows';
const trainerCourseRowsExport = '@gafus/course-progress-server/trainer-course-rows';
const rewardedAdRowsExport = '@gafus/gafus-server/rewarded-ad-rows';
const offlineVideoRowsExport = '@gafus/course-progress-server/offline-video-rows';
const offlineMutationRowsExport = '@gafus/course-progress-server/offline-mutation-rows';
const trainerStepRowsExport = '@gafus/course-progress-server/trainer-step-rows';
const adminRowsExport = '@gafus/subscription-finance-server/admin-rows';
const reminderReviewRowsExport = '@gafus/identity-write-server/reminder-review-rows';
const mediaDbPortsExport = '@gafus/media-server/media-db-ports';
const feedRankedRowsExport = '@gafus/media-server/feed-ranked-rows';
const petRowsExport = '@gafus/pets-server/pet-rows';
const examServiceExport = '@gafus/exam-server/exam-service';
const examRetentionExport = '@gafus/exam-server/retention-policy';
const questionWriteServiceExport = '@gafus/questions-write-server/service';
const questionWriteErrorsExport = '@gafus/questions-write-server/errors';
const questionWriteSchemasExport = '@gafus/questions-write-server/schemas';
const trainingServiceExport = '@gafus/course-progress-server/training-service';
const dailyCourseServiceExport = '@gafus/course-progress-server/daily-course-service';
const consultationWriteServiceExport = '@gafus/consultation-write-server/service';
const consultationWriteValidationExport = '@gafus/consultation-write-server/validation';
const paymentServiceExport = '@gafus/subscription-payment-server/service';
const paymentPureExport = '@gafus/subscription-payment-server/payment-pure';
const paymentAppleEnvExport = '@gafus/subscription-payment-server/apple-environment';
const paymentPlansExport = '@gafus/subscription-payment-server/plans';
const paymentPromoExport = '@gafus/subscription-payment-server/promo-code';
const paymentFinanceWrapperExport = '@gafus/subscription-payment-server/payment-finance';
const paymentPartnerExport = '@gafus/subscription-payment-server/partner';
const paymentProfitExport = '@gafus/subscription-payment-server/profit-math';
const gafusActivityExport = '@gafus/gafus-server/activity-read';
const gafusSettingsExport = '@gafus/gafus-server/settings-read';
const policyReadsExport = '@gafus/entitlements-server/policy-reads';
const rewardedAccessReadsExport = '@gafus/entitlements-server/rewarded-access-reads';
const questionPhotoTaskExport = '@gafus/media-server/question-photo-task';
const petReadExport = '@gafus/pets-server/pet-reads';
const coursePathReadExport = '@gafus/course-read-server/course-path-read';
const legacyCatalogRowsExport = '@gafus/course-read-server/legacy-catalog-rows';
const trainerAIPersistenceExport = '@gafus/trainer-ai-server/persistence';
const courseContentRevisionExport = '@gafus/course-read-server/content-revision';
const gafusWalletLockExport = '@gafus/gafus-server/wallet-lock';
const courseProgressExport = '@gafus/course-progress-server/completion';
const passwordResetExport = '@gafus/identity-write-server/password-reset';
const consultationEligibilityExport = '@gafus/consultation-query-server/booking-eligibility';
const paymentFinanceExport = '@gafus/subscription-finance-server/payment-finance';
const courseEditorSnapshotExport = '@gafus/course-read-server/editor-snapshot';
const trialUsageExport = '@gafus/subscription-trial-server/trial-usage';
const consultationEmailOutboxExport = '@gafus/notifications-server/consultation-email-outbox';
const deletedMediaPurgeExport = '@gafus/media-server/deleted-media-purge';
const questionV2CleanupExport = '@gafus/media-server/question-v2-cleanup';
const npdOperationExport = '@gafus/subscription-finance-server/npd-operation-persistence';
const vetVisitDetailExport = '@gafus/pets-server/vet-visit-detail';
const gafusEntitlementReadsExport = '@gafus/course-read-server/gafus-entitlement-reads';
const reminderExpiryRedactionExport = '@gafus/notifications-server/reminder-expiry-redaction';
const versionedCourseDeleteExport = '@gafus/course-server/course-delete-versioned';
const rewardedSettingsExport = '@gafus/gafus-server/rewarded-settings';
const versionedCourseRowsExport = '@gafus/course-progress-server/course-version-rows';
const videoAccessReadExport = '@gafus/course-read-server/video-access-read';
const trainingReminderStorageExport = '@gafus/notifications-server/training-reminder-storage';
const gafusWalletRecordsExport = '@gafus/gafus-server/wallet-records';
const diaryEntriesExport = '@gafus/course-progress-server/diary-entries';
const surveyRowsExport = '@gafus/course-progress-server/survey-rows';
const trainerNoteRowsExport = '@gafus/course-progress-server/trainer-note-rows';
const legacyImportRecordsExport = '@gafus/gafus-server/legacy-import-records';
const preventionReminderRowsExport = '@gafus/pets-server/prevention-reminder-rows';
const npdReceiptExport = '@gafus/subscription-finance-server/npd-receipts';
const profitReconciliationExport = '@gafus/subscription-finance-server/profit-reconciliation-rows';
const registrationContextReadsExport = '@gafus/identity-write-server/registration-context-reads';
const gafusUnlockRecordsExport = '@gafus/gafus-server/unlock-records';
const accountCleanupRecordsExport = '@gafus/identity-write-server/account-cleanup-records';
const accountCleanupWorkerRowsExport = '@gafus/identity-write-server/account-cleanup-worker-rows';
const cynologistCatalogRowsExport = '@gafus/consultation-query-server/cynologist-catalog-rows';
const consultationScheduleRowsExport = '@gafus/consultation-query-server/schedule-rows';
const registrationContractRowsExport = '@gafus/identity-write-server/registration-contract-rows';
const adminUserReadsExport = '@gafus/identity-write-server/admin-user-reads';
const adminUserWritesExport = '@gafus/identity-write-server/admin-user-writes';
const petMediaOutboxExport = '@gafus/pets-server/pet-media-deletion-outbox';
const petMediaSqlExport = '@gafus/pets-server/pet-media-deletion-sql';
const petMediaDefaultDbExport = '@gafus/pets-server/pet-media-deletion-default';
const vetVisitWriteRowsExport = '@gafus/pets-server/vet-visit-write-rows';
const newPackages = [
  '@gafus/subscription-read-server',
  '@gafus/subscription-write-server',
  '@gafus/statistics',
  '@gafus/logger',
  '@gafus/feed-server',
  '@gafus/questions-server',
  '@gafus/gallery-server',
  '@gafus/consultation-server',
  '@gafus/article-server',
  '@gafus/gafus-server',
  '@gafus/entitlements-server',
  '@gafus/media-server',
  '@gafus/pets-server',
  '@gafus/course-read-server',
  '@gafus/trainer-ai-server',
  '@gafus/course-progress-server',
  '@gafus/identity-write-server',
  '@gafus/consultation-query-server',
  '@gafus/subscription-finance-server',
  '@gafus/subscription-trial-server',
  '@gafus/exam-server', // Exam domain is now consumed directly by Core in BOTH targets.
  '@gafus/questions-write-server', // Questions persistence is a Core dependency in both images.
  '@gafus/consultation-write-server', // Booking state transitions, injected subscription and push policies.
  '@gafus/subscription-payment-server', // Apple/YooKassa payment and refund persistence.
  '@gafus/subscription-shared', // pure billing/Apple/promo policies required by Core.
  '@gafus/questions-shared', // immutable QuestionError and Zod schema identity.
  '@gafus/pets-shared', // pure owner-locked pet-media locator and deletion policy.
  '@gafus/media-shared', // shared Feed/Gallery types and immutable selectors.

];
// Both targets must contain the compiled shared public contracts, not only a
// working source alias in the developer's pnpm workspace.
const sharedContracts = [
  ...["appleEnvironment", "paymentPure", "plans", "profitMath", "promoCode"]
    .map(key => `@gafus/subscription-shared/${key}`),
  "@gafus/questions-shared/errors",
  "@gafus/questions-shared/schemas",
  "@gafus/pets-shared/pet-media-deletion-outbox",
  "@gafus/pets-shared/vet-visit-error",
  "@gafus/media-shared/media-db-ports",
  "@gafus/media-shared/purge-paths",
];
const seenSharedContracts = new Set();
// Architecture additions must not inflate the frozen legacy baseline.
const chat2RoomPresentationExport = '@gafus/core-client/chat2/room-presentation';
const subscriptionSelectionExport = '@gafus/core-client/utils/subscription-selection';
const chat2DraftExport = '@gafus/core-client/chat2/draft';
const chat2OutboxRowsExport = '@gafus/notifications-server/chat2-outbox-rows';
const feedVideoRecoveryExport = '@gafus/feed-server/feed-video-recovery';
const chat2DeletionRowsExport = '@gafus/media-server/chat2-deletion-rows';
const chat2VideoRecoveryExport = '@gafus/media-server/chat2-video-recovery';
const catalogCardsExport = '@gafus/course-read-server/catalog-cards';
const subscriptionTransitionsExport = '@gafus/subscription-payment-server/transitions';
const architectureExports = [chat2RoomPresentationExport, subscriptionSelectionExport, chat2DraftExport, chat2OutboxRowsExport, feedVideoRecoveryExport, chat2DeletionRowsExport, chat2VideoRecoveryExport, catalogCardsExport, subscriptionTransitionsExport];
const seenArchitectureExports = new Set();
// Admin consultation DTO queries must only ship in the API image.
const mode = process.argv[2];
if (!['api', 'worker'].includes(mode)) throw Error('RUNTIME_IMAGE_TARGET_REQUIRED');
const apiOnly = ['@gafus/course-server'];
const workerOnly = [];
const packages = [
  ...legacyPackages, ...newPackages,
  ...(mode === 'api' ? apiOnly : []),
  ...(mode === 'worker' ? workerOnly : []),
];
const main = mode === 'api' ? '/app/dist/index.js' : '/app/dist/worker/src/index.js';
const assertFile = (path, label) => {
  try { if (!statSync(path).isFile()) throw Error('NOT_FILE'); }
  catch { throw Error(`RUNTIME_PACKAGE_MISSING:${label}`); }
};
assertFile(main, `${mode} main entry`);
let exportsChecked = 0;
let legacyExportsChecked = 0;
let chat2ClientExportChecked = false;
let walkTrackingExportChecked = false;
let chat2SendAttemptExportChecked = false;
let chatOutboxDiagnosticsExportChecked = false;
let trainingReminderExportChecked = false;
let trainingReminderDeliveryExportChecked = false;
let trainingReminderApplicationExportChecked = false;
let adminBroadcastExportChecked = false;
let pushSubscriptionsExportChecked = false;
let gafusDeliveryExportChecked = false;
let publicPlatformStatsExportChecked = false;
let staffUserSearchExportChecked = false;
let smartPersistenceExportChecked = false;
let retiredFeedPhotoExportChecked = false;
let gafusReactionProgressExportChecked = false;
let questionNotificationExportChecked = false;
let trainerEditorCountsExportChecked = false;
let trainerVideoPlaybackExportChecked = false;
let feedRuntimeExportChecked = false;
let feedBackgroundExportChecked = false;
let consultationAdminExportChecked = false;
let consultationReadbackExportChecked = false;
let consultationVoxExportChecked = false;
let examCleanupExportChecked = false;
let galleryRuntimeExportChecked = false;
let galleryCloudRecoveryExportChecked = false;
let questionsPhotosExportChecked = false;
let coursePublicCatalogExportChecked = false;
let coursePersonalizationExportChecked = false;
let courseReviewsExportChecked = false;
let courseFavoritesExportChecked = false;
let courseMiniGuidesExportChecked = false;
let courseCacheRevisionExportChecked = false;
let onlineStepBindingExportChecked = false;
let consultationMailDeliveryExportChecked = false;
let petsWeightExportChecked = false;
let dogWalksExportChecked = false;
let mediaPurgeExportChecked = false;
let trainerTranscodingExportChecked = false;
let videoProgressExportChecked = false;
let articleLikesExportChecked = false;
let articleRowsExportChecked = false;
let promoCodeRowsExportChecked = false;
let profitDashboardRowsExportChecked = false;
let profitVideoRowsExportChecked = false;
let gafusAdminRowsExportChecked = false;
let trainerVideoRowsExportChecked = false;
let partnerRowsExportChecked = false;
let slotRowsExportChecked = false;
let preventionRowsExportChecked = false;
let accountDeletionRowsExportChecked = false;
let rewardedWalletRowsExportChecked = false;
let authRowsExportChecked = false;
let trainerCourseRowsExportChecked = false;
let rewardedAdRowsExportChecked = false;
let offlineVideoRowsExportChecked = false;
let offlineMutationRowsExportChecked = false;
let trainerStepRowsExportChecked = false;
let adminRowsExportChecked = false;
let reminderReviewRowsExportChecked = false;
let mediaDbPortsExportChecked = false;
let feedRankedRowsExportChecked = false;
let petRowsExportChecked = false;
let examServiceExportChecked = false;
let examRetentionExportChecked = false;
let questionWriteServiceExportChecked = false;
let questionWriteErrorsExportChecked = false;
let questionWriteSchemasExportChecked = false;
let trainingServiceExportChecked = false;
let dailyCourseServiceExportChecked = false;
let consultationWriteServiceExportChecked = false;
let consultationWriteValidationExportChecked = false;
let paymentServiceExportChecked = false;
let paymentPureExportChecked = false;
let paymentAppleEnvExportChecked = false;
let paymentPlansExportChecked = false;
let paymentPromoExportChecked = false;
let paymentFinanceWrapperExportChecked = false;
let paymentPartnerExportChecked = false;
let paymentProfitExportChecked = false;
let gafusActivityExportChecked = false;
let gafusSettingsExportChecked = false;
let policyReadsExportChecked = false;
let rewardedAccessReadsExportChecked = false;
let questionPhotoTaskExportChecked = false;
let petReadExportChecked = false;
let coursePathReadExportChecked = false;
let legacyCatalogRowsExportChecked = false;
let trainerAIPersistenceExportChecked = false;
let courseContentRevisionExportChecked = false;
let gafusWalletLockExportChecked = false;
let courseProgressExportChecked = false;
let passwordResetExportChecked = false;
let consultationEligibilityExportChecked = false;
let paymentFinanceExportChecked = false;
let courseEditorSnapshotExportChecked = false;
let trialUsageExportChecked = false;
let consultationEmailOutboxExportChecked = false;
let deletedMediaPurgeExportChecked = false;
let questionV2CleanupExportChecked = false;
let npdOperationExportChecked = false;
let vetVisitDetailExportChecked = false;
let gafusEntitlementReadsExportChecked = false;
let reminderExpiryRedactionExportChecked = false;
let versionedCourseDeleteExportChecked = false;
let rewardedSettingsExportChecked = false;
let versionedCourseRowsExportChecked = false;
let videoAccessReadExportChecked = false;
let trainingReminderStorageExportChecked = false;
let gafusWalletRecordsExportChecked = false;
let diaryEntriesExportChecked = false;
let surveyRowsExportChecked = false;
let trainerNoteRowsExportChecked = false;
let legacyImportRecordsExportChecked = false;
let preventionReminderRowsExportChecked = false;
let npdReceiptExportChecked = false;
let profitReconciliationExportChecked = false;
let registrationContextReadsExportChecked = false;
let gafusUnlockRecordsExportChecked = false;
let accountCleanupRecordsExportChecked = false;
let accountCleanupWorkerRowsExportChecked = false;
let cynologistCatalogRowsExportChecked = false;
let consultationScheduleRowsExportChecked = false;
let registrationContractRowsExportChecked = false;
let adminUserReadsExportChecked = false;
let adminUserWritesExportChecked = false;
let petMediaOutboxExportChecked = false;
let petMediaSqlExportChecked = false;
let petMediaDefaultDbExportChecked = false;
let vetVisitWriteRowsExportChecked = false;
for (const name of packages) {
  // pnpm deploy may nest transitives under @gafus/core rather than exposing
  // them at the deployment root. Resolve from the real core consumer.
  const consumers = [
    createRequire('/app/package.json'),
    createRequire(realpathSync('/app/node_modules/@gafus/core/package.json')),
  ];
  let entry, consumer;
  for (const candidate of consumers) {
    try { entry = realpathSync(candidate.resolve(name)); consumer = candidate; break; }
    catch { /* Transitive package may exist in core pnpm tree only. */ }
  }
  if (!entry || !consumer) throw Error("RUNTIME_PACKAGE_ENTRY_MISSING:" + name);
  let moduleDir = resolve(entry, '..');
  let manifest;
  for (let i = 0; i < 8; i++) {
    try {
      const candidate = JSON.parse(readFileSync(join(moduleDir, 'package.json'), 'utf8'));
      if (candidate.name === name) { manifest = candidate; break; }
    } catch { /* Search above the compiled entry for its manifest. */ }
    const parent = resolve(moduleDir, '..');
    if (parent === moduleDir) break;
    moduleDir = parent;
  }
  if (!manifest) throw Error(`RUNTIME_PACKAGE_MANIFEST_MISSING:${name}`);
  if (manifest.name !== name || !manifest.exports || typeof manifest.exports !== 'object')
    throw Error(`RUNTIME_PACKAGE_MANIFEST_INVALID:${name}`);
  for (const [key, exportPaths] of Object.entries(manifest.exports)) {
    if (key.includes('*') || (key !== '.' && !key.startsWith('./')))
      throw Error(`RUNTIME_PACKAGE_EXPORT_INVALID:${name}`);
    if (typeof exportPaths !== 'object' || typeof exportPaths.types !== 'string' ||
        !exportPaths.types.startsWith('./dist/') || exportPaths.types.includes('..'))
      throw Error(`RUNTIME_PACKAGE_EXPORT_DECLARATION_INVALID:${name}:${key}`);
    const specifier = key === '.' ? name : `${name}/${key.slice(2)}`;
    let jsPath;
    try { jsPath = realpathSync(consumer.resolve(specifier)); }
    catch { throw Error(`RUNTIME_PACKAGE_MISSING:${specifier} compiled JS`); }
    // Resolving an exports map is not sufficient: both targets must exist.
    assertFile(jsPath, `${specifier} compiled JS`);
    assertFile(resolve(moduleDir, exportPaths.types), `${specifier} compiled declarations`);
    exportsChecked++;
    if (specifier === chat2ClientExport) chat2ClientExportChecked = true;
    else if (specifier === walkTrackingExport) walkTrackingExportChecked = true;
    else if (specifier === chat2SendAttemptExport) chat2SendAttemptExportChecked = true;
    else if (specifier === chatOutboxDiagnosticsExport) chatOutboxDiagnosticsExportChecked = true;
    else if (specifier === trainingReminderExport) trainingReminderExportChecked = true;
    else if (specifier === trainingReminderDeliveryExport) trainingReminderDeliveryExportChecked = true;
    else if (specifier === trainingReminderApplicationExport) trainingReminderApplicationExportChecked = true;
    else if (specifier === adminBroadcastExport) adminBroadcastExportChecked = true;
    else if (specifier === pushSubscriptionsExport) pushSubscriptionsExportChecked = true;
    else if (specifier === gafusDeliveryExport) gafusDeliveryExportChecked = true;
    else if (specifier === publicPlatformStatsExport) publicPlatformStatsExportChecked = true;
    else if (specifier === staffUserSearchExport) staffUserSearchExportChecked = true;
    else if (specifier === smartPersistenceExport) smartPersistenceExportChecked = true;
    else if (specifier === retiredFeedPhotoExport) retiredFeedPhotoExportChecked = true;
    else if (specifier === gafusReactionProgressExport) gafusReactionProgressExportChecked = true;
    else if (specifier === questionNotificationExport) questionNotificationExportChecked = true;
    else if (specifier === trainerEditorCountsExport) trainerEditorCountsExportChecked = true;
    else if (specifier === trainerVideoPlaybackExport) trainerVideoPlaybackExportChecked = true;
    else if (specifier === feedRuntimeExport) feedRuntimeExportChecked = true;
    else if (specifier === feedBackgroundExport) feedBackgroundExportChecked = true;
    else if (specifier === consultationAdminExport) consultationAdminExportChecked = true;
    else if (specifier === consultationReadbackExport) consultationReadbackExportChecked = true;
    else if (specifier === consultationVoxExport) consultationVoxExportChecked = true;
    else if (specifier === examCleanupExport) examCleanupExportChecked = true;
    else if (specifier === galleryRuntimeExport) galleryRuntimeExportChecked = true;
    else if (specifier === galleryCloudRecoveryExport) galleryCloudRecoveryExportChecked = true;
    else if (specifier === questionsPhotosExport) questionsPhotosExportChecked = true;
    else if (specifier === coursePublicCatalogExport) coursePublicCatalogExportChecked = true;
    else if (specifier === coursePersonalizationExport) coursePersonalizationExportChecked = true;
    else if (specifier === courseReviewsExport) courseReviewsExportChecked = true;
    else if (specifier === courseFavoritesExport) courseFavoritesExportChecked = true;
    else if (specifier === courseMiniGuidesExport) courseMiniGuidesExportChecked = true;
    else if (specifier === courseCacheRevisionExport) courseCacheRevisionExportChecked = true;
    else if (specifier === onlineStepBindingExport) onlineStepBindingExportChecked = true;
    else if (specifier === consultationMailDeliveryExport) consultationMailDeliveryExportChecked = true;
    else if (specifier === petsWeightExport) petsWeightExportChecked = true;
    else if (specifier === dogWalksExport) dogWalksExportChecked = true;
    else if (specifier === mediaPurgeExport) mediaPurgeExportChecked = true;
    else if (specifier === trainerTranscodingExport) trainerTranscodingExportChecked = true;
    else if (specifier === videoProgressExport) videoProgressExportChecked = true;
    else if (specifier === articleLikesExport) articleLikesExportChecked = true;
    else if (specifier === articleRowsExport) articleRowsExportChecked = true;
    else if (specifier === promoCodeRowsExport) promoCodeRowsExportChecked = true;
    else if (specifier === profitDashboardRowsExport) profitDashboardRowsExportChecked = true;
    else if (specifier === profitVideoRowsExport) profitVideoRowsExportChecked = true;
    else if (specifier === gafusAdminRowsExport) gafusAdminRowsExportChecked = true;
    else if (specifier === trainerVideoRowsExport) trainerVideoRowsExportChecked = true;
    else if (specifier === partnerRowsExport) partnerRowsExportChecked = true;
    else if (specifier === slotRowsExport) slotRowsExportChecked = true;
    else if (specifier === preventionRowsExport) preventionRowsExportChecked = true;
    else if (specifier === accountDeletionRowsExport) accountDeletionRowsExportChecked = true;
    else if (specifier === rewardedWalletRowsExport) rewardedWalletRowsExportChecked = true;
    else if (specifier === authRowsExport) authRowsExportChecked = true;
    else if (specifier === trainerCourseRowsExport) trainerCourseRowsExportChecked = true;
    else if (specifier === rewardedAdRowsExport) rewardedAdRowsExportChecked = true;
    else if (specifier === offlineVideoRowsExport) offlineVideoRowsExportChecked = true;
    else if (specifier === offlineMutationRowsExport) offlineMutationRowsExportChecked = true;
    else if (specifier === trainerStepRowsExport) trainerStepRowsExportChecked = true;
    else if (specifier === adminRowsExport) adminRowsExportChecked = true;
    else if (specifier === reminderReviewRowsExport) reminderReviewRowsExportChecked = true;
    else if (specifier === mediaDbPortsExport) mediaDbPortsExportChecked = true;
    else if (specifier === feedRankedRowsExport) feedRankedRowsExportChecked = true;
    else if (specifier === petRowsExport) petRowsExportChecked = true;
    else if (specifier === examServiceExport) examServiceExportChecked = true;
    else if (specifier === examRetentionExport) examRetentionExportChecked = true;
    else if (specifier === questionWriteServiceExport) questionWriteServiceExportChecked = true;
    else if (specifier === questionWriteErrorsExport) questionWriteErrorsExportChecked = true;
    else if (specifier === questionWriteSchemasExport) questionWriteSchemasExportChecked = true;
    else if (specifier === trainingServiceExport) trainingServiceExportChecked = true;
    else if (specifier === dailyCourseServiceExport) dailyCourseServiceExportChecked = true;
    else if (specifier === consultationWriteServiceExport) consultationWriteServiceExportChecked = true;
    else if (specifier === consultationWriteValidationExport) consultationWriteValidationExportChecked = true;
    else if (specifier === paymentServiceExport) paymentServiceExportChecked = true;
    else if (sharedContracts.includes(specifier)) seenSharedContracts.add(specifier);
    else if (specifier === paymentPureExport) paymentPureExportChecked = true;
    else if (specifier === paymentAppleEnvExport) paymentAppleEnvExportChecked = true;
    else if (specifier === paymentPlansExport) paymentPlansExportChecked = true;
    else if (specifier === paymentPromoExport) paymentPromoExportChecked = true;
    else if (specifier === paymentFinanceWrapperExport) paymentFinanceWrapperExportChecked = true;
    else if (specifier === paymentPartnerExport) paymentPartnerExportChecked = true;
    else if (specifier === paymentProfitExport) paymentProfitExportChecked = true;
    else if (specifier === gafusActivityExport) gafusActivityExportChecked = true;
    else if (specifier === gafusSettingsExport) gafusSettingsExportChecked = true;
    else if (specifier === policyReadsExport) policyReadsExportChecked = true;
    else if (specifier === rewardedAccessReadsExport) rewardedAccessReadsExportChecked = true;
    else if (specifier === questionPhotoTaskExport) questionPhotoTaskExportChecked = true;
    else if (specifier === petReadExport) petReadExportChecked = true;
    else if (specifier === coursePathReadExport) coursePathReadExportChecked = true;
    else if (specifier === legacyCatalogRowsExport) legacyCatalogRowsExportChecked = true;
    else if (specifier === trainerAIPersistenceExport) trainerAIPersistenceExportChecked = true;
    else if (specifier === courseContentRevisionExport) courseContentRevisionExportChecked = true;
    else if (specifier === gafusWalletLockExport) gafusWalletLockExportChecked = true;
    else if (specifier === courseProgressExport) courseProgressExportChecked = true;
    else if (specifier === passwordResetExport) passwordResetExportChecked = true;
    else if (specifier === consultationEligibilityExport) consultationEligibilityExportChecked = true;
    else if (specifier === paymentFinanceExport) paymentFinanceExportChecked = true;
    else if (specifier === courseEditorSnapshotExport) courseEditorSnapshotExportChecked = true;
    else if (specifier === trialUsageExport) trialUsageExportChecked = true;
    else if (specifier === consultationEmailOutboxExport) consultationEmailOutboxExportChecked = true;
    else if (specifier === deletedMediaPurgeExport) deletedMediaPurgeExportChecked = true;
    else if (specifier === questionV2CleanupExport) questionV2CleanupExportChecked = true;
    else if (specifier === npdOperationExport) npdOperationExportChecked = true;
    else if (specifier === vetVisitDetailExport) vetVisitDetailExportChecked = true;
    else if (specifier === gafusEntitlementReadsExport) gafusEntitlementReadsExportChecked = true;
    else if (specifier === reminderExpiryRedactionExport) reminderExpiryRedactionExportChecked = true;
    else if (specifier === versionedCourseDeleteExport) versionedCourseDeleteExportChecked = true;
    else if (specifier === rewardedSettingsExport) rewardedSettingsExportChecked = true;
    else if (specifier === versionedCourseRowsExport) versionedCourseRowsExportChecked = true;
    else if (specifier === videoAccessReadExport) videoAccessReadExportChecked = true;
    else if (specifier === trainingReminderStorageExport) trainingReminderStorageExportChecked = true;
    else if (specifier === gafusWalletRecordsExport) gafusWalletRecordsExportChecked = true;
    else if (specifier === diaryEntriesExport) diaryEntriesExportChecked = true;
    else if (specifier === surveyRowsExport) surveyRowsExportChecked = true;
    else if (specifier === trainerNoteRowsExport) trainerNoteRowsExportChecked = true;
    else if (specifier === legacyImportRecordsExport) legacyImportRecordsExportChecked = true;
    else if (specifier === preventionReminderRowsExport) preventionReminderRowsExportChecked = true;
    else if (specifier === npdReceiptExport) npdReceiptExportChecked = true;
    else if (specifier === profitReconciliationExport) profitReconciliationExportChecked = true;
    else if (specifier === registrationContextReadsExport) registrationContextReadsExportChecked = true;
    else if (specifier === gafusUnlockRecordsExport) gafusUnlockRecordsExportChecked = true;
    else if (specifier === accountCleanupRecordsExport) accountCleanupRecordsExportChecked = true;
    else if (specifier === accountCleanupWorkerRowsExport) accountCleanupWorkerRowsExportChecked = true;
    else if (specifier === cynologistCatalogRowsExport) cynologistCatalogRowsExportChecked = true;
    else if (specifier === consultationScheduleRowsExport) consultationScheduleRowsExportChecked = true;
    else if (specifier === registrationContractRowsExport) registrationContractRowsExportChecked = true;
    else if (specifier === adminUserReadsExport) adminUserReadsExportChecked = true;
    else if (specifier === adminUserWritesExport) adminUserWritesExportChecked = true;
    else if (specifier === petMediaOutboxExport) petMediaOutboxExportChecked = true;
    else if (specifier === petMediaSqlExport) petMediaSqlExportChecked = true;
    else if (specifier === petMediaDefaultDbExport) petMediaDefaultDbExportChecked = true;
    else if (specifier === vetVisitWriteRowsExport) vetVisitWriteRowsExportChecked = true;
    else if (specifier === chat2RoomPresentationExport) seenArchitectureExports.add(specifier);
    else if (specifier === subscriptionSelectionExport) seenArchitectureExports.add(specifier);
    else if (specifier === chat2DraftExport) seenArchitectureExports.add(specifier);
    else if (specifier === chat2OutboxRowsExport) seenArchitectureExports.add(specifier);
    else if (specifier === feedVideoRecoveryExport) seenArchitectureExports.add(specifier);
    else if (specifier === chat2DeletionRowsExport) seenArchitectureExports.add(specifier);
    else if (specifier === chat2VideoRecoveryExport) seenArchitectureExports.add(specifier);
    else if (specifier === catalogCardsExport) seenArchitectureExports.add(specifier);
    else if (specifier === subscriptionTransitionsExport) seenArchitectureExports.add(specifier);
    else if (legacyPackages.includes(name)) legacyExportsChecked++;
  }
  // The deployed package must carry declarations, not just source-side exports.
  const types = manifest.types ?? manifest.typings ?? manifest.exports['.']?.types;
  if (typeof types !== 'string' || types.includes('..'))
    throw Error(`RUNTIME_PACKAGE_TYPES_MISSING:${name}`);
  assertFile(resolve(moduleDir, types), `${name} declaration entry`);
}
if (!chat2ClientExportChecked) throw Error('RUNTIME_CHAT2_CLIENT_EXPORT_MISSING');
if (!walkTrackingExportChecked) throw Error('RUNTIME_WALK_TRACKING_EXPORT_MISSING');
if (!chat2SendAttemptExportChecked) throw Error('RUNTIME_CHAT2_SEND_ATTEMPT_EXPORT_MISSING');
if (!chatOutboxDiagnosticsExportChecked) throw Error('RUNTIME_CHAT_OUTBOX_DIAGNOSTICS_EXPORT_MISSING');

if (legacyPackages.length !== 9 || legacyExportsChecked !== 48)
  throw Error(`RUNTIME_LEGACY_PACKAGE_EXPORT_COVERAGE_CHANGED:packages=${legacyPackages.length}:exports=${legacyExportsChecked}`);
if (!trainingReminderExportChecked) throw Error('RUNTIME_TRAINING_REMINDER_EXPORT_MISSING');
if (!trainingReminderDeliveryExportChecked) throw Error('RUNTIME_TRAINING_REMINDER_DELIVERY_EXPORT_MISSING');
if (!trainingReminderApplicationExportChecked) throw Error('RUNTIME_TRAINING_REMINDER_APPLICATION_EXPORT_MISSING');
if (!adminBroadcastExportChecked) throw Error('RUNTIME_ADMIN_BROADCAST_EXPORT_MISSING');
if (!pushSubscriptionsExportChecked) throw Error('RUNTIME_PUSH_SUBSCRIPTIONS_EXPORT_MISSING');
if (!gafusDeliveryExportChecked) throw Error('RUNTIME_GAFUS_DELIVERY_EXPORT_MISSING');
if (!publicPlatformStatsExportChecked) throw Error('RUNTIME_PLATFORM_STATS_EXPORT_MISSING');
if (!staffUserSearchExportChecked) throw Error('RUNTIME_STAFF_SEARCH_EXPORT_MISSING');
if (!smartPersistenceExportChecked) throw Error('RUNTIME_SMART_FEED_EXPORT_MISSING');
if (!retiredFeedPhotoExportChecked) throw Error('RUNTIME_RETIRED_FEED_PHOTO_EXPORT_MISSING');
if (!gafusReactionProgressExportChecked) throw Error('RUNTIME_GAFUS_REACTION_PROGRESS_EXPORT_MISSING');
if (!questionNotificationExportChecked) throw Error('RUNTIME_QUESTION_NOTIFICATIONS_EXPORT_MISSING');
if (!trainerEditorCountsExportChecked) throw Error('RUNTIME_TRAINER_EDITOR_COUNTS_EXPORT_MISSING');
if (!trainerVideoPlaybackExportChecked) throw Error('RUNTIME_TRAINER_VIDEO_PLAYBACK_EXPORT_MISSING');
if (!feedRuntimeExportChecked) throw Error('RUNTIME_FEED_RUNTIME_EXPORT_MISSING');
if (!feedBackgroundExportChecked) throw Error('RUNTIME_FEED_BACKGROUND_EXPORT_MISSING');
if (mode === 'api' && !consultationAdminExportChecked) throw Error('RUNTIME_CONSULTATION_ADMIN_EXPORT_MISSING');
if (mode === 'api' && !consultationReadbackExportChecked) throw Error('RUNTIME_CONSULTATION_READBACK_EXPORT_MISSING');
if (mode === 'api' && !consultationVoxExportChecked) throw Error('RUNTIME_CONSULTATION_VOX_EXPORT_MISSING');
if (!examCleanupExportChecked) throw Error('RUNTIME_EXAM_CLEANUP_EXPORT_MISSING');
if (!galleryRuntimeExportChecked) throw Error('RUNTIME_GALLERY_RUNTIME_EXPORT_MISSING');
if (!galleryCloudRecoveryExportChecked) throw Error('RUNTIME_GALLERY_RECOVERY_EXPORT_MISSING');
if (!questionsPhotosExportChecked) throw Error('RUNTIME_QUESTIONS_PHOTOS_EXPORT_MISSING');
if (mode === 'api' && !coursePublicCatalogExportChecked) throw Error('RUNTIME_COURSE_PUBLIC_CATALOG_EXPORT_MISSING');
if (mode === 'api' && !coursePersonalizationExportChecked) throw Error('RUNTIME_COURSE_PERSONALIZATION_EXPORT_MISSING');
if (mode === 'api' && !courseReviewsExportChecked) throw Error('RUNTIME_COURSE_REVIEWS_EXPORT_MISSING');
if (mode === 'api' && !courseFavoritesExportChecked) throw Error('RUNTIME_COURSE_FAVORITES_EXPORT_MISSING');
if (mode === 'api' && !courseMiniGuidesExportChecked) throw Error('RUNTIME_COURSE_MINI_GUIDES_EXPORT_MISSING');
if (mode === 'api' && !courseCacheRevisionExportChecked) throw Error('RUNTIME_COURSE_CACHE_REVISION_EXPORT_MISSING');
if (mode === 'api' && !onlineStepBindingExportChecked) throw Error('RUNTIME_ONLINE_STEP_BINDING_EXPORT_MISSING');
if (!consultationMailDeliveryExportChecked) throw Error('RUNTIME_CONSULTATION_MAIL_DELIVERY_EXPORT_MISSING');
if (mode === 'api' && !petsWeightExportChecked) throw Error('RUNTIME_PETS_WEIGHT_EXPORT_MISSING');
if (!dogWalksExportChecked) throw Error('RUNTIME_DOG_WALKS_EXPORT_MISSING');
if (mode === 'worker' && !mediaPurgeExportChecked) throw Error('RUNTIME_MEDIA_PURGE_REPOSITORY_EXPORT_MISSING');
if (mode === 'worker' && !trainerTranscodingExportChecked) throw Error('RUNTIME_TRAINER_TRANSCODING_EXPORT_MISSING');
if (mode === 'api' && !videoProgressExportChecked) throw Error('RUNTIME_VIDEO_PROGRESS_EXPORT_MISSING');
if (!articleLikesExportChecked) throw Error('RUNTIME_ARTICLE_LIKES_EXPORT_MISSING');
if (!articleRowsExportChecked) throw Error('RUNTIME_ARTICLE_ROWS_EXPORT_MISSING');
if (!promoCodeRowsExportChecked) throw Error('RUNTIME_PROMO_CODE_ROWS_EXPORT_MISSING');
if (!profitDashboardRowsExportChecked) throw Error('RUNTIME_PROFIT_DASHBOARD_ROWS_EXPORT_MISSING');
if (!profitVideoRowsExportChecked) throw Error('RUNTIME_PROFIT_VIDEO_ROWS_EXPORT_MISSING');
if (!gafusAdminRowsExportChecked) throw Error('RUNTIME_GAFUS_ADMIN_ROWS_EXPORT_MISSING');
if (!trainerVideoRowsExportChecked) throw Error('RUNTIME_TRAINER_VIDEO_ROWS_EXPORT_MISSING');
if (!partnerRowsExportChecked) throw Error('RUNTIME_PARTNER_ROWS_EXPORT_MISSING');
if (!slotRowsExportChecked) throw Error('RUNTIME_SLOT_ROWS_EXPORT_MISSING');
if (!preventionRowsExportChecked) throw Error('RUNTIME_PREVENTION_ROWS_EXPORT_MISSING');
if (!accountDeletionRowsExportChecked) throw Error('RUNTIME_ACCOUNT_DELETION_ROWS_EXPORT_MISSING');
if (!rewardedWalletRowsExportChecked) throw Error('RUNTIME_REWARDED_WALLET_ROWS_EXPORT_MISSING');
if (!authRowsExportChecked) throw Error('RUNTIME_AUTH_ROWS_EXPORT_MISSING');
if (!trainerCourseRowsExportChecked) throw Error('RUNTIME_TRAINER_COURSE_ROWS_EXPORT_MISSING');
if (!rewardedAdRowsExportChecked) throw Error('RUNTIME_REWARDED_AD_ROWS_EXPORT_MISSING');
if (!offlineVideoRowsExportChecked) throw Error('RUNTIME_OFFLINE_VIDEO_ROWS_EXPORT_MISSING');
if (!offlineMutationRowsExportChecked) throw Error('RUNTIME_OFFLINE_MUTATION_ROWS_EXPORT_MISSING');
if (!trainerStepRowsExportChecked) throw Error('RUNTIME_TRAINER_STEP_ROWS_EXPORT_MISSING');
if (!adminRowsExportChecked) throw Error('RUNTIME_ADMIN_ROWS_EXPORT_MISSING');
if (!reminderReviewRowsExportChecked) throw Error('RUNTIME_REMINDER_REVIEW_ROWS_EXPORT_MISSING');
if (!mediaDbPortsExportChecked) throw Error('RUNTIME_MEDIA_DB_PORTS_EXPORT_MISSING');
if (!feedRankedRowsExportChecked) throw Error('RUNTIME_FEED_RANKED_ROWS_EXPORT_MISSING');
if (!petRowsExportChecked) throw Error('RUNTIME_PET_ROWS_EXPORT_MISSING');
if (!examServiceExportChecked) throw Error('RUNTIME_EXAM_SERVICE_EXPORT_MISSING');
if (!examRetentionExportChecked) throw Error('RUNTIME_EXAM_RETENTION_EXPORT_MISSING');
if (!questionWriteServiceExportChecked) throw Error('RUNTIME_QUESTION_WRITE_SERVICE_EXPORT_MISSING');
if (!questionWriteErrorsExportChecked) throw Error('RUNTIME_QUESTION_WRITE_ERRORS_EXPORT_MISSING');
if (!questionWriteSchemasExportChecked) throw Error('RUNTIME_QUESTION_WRITE_SCHEMAS_EXPORT_MISSING');
if (!trainingServiceExportChecked) throw Error('RUNTIME_TRAINING_SERVICE_EXPORT_MISSING');
if (!dailyCourseServiceExportChecked) throw Error('RUNTIME_DAILY_COURSE_SERVICE_EXPORT_MISSING');
if (!consultationWriteServiceExportChecked) throw Error('RUNTIME_CONSULTATION_WRITE_SERVICE_EXPORT_MISSING');
if (!consultationWriteValidationExportChecked) throw Error('RUNTIME_CONSULTATION_WRITE_VALIDATION_EXPORT_MISSING');
if (!paymentServiceExportChecked) throw Error('RUNTIME_PAYMENT_SERVICE_EXPORT_MISSING');
if (!paymentPureExportChecked) throw Error('RUNTIME_PAYMENT_PURE_EXPORT_MISSING');
if (!paymentAppleEnvExportChecked) throw Error('RUNTIME_PAYMENT_APPLE_ENV_EXPORT_MISSING');
if (!paymentPlansExportChecked) throw Error('RUNTIME_PAYMENT_PLANS_EXPORT_MISSING');
if (!paymentPromoExportChecked) throw Error('RUNTIME_PAYMENT_PROMO_EXPORT_MISSING');
if (!paymentFinanceWrapperExportChecked) throw Error('RUNTIME_PAYMENT_FINANCE_WRAPPER_EXPORT_MISSING');
if (!paymentPartnerExportChecked) throw Error('RUNTIME_PAYMENT_PARTNER_EXPORT_MISSING');
if (!paymentProfitExportChecked) throw Error('RUNTIME_PAYMENT_PROFIT_EXPORT_MISSING');
if (!gafusActivityExportChecked) throw Error('RUNTIME_GAFUS_ACTIVITY_READ_EXPORT_MISSING');
if (!gafusSettingsExportChecked) throw Error('RUNTIME_GAFUS_SETTINGS_READ_EXPORT_MISSING');
if (!policyReadsExportChecked) throw Error('RUNTIME_POLICY_READS_EXPORT_MISSING');
if (!rewardedAccessReadsExportChecked) throw Error('RUNTIME_REWARDED_ACCESS_READS_EXPORT_MISSING');
if (!questionPhotoTaskExportChecked) throw Error('RUNTIME_QUESTION_PHOTO_TASK_EXPORT_MISSING');
if (!petReadExportChecked) throw Error('RUNTIME_PET_READ_EXPORT_MISSING');
if (!coursePathReadExportChecked) throw Error('RUNTIME_COURSE_PATH_READ_EXPORT_MISSING');
if (!legacyCatalogRowsExportChecked) throw Error('RUNTIME_LEGACY_CATALOG_ROWS_EXPORT_MISSING');
if (!trainerAIPersistenceExportChecked) throw Error('RUNTIME_TRAINER_AI_PERSISTENCE_EXPORT_MISSING');
if (!courseContentRevisionExportChecked) throw Error('RUNTIME_COURSE_CONTENT_REVISION_EXPORT_MISSING');
if (!gafusWalletLockExportChecked) throw Error('RUNTIME_GAFUS_WALLET_LOCK_EXPORT_MISSING');
if (!courseProgressExportChecked) throw Error('RUNTIME_COURSE_PROGRESS_EXPORT_MISSING');
if (!passwordResetExportChecked) throw Error('RUNTIME_PASSWORD_RESET_EXPORT_MISSING');
if (!consultationEligibilityExportChecked) throw Error('RUNTIME_CONSULTATION_ELIGIBILITY_EXPORT_MISSING');
if (!paymentFinanceExportChecked) throw Error('RUNTIME_PAYMENT_FINANCE_EXPORT_MISSING');
if (!courseEditorSnapshotExportChecked) throw Error('RUNTIME_COURSE_EDITOR_SNAPSHOT_EXPORT_MISSING');
if (!trialUsageExportChecked) throw Error('RUNTIME_SUBSCRIPTION_TRIAL_EXPORT_MISSING');
if (!consultationEmailOutboxExportChecked) throw Error('RUNTIME_CONSULTATION_EMAIL_OUTBOX_EXPORT_MISSING');
if (!deletedMediaPurgeExportChecked) throw Error('RUNTIME_DELETED_MEDIA_PURGE_EXPORT_MISSING');
if (!questionV2CleanupExportChecked) throw Error('RUNTIME_QUESTION_V2_CLEANUP_EXPORT_MISSING');
if (!npdOperationExportChecked) throw Error('RUNTIME_NPD_OPERATION_EXPORT_MISSING');
if (!vetVisitDetailExportChecked) throw Error('RUNTIME_VET_VISIT_DETAIL_EXPORT_MISSING');
if (!gafusEntitlementReadsExportChecked) throw Error('RUNTIME_GAFUS_ENTITLEMENT_READS_EXPORT_MISSING');
if (!reminderExpiryRedactionExportChecked) throw Error('RUNTIME_REMINDER_EXPIRY_REDACTION_EXPORT_MISSING');
if (mode === 'api' && !versionedCourseDeleteExportChecked) throw Error('RUNTIME_COURSE_DELETE_VERSIONED_EXPORT_MISSING');
if (!rewardedSettingsExportChecked) throw Error('RUNTIME_REWARDED_SETTINGS_EXPORT_MISSING');
if (!versionedCourseRowsExportChecked) throw Error('RUNTIME_COURSE_VERSION_ROWS_EXPORT_MISSING');
if (!videoAccessReadExportChecked) throw Error('RUNTIME_VIDEO_ACCESS_READ_EXPORT_MISSING');
if (!trainingReminderStorageExportChecked) throw Error('RUNTIME_TRAINING_REMINDER_STORAGE_EXPORT_MISSING');
if (!gafusWalletRecordsExportChecked) throw Error('RUNTIME_GAFUS_WALLET_RECORDS_EXPORT_MISSING');
if (!diaryEntriesExportChecked) throw Error('RUNTIME_DIARY_ENTRIES_EXPORT_MISSING');
if (!surveyRowsExportChecked) throw Error('RUNTIME_SURVEY_ROWS_EXPORT_MISSING');
if (!trainerNoteRowsExportChecked) throw Error('RUNTIME_TRAINER_NOTE_ROWS_EXPORT_MISSING');
if (!legacyImportRecordsExportChecked) throw Error('RUNTIME_LEGACY_IMPORT_RECORDS_EXPORT_MISSING');
if (!preventionReminderRowsExportChecked) throw Error('RUNTIME_PREVENTION_REMINDER_ROWS_EXPORT_MISSING');
if (!npdReceiptExportChecked) throw Error('RUNTIME_NPD_RECEIPTS_EXPORT_MISSING');
if (!profitReconciliationExportChecked) throw Error('RUNTIME_PROFIT_RECONCILIATION_EXPORT_MISSING');
if (!registrationContextReadsExportChecked) throw Error('RUNTIME_REGISTRATION_CONTEXT_READS_EXPORT_MISSING');
if (!gafusUnlockRecordsExportChecked) throw Error('RUNTIME_GAFUS_UNLOCK_RECORDS_EXPORT_MISSING');
if (!accountCleanupRecordsExportChecked) throw Error('RUNTIME_ACCOUNT_CLEANUP_RECORDS_EXPORT_MISSING');
if (!accountCleanupWorkerRowsExportChecked) throw Error('RUNTIME_ACCOUNT_CLEANUP_WORKER_ROWS_EXPORT_MISSING');
if (!cynologistCatalogRowsExportChecked) throw Error('RUNTIME_CYNOLOGIST_CATALOG_ROWS_EXPORT_MISSING');
if (!consultationScheduleRowsExportChecked) throw Error('RUNTIME_CONSULTATION_SCHEDULE_ROWS_EXPORT_MISSING');
if (!registrationContractRowsExportChecked) throw Error('RUNTIME_REGISTRATION_CONTRACT_ROWS_EXPORT_MISSING');
if (!adminUserReadsExportChecked) throw Error('RUNTIME_ADMIN_USER_READS_EXPORT_MISSING');
if (!adminUserWritesExportChecked) throw Error('RUNTIME_ADMIN_USER_WRITES_EXPORT_MISSING');
if (!petMediaOutboxExportChecked) throw Error('RUNTIME_PET_MEDIA_OUTBOX_EXPORT_MISSING');
if (!petMediaSqlExportChecked) throw Error('RUNTIME_PET_MEDIA_SQL_EXPORT_MISSING');
if (!petMediaDefaultDbExportChecked) throw Error('RUNTIME_PET_MEDIA_DEFAULT_DB_EXPORT_MISSING');
if (!vetVisitWriteRowsExportChecked) throw Error('RUNTIME_VET_VISIT_WRITE_ROWS_EXPORT_MISSING');
for (const spec of sharedContracts) {
  if (!seenSharedContracts.has(spec))
    throw Error("RUNTIME_SHARED_CONTRACT_EXPORT_MISSING:" + spec);
}
for (const spec of architectureExports) {
  if (!seenArchitectureExports.has(spec))
    throw Error("RUNTIME_ARCHITECTURE_EXPORT_MISSING:" + spec);
}
// Frozen 9/48 remains independent of new package exports.
// Four shared-contract packages: Worker 37 packages/234 exports;
// API 38 packages/244 exports; frozen legacy 9/48 stays independent.
// New notifications-server exports are validated independently, rather than
// silently included in the fixed historical 48-export baseline.
if (newPackages.length !== 28 || apiOnly.length !== 1 || workerOnly.length !== 0 ||
  packages.length !== (mode === 'worker' ? 37 : 38) ||
  (mode === 'worker' ? exportsChecked !== 234 : exportsChecked !== 244))
  throw Error("RUNTIME_POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED:packages=" + packages.length + ":exports=" + exportsChecked);
console.log(`RUNTIME_PACKAGING_PASS target=${mode} packages=${packages.length} compiled_exports=${exportsChecked}`);
