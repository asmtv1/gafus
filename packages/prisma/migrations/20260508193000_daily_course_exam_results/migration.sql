-- Support exam results for daily course steps.
ALTER TABLE "ExamResult" ADD COLUMN "dailyCourseUserStepId" TEXT;
ALTER TABLE "ExamResult" ALTER COLUMN "userStepId" DROP NOT NULL;

CREATE UNIQUE INDEX "ExamResult_dailyCourseUserStepId_key" ON "ExamResult"("dailyCourseUserStepId");
CREATE INDEX "ExamResult_dailyCourseUserStepId_idx" ON "ExamResult"("dailyCourseUserStepId");

ALTER TABLE "ExamResult"
  ADD CONSTRAINT "ExamResult_dailyCourseUserStepId_fkey"
  FOREIGN KEY ("dailyCourseUserStepId")
  REFERENCES "DailyCourseUserStep"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
