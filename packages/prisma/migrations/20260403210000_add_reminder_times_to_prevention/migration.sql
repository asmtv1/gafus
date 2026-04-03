-- AlterTable: добавить reminderTimes и sentTimesForRemindAt
ALTER TABLE "PetPreventionEntry" ADD COLUMN "reminderTimes" JSONB NOT NULL DEFAULT '["09:00"]';
ALTER TABLE "PetPreventionEntry" ADD COLUMN "sentTimesForRemindAt" JSONB;
