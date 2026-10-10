-- Additive migration: the legacy rewarded-ad schema remains intact.
CREATE TYPE "GafusTransactionKind" AS ENUM ('EARN', 'SPEND', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'LEGACY_IMPORT');
CREATE TYPE "GafusRewardClass" AS ENUM ('ACTIVITY', 'BONUS');
CREATE TYPE "GafusRewardKind" AS ENUM ('POST_PUBLISHED', 'QUESTION_CREATED', 'ANSWER_CREATED', 'POST_REACTION_MILESTONE', 'BEST_ANSWER');
CREATE TYPE "GafusRewardDecision" AS ENUM ('GRANTED', 'DENIED_ACTIVITY_LIMIT', 'DENIED_ANTI_ABUSE', 'DENIED_POLICY', 'DISABLED');
CREATE TYPE "GafusAccessTargetType" AS ENUM ('COURSE_STEP', 'MINI_GUIDE');
CREATE TYPE "GafusNotificationKind" AS ENUM ('REACTION_MILESTONE', 'BEST_ANSWER');
CREATE TYPE "GafusOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
CREATE TYPE "GafusFraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "GafusFraudStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "GafusWallet" (
  "userId" TEXT PRIMARY KEY,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "GafusTransaction" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" "GafusTransactionKind" NOT NULL,
  "delta" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "rewardKind" "GafusRewardKind",
  "sourceEntityType" VARCHAR(32),
  "sourceEntityId" TEXT,
  "targetType" "GafusAccessTargetType",
  "targetKey" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "settingsRevision" INTEGER,
  "adminActorId" TEXT,
  "reason" VARCHAR(1000),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GafusRewardEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "rewardClass" "GafusRewardClass" NOT NULL,
  "rewardKind" "GafusRewardKind" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "sourceEntityId" TEXT,
  "decision" "GafusRewardDecision" NOT NULL,
  "amount" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "denialCode" VARCHAR(64),
  "settingsRevision" INTEGER NOT NULL,
  "contentFingerprint" VARCHAR(64),
  "transactionId" TEXT,
  "metadata" JSONB
);

CREATE TABLE "GafusPostReactionProgram" (
  "postId" TEXT PRIMARY KEY,
  "thresholdStep" INTEGER NOT NULL,
  "highWaterReactionCount" INTEGER NOT NULL DEFAULT 0,
  "settingsRevision" INTEGER NOT NULL,
  "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "GafusPostReactionMilestone" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "eligibleReactionCount" INTEGER NOT NULL,
  "rewardEventId" TEXT NOT NULL,
  "settingsRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GafusTargetAccess" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "targetType" "GafusAccessTargetType" NOT NULL,
  "targetKey" TEXT NOT NULL,
  "courseId" TEXT,
  "dayOnCourseId" TEXT,
  "stepOnDayId" TEXT,
  "transactionId" TEXT NOT NULL,
  "settingsRevision" INTEGER NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GafusSettings" (
  "key" VARCHAR(32) PRIMARY KEY DEFAULT 'default',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "economyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "earningEnabled" BOOLEAN NOT NULL DEFAULT true,
  "spendingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "postReward" INTEGER NOT NULL DEFAULT 1,
  "questionReward" INTEGER NOT NULL DEFAULT 1,
  "answerReward" INTEGER NOT NULL DEFAULT 1,
  "activityLimit" INTEGER NOT NULL DEFAULT 3,
  "activityWindowSeconds" INTEGER NOT NULL DEFAULT 86400,
  "reactionThreshold" INTEGER NOT NULL DEFAULT 10,
  "reactionReward" INTEGER NOT NULL DEFAULT 1,
  "bestAnswerReward" INTEGER NOT NULL DEFAULT 1,
  "courseStepCost" INTEGER NOT NULL DEFAULT 1,
  "miniGuideCost" INTEGER NOT NULL DEFAULT 1,
  "accessDurationSeconds" INTEGER NOT NULL DEFAULT 604800,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "GafusSettingsRevision" (
  "revision" INTEGER PRIMARY KEY,
  "snapshot" JSONB NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GafusAdminAudit" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "targetUserId" TEXT,
  "transactionId" TEXT,
  "reason" VARCHAR(1000) NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GafusNotificationOutbox" (
  "id" TEXT PRIMARY KEY,
  "rewardEventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "GafusNotificationKind" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "url" TEXT,
  "status" "GafusOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "attemptToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "errorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "GafusFraudSignal" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "severity" "GafusFraudSeverity" NOT NULL,
  "status" "GafusFraudStatus" NOT NULL DEFAULT 'OPEN',
  "kind" VARCHAR(64) NOT NULL,
  "entityType" VARCHAR(32),
  "entityId" TEXT,
  "metadata" JSONB,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GafusTransaction_idempotencyKey_key" ON "GafusTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "GafusRewardEvent_eventKey_key" ON "GafusRewardEvent"("eventKey");
CREATE UNIQUE INDEX "GafusRewardEvent_transactionId_key" ON "GafusRewardEvent"("transactionId");
CREATE UNIQUE INDEX "GafusPostReactionMilestone_rewardEventId_key" ON "GafusPostReactionMilestone"("rewardEventId");
CREATE UNIQUE INDEX "GafusPostReactionMilestone_postId_threshold_key" ON "GafusPostReactionMilestone"("postId", "threshold");
CREATE UNIQUE INDEX "GafusTargetAccess_transactionId_key" ON "GafusTargetAccess"("transactionId");
CREATE UNIQUE INDEX "GafusNotificationOutbox_rewardEventId_key" ON "GafusNotificationOutbox"("rewardEventId");
CREATE UNIQUE INDEX "GafusNotificationOutbox_attemptToken_key" ON "GafusNotificationOutbox"("attemptToken");
CREATE INDEX "GafusWallet_updatedAt_idx" ON "GafusWallet"("updatedAt");
CREATE INDEX "GafusTransaction_userId_createdAt_id_idx" ON "GafusTransaction"("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "GafusTransaction_userId_kind_createdAt_idx" ON "GafusTransaction"("userId", "kind", "createdAt" DESC);
CREATE INDEX "GafusTransaction_sourceEntityType_sourceEntityId_idx" ON "GafusTransaction"("sourceEntityType", "sourceEntityId");
CREATE INDEX "GafusTransaction_targetType_targetKey_idx" ON "GafusTransaction"("targetType", "targetKey");
CREATE INDEX "GafusRewardEvent_userId_rewardClass_decision_occurredAt_idx" ON "GafusRewardEvent"("userId", "rewardClass", "decision", "occurredAt");
CREATE INDEX "GafusRewardEvent_userId_occurredAt_idx" ON "GafusRewardEvent"("userId", "occurredAt" DESC);
CREATE INDEX "GafusRewardEvent_rewardKind_occurredAt_idx" ON "GafusRewardEvent"("rewardKind", "occurredAt");
CREATE INDEX "GafusPostReactionProgram_enabledAt_idx" ON "GafusPostReactionProgram"("enabledAt");
CREATE INDEX "GafusPostReactionMilestone_postId_createdAt_idx" ON "GafusPostReactionMilestone"("postId", "createdAt");
CREATE INDEX "GafusTargetAccess_userId_targetType_targetKey_expiresAt_idx" ON "GafusTargetAccess"("userId", "targetType", "targetKey", "expiresAt");
CREATE INDEX "GafusTargetAccess_userId_expiresAt_idx" ON "GafusTargetAccess"("userId", "expiresAt");
CREATE INDEX "GafusTargetAccess_expiresAt_idx" ON "GafusTargetAccess"("expiresAt");
CREATE INDEX "GafusAdminAudit_actorId_createdAt_idx" ON "GafusAdminAudit"("actorId", "createdAt");
CREATE INDEX "GafusAdminAudit_targetUserId_createdAt_idx" ON "GafusAdminAudit"("targetUserId", "createdAt");
CREATE INDEX "GafusAdminAudit_action_createdAt_idx" ON "GafusAdminAudit"("action", "createdAt");
CREATE INDEX "GafusNotificationOutbox_status_availableAt_leaseUntil_idx" ON "GafusNotificationOutbox"("status", "availableAt", "leaseUntil");
CREATE INDEX "GafusNotificationOutbox_userId_createdAt_idx" ON "GafusNotificationOutbox"("userId", "createdAt");
CREATE INDEX "GafusFraudSignal_status_severity_createdAt_idx" ON "GafusFraudSignal"("status", "severity", "createdAt");
CREATE INDEX "GafusFraudSignal_userId_createdAt_idx" ON "GafusFraudSignal"("userId", "createdAt");
CREATE INDEX "GafusFraudSignal_kind_createdAt_idx" ON "GafusFraudSignal"("kind", "createdAt");
ALTER TABLE "GafusWallet" ADD CONSTRAINT "GafusWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_adminActorId_fkey" FOREIGN KEY ("adminActorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "GafusTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GafusPostReactionMilestone" ADD CONSTRAINT "GafusPostReactionMilestone_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GafusPostReactionProgram"("postId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "GafusTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GafusSettings" ADD CONSTRAINT "GafusSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GafusSettingsRevision" ADD CONSTRAINT "GafusSettingsRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GafusAdminAudit" ADD CONSTRAINT "GafusAdminAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GafusWallet" ADD CONSTRAINT "GafusWallet_balance_nonnegative" CHECK ("balance" >= 0);
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_delta_nonzero" CHECK ("delta" <> 0);
ALTER TABLE "GafusTransaction" ADD CONSTRAINT "GafusTransaction_balances_valid" CHECK ("balanceBefore" >= 0 AND "balanceAfter" >= 0 AND "balanceAfter" = "balanceBefore" + "delta");
ALTER TABLE "GafusRewardEvent" ADD CONSTRAINT "GafusRewardEvent_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "GafusPostReactionProgram" ADD CONSTRAINT "GafusPostReactionProgram_threshold_positive" CHECK ("thresholdStep" > 0);
ALTER TABLE "GafusPostReactionProgram" ADD CONSTRAINT "GafusPostReactionProgram_highwater_nonnegative" CHECK ("highWaterReactionCount" >= 0);
ALTER TABLE "GafusPostReactionMilestone" ADD CONSTRAINT "GafusPostReactionMilestone_threshold_positive" CHECK ("threshold" > 0);
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_positive_duration" CHECK ("expiresAt" > "grantedAt");
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_target_shape" CHECK (("targetType" = 'COURSE_STEP' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL) OR ("targetType" = 'MINI_GUIDE' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL));
ALTER TABLE "GafusSettings" ADD CONSTRAINT "GafusSettings_config_positive" CHECK ("activityLimit" >= 0 AND "activityWindowSeconds" > 0 AND "reactionThreshold" > 0 AND "accessDurationSeconds" > 0 AND "postReward" >= 0 AND "questionReward" >= 0 AND "answerReward" >= 0 AND "reactionReward" >= 0 AND "bestAnswerReward" >= 0 AND "courseStepCost" > 0 AND "miniGuideCost" > 0);
