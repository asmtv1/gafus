CREATE TABLE "PetDocument" (
  "id" TEXT NOT NULL,
  "petId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PetDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PetDocument_petId_createdAt_idx" ON "PetDocument"("petId", "createdAt");
CREATE INDEX "PetDocument_ownerId_idx" ON "PetDocument"("ownerId");

ALTER TABLE "PetDocument"
ADD CONSTRAINT "PetDocument_petId_fkey" FOREIGN KEY ("petId")
REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PetDocument"
ADD CONSTRAINT "PetDocument_ownerId_fkey" FOREIGN KEY ("ownerId")
REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

