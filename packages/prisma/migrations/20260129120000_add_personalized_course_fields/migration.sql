-- AlterTable Course: персонализация курса
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "isPersonalized" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable UserCourse: поля персонализации (имя, пол, имя питомца, склонения)
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "userDisplayName" TEXT;
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "userGender" TEXT;
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petName" TEXT;
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petNameDat" TEXT;
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petNameIns" TEXT;
