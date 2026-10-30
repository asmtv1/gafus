-- Additive: stable identity for step notifications; preserve historical positional records.
ALTER TABLE "StepNotification"
  ADD COLUMN "dayOnCourseId" TEXT,
  ADD COLUMN "stepOnDayId" TEXT;

CREATE INDEX "StepNotification_bound_occurrence_idx"
  ON "StepNotification" ("userId", "dayOnCourseId", "stepOnDayId");

-- At most one unsent bound notification for an occurrence, including paused rows.
-- Legacy records and immediate notifications have NULL ids and remain unaffected.
CREATE UNIQUE INDEX "StepNotification_active_bound_unique"
  ON "StepNotification" ("userId", "dayOnCourseId", "stepOnDayId")
  WHERE "type" = 'step' AND "sent" = false
    AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL;
