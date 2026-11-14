-- Expand first; deploy worker changes only after migration has succeeded.
ALTER TABLE "Chat2OutboxEvent"
  ADD COLUMN "claimToken" UUID,
  ADD COLUMN "operationId" VARCHAR(64),
  ADD COLUMN "traceId" VARCHAR(32),
  ADD COLUMN "lastErrorCode" VARCHAR(64),
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3);
CREATE INDEX "Chat2OutboxEvent_deadLetteredAt_deliveredAt_createdAt_idx"
  ON "Chat2OutboxEvent"("deadLetteredAt", "deliveredAt", "createdAt");
