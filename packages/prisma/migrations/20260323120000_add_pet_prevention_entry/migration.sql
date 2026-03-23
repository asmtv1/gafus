-- CreateEnum
CREATE TYPE "PetPreventionType" AS ENUM ('VACCINATION', 'DEWORMING', 'TICKS_FLEAS');

-- CreateTable
CREATE TABLE "PetPreventionEntry" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "PetPreventionType" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "productName" TEXT,
    "notes" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetPreventionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PetPreventionEntry_petId_clientId_key" ON "PetPreventionEntry"("petId", "clientId");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_petId_idx" ON "PetPreventionEntry"("petId");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_ownerId_idx" ON "PetPreventionEntry"("ownerId");

-- CreateIndex
CREATE INDEX "PetPreventionEntry_petId_type_performedAt_idx" ON "PetPreventionEntry"("petId", "type", "performedAt");

-- AddForeignKey
ALTER TABLE "PetPreventionEntry" ADD CONSTRAINT "PetPreventionEntry_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetPreventionEntry" ADD CONSTRAINT "PetPreventionEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
