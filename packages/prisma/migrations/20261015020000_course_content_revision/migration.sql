-- Atomic invalidation: the version changes in the SAME PostgreSQL transaction
-- as Course/DayOnCourse/TrainingDay/StepOnDay/Step modifications. Rollbacks
-- also roll back the version. No loss of Redis notifications can stale cache.
CREATE TABLE "CourseContentRevision" (
    "id" INTEGER NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "CourseContentRevision_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CourseContentRevision" ("id", "revision") VALUES (1, 0);

CREATE FUNCTION gafus_bump_course_content_revision() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "CourseContentRevision"
       SET "revision" = "revision" + 1
     WHERE "id" = 1;
    RETURN NULL;
END;
$$;

-- Statement-level triggers limit single-row contention during a bulk edit.
-- They also cover direct Prisma writes not routed through Trainer Panel.
CREATE TRIGGER "course_content_revision_course"
AFTER INSERT OR UPDATE OR DELETE ON "Course"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

CREATE TRIGGER "course_content_revision_day_on_course"
AFTER INSERT OR UPDATE OR DELETE ON "DayOnCourse"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

CREATE TRIGGER "course_content_revision_training_day"
AFTER INSERT OR UPDATE OR DELETE ON "TrainingDay"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

CREATE TRIGGER "course_content_revision_step_on_day"
AFTER INSERT OR UPDATE OR DELETE ON "StepOnDay"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();

CREATE TRIGGER "course_content_revision_step"
AFTER INSERT OR UPDATE OR DELETE ON "Step"
FOR EACH STATEMENT EXECUTE FUNCTION gafus_bump_course_content_revision();
