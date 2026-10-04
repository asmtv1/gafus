import { prisma, type Prisma } from "@gafus/prisma";
import {
  CONSULTATION_ACTIVE_BOOKING_MESSAGE,
  consultationWeeklyCooldownMessage,
  type ConsultationBookingEligibility,
} from "@gafus/consultation-shared";
import { ConsultationBookingRestrictedError } from "./errors";

export const CONSULTATION_BOOKING_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Both creation and completion take this lock, across API/web instances. */
export async function lockConsultationClient(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${clientId} FOR UPDATE`;
}

export async function getConsultationBookingEligibility(
  clientId: string,
  db: Pick<Prisma.TransactionClient, "consultationBooking"> = prisma,
  now = new Date(),
): Promise<ConsultationBookingEligibility> {
  const active = await db.consultationBooking.findFirst({
    where: { clientId, status: { in: ["PENDING_TRAINER_CONFIRMATION", "CONFIRMED"] } },
    select: { id: true },
  });
  if (active) {
    return { canBook: false, reason: "ACTIVE_BOOKING", nextBookingAt: null,
      message: CONSULTATION_ACTIVE_BOOKING_MESSAGE };
  }
  const completed = await db.consultationBooking.findFirst({
    where: { clientId, status: "COMPLETED", completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  if (completed?.completedAt) {
    const next = new Date(completed.completedAt.getTime() + CONSULTATION_BOOKING_COOLDOWN_MS);
    if (now < next) {
      const nextBookingAt = next.toISOString();
      return { canBook: false, reason: "WEEKLY_COOLDOWN", nextBookingAt,
        message: consultationWeeklyCooldownMessage(nextBookingAt) };
    }
  }
  return { canBook: true, reason: null, nextBookingAt: null, message: null };
}

export async function requireConsultationBookingEligibility(
  clientId: string,
  db: Pick<Prisma.TransactionClient, "consultationBooking"> = prisma,
): Promise<void> {
  const eligibility = await getConsultationBookingEligibility(clientId, db);
  if (!eligibility.canBook) throw new ConsultationBookingRestrictedError(eligibility);
}
