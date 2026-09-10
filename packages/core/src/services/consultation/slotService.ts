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
 * Пересобрать материализованные FREE-слоты в диапазоне. BOOKED не трогаем.
 */
export async function rebuildSlotsForCynologist(
  cynologistId: string,
  fromUtc: Date,
  toUtc: Date,
): Promise<void> {
  const cyn = await prisma.consultationCynologist.findUnique({
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
  const dayOffDates = new Set(
    cyn.dayOffs.map((d) => consultationMskDayKey(d.date)),
  );

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

  const desiredKeys = new Set(desired.map((d) => `${d.startAt.toISOString()}|${d.endAt.toISOString()}`));

  await prisma.$transaction(async (tx) => {
    // Calendar reads, the worker horizon and trainer edits can all request a
    // rebuild.  Serialize a whole rebuild per cynologist: the read-then-create
    // below would otherwise let concurrent requests collide on the unique
    // (cynologistId, startAt) constraint and return a 500 to one visitor.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consultation-slots:${cynologistId}`}, 0))`,
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

    for (const s of existing) {
      if (s.bookings.length > 0) {
        if (s.status !== SLOT.BOOKED) {
          await tx.consultationSlot.update({
            where: { id: s.id },
            data: { status: SLOT.BOOKED },
          });
        }
        continue;
      }
      if (s._count.bookings > 0) {
        if (s.status === SLOT.BOOKED) {
          await tx.consultationSlot.update({
            where: { id: s.id },
            data: { status: SLOT.FREE },
          });
        }
        continue;
      }
      const key = `${s.startAt.toISOString()}|${s.endAt.toISOString()}`;
      if (!desiredKeys.has(key)) {
        await tx.consultationSlot.delete({ where: { id: s.id } });
        continue;
      }
      if (s.status === SLOT.BLOCKED) {
        await tx.consultationSlot.update({
          where: { id: s.id },
          data: { status: SLOT.FREE },
        });
      }
    }

    for (const d of desired) {
      const exists = await tx.consultationSlot.findFirst({
        where: {
          cynologistId,
          startAt: d.startAt,
          endAt: d.endAt,
        },
      });
      if (!exists) {
        await tx.consultationSlot.create({
          data: {
            cynologistId,
            startAt: d.startAt,
            endAt: d.endAt,
            status: SLOT.FREE,
          },
        });
      }
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
  });

  logger.info("rebuildSlotsForCynologist done", { cynologistId, desired: desired.length });
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
