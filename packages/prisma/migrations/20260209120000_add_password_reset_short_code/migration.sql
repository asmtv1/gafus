-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN "shortCode" TEXT;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "PasswordResetToken_shortCode_key" ON "PasswordResetToken"("shortCode");
