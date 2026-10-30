import { Prisma, prisma } from "@gafus/prisma";
import { DateTime } from "luxon";
import { createWebLogger } from "@gafus/logger";

import { consultationMskDayKey } from "./consultationMskFormat";
import { ConsultationNotFoundError, ConsultationSlotTakenError } from "./errors";
import type { ConsultationSlotDto } from "./types";

const logger = createWebLogger("core-consultation-slots");
const CONSULTATION_TIMEZONE = "Europe/Moscow";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Литеральные значения Prisma enum. Не использовать рантайм-экспорты
 * `ConsultationSlotStatus` / `ConsultationBookingStatus` из `@gafus/prisma` на уровне модуля:
 * в отдельных server-бандлах (например Next admin) именованные экспорты иногда `undefined`.
 */
const SLOT = {
  FREE: "FREE",
  BOOKED: "BOOKED",
  BLOCKED: "BLOCKED",
} as const;

const BOOKING = {
  PENDING_TRAINER_CONFIRMATION: "PENDING_TRAINER_CONFIRMATION",
  CONFIRMED: "CONFIRMED",
} as const;

/** Пока бронь в этом статусе, слот недоступен для новой записи (остальные — «хвост» в БД, слот уже FREE). */
const ACTIVE_BOOKING_FOR_SLOT = [BOOKING.PENDING_TRAINER_CONFIRMATION, BOOKING.CONFIRMED] as const;

function whereSlotFreeForNewBooking() {
  return {
    bookings: {
      none: { status: { in: [...ACTIVE_BOOKING_FOR_SLOT] } },
    },
  };
}

async function mskDayOffKeySetByCynologistId(cynologistId: string): Promise<Set<string>> {
  const rows = await prisma.consultationDayOff.findMany({
    where: { cynologistId },
    select: { date: true },
  });
  return new Set(rows.map((r) => consultationMskDayKey(r.date)));
}

async function ensureSlotHorizonCoversRequest(params: {
  cynologistId: string;
  slotHorizonDays: number;
  requestedToUtc: Date;
}): Promise<void> {
  const { cynologistId, slotHorizonDays, requestedToUtc } = params;
  const latestSlot = await prisma.consultationSlot.findFirst({
    where: { cynologistId },
    select: { startAt: true },
    orderBy: { startAt: "desc" },
  });

  if (latestSlot?.startAt && latestSlot.startAt >= requestedToUtc) {
    return;
  }

  const workingRules = await prisma.consultationAvailabilityRule.count({
    where: { cynologistId, isWorkingDay: true },
  });
  if (workingRules === 0) {
    return;
  }

  const from = new Date();
  const horizonTo = new Date(from.getTime() + slotHorizonDays * MS_PER_DAY);
  const to = new Date(Math.max(horizonTo.getTime(), requestedToUtc.getTime()));
  await rebuildSlotsForCynologist(cynologistId, from, to);
}

/** Luxon weekday 1..7 (Пн..Вс) → JS 0..6 (Вс..Сб). */
function luxonWeekdayToJs(w: number): number {
  return w === 7 ? 0 : w;
}

function parseHhMm(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number);
  return { h, m: m ?? 0 };
}

/**
 * Сгенерировать желаемые интервалы слотов (UTC) в диапазоне [fromUtc, toUtc].
 */
function buildDesiredSlotIntervals(params: {
  slotDurationMin: number;
  fromUtc: Date;
  toUtc: Date;
  rules: {
    weekday: number;
    startTime: string;
    endTime: string;
    isWorkingDay: boolean;
  }[];
  dayOffDates: Set<string>;
  exceptions: { startAt: Date; endAt: Date }[];
}): { startAt: Date; endAt: Date }[] {
  const { slotDurationMin, fromUtc, toUtc, rules, dayOffDates, exceptions } = params;
  const zone = CONSULTATION_TIMEZONE;
  const out: { startAt: Date; endAt: Date }[] = [];

  let cursor = DateTime.fromJSDate(fromUtc, { zone: "utc" }).setZone(zone).startOf("day");
  const endDay = DateTime.fromJSDate(toUtc, { zone: "utc" }).setZone(zone).endOf("day");

  while (cursor <= endDay) {
    const dateStr = cursor.toFormat("yyyy-MM-dd");
    if (dayOffDates.has(dateStr)) {
      cursor = cursor.plus({ days: 1 });
      continue;
    }

    const jsWeekday = luxonWeekdayToJs(cursor.weekday);
    const dayRules = rules.filter((r) => r.weekday === jsWeekday && r.isWorkingDay);
    for (const r of dayRules) {
      const sh = parseHhMm(r.startTime);
      const eh = parseHhMm(r.endTime);
      let slotStart = cursor.set({ hour: sh.h, minute: sh.m, second: 0, millisecond: 0 });
      const dayEnd = cursor.set({ hour: eh.h, minute: eh.m, second: 0, millisecond: 0 });
      while (slotStart.plus({ minutes: slotDurationMin }) <= dayEnd) {
        const slotEnd = slotStart.plus({ minutes: slotDurationMin });
        const startUtc = slotStart.toUTC().toJSDate();
        const endUtc = slotEnd.toUTC().toJSDate();
        if (startUtc >= fromUtc && endUtc <= toUtc) {
          out.push({ startAt: startUtc, endAt: endUtc });
        }
        slotStart = slotEnd;
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  const blocked = new Set<string>();
  for (const ex of exceptions) {
    for (const s of out) {
      if (s.startAt < ex.endAt && s.endAt > ex.startAt) {
        blocked.add(`${s.startAt.toISOString()}|${s.endAt.toISOString()}`);
      }
    }
  }

  return out
    .filter((s) => !blocked.has(`${s.startAt.toISOString()}|${s.endAt.toISOString()}`))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * Rebuild both persisted rule changes and materialized slots in the SAME
 * transaction. The caller must acquire the per-cynologist advisory lock before
 * making any configuration changes; re-acquiring an xact lock is harmless.
 * This also serializes the normal lazy reader-triggered horizon rebuild.
 */
export async function rebuildSlotsForCynologistInTransaction(
  tx: Prisma.TransactionClient,
  cynologistId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consultation-slots:${cynologistId}`}, 0))`,
  );
  const cyn = await tx.consultationCynologist.findUnique({
    where: { id: cynologistId },
    include: {
      availabilityRules: true,
      dayOffs: true,
      slotExceptions: true,
    },
  });

  if (!cyn) {
    throw new ConsultationNotFoundError("Профиль кинолога");
  }

  /** Ключи YYYY-MM-DD в МСК — как в buildDesiredSlotIntervals; иначе при TZ сервера ≠ Europe/Moscow выходной не совпадал с днём и FREE-слоты оставались. */
  const dayOffDates = new Set(cyn.dayOffs.map((d) => consultationMskDayKey(d.date)));

  const desired = buildDesiredSlotIntervals({
    slotDurationMin: cyn.slotDurationMin,
    fromUtc,
    toUtc,
    rules: cyn.availabilityRules.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      isWorkingDay: r.isWorkingDay,
    })),
    dayOffDates,
    exceptions: cyn.slotExceptions.map((e) => ({ startAt: e.startAt, endAt: e.endAt })),
  });

  const desiredKeys = new Set(
    desired.map((d) => `${d.startAt.toISOString()}|${d.endAt.toISOString()}`),
  );

  const existing = await tx.consultationSlot.findMany({
    where: {
      cynologistId,
      startAt: { lt: toUtc },
      endAt: { gt: fromUtc },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      bookings: {
        where: { status: { in: [...ACTIVE_BOOKING_FOR_SLOT] } },
        select: { id: true },
        take: 1,
      },
      _count: { select: { bookings: true } },
    },
  });

  const toBooked: string[] = [];
  const toBlocked: string[] = [];
  const toFree: string[] = [];
  const toDelete: string[] = [];
  for (const s of existing) {
    if (s.bookings.length > 0) {
      // Active confirmation/booking has priority over any calendar edit.
      if (s.status !== SLOT.BOOKED) toBooked.push(s.id);
      continue;
    }
    const key = `${s.startAt.toISOString()}|${s.endAt.toISOString()}`;
    if (s._count.bookings > 0) {
      // Historical FK references must be retained, but never reopened if
      // the new schedule would exclude that slot.
      if (desiredKeys.has(key)) {
        if (s.status !== SLOT.FREE) toFree.push(s.id);
      } else if (s.status !== SLOT.BLOCKED) {
        toBlocked.push(s.id);
      }
      continue;
    }
    if (!desiredKeys.has(key)) toDelete.push(s.id);
    else if (s.status === SLOT.BLOCKED) toFree.push(s.id);
  }

  // Keep bounded SQL round trips even when editing thousands of slots.
  // All decisions were made from one locked snapshot in this transaction.
  if (toBooked.length) {
    await tx.consultationSlot.updateMany({
      where: { id: { in: toBooked } },
      data: { status: SLOT.BOOKED },
    });
  }
  if (toBlocked.length) {
    await tx.consultationSlot.updateMany({
      where: { id: { in: toBlocked } },
      data: { status: SLOT.BLOCKED },
    });
  }
  if (toFree.length) {
    await tx.consultationSlot.updateMany({
      where: { id: { in: toFree } },
      data: { status: SLOT.FREE },
    });
  }
  if (toDelete.length) {
    await tx.consultationSlot.deleteMany({ where: { id: { in: toDelete } } });
  }

  // A full 60-day horizon may contain thousands of slots. A per-slot
  // findFirst/create round trip was causing minutes of latency during actual
  // legacy Next calendar rendering. Existing slot rows were already read
  // above under the cynologist advisory lock; batch only missing intervals.
  const existingKeys = new Set(
    existing.map((s) => `${s.startAt.toISOString()}|${s.endAt.toISOString()}`),
  );
  const missing = desired.filter(
    (d) => !existingKeys.has(`${d.startAt.toISOString()}|${d.endAt.toISOString()}`),
  );
  if (missing.length > 0) {
    await tx.consultationSlot.createMany({
      data: missing.map((d) => ({
        cynologistId,
        startAt: d.startAt,
        endAt: d.endAt,
        status: SLOT.FREE,
      })),
      // Historical FK-referenced slots may occupy the same startAt with a
      // different endAt. Do not overwrite that history or reopen its slot.
      skipDuplicates: true,
    });
  }

  for (const ex of cyn.slotExceptions) {
    await tx.consultationSlot.updateMany({
      where: {
        cynologistId,
        status: SLOT.FREE,
        startAt: { lt: ex.endAt },
        endAt: { gt: ex.startAt },
      },
      data: { status: SLOT.BLOCKED },
    });
  }
  logger.info("rebuildSlotsForCynologist done", { cynologistId, desired: desired.length });
}

/** Public rebuild for lazy horizon refreshes and existing trainer/core callers. */
export async function rebuildSlotsForCynologist(
  cynologistId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await rebuildSlotsForCynologistInTransaction(tx, cynologistId, fromUtc, toUtc);
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

/**
 * Доступные слоты для записи (FREE, не в прошлом относительно lead time).
 */
export async function getAvailableSlots(
  cynologistUserId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<ConsultationSlotDto[]> {
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { userId: cynologistUserId },
    select: {
      id: true,
      bookingLeadTimeMin: true,
      slotHorizonDays: true,
    },
  });

  if (!cyn) {
    throw new ConsultationNotFoundError("Кинолог");
  }

  await ensureSlotHorizonCoversRequest({
    cynologistId: cyn.id,
    slotHorizonDays: cyn.slotHorizonDays,
    requestedToUtc: toUtc,
  });

  const leadMs = cyn.bookingLeadTimeMin * 60 * 1000;
  const minByLead = new Date(Date.now() + leadMs);
  const minBySameDay = DateTime.utc()
    .setZone(CONSULTATION_TIMEZONE)
    .startOf("day")
    .plus({ days: 1 })
    .toUTC()
    .toJSDate();
  const minStart = new Date(Math.max(minByLead.getTime(), minBySameDay.getTime()));

  const dayOffMsk = await mskDayOffKeySetByCynologistId(cyn.id);

  const slots = await prisma.consultationSlot.findMany({
    where: {
      cynologistId: cyn.id,
      status: SLOT.FREE,
      ...whereSlotFreeForNewBooking(),
      startAt: { gte: new Date(Math.max(fromUtc.getTime(), minStart.getTime())), lte: toUtc },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
    },
    orderBy: { startAt: "asc" },
  });

  return slots
    .filter((s) => !dayOffMsk.has(consultationMskDayKey(s.startAt)))
    .map((s) => ({
      id: s.id,
      startAtUtc: s.startAt.toISOString(),
      endAtUtc: s.endAt.toISOString(),
      status: s.status,
    }));
}

/**
 * Свободные слоты кинолога для редактирования доступности в trainer-panel.
 * Публичный вход — {@link getTrainerEditableSlots} в availabilityService (ленивый импорт).
 */
export async function getTrainerEditableSlotsImpl(
  trainerUserId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<ConsultationSlotDto[]> {
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { userId: trainerUserId },
    select: { id: true, slotHorizonDays: true },
  });

  if (!cyn) {
    throw new ConsultationNotFoundError("Кинолог");
  }

  await ensureSlotHorizonCoversRequest({
    cynologistId: cyn.id,
    slotHorizonDays: cyn.slotHorizonDays,
    requestedToUtc: toUtc,
  });

  const dayOffMsk = await mskDayOffKeySetByCynologistId(cyn.id);

  const slots = await prisma.consultationSlot.findMany({
    where: {
      cynologistId: cyn.id,
      status: SLOT.FREE,
      ...whereSlotFreeForNewBooking(),
      startAt: { gte: fromUtc, lte: toUtc },
    },
    select: { id: true, startAt: true, endAt: true, status: true },
    orderBy: { startAt: "asc" },
  });

  return slots
    .filter((s) => !dayOffMsk.has(consultationMskDayKey(s.startAt)))
    .map((s) => ({
      id: s.id,
      startAtUtc: s.startAt.toISOString(),
      endAtUtc: s.endAt.toISOString(),
      status: s.status,
    }));
}

/**
 * Слоты для календарного выбора: FREE + BOOKED + BLOCKED.
 */
export async function getCalendarSlots(
  cynologistUserId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<ConsultationSlotDto[]> {
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { userId: cynologistUserId },
    select: { id: true, bookingLeadTimeMin: true, slotHorizonDays: true },
  });

  if (!cyn) {
    throw new ConsultationNotFoundError("Кинолог");
  }

  await ensureSlotHorizonCoversRequest({
    cynologistId: cyn.id,
    slotHorizonDays: cyn.slotHorizonDays,
    requestedToUtc: toUtc,
  });

  const leadMs = cyn.bookingLeadTimeMin * 60 * 1000;
  const minByLead = new Date(Date.now() + leadMs);
  const minBySameDay = DateTime.utc()
    .setZone(CONSULTATION_TIMEZONE)
    .startOf("day")
    .plus({ days: 1 })
    .toUTC()
    .toJSDate();
  const minStart = new Date(Math.max(minByLead.getTime(), minBySameDay.getTime()));

  const slots = await prisma.consultationSlot.findMany({
    where: {
      cynologistId: cyn.id,
      startAt: { gte: fromUtc, lte: toUtc },
      status: { in: [SLOT.FREE, SLOT.BOOKED, SLOT.BLOCKED] },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      bookings: {
        where: { status: { in: [...ACTIVE_BOOKING_FOR_SLOT] } },
        select: { id: true, status: true },
        take: 1,
      },
    },
    orderBy: { startAt: "asc" },
  });

  return slots.map((s) => {
    const activeBooking = s.bookings[0];
    const bookingKeepsSlotBusy =
      !!activeBooking &&
      (activeBooking.status === BOOKING.PENDING_TRAINER_CONFIRMATION ||
        activeBooking.status === BOOKING.CONFIRMED);
    const status =
      s.status === SLOT.FREE && bookingKeepsSlotBusy
        ? SLOT.BOOKED
        : s.status === SLOT.FREE && s.startAt < minStart
          ? SLOT.BLOCKED
          : s.status;
    return {
      id: s.id,
      startAtUtc: s.startAt.toISOString(),
      endAtUtc: s.endAt.toISOString(),
      status,
    };
  });
}

/**
 * Перед переходом на подтверждение записи: слот принадлежит кинологу и ещё в статусе FREE.
 */
export async function verifyConsultationSlotFreeForCynologist(
  slotId: string,
  cynologistUserId: string,
): Promise<void> {
  const slot = await prisma.consultationSlot.findFirst({
    where: {
      id: slotId,
      cynologist: { userId: cynologistUserId },
    },
    select: {
      status: true,
      bookings: {
        where: { status: { in: [...ACTIVE_BOOKING_FOR_SLOT] } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!slot) {
    throw new ConsultationNotFoundError("Слот");
  }
  if (slot.status !== SLOT.FREE || slot.bookings.length > 0) {
    throw new ConsultationSlotTakenError();
  }
}
