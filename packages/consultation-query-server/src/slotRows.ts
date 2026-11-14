/**
 * Consultation calendar SQL repository.
 *
 * Core owns Moscow civil-time math, protected slot admission, horizon rules,
 * privacy-safe errors and slot status decisions. Repository owns SQL, caller-
 * scoped projections, advisory-lock serialization and bounded batch writes.
 */
import { Prisma, prisma } from "@gafus/prisma";

export type SlotTransaction = Prisma.TransactionClient;
export type ActiveSlotBooking = "PENDING_TRAINER_CONFIRMATION" | "CONFIRMED";
export type SlotRowStatus = "FREE" | "BOOKED" | "BLOCKED";

export async function withSlotTransaction<T>(
  callback: (tx: SlotTransaction) => Promise<T>,
  options: { maxWait: number; timeout: number },
): Promise<T> {
  return prisma.$transaction(callback, options);
}

export function readCynologistDayOffDates(cynologistId: string) {
  return prisma.consultationDayOff.findMany({
    where: { cynologistId },
    select: { date: true },
  });
}
export function readLatestCynologistSlot(cynologistId: string) {
  return prisma.consultationSlot.findFirst({
    where: { cynologistId },
    select: { startAt: true },
    orderBy: { startAt: "desc" },
  });
}
export function countCynologistWorkingRules(cynologistId: string) {
  return prisma.consultationAvailabilityRule.count({
    where: { cynologistId, isWorkingDay: true },
  });
}
export async function lockCynologistSlotHorizon(tx: SlotTransaction, cynologistId: string) {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consultation-slots:${cynologistId}`}, 0))`,
  );
}
export function readCynologistSlotSchedule(tx: SlotTransaction, cynologistId: string) {
  return tx.consultationCynologist.findUnique({
    where: { id: cynologistId },
    include: { availabilityRules: true, dayOffs: true, slotExceptions: true },
  });
}
export function readExistingCynologistSlots(
  tx: SlotTransaction,
  cynologistId: string,
  fromUtc: Date,
  toUtc: Date,
  activeStatuses: readonly ActiveSlotBooking[],
) {
  return tx.consultationSlot.findMany({
    where: { cynologistId, startAt: { lt: toUtc }, endAt: { gt: fromUtc } },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      bookings: {
        where: { status: { in: [...activeStatuses] } },
        select: { id: true },
        take: 1,
      },
      _count: { select: { bookings: true } },
    },
  });
}
export async function updateCynologistSlotStatuses(
  tx: SlotTransaction,
  ids: string[],
  status: SlotRowStatus,
): Promise<void> {
  await tx.consultationSlot.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
}
export async function deleteCynologistSlots(tx: SlotTransaction, ids: string[]): Promise<void> {
  await tx.consultationSlot.deleteMany({ where: { id: { in: ids } } });
}
export async function createMissingCynologistSlots(
  tx: SlotTransaction,
  cynologistId: string,
  intervals: { startAt: Date; endAt: Date }[],
): Promise<void> {
  await tx.consultationSlot.createMany({
    data: intervals.map((d) => ({
      cynologistId,
      startAt: d.startAt,
      endAt: d.endAt,
      status: "FREE" as const,
    })),
    skipDuplicates: true,
  });
}
export async function blockCynologistExceptionOverlap(
  tx: SlotTransaction,
  cynologistId: string,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  await tx.consultationSlot.updateMany({
    where: {
      cynologistId,
      status: "FREE",
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    data: { status: "BLOCKED" },
  });
}
export function readPublicSlotCynologist(cynologistUserId: string) {
  return prisma.consultationCynologist.findUnique({
    where: { userId: cynologistUserId },
    select: { id: true, bookingLeadTimeMin: true, slotHorizonDays: true },
  });
}
export function readTrainerSlotCynologist(trainerUserId: string) {
  return prisma.consultationCynologist.findUnique({
    where: { userId: trainerUserId },
    select: { id: true, slotHorizonDays: true },
  });
}
export function readFreeCynologistSlots(
  cynologistId: string,
  fromUtc: Date,
  toUtc: Date,
  activeStatuses: readonly ActiveSlotBooking[],
) {
  return prisma.consultationSlot.findMany({
    where: {
      cynologistId,
      status: "FREE",
      bookings: { none: { status: { in: [...activeStatuses] } } },
      startAt: { gte: fromUtc, lte: toUtc },
    },
    select: { id: true, startAt: true, endAt: true, status: true },
    orderBy: { startAt: "asc" },
  });
}
export function readCalendarCynologistSlots(
  cynologistId: string,
  fromUtc: Date,
  toUtc: Date,
  activeStatuses: readonly ActiveSlotBooking[],
) {
  return prisma.consultationSlot.findMany({
    where: {
      cynologistId,
      startAt: { gte: fromUtc, lte: toUtc },
      status: { in: ["FREE", "BOOKED", "BLOCKED"] },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      bookings: {
        where: { status: { in: [...activeStatuses] } },
        select: { id: true, status: true },
        take: 1,
      },
    },
    orderBy: { startAt: "asc" },
  });
}
export function readVerifiedConsultationSlot(
  slotId: string,
  cynologistUserId: string,
  activeStatuses: readonly ActiveSlotBooking[],
) {
  return prisma.consultationSlot.findFirst({
    where: { id: slotId, cynologist: { userId: cynologistUserId } },
    select: {
      status: true,
      bookings: {
        where: { status: { in: [...activeStatuses] } },
        select: { id: true },
        take: 1,
      },
    },
  });
}
