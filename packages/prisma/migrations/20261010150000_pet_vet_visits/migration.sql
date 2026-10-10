CREATE TABLE "PetVetVisit" (
  "id" TEXT NOT NULL, "petId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "visitedOn" DATE NOT NULL, "specialty" VARCHAR(200) NOT NULL,
  "doctorName" VARCHAR(200) NOT NULL DEFAULT '', "clinic" VARCHAR(300) NOT NULL DEFAULT '',
  "diagnosis" TEXT NOT NULL DEFAULT '', "conclusion" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetVetVisit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PetVetVisit_petId_ownerId_fkey" FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PetVetVisit_petId_visitedOn_createdAt_idx" ON "PetVetVisit"("petId", "visitedOn", "createdAt");
CREATE INDEX "PetVetVisit_ownerId_idx" ON "PetVetVisit"("ownerId");
CREATE TABLE "PetVetAttachment" (
  "id" TEXT NOT NULL, "visitId" TEXT NOT NULL, "name" VARCHAR(200) NOT NULL,
  "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
  "originalKey" TEXT NOT NULL, "previewKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetVetAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PetVetAttachment_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  CONSTRAINT "PetVetAttachment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "PetVetVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PetVetAttachment_originalKey_key" ON "PetVetAttachment"("originalKey");
CREATE UNIQUE INDEX "PetVetAttachment_previewKey_key" ON "PetVetAttachment"("previewKey");
CREATE INDEX "PetVetAttachment_visitId_createdAt_idx" ON "PetVetAttachment"("visitId", "createdAt");
