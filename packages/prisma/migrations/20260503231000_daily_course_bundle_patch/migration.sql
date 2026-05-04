-- Patch migration: convert old daily-course schema (TrainingDay-based) to DailyCourseBundle-based.
-- This migration is idempotent and safe for DBs that already have the new shape.

-- 1) Ensure new tables exist.
CREATE TABLE IF NOT EXISTS "DailyCourseBundle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "equipment" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'regular',
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyCourseBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DailyCourseBundleStep" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "DailyCourseBundleStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DailyCourseBundle_authorId_idx" ON "DailyCourseBundle"("authorId");
CREATE INDEX IF NOT EXISTS "DailyCourseBundle_updatedAt_idx" ON "DailyCourseBundle"("updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyCourseBundleStep_bundleId_order_key" ON "DailyCourseBundleStep"("bundleId", "order");
CREATE INDEX IF NOT EXISTS "DailyCourseBundleStep_bundleId_order_idx" ON "DailyCourseBundleStep"("bundleId", "order");
CREATE INDEX IF NOT EXISTS "DailyCourseBundleStep_stepId_idx" ON "DailyCourseBundleStep"("stepId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseBundle_authorId_fkey'
  ) THEN
    ALTER TABLE "DailyCourseBundle"
      ADD CONSTRAINT "DailyCourseBundle_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseBundleStep_bundleId_fkey'
  ) THEN
    ALTER TABLE "DailyCourseBundleStep"
      ADD CONSTRAINT "DailyCourseBundleStep_bundleId_fkey"
      FOREIGN KEY ("bundleId") REFERENCES "DailyCourseBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseBundleStep_stepId_fkey'
  ) THEN
    ALTER TABLE "DailyCourseBundleStep"
      ADD CONSTRAINT "DailyCourseBundleStep_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) Backfill bundles and bundle steps from old schedule/day shape (if old columns exist).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseSchedule'
      AND column_name = 'dayId'
  ) THEN
    INSERT INTO "DailyCourseBundle" ("id", "title", "equipment", "description", "type", "authorId", "createdAt", "updatedAt")
    SELECT
      td."id",
      td."title",
      td."equipment",
      td."description",
      td."type",
      td."authorId",
      td."createdAt",
      td."updatedAt"
    FROM "TrainingDay" td
    JOIN "DailyCourseSchedule" ds ON ds."dayId" = td."id"
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "DailyCourseBundleStep" ("id", "bundleId", "stepId", "order")
    SELECT
      sod."id",
      sod."dayId",
      sod."stepId",
      sod."order"
    FROM "StepOnDay" sod
    JOIN "DailyCourseSchedule" ds ON ds."dayId" = sod."dayId"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

-- 3) Move DailyCourseSchedule dayId -> bundleId.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseSchedule'
      AND column_name = 'bundleId'
  ) THEN
    ALTER TABLE "DailyCourseSchedule" ADD COLUMN "bundleId" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseSchedule'
      AND column_name = 'dayId'
  ) THEN
    UPDATE "DailyCourseSchedule" SET "bundleId" = "dayId" WHERE "bundleId" IS NULL;
  END IF;

  ALTER TABLE "DailyCourseSchedule" ALTER COLUMN "bundleId" SET NOT NULL;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseSchedule_dayId_fkey') THEN
    ALTER TABLE "DailyCourseSchedule" DROP CONSTRAINT "DailyCourseSchedule_dayId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DailyCourseSchedule_dayId_idx') THEN
    DROP INDEX "DailyCourseSchedule_dayId_idx";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DailyCourseSchedule_bundleId_idx') THEN
    CREATE INDEX "DailyCourseSchedule_bundleId_idx" ON "DailyCourseSchedule"("bundleId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseSchedule_bundleId_fkey') THEN
    ALTER TABLE "DailyCourseSchedule"
      ADD CONSTRAINT "DailyCourseSchedule_bundleId_fkey"
      FOREIGN KEY ("bundleId") REFERENCES "DailyCourseBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseSchedule'
      AND column_name = 'dayId'
  ) THEN
    ALTER TABLE "DailyCourseSchedule" DROP COLUMN "dayId";
  END IF;
END $$;

-- 4) Move DailyCourseUserStep stepOnDayId -> bundleStepId.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseUserStep'
      AND column_name = 'bundleStepId'
  ) THEN
    ALTER TABLE "DailyCourseUserStep" ADD COLUMN "bundleStepId" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseUserStep'
      AND column_name = 'stepOnDayId'
  ) THEN
    UPDATE "DailyCourseUserStep" SET "bundleStepId" = "stepOnDayId" WHERE "bundleStepId" IS NULL;
  END IF;

  ALTER TABLE "DailyCourseUserStep" ALTER COLUMN "bundleStepId" SET NOT NULL;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseUserStep_stepOnDayId_fkey') THEN
    ALTER TABLE "DailyCourseUserStep" DROP CONSTRAINT "DailyCourseUserStep_stepOnDayId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DailyCourseUserStep_stepOnDayId_idx') THEN
    DROP INDEX "DailyCourseUserStep_stepOnDayId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DailyCourseUserStep_dailyCourseUserTrainingId_stepOnDayId_key') THEN
    DROP INDEX "DailyCourseUserStep_dailyCourseUserTrainingId_stepOnDayId_key";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DailyCourseUserStep_bundleStepId_idx') THEN
    CREATE INDEX "DailyCourseUserStep_bundleStepId_idx" ON "DailyCourseUserStep"("bundleStepId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'DailyCourseUserStep_dailyCourseUserTrainingId_bundleStepId_key') THEN
    CREATE UNIQUE INDEX "DailyCourseUserStep_dailyCourseUserTrainingId_bundleStepId_key"
      ON "DailyCourseUserStep"("dailyCourseUserTrainingId", "bundleStepId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DailyCourseUserStep_bundleStepId_fkey') THEN
    ALTER TABLE "DailyCourseUserStep"
      ADD CONSTRAINT "DailyCourseUserStep_bundleStepId_fkey"
      FOREIGN KEY ("bundleStepId") REFERENCES "DailyCourseBundleStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'DailyCourseUserStep'
      AND column_name = 'stepOnDayId'
  ) THEN
    ALTER TABLE "DailyCourseUserStep" DROP COLUMN "stepOnDayId";
  END IF;
END $$;
