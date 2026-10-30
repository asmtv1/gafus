-- Additive only: preserve all legacy QuestionPhoto rows until a proven cutover.
CREATE TABLE "QuestionV2MediaTask" (
  "mediaId" UUID NOT NULL,
  "photoId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceMime" VARCHAR(64) NOT NULL,
  "sourceBytes" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'AWAITING_UPLOAD',
  "attemptToken" UUID,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "manifest" JSONB,
  "errorCode" VARCHAR(64),
  "cleanupKind" VARCHAR(10),
  "cleanupToken" UUID,
  "cleanupLeaseUntil" TIMESTAMP(3),
  "cleanupNextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
  "cleanupCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionV2MediaTask_pkey" PRIMARY KEY ("mediaId")
);
CREATE UNIQUE INDEX "QuestionV2MediaTask_photoId_key" ON "QuestionV2MediaTask"("photoId");
CREATE UNIQUE INDEX "QuestionV2MediaTask_sourceKey_key" ON "QuestionV2MediaTask"("sourceKey");
CREATE INDEX "QuestionV2MediaTask_status_nextAttemptAt_createdAt_idx" ON "QuestionV2MediaTask"("status","nextAttemptAt","createdAt");
CREATE INDEX "QuestionV2MediaTask_ownerId_status_idx" ON "QuestionV2MediaTask"("ownerId","status");
CREATE INDEX "QuestionV2MediaTask_cleanupKind_cleanupNextAt_idx" ON "QuestionV2MediaTask"("cleanupKind","cleanupNextAt");
