-- Add course survey step support.
ALTER TYPE "StepType" ADD VALUE IF NOT EXISTS 'SURVEY';

ALTER TABLE "Step" ADD COLUMN IF NOT EXISTS "surveySlug" TEXT;
ALTER TABLE "StepTemplate" ADD COLUMN IF NOT EXISTS "surveySlug" TEXT;

CREATE TYPE "SurveyPhase" AS ENUM ('INITIAL', 'FINAL');

CREATE TABLE "SurveyResponse" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "petId" TEXT,
  "surveySlug" TEXT NOT NULL,
  "surveyFamilySlug" TEXT NOT NULL,
  "phase" "SurveyPhase" NOT NULL,
  "surveyVersion" INTEGER NOT NULL,
  "answers" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SurveyResponse_userId_stepId_key" ON "SurveyResponse"("userId", "stepId");
CREATE INDEX "SurveyResponse_userId_courseId_surveyFamilySlug_idx" ON "SurveyResponse"("userId", "courseId", "surveyFamilySlug");
CREATE INDEX "SurveyResponse_stepId_idx" ON "SurveyResponse"("stepId");
CREATE INDEX "SurveyResponse_petId_idx" ON "SurveyResponse"("petId");

ALTER TABLE "SurveyResponse"
  ADD CONSTRAINT "SurveyResponse_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveyResponse"
  ADD CONSTRAINT "SurveyResponse_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveyResponse"
  ADD CONSTRAINT "SurveyResponse_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveyResponse"
  ADD CONSTRAINT "SurveyResponse_petId_fkey"
  FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
