-- CreateTable
CREATE TABLE "TrainerNote" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isVisibleToStudent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerNote_studentId_idx" ON "TrainerNote"("studentId");

-- CreateIndex
CREATE INDEX "TrainerNote_trainerId_createdAt_idx" ON "TrainerNote"("trainerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TrainerNote_trainerId_studentId_createdAt_idx" ON "TrainerNote"("trainerId", "studentId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
