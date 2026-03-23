-- CreateEnum
CREATE TYPE "PetPreventionReminderKind" AS ENUM ('AFTER_DAYS', 'ON_DATE');

-- AlterTable
ALTER TABLE "PetPreventionEntry" ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PetPreventionEntry" ADD COLUMN "reminderKind" "PetPreventionReminderKind" NOT NULL DEFAULT 'AFTER_DAYS';
ALTER TABLE "PetPreventionEntry" ADD COLUMN "reminderDaysAfter" INTEGER;
ALTER TABLE "PetPreventionEntry" ADD COLUMN "reminderOnDate" DATE;
ALTER TABLE "PetPreventionEntry" ADD COLUMN "remindAt" DATE;
ALTER TABLE "PetPreventionEntry" ADD COLUMN "lastNotifiedForRemindAt" DATE;

-- Backfill: дефолтные интервалы (как у прежнего воркера)
UPDATE "PetPreventionEntry" SET
  "reminderDaysAfter" = CASE "type"
    WHEN 'VACCINATION' THEN 365
    WHEN 'DEWORMING' THEN 90
    ELSE 30
  END;

UPDATE "PetPreventionEntry" SET
  "remindAt" = ("performedAt" AT TIME ZONE 'UTC')::date + make_interval(days => "reminderDaysAfter");

CREATE INDEX "PetPreventionEntry_reminderEnabled_remindAt_idx" ON "PetPreventionEntry"("reminderEnabled", "remindAt");
