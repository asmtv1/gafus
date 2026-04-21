-- Консультации с кинологом: enum-ы, таблицы, FK на "User"

CREATE TYPE "ConsultationSlotStatus" AS ENUM ('FREE', 'BOOKED', 'BLOCKED');

CREATE TYPE "ConsultationBookingStatus" AS ENUM (
  'PENDING_TRAINER_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED_BY_TRAINER',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_SLA',
  'CANCELLED_BY_SYSTEM',
  'COMPLETED',
  'NO_SHOW'
);

CREATE TYPE "ConsultationEmailType" AS ENUM (
  'TRAINER_CONFIRM_REQUEST',
  'CLIENT_BOOKING_RECEIVED',
  'CLIENT_BOOKING_CONFIRMED',
  'TRAINER_BOOKING_CONFIRMED',
  'CLIENT_BOOKING_CANCELLED_BY_TRAINER',
  'TRAINER_BOOKING_CANCELLED_BY_USER',
  'CLIENT_BOOKING_CANCELLED_BY_SLA'
);

CREATE TYPE "ConsultationEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "ConsultationCynologist" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isListed" BOOLEAN NOT NULL DEFAULT false,
  "telemostHostEmail" TEXT,
  "slotDurationMin" INTEGER NOT NULL DEFAULT 30,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "bookingLeadTimeMin" INTEGER NOT NULL DEFAULT 60,
  "slotHorizonDays" INTEGER NOT NULL DEFAULT 60,
  "confirmationSlaMin" INTEGER NOT NULL DEFAULT 120,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationCynologist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationCynologist_userId_key" ON "ConsultationCynologist"("userId");

CREATE INDEX "ConsultationCynologist_isListed_idx" ON "ConsultationCynologist"("isListed");

CREATE TABLE "ConsultationAvailabilityRule" (
  "id" TEXT NOT NULL,
  "cynologistId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationAvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationAvailabilityRule_cynologistId_weekday_key"
  ON "ConsultationAvailabilityRule"("cynologistId", "weekday");

CREATE INDEX "ConsultationAvailabilityRule_cynologistId_idx"
  ON "ConsultationAvailabilityRule"("cynologistId");

CREATE TABLE "ConsultationDayOff" (
  "id" TEXT NOT NULL,
  "cynologistId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationDayOff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationDayOff_cynologistId_date_key"
  ON "ConsultationDayOff"("cynologistId", "date");

CREATE INDEX "ConsultationDayOff_cynologistId_idx" ON "ConsultationDayOff"("cynologistId");

CREATE TABLE "ConsultationSlotException" (
  "id" TEXT NOT NULL,
  "cynologistId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationSlotException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultationSlotException_cynologistId_startAt_idx"
  ON "ConsultationSlotException"("cynologistId", "startAt");

CREATE TABLE "ConsultationSlot" (
  "id" TEXT NOT NULL,
  "cynologistId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" "ConsultationSlotStatus" NOT NULL DEFAULT 'FREE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationSlot_cynologistId_startAt_key"
  ON "ConsultationSlot"("cynologistId", "startAt");

CREATE INDEX "ConsultationSlot_cynologistId_status_startAt_idx"
  ON "ConsultationSlot"("cynologistId", "status", "startAt");

CREATE TABLE "ConsultationBooking" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "cynologistId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "status" "ConsultationBookingStatus" NOT NULL DEFAULT 'PENDING_TRAINER_CONFIRMATION',
  "telemostConferenceId" TEXT,
  "telemostJoinUrl" TEXT,
  "telemostWatchUrl" TEXT,
  "trainerConfirmedAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "confirmationDeadlineAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationBooking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationBooking_slotId_key" ON "ConsultationBooking"("slotId");

CREATE INDEX "ConsultationBooking_cynologistId_status_idx"
  ON "ConsultationBooking"("cynologistId", "status");

CREATE INDEX "ConsultationBooking_clientId_createdAt_idx"
  ON "ConsultationBooking"("clientId", "createdAt");

CREATE TABLE "ConsultationEmailLog" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "type" "ConsultationEmailType" NOT NULL,
  "status" "ConsultationEmailStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultationEmailLog_bookingId_type_idx"
  ON "ConsultationEmailLog"("bookingId", "type");

CREATE TABLE "ConsultationBookingIdempotency" (
  "clientId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "bookingId" TEXT,
  "responseJson" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsultationBookingIdempotency_pkey" PRIMARY KEY ("clientId", "key")
);

CREATE INDEX "ConsultationBookingIdempotency_expiresAt_idx"
  ON "ConsultationBookingIdempotency"("expiresAt");

ALTER TABLE "ConsultationCynologist"
  ADD CONSTRAINT "ConsultationCynologist_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationAvailabilityRule"
  ADD CONSTRAINT "ConsultationAvailabilityRule_cynologistId_fkey"
  FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationDayOff"
  ADD CONSTRAINT "ConsultationDayOff_cynologistId_fkey"
  FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationSlotException"
  ADD CONSTRAINT "ConsultationSlotException_cynologistId_fkey"
  FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationSlot"
  ADD CONSTRAINT "ConsultationSlot_cynologistId_fkey"
  FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationBooking"
  ADD CONSTRAINT "ConsultationBooking_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationBooking"
  ADD CONSTRAINT "ConsultationBooking_cynologistId_fkey"
  FOREIGN KEY ("cynologistId") REFERENCES "ConsultationCynologist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationBooking"
  ADD CONSTRAINT "ConsultationBooking_slotId_fkey"
  FOREIGN KEY ("slotId") REFERENCES "ConsultationSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsultationEmailLog"
  ADD CONSTRAINT "ConsultationEmailLog_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsultationBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationBookingIdempotency"
  ADD CONSTRAINT "ConsultationBookingIdempotency_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
