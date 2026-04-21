import type { AuthRole } from "@gafus/auth";
import {
  ConsultationBookingStatus,
  ConsultationEmailType,
  ConsultationSlotStatus,
  Prisma,
  prisma,
} from "@gafus/prisma";
import {
  CONSULTATION_SLA_JOB_ID,
  consultationSlaQueue,
} from "@gafus/queues";
import { DateTime } from "luxon";
import { Job } from "bullmq";
import { createWebLogger } from "@gafus/logger";

import { ConsultationForbiddenError, ConsultationNotFoundError, ConsultationSlotTakenError } from "./errors";
import { enqueueConsultationEmail } from "./notificationService";
import { createTelemostConference } from "./telemostService";
import type { BookSlotResult, ConsultationBookingDto } from "./types";
import { bookSlotResultSchema, type BookSlotInput } from "./validation";

const logger = createWebLogger("core-consultation-booking");
const CONSULTATION_TIMEZONE = "Europe/Moscow";

function isConsultationSlotActiveUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("slotId");
}

async function removeSlaJob(bookingId: string): Promise<void> {
  try {
    const job = await Job.fromId(consultationSlaQueue, CONSULTATION_SLA_JOB_ID(bookingId));
    await job?.remove();
  } catch (e) {
    logger.warn("removeSlaJob", { bookingId, error: String(e) });
  }
}

async function scheduleSlaJob(bookingId: string, runAt: Date): Promise<void> {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  await consultationSlaQueue.add(
    "sla-timeout",
    { bookingId },
    {
      jobId: CONSULTATION_SLA_JOB_ID(bookingId),
      delay,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
}

export async function toBookingDto(bookingId: string): Promise<ConsultationBookingDto | null> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      cynologist: {
        include: {
          user: { include: { profile: { select: { fullName: true } } } },
        },
      },
    },
  });
  if (!b) {
    return null;
  }

  return {
    id: b.id,
    status: b.status,
    slot: {
      id: b.slot.id,
      startAtUtc: b.slot.startAt.toISOString(),
      endAtUtc: b.slot.endAt.toISOString(),
      status: b.slot.status,
    },
    cynologistUserId: b.cynologist.userId,
    cynologistDisplayName: b.cynologist.user.profile?.fullName ?? null,
    clientProblem: b.clientProblem,
    joinUrl: b.telemostJoinUrl,
    watchUrl: b.telemostWatchUrl,
    confirmationDeadlineAt: b.confirmationDeadlineAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  };
}

function trainerMayActOnBooking(
  actorRole: AuthRole,
  actorUserId: string,
  cynologistTrainerUserId: string,
): boolean {
  if (actorRole === "ADMIN" || actorRole === "MODERATOR") {
    return true;
  }
  return actorRole === "TRAINER" && actorUserId === cynologistTrainerUserId;
}

export async function bookSlot(
  clientId: string,
  input: BookSlotInput,
  requestId?: string,
): Promise<BookSlotResult> {
  const idem = await prisma.consultationBookingIdempotency.findUnique({
    where: {
      clientId_key: { clientId, key: input.idempotencyKey },
    },
  });
  if (idem?.responseJson && idem.expiresAt > new Date()) {
    const replay = bookSlotResultSchema.safeParse(idem.responseJson);
    if (replay.success) {
      return replay.data;
    }
  }

  let bookingId: string | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.consultationSlot.updateMany({
        where: { id: input.slotId, status: ConsultationSlotStatus.FREE },
        data: { status: ConsultationSlotStatus.BOOKED },
      });

      if (locked.count === 0) {
        throw new ConsultationSlotTakenError();
      }

      const slot = await tx.consultationSlot.findUnique({
        where: { id: input.slotId },
        include: { cynologist: true },
      });
      if (!slot) {
        throw new ConsultationNotFoundError("Слот");
      }

      const leadMs = slot.cynologist.bookingLeadTimeMin * 60 * 1000;
      const minByLead = Date.now() + leadMs;
      const minBySameDay = DateTime.utc()
        .setZone(CONSULTATION_TIMEZONE)
        .startOf("day")
        .plus({ days: 1 })
        .toUTC()
        .toMillis();
      if (slot.startAt.getTime() < Math.max(minByLead, minBySameDay)) {
        await tx.consultationSlot.updateMany({
          where: { id: input.slotId },
          data: { status: ConsultationSlotStatus.FREE },
        });
        throw new ConsultationForbiddenError("Запись день в день недоступна");
      }

      const slaMin = slot.cynologist.confirmationSlaMin;
      const deadline = new Date(Date.now() + slaMin * 60 * 1000);

      let booking;
      try {
        booking = await tx.consultationBooking.create({
          data: {
            clientId,
            cynologistId: slot.cynologistId,
            slotId: slot.id,
            clientProblem: input.clientProblem?.trim() || null,
            status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
            confirmationDeadlineAt: deadline,
          },
        });
      } catch (e) {
        if (isConsultationSlotActiveUniqueViolation(e)) {
          throw new ConsultationSlotTakenError();
        }
        throw e;
      }

      bookingId = booking.id;
      return { bookingId: booking.id, cynologistId: slot.cynologistId, deadline };
    });

    let telemost: { id: string; joinUrl: string; watchUrl: string | null };
    try {
      telemost = await createTelemostConference({ requestId });
    } catch (e) {
      await prisma.$transaction(async (tx) => {
        await tx.consultationBooking.update({
          where: { id: result.bookingId },
          data: { status: ConsultationBookingStatus.CANCELLED_BY_SYSTEM },
        });
        await tx.consultationSlot.update({
          where: { id: input.slotId },
          data: { status: ConsultationSlotStatus.FREE },
        });
      });
      throw e;
    }

    await prisma.consultationBooking.update({
      where: { id: result.bookingId },
      data: {
        telemostConferenceId: telemost.id,
        telemostJoinUrl: telemost.joinUrl,
        telemostWatchUrl: telemost.watchUrl,
      },
    });

    await enqueueConsultationEmail(result.bookingId, ConsultationEmailType.TRAINER_CONFIRM_REQUEST);
    await enqueueConsultationEmail(result.bookingId, ConsultationEmailType.CLIENT_BOOKING_RECEIVED);
    await scheduleSlaJob(result.bookingId, result.deadline);

    const dto = await toBookingDto(result.bookingId);
    if (!dto) {
      throw new Error("toBookingDto failed after create");
    }

    const payload: BookSlotResult = { kind: "created", booking: dto };

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.consultationBookingIdempotency.upsert({
      where: { clientId_key: { clientId, key: input.idempotencyKey } },
      create: {
        clientId,
        key: input.idempotencyKey,
        bookingId: result.bookingId,
        responseJson: payload as object,
        expiresAt,
      },
      update: {
        bookingId: result.bookingId,
        responseJson: payload as object,
        expiresAt,
      },
    });

    return payload;
  } catch (e) {
    if (bookingId && !(e instanceof ConsultationSlotTakenError)) {
      logger.error("bookSlot partial failure", e instanceof Error ? e : new Error(String(e)), {
        bookingId,
      });
    }
    throw e;
  }
}

export async function confirmBookingByTrainer(
  actorUserId: string,
  actorRole: AuthRole,
  bookingId: string,
): Promise<void> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: { cynologist: true },
  });
  if (!b) {
    throw new ConsultationNotFoundError("Бронирование");
  }
  if (!trainerMayActOnBooking(actorRole, actorUserId, b.cynologist.userId)) {
    throw new ConsultationForbiddenError();
  }
  if (b.status !== ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION) {
    throw new ConsultationForbiddenError("Некорректный статус");
  }

  await removeSlaJob(bookingId);

  await prisma.consultationBooking.update({
    where: { id: bookingId },
    data: {
      status: ConsultationBookingStatus.CONFIRMED,
      trainerConfirmedAt: new Date(),
    },
  });

  await enqueueConsultationEmail(bookingId, ConsultationEmailType.CLIENT_BOOKING_CONFIRMED);
  await enqueueConsultationEmail(bookingId, ConsultationEmailType.TRAINER_BOOKING_CONFIRMED);
}

export async function rejectBookingByTrainer(
  actorUserId: string,
  actorRole: AuthRole,
  bookingId: string,
  reason?: string,
): Promise<void> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: { cynologist: true, slot: true },
  });
  if (!b) {
    throw new ConsultationNotFoundError("Бронирование");
  }
  if (!trainerMayActOnBooking(actorRole, actorUserId, b.cynologist.userId)) {
    throw new ConsultationForbiddenError();
  }
  if (b.status !== ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION) {
    throw new ConsultationForbiddenError("Некорректный статус");
  }

  await removeSlaJob(bookingId);

  await prisma.$transaction(async (tx) => {
    await tx.consultationBooking.update({
      where: { id: bookingId },
      data: {
        status: ConsultationBookingStatus.CANCELLED_BY_TRAINER,
        cancelReason: reason ?? null,
      },
    });
    await tx.consultationSlot.update({
      where: { id: b.slotId },
      data: { status: ConsultationSlotStatus.FREE },
    });
  });

  await enqueueConsultationEmail(bookingId, ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_TRAINER);
}

export async function cancelBookingByUser(clientId: string, bookingId: string): Promise<void> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: { slot: true },
  });
  if (!b) {
    throw new ConsultationNotFoundError("Бронирование");
  }
  if (b.clientId !== clientId) {
    throw new ConsultationForbiddenError();
  }
  if (
    b.status !== ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION &&
    b.status !== ConsultationBookingStatus.CONFIRMED
  ) {
    throw new ConsultationForbiddenError("Отмена недоступна");
  }

  await removeSlaJob(bookingId);

  const wasPending = b.status === ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION;

  await prisma.$transaction(async (tx) => {
    await tx.consultationBooking.update({
      where: { id: bookingId },
      data: {
        status: ConsultationBookingStatus.CANCELLED_BY_USER,
      },
    });
    await tx.consultationSlot.update({
      where: { id: b.slotId },
      data: { status: ConsultationSlotStatus.FREE },
    });
  });

  if (wasPending) {
    await enqueueConsultationEmail(bookingId, ConsultationEmailType.TRAINER_BOOKING_CANCELLED_BY_USER);
  }
}

/** Worker: SLA истёк, тренер не подтвердил. */
export async function processBookingSlaTimeout(bookingId: string): Promise<void> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: { slot: true },
  });
  if (!b) {
    return;
  }
  if (b.status !== ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.consultationBooking.update({
      where: { id: bookingId },
      data: { status: ConsultationBookingStatus.CANCELLED_BY_SLA },
    });
    await tx.consultationSlot.update({
      where: { id: b.slotId },
      data: { status: ConsultationSlotStatus.FREE },
    });
  });

  await enqueueConsultationEmail(bookingId, ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_SLA);
}

export async function listClientBookings(
  clientId: string,
  cursor?: string,
  limit = 20,
): Promise<{ items: ConsultationBookingDto[]; nextCursor: string | null }> {
  const take = Math.min(50, Math.max(1, limit));
  const cur = cursor
    ? await prisma.consultationBooking.findUnique({
        where: { id: cursor },
        select: { id: true, createdAt: true },
      })
    : null;

  const rows = await prisma.consultationBooking.findMany({
    where: {
      clientId,
      ...(cur
        ? {
            OR: [
              { createdAt: { lt: cur.createdAt } },
              { createdAt: cur.createdAt, id: { lt: cur.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: {
      slot: true,
      cynologist: {
        include: {
          user: { include: { profile: { select: { fullName: true } } } },
        },
      },
    },
  });

  const slice = rows.slice(0, take);
  const hasMore = rows.length > take;
  const items: ConsultationBookingDto[] = slice.map((b) => ({
    id: b.id,
    status: b.status,
    slot: {
      id: b.slot.id,
      startAtUtc: b.slot.startAt.toISOString(),
      endAtUtc: b.slot.endAt.toISOString(),
      status: b.slot.status,
    },
    cynologistUserId: b.cynologist.userId,
    cynologistDisplayName: b.cynologist.user.profile?.fullName ?? null,
    clientProblem: b.clientProblem,
    joinUrl: b.telemostJoinUrl,
    watchUrl: b.telemostWatchUrl,
    confirmationDeadlineAt: b.confirmationDeadlineAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  }));

  return {
    items,
    nextCursor: hasMore ? slice[take - 1]?.id ?? null : null,
  };
}

export async function listTrainerBookings(
  trainerUserId: string,
  actorRole: AuthRole,
): Promise<ConsultationBookingDto[]> {
  const cyn = await prisma.consultationCynologist.findUnique({
    where: { userId: trainerUserId },
    select: { id: true },
  });

  if (actorRole === "TRAINER") {
    if (!cyn) {
      return [];
    }
  }

  const where =
    actorRole === "ADMIN" || actorRole === "MODERATOR"
      ? {}
      : { cynologistId: cyn!.id };

  const rows = await prisma.consultationBooking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      slot: true,
      cynologist: {
        include: {
          user: { include: { profile: { select: { fullName: true } } } },
        },
      },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    slot: {
      id: b.slot.id,
      startAtUtc: b.slot.startAt.toISOString(),
      endAtUtc: b.slot.endAt.toISOString(),
      status: b.slot.status,
    },
    cynologistUserId: b.cynologist.userId,
    cynologistDisplayName: b.cynologist.user.profile?.fullName ?? null,
    clientProblem: b.clientProblem,
    joinUrl: b.telemostJoinUrl,
    watchUrl: b.telemostWatchUrl,
    confirmationDeadlineAt: b.confirmationDeadlineAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  }));
}

