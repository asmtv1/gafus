import { prisma } from "@gafus/prisma";
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
import type { TrainerAvailabilityInput } from "./validation";

const logger = createWebLogger("core-consultation-availability");

function horizonRangeUtc(horizonDays: number): { from: Date; to: Date } {
  const from = new Date();
  const to = new Date(from.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getTrainerAvailability(
  trainerUserId: string,
): Promise<{
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

export async function setTrainerAvailability(
  trainerUserId: string,
  input: TrainerAvailabilityInput,
): Promise<void> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { id: cynId },
    select: { slotHorizonDays: true },
  });
  if (!cyn) {
    throw new ConsultationNotFoundError("Профиль кинолога");
  }

  await prisma.$transaction(async (tx) => {
    await tx.consultationAvailabilityRule.deleteMany({ where: { cynologistId: cynId } });
    for (const r of input.rules) {
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

  const { from, to } = horizonRangeUtc(cyn.slotHorizonDays);
  const { rebuildSlotsForCynologist } = await import("./slotService");
  await rebuildSlotsForCynologist(cynId, from, to);
  logger.success("setTrainerAvailability", { trainerUserId });
}

export async function addDayOff(
  trainerUserId: string,
  dateIso: string,
  reason?: string,
): Promise<void> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { id: cynId },
    select: { slotHorizonDays: true },
  });
  if (!cyn) {
    throw new ConsultationNotFoundError("Профиль кинолога");
  }

  const d = new Date(`${dateIso}T12:00:00.000Z`);
  const existing = await prisma.consultationDayOff.findFirst({
    where: { cynologistId: cynId, date: d },
  });
  if (existing) {
    await prisma.consultationDayOff.update({
      where: { id: existing.id },
      data: { reason: reason ?? null },
    });
  } else {
    await prisma.consultationDayOff.create({
      data: { cynologistId: cynId, date: d, reason: reason ?? null },
    });
  }

  const { from, to } = horizonRangeUtc(cyn.slotHorizonDays);
  const { rebuildSlotsForCynologist } = await import("./slotService");
  await rebuildSlotsForCynologist(cynId, from, to);
}

export async function removeDayOff(trainerUserId: string, dayOffId: string): Promise<void> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const row = await prisma.consultationDayOff.findFirst({
    where: { id: dayOffId, cynologistId: cynId },
  });
  if (!row) {
    throw new ConsultationNotFoundError("Выходной");
  }
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { id: cynId },
    select: { slotHorizonDays: true },
  });
  await prisma.consultationDayOff.delete({ where: { id: dayOffId } });
  if (cyn) {
    const { from, to } = horizonRangeUtc(cyn.slotHorizonDays);
    const { rebuildSlotsForCynologist } = await import("./slotService");
    await rebuildSlotsForCynologist(cynId, from, to);
  }
}

export async function addSlotException(
  trainerUserId: string,
  startAt: Date,
  endAt: Date,
  reason?: string,
): Promise<void> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { id: cynId },
    select: { slotHorizonDays: true },
  });
  if (!cyn) {
    throw new ConsultationNotFoundError("Профиль кинолога");
  }

  await prisma.consultationSlotException.create({
    data: {
      cynologistId: cynId,
      startAt,
      endAt,
      reason: reason ?? null,
    },
  });

  const { from, to } = horizonRangeUtc(cyn.slotHorizonDays);
  const { rebuildSlotsForCynologist } = await import("./slotService");
  await rebuildSlotsForCynologist(cynId, from, to);
}

export async function removeSlotException(
  trainerUserId: string,
  exceptionId: string,
): Promise<void> {
  const cynId = await ensureConsultationCynologistRow(trainerUserId);
  const row = await prisma.consultationSlotException.findFirst({
    where: { id: exceptionId, cynologistId: cynId },
  });
  if (!row) {
    throw new ConsultationNotFoundError("Исключение");
  }
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { id: cynId },
    select: { slotHorizonDays: true },
  });
  await prisma.consultationSlotException.delete({ where: { id: exceptionId } });
  if (cyn) {
    const { from, to } = horizonRangeUtc(cyn.slotHorizonDays);
    const { rebuildSlotsForCynologist } = await import("./slotService");
    await rebuildSlotsForCynologist(cynId, from, to);
  }
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
