DROP INDEX IF EXISTS "AppSubscription_appleOriginalTransactionId_key";

CREATE INDEX IF NOT EXISTS "AppSubscription_appleOriginalTransactionId_idx"
  ON "AppSubscription"("appleOriginalTransactionId");
