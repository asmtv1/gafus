-- WEB2 additive pet/document media deletion intents.
-- SOURCE ONLY; never execute on production or shared WORK without explicit migration review.
-- No FK to deleted Pet/User; rows survive cascade and retry after lost provider ACK.
CREATE TABLE "PetMediaDeletionIntent" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "dedupeKey" CHAR(64) NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "locator" TEXT NOT NULL,
    "reason" VARCHAR(24) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PetMediaDeletionIntent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PetMediaDeletionIntent_provider_check" CHECK ("provider" IN ('cloudru-documents','isolated-avatar','legacy-yandex')),
    CONSTRAINT "PetMediaDeletionIntent_status_check" CHECK ("status" IN ('pending','processing','done')),
    CONSTRAINT "PetMediaDeletionIntent_reason_check" CHECK ("reason" IN ('pet-delete','document-delete','candidate','photo-replaced')),
    CONSTRAINT "PetMediaDeletionIntent_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "PetMediaDeletionIntent_ownerId_dedupeKey_key"
    ON "PetMediaDeletionIntent"("ownerId","dedupeKey");
CREATE INDEX "PetMediaDeletionIntent_status_availableAt_idx"
    ON "PetMediaDeletionIntent"("status","availableAt");
CREATE INDEX "PetMediaDeletionIntent_ownerId_petId_idx"
    ON "PetMediaDeletionIntent"("ownerId","petId");
