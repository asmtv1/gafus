-- Additive support for article purchases in the existing wallet ledger.
ALTER TYPE "GafusAccessTargetType" ADD VALUE IF NOT EXISTS 'ARTICLE';
ALTER TABLE "GafusTargetAccess" DROP CONSTRAINT "GafusTargetAccess_target_shape";
ALTER TABLE "GafusTargetAccess" ADD CONSTRAINT "GafusTargetAccess_target_shape" CHECK (
  ("targetType"::text = 'COURSE_STEP' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NOT NULL AND "stepOnDayId" IS NOT NULL)
  OR ("targetType"::text = 'MINI_GUIDE' AND "courseId" IS NOT NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL)
  OR ("targetType"::text = 'ARTICLE' AND "courseId" IS NULL AND "dayOnCourseId" IS NULL AND "stepOnDayId" IS NULL AND "targetKey" LIKE 'article:%')
);
