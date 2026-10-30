-- G05 additive, preserves Pet and all existing migrations. Do not apply without separately approved DB lease.
CREATE TABLE "PetCreateReceipt" (
  "ownerId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "petId" TEXT NOT NULL,
  "responseStatus" SMALLINT NOT NULL DEFAULT 201,
  "responseJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetCreateReceipt_ownerId_clientRequestId_key" PRIMARY KEY ("ownerId","clientRequestId"),
  CONSTRAINT "PetCreateReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PetCreateReceipt_responseStatus_check" CHECK ("responseStatus" = 201),
  CONSTRAINT "PetCreateReceipt_payloadHash_format" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$')
);
