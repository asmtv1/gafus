-- One atomic additive migration: no partial schema on failure.
BEGIN;

-- Additive global Course revision. Existing rows and new creates begin at 1.
-- All current and future Course writers, including Prisma, raw SQL and bulk
-- UPDATE, are protected by the same database-owned row trigger.
ALTER TABLE "Course"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Course"
  ADD CONSTRAINT "Course_version_positive"
  CHECK ("version" > 0);

CREATE FUNCTION "gafus_course_increment_version"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Application code must NEVER bump/set version itself. One UPDATE = one
  -- database increment; explicit client-side increment would double count.
  IF NEW."version" IS DISTINCT FROM OLD."version" THEN
    RAISE EXCEPTION 'Course.version is database-managed'
      USING ERRCODE = '23514';
  END IF;
  IF OLD."version" >= 2147483647 THEN
    RAISE EXCEPTION 'Course.version exhausted'
      USING ERRCODE = '22003';
  END IF;
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER "Course_global_version_increment"
  BEFORE UPDATE ON "Course"
  FOR EACH ROW
  EXECUTE FUNCTION "gafus_course_increment_version"();

COMMIT;
