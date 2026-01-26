-- AlterTable
ALTER TABLE "TrainerNote" ADD COLUMN "title" VARCHAR(200);
ALTER TABLE "TrainerNote" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
