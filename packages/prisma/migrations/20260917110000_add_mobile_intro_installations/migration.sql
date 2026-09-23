CREATE TYPE "MobileIntroPlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "MobileIntroCompletion" AS ENUM ('COMPLETED', 'SKIPPED');
CREATE TYPE "MobileIntroAuthOutcome" AS ENUM ('REGISTERED', 'LOGGED_IN');

CREATE TABLE "MobileIntroInstallation" (
    "id" TEXT NOT NULL,
    "installationId" VARCHAR(128) NOT NULL,
    "introVersion" VARCHAR(32) NOT NULL,
    "platform" "MobileIntroPlatform" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion" "MobileIntroCompletion",
    "completedAt" TIMESTAMP(3),
    "authOutcome" "MobileIntroAuthOutcome",
    "authOutcomeAt" TIMESTAMP(3),
    "authOutcomeUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileIntroInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileIntroInstallation_installationId_introVersion_key"
  ON "MobileIntroInstallation"("installationId", "introVersion");
CREATE INDEX "MobileIntroInstallation_openedAt_idx" ON "MobileIntroInstallation"("openedAt");
CREATE INDEX "MobileIntroInstallation_authOutcomeUserId_idx" ON "MobileIntroInstallation"("authOutcomeUserId");

ALTER TABLE "MobileIntroInstallation"
  ADD CONSTRAINT "MobileIntroInstallation_authOutcomeUserId_fkey"
  FOREIGN KEY ("authOutcomeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
