ALTER TABLE "ConsultationBooking" ADD COLUMN "completedAt" TIMESTAMP(3);
CREATE INDEX "ConsultationBooking_clientId_status_completedAt_idx" ON "ConsultationBooking"("clientId", "status", "completedAt");
