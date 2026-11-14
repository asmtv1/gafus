-- Record audited staged rollout target; upgrades are monotonic and CAS-protected.
ALTER TABLE "MobileOtaAuditEvent" ADD COLUMN "rolloutPercent" INTEGER;
ALTER TABLE "MobileOtaDeployment" ADD CONSTRAINT "MobileOtaDeployment_rolloutPercent_range"
  CHECK ("rolloutPercent" >= 0 AND "rolloutPercent" <= 100);
