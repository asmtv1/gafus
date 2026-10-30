import { Prisma, prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { consultationMskDayKey } from "./consultationMskFormat";
import { ensureConsultationCynologistRow } from "./cynologistService";
import { ConsultationForbiddenError, ConsultationNotFoundError } from "./errors";
import type {
  ConsultationAvailabilityRuleDto,
  ConsultationSlotDto,
  DayOffDto,
  SlotExceptionDto,
} from "./types";
import {
  dayOffInputSchema,
  slotExceptionInputSchema,
  trainerAvailabilityInputSchema,
  type TrainerAvailabilityInput,
} from "./validation";

const logger = createWebLogger("core-consultation-availability");

function horizonRangeUtc(horizonDays: number): { from: Date; to: Date } {
  const from = new Date();
  const to = new Date(from.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getTrainerAvailability(trainerUserId: string): Promise<{
  rules: ConsultationAvailabilityRuleDto[];
  dayOffs: DayOffDto[];
  exceptions: SlotExceptionDto[];
  slotDurationMin: number;
}> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { id: cynId },
    include: {
      availabilityRules: true,
      dayOffs: true,
      slotExceptions: true,
    },
  });
  if (!cyn) {
    throw new ConsultationNotFoundError("Профиль кинолога");
  }

  return {
    slotDurationMin: cyn.slotDurationMin,
    rules: cyn.availabilityRules.map((r) => ({
      id: r.id,
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      isWorkingDay: r.isWorkingDay,
    })),
    dayOffs: cyn.dayOffs.map((d) => ({
      id: d.id,
      date: d.date.toISOString().slice(0, 10),
      reason: d.reason,
    })),
    exceptions: cyn.slotExceptions.map((e) => ({
      id: e.id,
      startAtUtc: e.startAt.toISOString(),
      endAtUtc: e.endAt.toISOString(),
      reason: e.reason,
    })),
  };
}

/**
 * A schedule mutation and its materialized slots are one indivisible DB write.
 * Serializing under the same advisory lock used by reader-triggered rebuilds
 * avoids stale configurations overwriting newer slots. On any rebuild error,
 * Prisma rolls back both the changed rule/exception and the slot changes.
 */
async function mutateTrainerSchedule(
  trainerUserId: string,
  mutation: (tx: Prisma.TransactionClient, cynId: string) => Promise<void>,
): Promise<void> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const { rebuildSlotsForCynologistInTransaction } = await import("./slotService");
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consultation-slots:${cynId}`}, 0))`,
      );
      const cyn = await tx.consultationCynologist.findUnique({
        where: { id: cynId },
        select: { slotHorizonDays: true },
      });
      if (!cyn) throw new ConsultationNotFoundError("Профиль кинолога");

      await mutation(tx, cynId);
      const { from, to } = horizonRangeUtc(cyn.slotHorizonDays);
      await rebuildSlotsForCynologistInTransaction(tx, cynId, from, to);
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

export async function setTrainerAvailability(
  trainerUserId: string,
  input: TrainerAvailabilityInput,
): Promise<void> {
  // Preserve the same Zod contract even when a Core caller bypasses HTTP.
  const { rules } = trainerAvailabilityInputSchema.parse(input);
  await mutateTrainerSchedule(trainerUserId, async (tx, cynId) => {
    await tx.consultationAvailabilityRule.deleteMany({ where: { cynologistId: cynId } });
    for (const r of rules) {
      await tx.consultationAvailabilityRule.create({
        data: {
          cynologistId: cynId,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          isWorkingDay: r.isWorkingDay,
        },
      });
    }
  });
  logger.success("setTrainerAvailability", { trainerUserId });
}

export async function addDayOff(
  trainerUserId: string,
  dateIso: string,
  reason?: string,
): Promise<void> {
  dayOffInputSchema.parse({ date: dateIso, reason });
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  await mutateTrainerSchedule(trainerUserId, async (tx, cynId) => {
    const existing = await tx.consultationDayOff.findFirst({
      where: { cynologistId: cynId, date },
    });
    if (existing) {
      await tx.consultationDayOff.update({
        where: { id: existing.id },
        data: { reason: reason ?? null },
      });
    } else {
      await tx.consultationDayOff.create({
        data: { cynologistId: cynId, date, reason: reason ?? null },
      });
    }
  });
}

export async function removeDayOff(trainerUserId: string, dayOffId: string): Promise<void> {
  await mutateTrainerSchedule(trainerUserId, async (tx, cynId) => {
    const row = await tx.consultationDayOff.findFirst({
      where: { id: dayOffId, cynologistId: cynId },
    });
    if (!row) throw new ConsultationNotFoundError("Выходной");
    await tx.consultationDayOff.delete({ where: { id: row.id } });
  });
}

export async function addSlotException(
  trainerUserId: string,
  startAt: Date,
  endAt: Date,
  reason?: string,
): Promise<void> {
  // Reject invalid Date values and overlapping/reversed intervals at Core too.
  slotExceptionInputSchema.parse({
    startAt: Number.isFinite(startAt.getTime()) ? startAt.toISOString() : "invalid",
    endAt: Number.isFinite(endAt.getTime()) ? endAt.toISOString() : "invalid",
    reason,
  });
  await mutateTrainerSchedule(trainerUserId, async (tx, cynId) => {
    await tx.consultationSlotException.create({
      data: { cynologistId: cynId, startAt, endAt, reason: reason ?? null },
    });
  });
}

export async function removeSlotException(
  trainerUserId: string,
  exceptionId: string,
): Promise<void> {
  await mutateTrainerSchedule(trainerUserId, async (tx, cynId) => {
    const row = await tx.consultationSlotException.findFirst({
      where: { id: exceptionId, cynologistId: cynId },
    });
    if (!row) throw new ConsultationNotFoundError("Исключение");
    await tx.consultationSlotException.delete({ where: { id: row.id } });
  });
}

/**
 * Свободные слоты для UI расписания (ленивый импорт slotService — без Prisma enums в графе только чтения).
 */
export async function getTrainerEditableSlots(
  trainerUserId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<ConsultationSlotDto[]> {
  const { getTrainerEditableSlotsImpl } = await import("./slotService");
  return getTrainerEditableSlotsImpl(trainerUserId, fromUtc, toUtc);
}

export async function getCynologistDayOffDates(
  cynologistUserId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<string[]> {
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { userId: cynologistUserId },
    select: { id: true },
  });

  if (!cyn) {
    throw new ConsultationNotFoundError("Кинолог");
  }

  const dayOffs = await prisma.consultationDayOff.findMany({
    where: {
      cynologistId: cyn.id,
      date: {
        gte: fromUtc,
        lte: toUtc,
      },
    },
    select: { date: true },
    orderBy: { date: "asc" },
  });

  return dayOffs.map((d) => consultationMskDayKey(d.date));
}

export async function assertTrainerOwnsCynologist(
  trainerUserId: string,
  cynologistId: string,
): Promise<void> {
  const row = await prisma.consultationCynologist.findFirst({
    where: { id: cynologistId, userId: trainerUserId },
    select: { id: true },
  });
  if (!row) {
    throw new ConsultationForbiddenError();
  }
}
