-- Add optional client problem summary for consultation booking confirmation flow.
ALTER TABLE "ConsultationBooking"
ADD COLUMN "clientProblem" TEXT;
