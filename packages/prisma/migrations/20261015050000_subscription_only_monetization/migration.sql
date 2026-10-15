-- Refactor one-off course and article purchases to subscription-only access.
-- CAUTION: production needs a verified PostgreSQL backup before deployment.
-- Archive historical payments in a dedicated schema before dropping old tables.
-- Subscription payment models, progress and private assignments are untouched.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
CREATE SCHEMA IF NOT EXISTS gafus_legacy_purchase_archive;

CREATE TABLE gafus_legacy_purchase_archive."Payment" AS
  SELECT * FROM public."Payment";
CREATE TABLE gafus_legacy_purchase_archive."ArticlePayment" AS
  SELECT * FROM public."ArticlePayment";
CREATE TABLE gafus_legacy_purchase_archive."ArticleAccess" AS
  SELECT * FROM public."ArticleAccess";
CREATE TABLE gafus_legacy_purchase_archive."OfertaAcceptance" AS
  SELECT * FROM public."OfertaAcceptance";
-- Archived enum columns must become independent TEXT values before enum cleanup.
ALTER TABLE gafus_legacy_purchase_archive."Payment"
  ALTER COLUMN "provider" TYPE text USING "provider"::text,
  ALTER COLUMN "status" TYPE text USING "status"::text;
ALTER TABLE gafus_legacy_purchase_archive."ArticlePayment"
  ALTER COLUMN "status" TYPE text USING "status"::text;

-- Preserve final list prices as read-only historical evidence.
CREATE TABLE gafus_legacy_purchase_archive."CoursePrices" AS
  SELECT id, "priceRub", "appleIapProductId" FROM public."Course";
CREATE TABLE gafus_legacy_purchase_archive."ArticlePrices" AS
  SELECT id, "priceRub" FROM public."Article";

CREATE TABLE gafus_legacy_purchase_archive."CourseAccess_purchase" AS
  SELECT a.* FROM public."CourseAccess" a
  INNER JOIN public."Course" c ON c.id = a."courseId"
  WHERE c."isPrivate" = false;

-- Keep only student assignments to PRIVATE courses in CourseAccess.
DELETE FROM public."CourseAccess" a USING public."Course" c
  WHERE a."courseId" = c.id AND c."isPrivate" = false;

DROP TABLE public."ArticleAccess";
DROP TABLE public."ArticlePayment";
DROP TABLE public."OfertaAcceptance";
DROP TABLE public."Payment";

ALTER TABLE public."Course"
  DROP COLUMN "priceRub",
  DROP COLUMN "appleIapProductId";
ALTER TABLE public."Article" DROP COLUMN "priceRub";

DROP TYPE IF EXISTS public."PaymentProvider";
DROP TYPE IF EXISTS public."PaymentStatus";
COMMIT;
