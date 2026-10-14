-- New isolated queue, no mutation of pre-existing Gallery/Feed records.
CREATE TABLE "MediaCdnPurge" (
    "id" TEXT NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "paths" TEXT[] NOT NULL,
    "purgeOperations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaCdnPurge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaCdnPurge_status_availableAt_idx" ON "MediaCdnPurge"("status", "availableAt");
