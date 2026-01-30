-- AlterTable UserCourse: ручная правка родительного, винительного и предложного падежей клички питомца
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petNameGen" TEXT;
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petNameAcc" TEXT;
ALTER TABLE "UserCourse" ADD COLUMN IF NOT EXISTS "petNamePre" TEXT;
