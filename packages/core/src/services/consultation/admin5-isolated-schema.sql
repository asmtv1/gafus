-- ADMIN-5 isolated synthetic PG schema for transaction/booking calendar tests.
-- Do NOT apply to any real database. No Prisma migrate/generate. Local PG only.
CREATE TYPE "ConsultationSlotStatus" AS ENUM ('FREE','BOOKED','BLOCKED');
CREATE TYPE "ConsultationBookingStatus" AS ENUM ('PENDING_TRAINER_CONFIRMATION','CONFIRMED','CANCELLED_BY_TRAINER','CANCELLED_BY_USER','CANCELLED_BY_SLA','CANCELLED_BY_SYSTEM','COMPLETED','NO_SHOW');
CREATE TABLE "ConsultationCynologist" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "isListed" BOOLEAN NOT NULL DEFAULT FALSE,
  "slotDurationMin" INTEGER NOT NULL DEFAULT 30,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "bookingLeadTimeMin" INTEGER NOT NULL DEFAULT 60,
  "slotHorizonDays" INTEGER NOT NULL DEFAULT 60,
  "confirmationSlaMin" INTEGER NOT NULL DEFAULT 1440,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ConsultationAvailabilityRule" (
  id TEXT PRIMARY KEY,
  "cynologistId" TEXT NOT NULL REFERENCES "ConsultationCynologist"(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isWorkingDay" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("cynologistId",weekday)
);
CREATE TABLE "ConsultationDayOff" (
  id TEXT PRIMARY KEY,
  "cynologistId" TEXT NOT NULL REFERENCES "ConsultationCynologist"(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("cynologistId", date)
);
CREATE TABLE "ConsultationSlotException" (
  id TEXT PRIMARY KEY,
  "cynologistId" TEXT NOT NULL REFERENCES "ConsultationCynologist"(id) ON DELETE CASCADE,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  reason TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ConsultationSlot" (
  id TEXT PRIMARY KEY,
  "cynologistId" TEXT NOT NULL REFERENCES "ConsultationCynologist"(id) ON DELETE CASCADE,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  status "ConsultationSlotStatus" NOT NULL DEFAULT 'FREE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("cynologistId", "startAt")
);
CREATE TABLE "ConsultationBooking" (
  id TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "cynologistId" TEXT NOT NULL REFERENCES "ConsultationCynologist"(id) ON DELETE CASCADE,
  "slotId" TEXT NOT NULL REFERENCES "ConsultationSlot"(id),
  "clientOwnerName" TEXT,
  "clientPhone" TEXT,
  "petName" TEXT,
  "petGender" TEXT,
  "petAge" TEXT,
  "petBreed" TEXT,
  "clientProblem" TEXT,
  "clientSelfHelpAttempt" TEXT,
  status "ConsultationBookingStatus" NOT NULL DEFAULT 'PENDING_TRAINER_CONFIRMATION',
  "completedAt" TIMESTAMP(3),
  "trainerConfirmedAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "confirmationDeadlineAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Only the user identity/role projection read by authorizeTarget()/staff resolver.
-- No production/user-data schema or records are needed in this synthetic DB.
CREATE TYPE "UserRole" AS ENUM ('USER','PARTNER','TRAINER','ADMIN','MODERATOR');
CREATE TABLE "User" (
  id TEXT PRIMARY KEY,
  role "UserRole" NOT NULL
);
-- Synthetic identities: only exact fixture IDs for this in-memory Hono test.
INSERT INTO "User" (id, role) VALUES
 ('admin5_http_admin','ADMIN'),
 ('admin5_http_trainer','TRAINER'),
 ('admin5_http_user','USER'),
 ('admin5_http_moderator','MODERATOR');
