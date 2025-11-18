-- CreateTable
CREATE TABLE "TrainerVideo" (
  "id" TEXT NOT NULL,
  "trainerId" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "durationSec" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainerVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_trainer_videos_trainer" ON "TrainerVideo"("trainerId");

-- AddForeignKey
ALTER TABLE "TrainerVideo"
ADD CONSTRAINT "TrainerVideo_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

