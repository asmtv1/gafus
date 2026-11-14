-- Exact idempotency for private source patch registrations.
-- NULL supports pre-existing definitions whose operation ID was not recorded.
ALTER TABLE "MobilePatchDefinition" ADD COLUMN "operationId" VARCHAR(120);
UPDATE "MobilePatchDefinition"
SET "operationId" = "nativeRequirements"->>'operationId'
WHERE "nativeRequirements" ? 'operationId';
CREATE UNIQUE INDEX "MobilePatchDefinition_operationId_key"
  ON "MobilePatchDefinition"("operationId");
