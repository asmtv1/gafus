-- CreateEnum
CREATE TYPE "GalleryPhotoStatus" AS ENUM ('pending', 'processing', 'ready', 'moving', 'failed');

-- CreateEnum
CREATE TYPE "GalleryUploadStatus" AS ENUM ('reserved', 'uploaded', 'processing', 'ready', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "GalleryStorageJobKind" AS ENUM ('publish', 'move', 'delete');

-- CreateEnum
CREATE TYPE "GalleryStorageJobStatus" AS ENUM ('pending', 'processing', 'done', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "GalleryAlbum" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "coverPhotoId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "caption" VARCHAR(2000),
    "status" "GalleryPhotoStatus" NOT NULL DEFAULT 'pending',
    "thumbKey" TEXT,
    "fullKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "clientRequestId" VARCHAR(36) NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "retryOfId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "filename" VARCHAR(255) NOT NULL,
    "declaredMime" VARCHAR(64) NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceETag" TEXT,
    "status" "GalleryUploadStatus" NOT NULL DEFAULT 'reserved',
    "postExpiresAt" TIMESTAMP(3) NOT NULL,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stagedThumbKey" TEXT,
    "stagedFullKey" TEXT,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryStorageJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "photoId" TEXT,
    "uploadId" TEXT,
    "destinationAlbumId" TEXT,
    "kind" "GalleryStorageJobKind" NOT NULL,
    "status" "GalleryStorageJobStatus" NOT NULL DEFAULT 'pending',
    "sourceKeys" TEXT[],
    "sourceETags" TEXT[],
    "targetKeys" TEXT[],
    "width" INTEGER,
    "height" INTEGER,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryStorageJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryAlbum_ownerId_deletedAt_createdAt_id_idx" ON "GalleryAlbum"("ownerId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "GalleryPhoto_ownerId_deletedAt_status_reservationExpiresAt_idx" ON "GalleryPhoto"("ownerId", "deletedAt", "status", "reservationExpiresAt");

-- CreateIndex
CREATE INDEX "GalleryPhoto_albumId_deletedAt_createdAt_id_idx" ON "GalleryPhoto"("albumId", "deletedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_photoId_key" ON "GalleryUpload"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_retryOfId_key" ON "GalleryUpload"("retryOfId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_sourceKey_key" ON "GalleryUpload"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_attemptToken_key" ON "GalleryUpload"("attemptToken");

-- CreateIndex
CREATE INDEX "GalleryUpload_status_reservationExpiresAt_leaseUntil_idx" ON "GalleryUpload"("status", "reservationExpiresAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryUpload_ownerId_clientRequestId_key" ON "GalleryUpload"("ownerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryStorageJob_dedupeKey_key" ON "GalleryStorageJob"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryStorageJob_attemptToken_key" ON "GalleryStorageJob"("attemptToken");

-- CreateIndex
CREATE INDEX "GalleryStorageJob_status_availableAt_leaseUntil_idx" ON "GalleryStorageJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "GalleryStorageJob_ownerId_photoId_idx" ON "GalleryStorageJob"("ownerId", "photoId");

-- AddForeignKey
ALTER TABLE "GalleryAlbum" ADD CONSTRAINT "GalleryAlbum_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "GalleryAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryUpload" ADD CONSTRAINT "GalleryUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryUpload" ADD CONSTRAINT "GalleryUpload_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "GalleryPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

