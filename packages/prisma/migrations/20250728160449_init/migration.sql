/*
  Warnings:

  - Added the required column `authorId` to the `Step` table without a default value. This is not possible if the table is not empty.
  - Added the required column `authorId` to the `TrainingDay` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Step" ADD COLUMN     "authorId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TrainingDay" ADD COLUMN     "authorId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "TrainingDay" ADD CONSTRAINT "TrainingDay_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
