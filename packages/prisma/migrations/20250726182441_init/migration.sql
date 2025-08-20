/*
  Warnings:

  - You are about to drop the column `trainingDayId` on the `Step` table. All the data in the column will be lost.
  - You are about to drop the column `courseId` on the `TrainingDay` table. All the data in the column will be lost.
  - You are about to drop the column `dayNumber` on the `TrainingDay` table. All the data in the column will be lost.
  - You are about to drop the column `passwordResetRequestedAt` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Step" DROP CONSTRAINT "Step_trainingDayId_fkey";

-- DropForeignKey
ALTER TABLE "TrainingDay" DROP CONSTRAINT "TrainingDay_courseId_fkey";

-- DropIndex
DROP INDEX "TrainingDay_courseId_dayNumber_key";

-- AlterTable
ALTER TABLE "Step" DROP COLUMN "trainingDayId",
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pdfUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "Training" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TrainingDay" DROP COLUMN "courseId",
DROP COLUMN "dayNumber";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordResetRequestedAt",
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserCourse" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserStep" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserTraining" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "DayOnCourse" (
    "courseId" INTEGER NOT NULL,
    "dayId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "DayOnCourse_pkey" PRIMARY KEY ("courseId","dayId")
);

-- CreateTable
CREATE TABLE "StepOnDay" (
    "dayId" INTEGER NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "StepOnDay_pkey" PRIMARY KEY ("dayId","stepId")
);

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;
