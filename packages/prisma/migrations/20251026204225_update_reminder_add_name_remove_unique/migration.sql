-- DropIndex
DROP INDEX IF EXISTS "Reminder_userId_type_key";

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Напоминание';

-- CreateIndex
CREATE INDEX "Reminder_userId_type_idx" ON "Reminder"("userId", "type");



