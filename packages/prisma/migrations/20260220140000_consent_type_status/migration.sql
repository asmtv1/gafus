-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PERSONAL_DATA', 'PRIVACY_POLICY', 'DATA_DISTRIBUTION');

-- CreateEnum
CREATE TYPE "ConsentLogStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AddColumn consentType (with default for backfill)
ALTER TABLE "ConsentLog" ADD COLUMN "consentType" "ConsentType" NOT NULL DEFAULT 'PERSONAL_DATA';

-- Migrate status from TEXT to enum
ALTER TABLE "ConsentLog" ADD COLUMN "status_new" "ConsentLogStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "ConsentLog" SET "status_new" = CASE
  WHEN LOWER(status) = 'completed' THEN 'COMPLETED'::"ConsentLogStatus"
  WHEN LOWER(status) = 'failed' THEN 'FAILED'::"ConsentLogStatus"
  ELSE 'PENDING'::"ConsentLogStatus"
END;

ALTER TABLE "ConsentLog" DROP COLUMN "status";
ALTER TABLE "ConsentLog" RENAME COLUMN "status_new" TO "status";

-- Drop old unique index on tempSessionId
DROP INDEX IF EXISTS "ConsentLog_tempSessionId_key";

-- Add composite unique
CREATE UNIQUE INDEX "ConsentLog_tempSessionId_consentType_key" ON "ConsentLog"("tempSessionId", "consentType");

-- Add index on tempSessionId
CREATE INDEX "ConsentLog_tempSessionId_idx" ON "ConsentLog"("tempSessionId");

-- Remove column default for consentType (no longer needed)
ALTER TABLE "ConsentLog" ALTER COLUMN "consentType" DROP DEFAULT;
