ALTER TABLE "ConsultationCynologist"
  ALTER COLUMN "confirmationSlaMin" SET DEFAULT 1440;

UPDATE "ConsultationCynologist"
SET "confirmationSlaMin" = 1440
WHERE "confirmationSlaMin" = 120;
