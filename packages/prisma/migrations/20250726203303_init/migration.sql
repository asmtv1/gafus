/*
  Warnings:

  - The primary key for the `DayOnCourse` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `StepOnDay` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `durationSec` on the `UserStep` table. All the data in the column will be lost.
  - You are about to drop the column `stepId` on the `UserStep` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `UserStep` table. All the data in the column will be lost.
  - You are about to drop the column `trainingDayId` on the `UserTraining` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[courseId,order]` on the table `DayOnCourse` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[dayId,order]` on the table `StepOnDay` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userTrainingId,stepOnDayId]` on the table `UserStep` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,dayOnCourseId]` on the table `UserTraining` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `stepOnDayId` to the `UserStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dayOnCourseId` to the `UserTraining` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UserStep" DROP CONSTRAINT "UserStep_stepId_fkey";

-- DropForeignKey
ALTER TABLE "UserStep" DROP CONSTRAINT "UserStep_userTrainingId_fkey";

-- DropForeignKey
ALTER TABLE "UserTraining" DROP CONSTRAINT "UserTraining_trainingDayId_fkey";

-- DropIndex
DROP INDEX "UserStep_userTrainingId_stepId_key";

-- DropIndex
DROP INDEX "UserTraining_userId_trainingDayId_key";

-- AlterTable
ALTER TABLE "DayOnCourse" DROP CONSTRAINT "DayOnCourse_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "DayOnCourse_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "StepOnDay" DROP CONSTRAINT "StepOnDay_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "StepOnDay_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "UserStep" DROP COLUMN "durationSec",
DROP COLUMN "stepId",
DROP COLUMN "title",
ADD COLUMN     "stepOnDayId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "UserTraining" DROP COLUMN "trainingDayId",
ADD COLUMN     "dayOnCourseId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "DayOnCourse_courseId_order_idx" ON "DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DayOnCourse_courseId_order_key" ON "DayOnCourse"("courseId", "order");

-- CreateIndex
CREATE INDEX "StepOnDay_dayId_order_idx" ON "StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "StepOnDay_dayId_order_key" ON "StepOnDay"("dayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "UserStep_userTrainingId_stepOnDayId_key" ON "UserStep"("userTrainingId", "stepOnDayId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTraining_userId_dayOnCourseId_key" ON "UserTraining"("userId", "dayOnCourseId");

-- AddForeignKey
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_dayOnCourseId_fkey" FOREIGN KEY ("dayOnCourseId") REFERENCES "DayOnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_userTrainingId_fkey" FOREIGN KEY ("userTrainingId") REFERENCES "UserTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_stepOnDayId_fkey" FOREIGN KEY ("stepOnDayId") REFERENCES "StepOnDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
