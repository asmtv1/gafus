-- Durable at-least-once training reminder attempt tracking.
CREATE TABLE "TrainingReminderDelivery" (
  "id" TEXT NOT NULL,
  "reminderId" TEXT NOT NULL,
  "localDate" VARCHAR(10) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingReminderDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrainingReminderDelivery_reminderId_localDate_key"
  ON "TrainingReminderDelivery"("reminderId", "localDate");
CREATE INDEX "TrainingReminderDelivery_status_leaseExpiresAt_idx"
  ON "TrainingReminderDelivery"("status", "leaseExpiresAt");
ALTER TABLE "TrainingReminderDelivery"
  ADD CONSTRAINT "TrainingReminderDelivery_reminderId_fkey"
  FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
