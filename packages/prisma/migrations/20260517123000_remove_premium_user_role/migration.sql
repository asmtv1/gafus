UPDATE "User"
SET "role" = 'USER'
WHERE "role" = 'PREMIUM';

UPDATE "AccountDeletionAudit"
SET "role" = 'USER'
WHERE "role" = 'PREMIUM';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('USER', 'TRAINER', 'ADMIN', 'MODERATOR');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole",
  ALTER COLUMN "role" SET DEFAULT 'USER';

ALTER TABLE "AccountDeletionAudit"
  ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole";

DROP TYPE "UserRole_old";
