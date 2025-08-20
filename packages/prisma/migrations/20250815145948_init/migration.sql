/*
  Warnings:

  - Added the required column `trainingLevel` to the `Course` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."TrainingLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- AlterTable
ALTER TABLE "public"."Course" ADD COLUMN     "equipment" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trainingLevel" "public"."TrainingLevel" NOT NULL;

-- AlterTable
ALTER TABLE "public"."TrainingDay" ADD COLUMN     "equipment" TEXT NOT NULL DEFAULT '';
