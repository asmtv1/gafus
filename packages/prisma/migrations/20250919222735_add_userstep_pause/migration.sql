-- AlterTable
ALTER TABLE "UserStep" ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remainingSec" INTEGER;
