#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const legacyAdapters = [
  "mobile-ota-server", // owned signed release registry persistence, no API/Core ORM
  "reengagement", "statistics", "feed-server", "gallery-server",
  "auth", "mailer", "webpush", "notifications-server", "questions-server", "questions-write-server", "consultation-server", "consultation-write-server", "exam-server", "course-server", "course-read-server", "course-progress-server", "identity-write-server", "consultation-query-server", "subscription-finance-server", "subscription-payment-server", "subscription-trial-server", "trainer-ai-server",
  "pets-server", "tracking-server", "media-server", "article-server", "gafus-server", "entitlements-server",
  "subscription-read-server", "subscription-write-server",
];
// Explicit infrastructure seams only. These provider/framework adapters require
// direct persistence until their transport contracts are redesigned; no additional
// module can start importing the database without failing CI.
const permittedInfrastructure = new Set([
  "packages/mobile-ota-server/src/version-publication-repository.ts", // serializable platform/version publication lock, replay and immutable audit append
  "packages/mobile-ota-server/src/version-selection-repository.ts", // observed native installation and exact signed version lookup
  "packages/mobile-ota-server/src/ci-registration.ts", // verified signed Expo manifest, immutable asset and idempotent CI receipt SQL
  "packages/mobile-ota-server/src/deployment-commands.ts", // version-CAS OTA publish/pause and audited channel creation
  "packages/mobile-ota-server/src/native-release-admin.ts", // native build provenance and verified device trust registry
  "packages/mobile-ota-server/src/mandatory-control.ts", // version-CAS admin-only iOS/Android mandatory OTA policy and audit persistence
  "packages/mobile-ota-server/src/patch-commands.ts", // private source-only restoration definitions and draft applications
  "packages/mobile-ota-server/src/queries.ts", // bounded administrative OTA/private CI projections
  "packages/mobile-ota-server/src/repository.ts", // read-only exact runtime+native fingerprint signed manifest lookup
  "packages/mobile-ota-server/src/tester-grant-service.ts", // DB-verified named OTA tester principal; short-lived signed grant issuance
  "packages/mobile-ota-server/src/telemetry.ts", // hashed pseudonymous OTA lifecycle events, bounded reads and 30-day cleanup
  "packages/mobile-ota-server/src/diagnostics-repository.ts", // isolated mobile diagnostic grant/quota and durable spool transactional adapter
  "packages/mobile-ota-server/src/diagnostics-observe-repository.ts", // verified Expo Observe native release scope and durable dedup adapter
  "packages/mobile-ota-server/src/diagnostics-spool-repository.ts", // fenced Worker-owned diagnostic spool DB methods and short TTL tombstones
  "packages/mobile-ota-server/src/diagnostics-web-repository.ts", // origin/release-scoped browser grant and separate atomic public daily budgets
  // Explicitly extracted Core queries. These are read-only infrastructure
  // projections; the HTTP/Core layers contain no Prisma delegates for them.
  "packages/subscription-read-server/src/offerSnapshotService.ts", // read-only owner-scoped Apple/paywall projection
  "packages/subscription-read-server/src/accessService.ts", // subscription access read-side
  "packages/subscription-read-server/src/adminHistoryService.ts", // audited admin billing history
  "packages/subscription-read-server/src/metricsSnapshotService.ts", // counters and status projections
  "packages/subscription-write-server/src/appleTokenInitializationReview.ts", // transaction-owned token CAS
  "packages/subscription-write-server/src/npdBootstrapService.ts", // NPD bootstrap transactional adapter
  "packages/subscription-write-server/src/npdCutoverService.ts", // NPD cutover transactional adapter
  "packages/subscription-write-server/src/npdEmailDeliveryService.ts", // durable receipt delivery
  "packages/subscription-write-server/src/renewalCandidatesService.ts", // exhaustion checkpoint before fetching candidates
  "packages/subscription-write-server/src/renewalAttemptService.ts", // unique active renewal intent/idempotence CAS
  "packages/subscription-write-server/src/renewalFinalizationService.ts", // atomic billing period, partner commission and NPD receipt
  "packages/subscription-write-server/src/renewalProviderResultService.ts", // transactional provider failure/cancel semantics
  "packages/subscription-write-server/src/renewalReminderService.ts", // atomic next-period reminder stamp
  "packages/subscription-finance-server/src/npd-operation-persistence.ts", // NPD transactional lease, CAS finish, receipt + email journal
  "packages/subscription-write-server/src/adminPartnerService.ts", // ACL-guarded payout mutations
  "packages/statistics/src/course/getAuthoredCourses.ts", // trainer statistics persistence-owned read service
  "packages/statistics/src/course/statistics.ts", // trainer statistics persistence-owned read service
  "packages/statistics/src/steps/statistics.ts", // trainer statistics persistence-owned read service
  "packages/statistics/src/user/progress.ts", // trainer statistics persistence-owned read service
  "packages/statistics/src/infra/trainerEditorCounts.ts", // trainer ownership and role-filtered course memberships
  "packages/statistics/src/infra/trainerVideoPlayback.ts", // trainer-only streaming metadata ACL projection
  "packages/statistics/src/infra/platformStats.ts", // public role-count projection only
  "packages/statistics/src/infra/userSearch.ts", // staff-only role-filtered student lookup
  "packages/statistics/src/infra/adminStorageService.ts",
  "packages/statistics/src/infra/mediaProcessingMetrics.ts",
  "packages/statistics/src/infra/readTrainerVideoMetadataRows.ts",
  "packages/statistics/src/infra/trainerTargetAccess.ts",
  "packages/statistics/src/infra/videoPlaybackQuality.ts",
  "packages/statistics/src/infra/databaseHealth.ts",
  "packages/statistics/src/infra/mailAdminMonitoring.ts",
  "packages/statistics/src/infra/mailDeliveryMonitor.ts",
  "packages/reengagement/src/infra/schedulerQueries.ts", // owner-filtered due and active campaign scheduling reads
  "packages/reengagement/src/workerQueries.ts", // transport-time ACL and private endpoint cleanup
  "packages/reengagement/src/infra/reengagementSettings.ts", // user preferences and active campaign cancellation
  "packages/reengagement/src/infra/analyzer.ts", // reengagement persistence-owned service
  "packages/reengagement/src/infra/campaign-manager.ts", // reengagement persistence-owned service
  "packages/reengagement/src/infra/metrics.ts", // reengagement persistence-owned service
  "packages/reengagement/src/infra/user-data-collector.ts", // reengagement persistence-owned service
  "packages/notifications-server/src/gafus-delivery.ts", // lease fenced user-scoped Gafus push outbox + bounded retries
  "packages/notifications-server/src/immediatePushService.ts", // existing transactional immediate push service
  "packages/notifications-server/src/pushWorkerService.ts", // existing durable push delivery
  "packages/notifications-server/src/pushSubscriptionService.ts", // signed-session, locked owner endpoint CAS
  "packages/notifications-server/src/stepNotificationService.ts", // existing step notification repository
  "packages/auth/src/identityReadService.ts", // session revocation, actor role, and password credential reads
  "packages/notifications-server/src/chat-outbox-diagnostics.ts", // server-only Chat2 dead-letter diagnostics and retry, never API-owned ORM
  "packages/notifications-server/src/adminBroadcastService.ts", // explicit-admin broadcast database read and invalid-token prune
  "packages/notifications-server/src/trainingReminderClaims.ts",
  "packages/notifications-server/src/training-reminder-delivery.ts", // owner/day scoped lease and durable training reminder ACK // conditional reminder and push-subscription repository
  "packages/feed-server/src/gafusReactionProgress.ts", // owner-scoped reward progress from published, non-deleted posts
  "packages/feed-server/src/smart-affinity.ts", // bounded smart feed SQL/model persistence
  "packages/feed-server/src/smart-aggregation.ts", // bounded smart feed SQL/model persistence
  "packages/feed-server/src/smart-health.ts", // bounded smart feed SQL/model persistence
  "packages/feed-server/src/smart-experiment-report.ts", // bounded smart feed SQL/model persistence
  "packages/feed-server/src/smart-ml-training.ts", // bounded smart feed SQL/model persistence
  "packages/feed-server/src/smart-ml-promotion.ts", // bounded smart feed SQL/model persistence
  "packages/feed-server/src/smart-ml-operations.ts", // bounded smart feed SQL/model persistence
  "packages/gallery-server/src/runtimeService.ts", // concrete Gallery Prisma and storage port binding
  "packages/gallery-server/src/recovery.ts", // bounded Cloud wake-up due query
  "packages/feed-server/src/smartPreferencesRows.ts", // actor-scoped feed personalization SQL and single-transaction reset
  "packages/feed-server/src/smartRetentionRows.ts", // bounded smart telemetry retention SQL, never deletes public posts
  "packages/feed-server/src/smartRetrievalRows.ts", // viewer-scoped multi-source candidate query with hard ACL filters
  "packages/feed-server/src/smartRankingRows.ts", // viewer-scoped single-source and smart affinity SQL projection
  "packages/feed-server/src/chronologicalRows.ts", // viewer-scoped chronological feed page SQL/keyset projection
  "packages/feed-server/src/runtimeServices.ts", // concrete S3/DB production feed composition
  "packages/feed-server/src/backgroundOperations.ts", // feed maintenance and private push read adapter
  "packages/feed-server/src/retiredPhotoQueue.ts", // one-way terminal cleanup of retired photo queue
  "packages/feed-server/src/smartTelemetryService.ts", // actor-scoped telemetry persistence and feedback
  "packages/tracking-server/src/trackingService.ts", // pre-existing reengagement click persistence
  "packages/entitlements-server/src/policyReads.ts", // actor-scoped subscription, assignment and time-bounded Gafus grants
  "packages/entitlements-server/src/courseStepGrantReads.ts", // same-occurrence course/guide Gafus and video access projections
  "packages/entitlements-server/src/rewardedAccessReads.ts", // owner/course/occurrence scoped read-only paid-step/video legacy entitlement projections
  "packages/gafus-server/src/activityRead.ts", // bounded owner ACTIVITY only, excludes historical denied activity
  "packages/gafus-server/src/legacy-import-records.ts", // admin row lock, cutover preflight, wallet lock and atomic audit
  "packages/gafus-server/src/walletRecords.ts", // wallet upsert, conditional atomic debit, idempotent ledger read/append
  "packages/gafus-server/src/unlock-records.ts", // caller wallet lock + idempotency replay and atomic Gafus purchase grant
  "packages/gafus-server/src/walletLock.ts", // shared transaction-scoped wallet advisory lock
  "packages/gafus-server/src/rewardedSettings.ts", // existing default row: Core-valid rewarded ad settings read/upsert
  "packages/gafus-server/src/settingsRead.ts", // read-only default-config projection
  "packages/gafus-server/src/admin-rows.ts", // role-fenced admin settings, ledger audit, fraud CAS transactional persistence
  "packages/gafus-server/src/rewardedWalletRows.ts", // locked rewarded ad wallet transaction, replay and target ownership SQL
  "packages/gafus-server/src/rewardedAdRows.ts", // ad event receipt, owner limits and target-locked grant persistence
  "packages/article-server/src/articleOwnerWrites.ts", // owner-locked atomic UPDATE/DELETE, no TOCTOU
  "packages/article-server/src/articleLikes.ts", // transaction-scoped pair locking for article-like toggles
  "packages/article-server/src/articleRows.ts", // catalog, actor-scoped likes/grants, owner-viewer projection, atomic view deduplication
  "packages/media-server/src/questionPhotoTaskRead.ts", // only status/manifest projection; photo ACL enforced by caller
  "packages/media-server/src/mediaCdnPurgeRepository.ts", // lease-fenced cross-domain CDN purge persistence
  "packages/media-server/src/trainerTranscoding.ts", // trainer-video status persistence
  "packages/media-server/src/trainerVideoRows.ts", // trainer-video catalog, per-owner CAS and reference cleanup SQL
  "packages/media-server/src/feedRankedRows.ts", // ranked Feed keyset SQL with UTC-naive timestamp order
  "packages/course-server/src/videoProgressService.ts", // playback bookmark repository, policy lives in Core
  "packages/tracking-server/src/walksService.ts", // owner-scoped dog-walk sync, delete tombstone & serializable conflict checks
  "packages/pets-server/src/prevention-reminder-rows.ts", // UTC-day due projection and owner/date-fenced notification ack
  "packages/pets-server/src/preventionRows.ts", // actor-scoped prevention diary persistence and JSON null write normalization
  "packages/pets-server/src/petRows.ts", // owner-fenced Pet profile, document and idempotency SQL records
  "packages/pets-server/src/petReadProjections.ts", // actor-scoped pet list, counts and detail
  "packages/pets-server/src/vet-visit-detail.ts",
  "packages/pets-server/src/petMediaDeletionDefaultDb.ts",
  "packages/pets-server/src/vet-visit-write-rows.ts", // same-tx owner-lock visit writes, reservations and gallery outbox enqueue callback // singleton owner-locked pet-media deletion janitor database port // owner and visit double-ACL, PII-free vet DTO and bounded pending thumbnail reads
  "packages/pets-server/src/weightService.ts", // owner scoped row locking for body-weight writes
  "packages/course-server/src/favoriteService.ts", // actor-filtered private favorites and idempotent (userId,courseId) writes
  "packages/course-server/src/reviewService.ts", // review author projection, completed-enrollment and owner-scoped mutations
  "packages/trainer-ai-server/src/persistence.ts", // role-fenced Trainer AI config/history mutations
  "packages/course-read-server/src/editorSnapshot.ts", // ACL-and-role-checked repeatable-read editor version/relation snapshot
  "packages/course-read-server/src/durableContentRevision.ts", // authoritative PostgreSQL content revision, no Redis fallback
  "packages/subscription-trial-server/src/trialUsage.ts", // per-user trial receipts, serialized cross-account card fingerprint check and transactional upsert
  "packages/subscription-finance-server/src/profit-reconciliation-rows.ts", // verified provider fields + guarded finance refund/CAS completion
  "packages/subscription-finance-server/src/paymentFinance.ts", // verified financial metadata and shared-tx refund receipt repository
  "packages/subscription-finance-server/src/promoCodeRows.ts", // serializable promo mutation records, snapshots and exact account-scoped reads
  "packages/subscription-finance-server/src/profit-dashboard-rows.ts", // repeatable-read finance report snapshot reads
  "packages/subscription-finance-server/src/profit-video-rows.ts", // atomic actor-checked expense CAS and audit snapshots
  "packages/subscription-finance-server/src/partnerRows.ts", // locked partner binding, referral and payout ledger persistence
  "packages/subscription-finance-server/src/adminRows.ts", // NPD dashboard, subscription admin snapshots and serializable manual grants
  "packages/subscription-payment-server/src/googlePlayRows.ts", // owner-locked Google Play token/renewal SQL; API transport never imports Prisma runtime
  "packages/subscription-payment-server/src/appleSubscriptionState.ts", // verified Apple Server API state persistence under subscription row lock
  "packages/subscription-payment-server/src/subscriptionTransitions.ts", // atomic verified YooKassa trial binding and entitlement persistence
  "packages/subscription-payment-server/src/paymentService.ts", // provider-authenticated purchase/refund state transitions and locked subscription SQL
  "packages/consultation-query-server/src/bookingEligibility.ts",
  "packages/consultation-query-server/src/consultationMailRead.ts", // booking-only mail projection; no recipient or transport policy
  "packages/consultation-query-server/src/cynologist-catalog-rows.ts",
  "packages/consultation-query-server/src/schedule-rows.ts", // role-locked schedule transaction with same-tx materialized slot rebuild // owner-role-locked trainer listing and idempotent schedule row // exact client-scoped active/completed booking projection and booking lock
  "packages/consultation-query-server/src/slotRows.ts", // serialized slot horizon materialization and admission SQL
  "packages/identity-write-server/src/registration-context-reads.ts",
  "packages/identity-write-server/src/registration-contract-rows.ts", // registration email idempotency under caller transaction
  "packages/identity-write-server/src/account-cleanup-worker-rows.ts", // SKIP LOCKED lease and token-fenced owner cleanup retry/checkpoints
  "packages/identity-write-server/src/accountDeletionRows.ts", // same-transaction self-delete cleanup, audit counters and challenge persistence
  "packages/identity-write-server/src/authRows.ts", // authentication user projections and CAS refresh/token/password session transactions
  "packages/identity-write-server/src/reminderReviewRows.ts", // AG1/AG4 source-only reminder receipt transaction and owner-fenced persistence
  "packages/identity-write-server/src/passwordReset.ts", // single-use reset receipt, role-session revocation SQL transaction
  "packages/identity-write-server/src/emailAccountRows.ts", // owner-locked email token creation, delivery rollback and single-use CAS confirmation
  "packages/identity-write-server/src/profileRows.ts", // owner-scoped private/public profile projections and avatar row-lock commit
  "packages/identity-write-server/src/adminUserReads.ts", // privileged admin list and current actor/target role-only SQL projections
  "packages/identity-write-server/src/adminUserWrites.ts", // ordered actor+target locks and same-tx role-revocation, partner and cleanup callbacks
  "packages/notifications-server/src/training-reminder-storage.ts", // canonical owner-row and training reminder FOR UPDATE transaction semantics
  "packages/notifications-server/src/reminder-expiry-redaction.ts", // source-only reminder PII redaction, capped SKIP LOCKED tombstone SQL
  "packages/notifications-server/src/consultation-email-outbox.ts", // durable consultation mail receipt, BullMQ replay and P2002 recovery
  "packages/course-progress-server/src/diary-entries.ts", // owner-bound diary save/read and course-occurrence ordering
  "packages/course-progress-server/src/courseVersionRows.ts", // DB trigger version CAS, owner-gated reads and row-locked logo update
  "packages/course-progress-server/src/completion.ts", // row-locked learner completion and owner-scoped progress
  "packages/course-progress-server/src/userProgressRows.ts", // exact learner/course-scoped progress reads and status sync writes
  "packages/course-progress-server/src/trainingDayRows.ts", // atomic trainer day and step ownership writes, exact course attachment cleanup
  "packages/course-progress-server/src/surveyRows.ts", // exact owner/course/day/step survey projection, row-locked submit+completion in one transaction
  "packages/course-progress-server/src/trainerNoteRows.ts", // owner-fenced note writes, student-only visible projection and trainer filtered lists
  "packages/course-progress-server/src/trainerCourseRows.ts", // version-CAS trainer course writer, ordered day links and access rows
  "packages/course-progress-server/src/offlineVideoRows.ts", // V3 proposal journal and per-resource CAS SQL, NOT exported to active v2 router
  "packages/course-progress-server/src/offlineMutationRows.ts", // opt-in offline practice/prevention mutation journal SQL, source review only
  "packages/course-progress-server/src/trainerStepRows.ts", // trainer step/template owner-scoped persistence, isolated deletion tx and JSON null adaptation
  "packages/course-progress-server/src/trainingService.ts", // full Core training business service and owner-fenced transactional course progress
  "packages/course-progress-server/src/dailyCourseService.ts", // daily course and import/cleanup transaction ownership
  "packages/course-read-server/src/videoAccessRead.ts", // trainer-video and course occurrence projections: no entitlement decisions
  "packages/course-read-server/src/gafus-entitlement-reads.ts", // exact owner scoped user-step and video occurrence projections; grants remain Core-owned
  "packages/course-read-server/src/legacyCatalogRows.ts", // public course catalogue SQL with viewer-scoped favorites, access and progress rows
  "packages/course-read-server/src/coursePathRead.ts", // owner-course path progress and non-private training-day IDs
  "packages/course-read-server/src/offlineRead.ts", // read-only offline course/version projection: no ACL inference or writes
  "packages/course-read-server/src/trainingDayContentRead.ts", // authorization-neutral day content snapshot with no learner progress or grant joins
  "packages/course-server/src/course-delete-versioned.ts", // Course.version author-fenced atomic relation deletion, no external I/O
  "packages/course-server/src/onlineStepBindingService.ts", // read-only occurrence-binding SQL projection with pure Core policy
  "packages/course-server/src/cacheRevisionService.ts", // current staff role rechecked under User lock before durable revision bump
  "packages/course-server/src/miniGuideService.ts", // owner ACL before protected HTML read, 100-row anonymous guide metadata
  "packages/course-server/src/publicCatalogService.ts", // anonymized public readonly Course DTO projection
  "packages/course-server/src/personalizationService.ts", // exact user-course scoped personalized fields
  "packages/exam-server/src/cleanupService.ts", // dated video expiry and exact-url CAS after CDN deletion
  "packages/exam-server/src/examService.ts", // exam domain writes and reviews relocated with injected notification transport
  "packages/consultation-write-server/src/service.ts", // atomic booking reservation, SLA, refunds and owner-ACL write semantics
  "packages/consultation-server/src/consultationEmailDelivery.ts", // provider ACK evidence, durable pending/UNKNOWN fail-closed CAS
  "packages/consultation-server/src/voximplantService.ts", // participant/booking-scoped Vox SDK identity and 90s admission
  "packages/consultation-server/src/adminBookingQueries.ts", // bounded, admin-only route booking DTOs
  "packages/consultation-server/src/bookingIdempotencyReadback.ts", // owner-scoped post-ACK readback
  "packages/questions-server/src/photos.ts", // owner-checked orphan photo deletion and 100-row janitor
  "packages/questions-server/src/notifications.ts", // bounded question-notification repair queue
  "packages/questions-server/src/moderation.ts", // locked admin-role recheck, target serialization and same-tx photo outbox
  "packages/questions-write-server/src/service.ts", // question publication, moderation, photos, rewards and owner-scoped SQL transactions
  "packages/feed-server/src/smartStats.ts", // bounded, parameterized read-only stats snapshot; caller supplies an already ACL-filtered list
  "packages/feed-server/src/adminModeration.ts", // moderation ACL and Prisma-backed state transitions
  "packages/mailer/src/send-transactional-mail.ts", // persisted provider acceptance readback
  "packages/mailer/src/outbox.ts",       // encrypted provider retry queue and lease journal
  "packages/mailer/src/resend.ts",       // provider send-attempt journal
  "packages/mailer/src/webhook.ts",      // verified provider event journal
  "packages/webpush/src/db.ts",          // legacy subscription adapter
  "packages/webpush/src/expoPush.ts",    // provider invalid-endpoint cleanup
]);
const observedExceptions = new Set();
const errors = [];
let checked = 0;

function walkDirectory(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name === "dist") continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) { walkDirectory(full); continue; }
    if (!/\.(ts|tsx|js|jsx)$/.test(item.name) || /\.(test|spec)\./.test(item.name)) continue;
    checked++;
    const source = ts.createSourceFile(full, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
    ts.forEachChild(source, function visit(node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === "@gafus/prisma") {
        const clause = node.importClause;
        const typeOnly = clause?.isTypeOnly || (clause?.namedBindings
          && ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every(item => item.isTypeOnly));
        if (!typeOnly) {
          const name = path.relative(root, full);
          if (permittedInfrastructure.has(name)) observedExceptions.add(name);
          else errors.push(name);
        }
      }
      if (ts.isCallExpression(node) && node.arguments.length === 1
        && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "@gafus/prisma"
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const name = path.relative(root, full);
        if (permittedInfrastructure.has(name)) observedExceptions.add(name);
        else errors.push(name);
      }
      ts.forEachChild(node, visit);
    });
  }
}
for (const name of legacyAdapters) walkDirectory(path.join(root, "packages", name, "src"));
for (const expected of permittedInfrastructure) {
  if (!observedExceptions.has(expected)) errors.push(`Expected infrastructure seam changed: ${expected}`);
}
// Transaction-only adapters deliberately receive Prisma.TransactionClient from
// their caller but NEVER import the Prisma runtime themselves. Do not add them
// to the runtime-import allowlist: any future direct value import MUST fail.
// Unlike purely type aliases, these ports execute SQL under the caller's
// transaction; reject accidental omission that could bypass deletion intent.
for (const file of ["packages/identity-write-server/src/account-cleanup-records.ts"]) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (!content.includes("tx.$executeRaw") || !content.includes("AccountCleanupTx"))
    errors.push(`Transaction-only deletion persistence seam changed: ${file}`);
}
if (errors.length) {
  console.error("Legacy domain adapter ORM boundary FAIL:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`Domain adapter ORM boundary PASS: ${legacyAdapters.join(", ")}; ${checked} source files; ${observedExceptions.size} fixed infrastructure exceptions, no new runtime Prisma`);
