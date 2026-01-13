-- CreateEnum
CREATE TYPE "TranscodingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "TrainerVideo" ADD COLUMN "hlsManifestPath" TEXT;
ALTER TABLE "TrainerVideo" ADD COLUMN "transcodingStatus" "TranscodingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "TrainerVideo" ADD COLUMN "transcodedAt" TIMESTAMP(3);
ALTER TABLE "TrainerVideo" ADD COLUMN "transcodingError" TEXT;

-- CreateIndex
CREATE INDEX "TrainerVideo_transcodingStatus_idx" ON "TrainerVideo"("transcodingStatus");
