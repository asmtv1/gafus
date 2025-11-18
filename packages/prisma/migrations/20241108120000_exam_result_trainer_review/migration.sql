-- Поля проверки тренером и индексы для ExamResult
ALTER TABLE "ExamResult"
  ADD COLUMN IF NOT EXISTS "trainerComment" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'ExamResult'
      AND constraint_name = 'ExamResult_reviewedById_fkey'
  ) THEN
    ALTER TABLE "ExamResult"
      ADD CONSTRAINT "ExamResult_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ExamResult_reviewedById_idx" ON "ExamResult" ("reviewedById");
CREATE INDEX IF NOT EXISTS "ExamResult_reviewedAt_idx" ON "ExamResult" ("reviewedAt");
