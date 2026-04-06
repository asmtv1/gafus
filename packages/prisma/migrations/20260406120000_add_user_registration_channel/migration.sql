-- CreateEnum
CREATE TYPE "RegistrationChannel" AS ENUM ('WEB', 'IOS', 'ANDROID', 'UNKNOWN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "registrationChannel" "RegistrationChannel" NOT NULL DEFAULT 'UNKNOWN';
