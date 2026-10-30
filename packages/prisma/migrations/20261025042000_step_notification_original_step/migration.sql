-- Preserve the immutable Step.id captured with the bound progress ACK.
ALTER TABLE "StepNotification" ADD COLUMN "originalStepId" TEXT;
