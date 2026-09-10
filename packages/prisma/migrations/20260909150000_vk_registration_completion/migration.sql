-- Durable completion/replay facts for the five-minute VK registration context.
-- This is deliberately additive: 20260909113000_registration_contracts_data is
-- already applied to the isolated registration test database.

ALTER TABLE "VkRegistrationContext"
  ADD COLUMN "completionFingerprint" VARCHAR(64);

ALTER TABLE "VkRegistrationContext"
  ADD COLUMN "selectedPromoCodeValue" VARCHAR(128);

CREATE INDEX "VkRegistrationContext_completionFingerprint_idx"
  ON "VkRegistrationContext"("completionFingerprint");

ALTER TABLE "VkLoginGrant"
  ADD COLUMN "registrationContextId" TEXT;

CREATE INDEX "VkLoginGrant_registrationContextId_idx"
  ON "VkLoginGrant"("registrationContextId");

ALTER TABLE "VkLoginGrant"
  ADD CONSTRAINT "VkLoginGrant_registrationContextId_fkey"
  FOREIGN KEY ("registrationContextId") REFERENCES "VkRegistrationContext"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
