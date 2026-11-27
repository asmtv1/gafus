BEGIN;
ALTER TABLE "StepNotification"
  ADD COLUMN "consultationBookingId" TEXT REFERENCES "ConsultationBooking"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  ADD COLUMN "consultationReminderKey" TEXT,
  ADD COLUMN "consultationRetryAt" TIMESTAMP(3),
  ADD CONSTRAINT "StepNotification_consultation_reminder_check" CHECK (
    ("consultationBookingId" IS NULL AND "consultationReminderKey" IS NULL AND "consultationRetryAt" IS NULL) OR
    ("consultationBookingId" IS NOT NULL AND "consultationReminderKey" IS NOT NULL AND
     "consultationReminderKey" IN ('30m-client','30m-trainer','start-client','start-trainer'))
  );
CREATE UNIQUE INDEX "StepNotification_booking_reminder_key"
  ON "StepNotification" ("consultationBookingId", "consultationReminderKey");
COMMIT;
