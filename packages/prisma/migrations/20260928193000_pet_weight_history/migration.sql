ALTER TABLE "Pet" ADD COLUMN "targetWeightKg" DOUBLE PRECISION;

CREATE TABLE "PetWeightEntry" (
  "id" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "weightKg" DOUBLE PRECISION NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetWeightEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PetWeightEntry_petId_measuredAt_idx" ON "PetWeightEntry"("petId", "measuredAt");
CREATE INDEX "PetWeightEntry_ownerId_idx" ON "PetWeightEntry"("ownerId");
ALTER TABLE "PetWeightEntry" ADD CONSTRAINT "PetWeightEntry_petId_ownerId_fkey"
  FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
