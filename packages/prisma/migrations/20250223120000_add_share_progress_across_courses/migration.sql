-- AlterTable
ALTER TABLE "TrainingDay" ADD COLUMN "shareProgressAcrossCourses" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex (оптимизация для sharedUserTrainings по dayId)
CREATE INDEX IF NOT EXISTS "DayOnCourse_dayId_idx" ON "DayOnCourse"("dayId");
