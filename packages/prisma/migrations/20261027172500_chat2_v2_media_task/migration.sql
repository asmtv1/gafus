-- GAFUS Refactor ONLY, additive and dormant until Chat2 media V2 API cutover.
-- No database writes to GAFUS Main and no automatic production migrations.
CREATE TABLE IF NOT EXISTS "Chat2V2MediaTask" (
  "mediaId" UUID NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "sourceKey" TEXT NOT NULL UNIQUE,
  "sourceMime" VARCHAR(100) NOT NULL,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Chat2V2MediaTask_status_nextAttemptAt_createdAt_idx"
  ON "Chat2V2MediaTask"("status","nextAttemptAt","createdAt");
CREATE INDEX IF NOT EXISTS "Chat2V2MediaTask_cleanup_pending_idx"
  ON "Chat2V2MediaTask"("cleanupKind","cleanupNextAt","cleanupLeaseUntil")
  WHERE "cleanupKind" IS NOT NULL AND "cleanupCompletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Chat2V2MediaTask_conversationId_ownerId_status_idx"
  ON "Chat2V2MediaTask"("conversationId","ownerId","status");
