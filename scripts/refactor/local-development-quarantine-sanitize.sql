-- INFRA032 QUARANTINE-ONLY, DESTRUCTIVE SANITIZER. NOT EXECUTED/APPROVED FOR RUNTIME YET.
-- WARNING 2026-10-24: DESTRUCTIVE SIX-TABLE SYNTHETIC FIXTURE ONLY.
-- NOT a production-compatible data anonymizer, NOT a migration path, NOT a way
-- to validate the full production data model, business state or FK invariants.
-- Discards payment/history/entitlement/notification/session and almost all rows.
-- DO NOT EXECUTE under INFRA032 forward-compatibility work or attach app/API.
-- The separate forward compatibility review is recorded in the AG1 matrix.
-- Run ONLY on a verified freshly restored, network-isolated scratch quarantine PG15+
-- with `psql -X -v ON_ERROR_STOP=1 -f <thisfile>` AFTER permission.
-- Never redirect raw psql error output into shared logs.
-- Do not let API/Redis/queue/media/payment/browser connect to this DB, even after sanitation
-- until separate acceptance. NO RAW values are selected for display or logged here.
-- Explicit transaction protects even if the operator forgets psql -1; any SQL
-- failure with ON_ERROR_STOP terminates psql and rolls back on disconnect.
BEGIN;
SET LOCAL client_min_messages = warning;
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '5s';

DO $guard$
DECLARE public_count integer; archived_count integer;
BEGIN
 IF current_database() !~ '^gafus_refactor_local_quarantine_[a-z0-9_]+$'
    OR current_user !~ '^gafus_refactor_local_[a-z0-9_]+$'
    OR inet_server_addr()::text IS DISTINCT FROM '127.0.0.1'
    OR current_setting('server_version_num')::integer < 150000
 THEN RAISE EXCEPTION 'INFRA032_QUARANTINE_IDENTITY_REFUSED'; END IF;
 SELECT count(*) INTO public_count FROM pg_catalog.pg_tables WHERE schemaname='public';
 SELECT count(*) INTO archived_count FROM pg_catalog.pg_tables
   WHERE schemaname='gafus_legacy_purchase_archive';
 IF public_count <> 166 OR archived_count <> 7
 THEN RAISE EXCEPTION 'INFRA032_DUMP_TABLE_LAYOUT_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname NOT IN ('public','gafus_legacy_purchase_archive','pg_catalog','information_schema')
      AND schemaname NOT LIKE 'pg_toast%' AND schemaname NOT LIKE 'pg_temp%')
 THEN RAISE EXCEPTION 'INFRA032_UNKNOWN_SCHEMA_REFUSED'; END IF;
END
$guard$;

-- Temporary rekey maps are never exported. No original names/descriptions,
-- emails, phones, password hashes, credentials, media or other user data survive.
CREATE TEMP TABLE _infra032_users ON COMMIT DROP AS
SELECT old_id, 'c'||left(md5(gen_random_uuid()::text),24) AS new_id
FROM (SELECT "authorId" AS old_id FROM public."Course"
      UNION SELECT "authorId" FROM public."TrainingDay"
      UNION SELECT "authorId" FROM public."Step") authors;
CREATE UNIQUE INDEX ON _infra032_users(old_id);
CREATE UNIQUE INDEX ON _infra032_users(new_id);

CREATE TEMP TABLE _infra032_courses ON COMMIT DROP AS
SELECT c.id AS old_id, 'c'||left(md5(gen_random_uuid()::text),24) AS new_id,
       'local_'||left(md5(gen_random_uuid()::text),30) AS synthetic_type,
       c."authorId" AS old_author_id, c."trainingLevel" AS level
FROM public."Course" c;
CREATE UNIQUE INDEX ON _infra032_courses(old_id);
CREATE UNIQUE INDEX ON _infra032_courses(new_id);
CREATE UNIQUE INDEX ON _infra032_courses(synthetic_type);

CREATE TEMP TABLE _infra032_days ON COMMIT DROP AS
SELECT d.id AS old_id, 'c'||left(md5(gen_random_uuid()::text),24) AS new_id,
       d."authorId" AS old_author_id
FROM public."TrainingDay" d;
CREATE UNIQUE INDEX ON _infra032_days(old_id);
CREATE UNIQUE INDEX ON _infra032_days(new_id);

CREATE TEMP TABLE _infra032_steps ON COMMIT DROP AS
SELECT s.id AS old_id, 'c'||left(md5(gen_random_uuid()::text),24) AS new_id,
       s."authorId" AS old_author_id, s.type, s."durationSec", s."estimatedDurationSec"
FROM public."Step" s;
CREATE UNIQUE INDEX ON _infra032_steps(old_id);
CREATE UNIQUE INDEX ON _infra032_steps(new_id);

CREATE TEMP TABLE _infra032_daylinks ON COMMIT DROP AS
SELECT 'c'||left(md5(gen_random_uuid()::text),24) AS id,
       c.new_id AS "courseId", d.new_id AS "dayId", l."order"
FROM public."DayOnCourse" l
JOIN _infra032_courses c ON c.old_id=l."courseId"
JOIN _infra032_days d ON d.old_id=l."dayId";
CREATE TEMP TABLE _infra032_steplinks ON COMMIT DROP AS
SELECT 'c'||left(md5(gen_random_uuid()::text),24) AS id,
       d.new_id AS "dayId", s.new_id AS "stepId", l."order"
FROM public."StepOnDay" l
JOIN _infra032_days d ON d.old_id=l."dayId"
JOIN _infra032_steps s ON s.old_id=l."stepId";

DO $fk_guard$
BEGIN
 IF (SELECT count(*) FROM _infra032_daylinks) <> (SELECT count(*) FROM public."DayOnCourse")
    OR (SELECT count(*) FROM _infra032_steplinks) <> (SELECT count(*) FROM public."StepOnDay")
    OR EXISTS (SELECT 1 FROM _infra032_courses c LEFT JOIN _infra032_users u ON c.old_author_id=u.old_id WHERE u.old_id IS NULL)
    OR EXISTS (SELECT 1 FROM _infra032_days d LEFT JOIN _infra032_users u ON d.old_author_id=u.old_id WHERE u.old_id IS NULL)
    OR EXISTS (SELECT 1 FROM _infra032_steps s LEFT JOIN _infra032_users u ON s.old_author_id=u.old_id WHERE u.old_id IS NULL)
 THEN RAISE EXCEPTION 'INFRA032_LEARNING_LINK_INTEGRITY_REFUSED'; END IF;
END
$fk_guard$;

-- The seven legacy purchase archive tables are NEVER eligible for the safe output.
DROP SCHEMA gafus_legacy_purchase_archive CASCADE;
-- Completely destroy all original rows in the quarantine transaction. No app,
-- external worker or network egress may be present in this dedicated PG instance.
DO $truncate_all$
DECLARE names text;
BEGIN
 SELECT string_agg(format('%I.%I',schemaname,tablename),', ' ORDER BY tablename)
 INTO names FROM pg_catalog.pg_tables WHERE schemaname='public';
 IF names IS NULL THEN RAISE EXCEPTION 'INFRA032_EMPTY_TABLE_CATALOG'; END IF;
 EXECUTE 'TRUNCATE TABLE '||names||' RESTART IDENTITY CASCADE';
END
$truncate_all$;

-- Reconstitute ONLY six strictly selected, synthetic learning-structure tables.
INSERT INTO public."User" (id, username, password, role, "createdAt", "updatedAt")
SELECT u.new_id, 'local_'||u.new_id, 'INVALID_DISABLED_LOCAL_LOGIN_ONLY', 'TRAINER', now(), now()
FROM _infra032_users u;
INSERT INTO public."Course"
  (id, name, type, description, equipment, "trainingLevel", "shortDesc",
   duration, "logoImg", "isPrivate", "isPaid", "authorId",
   "videoUrl", "createdAt", "updatedAt", "showInProfile", "isPersonalized", "guideContent")
SELECT c.new_id, 'Обезличенный курс', c.synthetic_type, '', '', c.level, '',
       '0', '', false, false, u.new_id, NULL, now(), now(), false, false, NULL
FROM _infra032_courses c JOIN _infra032_users u ON u.old_id=c.old_author_id;
INSERT INTO public."TrainingDay"
  (id,title,equipment,description,type,"authorId", "createdAt", "updatedAt",
   "showCoursePathExport", "shareProgressAcrossCourses")
SELECT d.new_id, 'Обезличенный день', '', '', 'regular', u.new_id,
       now(), now(), false, false
FROM _infra032_days d JOIN _infra032_users u ON u.old_id=d.old_author_id;
INSERT INTO public."Step"
  (id,title,description,"durationSec",type,"imageUrls","pdfUrls","videoUrl",checklist,
   "requiresVideoReport","requiresWrittenFeedback","hasTestQuestions","surveySlug",
   "isDailyCourse","authorId","createdAt","updatedAt","estimatedDurationSec")
SELECT s.new_id, 'Обезличенный шаг', '', s."durationSec", s.type,
       ARRAY[]::text[], ARRAY[]::text[], NULL, NULL, false, false, false, NULL,
       false, u.new_id, now(), now(), s."estimatedDurationSec"
FROM _infra032_steps s JOIN _infra032_users u ON u.old_id=s.old_author_id;
INSERT INTO public."DayOnCourse" (id, "courseId", "dayId", "order")
SELECT id, "courseId", "dayId", "order" FROM _infra032_daylinks;
INSERT INTO public."StepOnDay" (id, "dayId", "stepId", "order")
SELECT id, "dayId", "stepId", "order" FROM _infra032_steplinks;

-- Runtime verification fails atomically if ANY non-approved public table has rows.
-- The original archive schema must be gone. SQL does not print any row content.
DO $verify$
DECLARE tbl record; occupied boolean;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='gafus_legacy_purchase_archive')
 THEN RAISE EXCEPTION 'INFRA032_LEGACY_PURCHASE_ARCHIVE_NOT_DESTROYED'; END IF;
 FOR tbl IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'
 AND tablename NOT IN ('User','Course','TrainingDay','Step','DayOnCourse','StepOnDay') LOOP
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)',tbl.tablename) INTO occupied;
   IF occupied THEN RAISE EXCEPTION 'INFRA032_UNAPPROVED_TABLE_NOT_EMPTY'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public."User"
            WHERE email IS NOT NULL OR phone IS NOT NULL OR "telegramId" IS NOT NULL)
 THEN RAISE EXCEPTION 'INFRA032_USER_CONTACT_NOT_NULL'; END IF;
 IF EXISTS (SELECT 1 FROM public."Course"
            WHERE "isPaid" OR "isPrivate" OR "videoUrl" IS NOT NULL OR "logoImg" <> '')
 THEN RAISE EXCEPTION 'INFRA032_PAID_OR_MEDIA_NOT_SANITIZED'; END IF;
 IF EXISTS (SELECT 1 FROM public."Step"
            WHERE "videoUrl" IS NOT NULL OR cardinality("imageUrls") <> 0
                  OR cardinality("pdfUrls") <> 0 OR checklist IS NOT NULL)
 THEN RAISE EXCEPTION 'INFRA032_STEP_MEDIA_NOT_SANITIZED'; END IF;
END
$verify$;
-- External systems stay disabled. This is one atomic all-or-nothing transaction.
COMMIT;
