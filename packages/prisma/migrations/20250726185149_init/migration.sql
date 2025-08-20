/*
  Warnings:

  - You are about to drop the column `type` on the `TrainingDay` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Step" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "TrainingDay" DROP COLUMN "type";
