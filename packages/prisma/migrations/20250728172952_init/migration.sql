/*
  Warnings:

  - The primary key for the `Award` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Course` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `CourseReview` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `DayOnCourse` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Diploma` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `FavoriteCourse` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `StepOnDay` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TrainingDay` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `UserCourse` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "CourseAccess" DROP CONSTRAINT "CourseAccess_courseId_fkey";

-- DropForeignKey
ALTER TABLE "CourseReview" DROP CONSTRAINT "CourseReview_courseId_fkey";

-- DropForeignKey
ALTER TABLE "DayOnCourse" DROP CONSTRAINT "DayOnCourse_courseId_fkey";

-- DropForeignKey
ALTER TABLE "DayOnCourse" DROP CONSTRAINT "DayOnCourse_dayId_fkey";

-- DropForeignKey
ALTER TABLE "FavoriteCourse" DROP CONSTRAINT "FavoriteCourse_courseId_fkey";

-- DropForeignKey
ALTER TABLE "StepOnDay" DROP CONSTRAINT "StepOnDay_dayId_fkey";

-- DropForeignKey
ALTER TABLE "UserCourse" DROP CONSTRAINT "UserCourse_courseId_fkey";

-- DropForeignKey
ALTER TABLE "UserStep" DROP CONSTRAINT "UserStep_stepOnDayId_fkey";

-- DropForeignKey
ALTER TABLE "UserTraining" DROP CONSTRAINT "UserTraining_dayOnCourseId_fkey";

-- AlterTable
ALTER TABLE "Award" DROP CONSTRAINT "Award_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Award_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Award_id_seq";

-- AlterTable
ALTER TABLE "Course" DROP CONSTRAINT "Course_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Course_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Course_id_seq";

-- AlterTable
ALTER TABLE "CourseAccess" ALTER COLUMN "courseId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "CourseReview" DROP CONSTRAINT "CourseReview_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "courseId" SET DATA TYPE TEXT,
ADD CONSTRAINT "CourseReview_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "CourseReview_id_seq";

-- AlterTable
ALTER TABLE "DayOnCourse" DROP CONSTRAINT "DayOnCourse_pkey",
ALTER COLUMN "courseId" SET DATA TYPE TEXT,
ALTER COLUMN "dayId" SET DATA TYPE TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "DayOnCourse_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "DayOnCourse_id_seq";

-- AlterTable
ALTER TABLE "Diploma" DROP CONSTRAINT "Diploma_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Diploma_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Diploma_id_seq";

-- AlterTable
ALTER TABLE "FavoriteCourse" DROP CONSTRAINT "FavoriteCourse_pkey",
ALTER COLUMN "courseId" SET DATA TYPE TEXT,
ADD CONSTRAINT "FavoriteCourse_pkey" PRIMARY KEY ("userId", "courseId");

-- AlterTable
ALTER TABLE "StepOnDay" DROP CONSTRAINT "StepOnDay_pkey",
ALTER COLUMN "dayId" SET DATA TYPE TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "StepOnDay_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "StepOnDay_id_seq";

-- AlterTable
ALTER TABLE "TrainingDay" DROP CONSTRAINT "TrainingDay_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "TrainingDay_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "TrainingDay_id_seq";

-- AlterTable
ALTER TABLE "UserCourse" DROP CONSTRAINT "UserCourse_pkey",
ALTER COLUMN "courseId" SET DATA TYPE TEXT,
ADD CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("userId", "courseId");

-- AlterTable
ALTER TABLE "UserStep" ALTER COLUMN "stepOnDayId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "UserTraining" ALTER COLUMN "dayOnCourseId" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOnCourse" ADD CONSTRAINT "DayOnCourse_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepOnDay" ADD CONSTRAINT "StepOnDay_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraining" ADD CONSTRAINT "UserTraining_dayOnCourseId_fkey" FOREIGN KEY ("dayOnCourseId") REFERENCES "DayOnCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStep" ADD CONSTRAINT "UserStep_stepOnDayId_fkey" FOREIGN KEY ("stepOnDayId") REFERENCES "StepOnDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCourse" ADD CONSTRAINT "UserCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCourse" ADD CONSTRAINT "FavoriteCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
