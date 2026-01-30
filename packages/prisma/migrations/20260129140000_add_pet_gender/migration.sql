-- AlterTable UserCourse: пол питомца для корректного склонения клички
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petGender" TEXT;
