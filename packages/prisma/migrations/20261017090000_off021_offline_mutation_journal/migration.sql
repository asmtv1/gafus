-- CreateTable
CREATE TABLE "OfflineMutationReceipt" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "resourceKey" VARCHAR(256) NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
    "revision" BIGINT,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "OfflineMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineResourceRevision" (
    "ownerId" TEXT NOT NULL,
    "resourceKey" VARCHAR(256) NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "OfflineResourceRevision_pkey" PRIMARY KEY ("ownerId","resourceKey")
);

-- CreateTable
CREATE TABLE "OfflinePreventionClientBinding" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "receiptId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflinePreventionClientBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineMutationEffect" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineMutationEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineMutationReceipt_ownerId_resourceKey_revision_idx" ON "OfflineMutationReceipt"("ownerId", "resourceKey", "revision");

-- CreateIndex
CREATE INDEX "OfflineMutationReceipt_expiresAt_idx" ON "OfflineMutationReceipt"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineMutationReceipt_ownerId_eventId_key" ON "OfflineMutationReceipt"("ownerId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineMutationReceipt_id_ownerId_key" ON "OfflineMutationReceipt"("id", "ownerId");

-- CreateIndex
CREATE INDEX "OfflinePreventionClientBinding_ownerId_petId_idx" ON "OfflinePreventionClientBinding"("ownerId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflinePreventionClientBinding_petId_clientId_key" ON "OfflinePreventionClientBinding"("petId", "clientId");

-- CreateIndex
CREATE INDEX "OfflineMutationEffect_status_availableAt_idx" ON "OfflineMutationEffect"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineMutationEffect_ownerId_eventId_kind_key" ON "OfflineMutationEffect"("ownerId", "eventId", "kind");

-- AddForeignKey
ALTER TABLE "OfflineMutationReceipt" ADD CONSTRAINT "OfflineMutationReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineResourceRevision" ADD CONSTRAINT "OfflineResourceRevision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePreventionClientBinding" ADD CONSTRAINT "OfflinePreventionClientBinding_petId_ownerId_fkey" FOREIGN KEY ("petId", "ownerId") REFERENCES "Pet"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePreventionClientBinding" ADD CONSTRAINT "OfflinePreventionClientBinding_receiptId_ownerId_fkey" FOREIGN KEY ("receiptId", "ownerId") REFERENCES "OfflineMutationReceipt"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineMutationEffect" ADD CONSTRAINT "OfflineMutationEffect_ownerId_eventId_fkey" FOREIGN KEY ("ownerId", "eventId") REFERENCES "OfflineMutationReceipt"("ownerId", "eventId") ON DELETE CASCADE ON UPDATE CASCADE;
