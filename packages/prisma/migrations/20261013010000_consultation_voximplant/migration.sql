-- Atomic provider cutover: PostgreSQL DDL and the historical enum conversion
-- must commit together or roll back together on any error.
BEGIN;

-- Legacy Telemost conference references intentionally discarded during cutover.
ALTER TABLE "ConsultationBooking"
  DROP COLUMN IF EXISTS "telemostConferenceId",
  DROP COLUMN IF EXISTS "telemostJoinUrl",
  DROP COLUMN IF EXISTS "telemostWatchUrl";
ALTER TABLE "ConsultationCynologist" DROP COLUMN IF EXISTS "telemostHostEmail";

-- Historical email logs must not be deleted. Rename the unused legacy
-- Telemost failure enum to a provider-neutral historical video failure value.
-- The new booking flow never emits this email type.

ALTER TYPE "ConsultationEmailType" RENAME TO "ConsultationEmailType_old";
CREATE TYPE "ConsultationEmailType" AS ENUM (
  'TRAINER_CONFIRM_REQUEST', 'CLIENT_BOOKING_RECEIVED',
  'CLIENT_BOOKING_CONFIRMED', 'TRAINER_BOOKING_CONFIRMED',
  'CLIENT_BOOKING_CANCELLED_BY_TRAINER', 'TRAINER_BOOKING_CANCELLED_BY_USER',
  'CLIENT_BOOKING_CANCELLED_BY_SLA', 'CLIENT_BOOKING_VIDEO_FAILED',
  'CLIENT_CONSULTATION_REMINDER_30M',
  'CLIENT_CONSULTATION_START', 'TRAINER_CONSULTATION_REMINDER_30M',
  'CLIENT_CONSULTATION_NO_SHOW'
);
ALTER TABLE "ConsultationEmailLog" ALTER COLUMN "type" TYPE "ConsultationEmailType"
  USING (CASE
    WHEN "type"::text = 'CLIENT_BOOKING_TELEMOST_FAILED'
      THEN 'CLIENT_BOOKING_VIDEO_FAILED'
    ELSE "type"::text
  END)::"ConsultationEmailType";
DROP TYPE "ConsultationEmailType_old";

COMMIT;
