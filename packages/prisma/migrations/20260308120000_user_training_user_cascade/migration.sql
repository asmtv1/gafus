-- AlterTable: UserTraining.userId — ON DELETE RESTRICT → CASCADE
-- Чтобы удаление пользователя в админке не блокировалось записями UserTraining
ALTER TABLE "UserTraining" DROP CONSTRAINT "UserTraining_userId_fkey";
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
