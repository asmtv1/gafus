import type { AuthRole } from "@gafus/auth";
import {
  ConsultationBookingStatus,
  ConsultationEmailType,
  ConsultationSlotStatus,
  Prisma,
  prisma,
} from "@gafus/prisma";
import {
  CONSULTATION_REMINDER_JOB_ID,
  CONSULTATION_SLA_JOB_ID,
  type ConsultationReminderKind,
  consultationReminderQueue,
  consultationSlaQueue,
  removeConsultationReminderJob,
  removeConsultationSlaJob,
} from "@gafus/queues";
import { DateTime } from "luxon";
import { createWebLogger } from "@gafus/logger";

import { ConsultationForbiddenError, ConsultationNotFoundError, ConsultationSlotTakenError } from "./errors";
import { enqueueConsultationEmail } from "./notificationService";
import { createTelemostConference } from "./telemostService";
import type { BookSlotResult, ConsultationBookingDto } from "./types";
import { bookSlotResultSchema, type BookSlotInput } from "./validation";
import {
  REWARDED_CONSULTATION_BOOKING_COST,
  getRewardedCreditsStatus,
  refundRewardedCredits,
  SubscriptionOrCreditsRequiredError,
  unlockRewardedTarget,
  type RewardedPlatform,
  type RewardedTargetInput,
} from "../rewardedCredits";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "../appFeatureFlags";
import { getAppSubscriptionAccess } from "../appSubscription";

const logger = createWebLogger("core-consultation-booking");
const CONSULTATION_TIMEZONE = "Europe/Moscow";
const DEFAULT_CONFIRMATION_SLA_MIN = 24 * 60;

function isConsultationSlotActiveUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("slotId");
}

async function removeSlaJob(bookingId: string): Promise<void> {
  try {
    await removeConsultationSlaJob(bookingId);
  } catch (e) {
    logger.warn("removeSlaJob", { bookingId, error: String(e) });
  }
}

async function removeConsultationRemindJobSafe(bookingId: string): Promise<void> {
  try {
    await removeConsultationReminderJob(bookingId);
  } catch (e) {
    logger.warn("removeConsultationReminderJob", { bookingId, error: String(e) });
  }
}

const CONSULTATION_REMINDER_OFFSETS_MS: Record<ConsultationReminderKind, number> = {
  "30m": 30 * 60 * 1000,
  start: 0,
};

const CONSULTATION_REMINDER_JOB_NAMES: Record<ConsultationReminderKind, string> = {
  "30m": "remind-30m",
  start: "remind-start",
};

const CONSULTATION_RECONCILE_LOOKBACK_MINUTES = 10;

function buildConsultationRewardedTarget(
  clientId: string,
  idempotencyKey: string,
): RewardedTargetInput {
  return {
    targetType: "CONSULTATION_BOOKING",
    targetId: `${clientId}:${idempotencyKey}`,
    cost: REWARDED_CONSULTATION_BOOKING_COST,
  };
}

async function hasLiveConsultationBookingReplay(
  clientId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const idem = await prisma.consultationBookingIdempotency.findUnique({
    where: { clientId_key: { clientId, key: idempotencyKey } },
    select: { bookingId: true, responseJson: true, expiresAt: true },
  });
  return Boolean(idem && idem.expiresAt > new Date() && (idem.bookingId || idem.responseJson));
}

export async function refundConsultationRewardedCreditsForBooking(
  bookingId: string,
  reason: string,
): Promise<void> {
  const booking = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    select: { clientId: true },
  });
  if (!booking) return;

  const idem = await prisma.consultationBookingIdempotency.findFirst({
    where: { bookingId, clientId: booking.clientId },
    select: { key: true },
  });
  if (!idem?.key) return;
  const target = buildConsultationRewardedTarget(booking.clientId, idem.key);
  const spend = await prisma.rewardedCreditTransaction.findFirst({
    where: {
      userId: booking.clientId,
      type: "SPEND",
      targetType: target.targetType,
      targetId: target.targetId,
    },
    select: { id: true, amount: true },
  });
  if (!spend) return;

  await refundRewardedCredits({
    userId: booking.clientId,
    originalSpendId: spend.id,
    target,
    amount: spend.amount,
    reason,
    idempotencyKey: `rewarded:refund:consultation:${bookingId}:${reason}`,
  });
}

/** Напоминания перед стартом; если до окна меньше минуты — не планируем. */
async function scheduleConsultationReminderIfNeeded(
  bookingId: string,
  slotStartAt: Date,
  kind: ConsultationReminderKind,
): Promise<void> {
  const runAt = new Date(slotStartAt.getTime() - CONSULTATION_REMINDER_OFFSETS_MS[kind]);
  const delay = runAt.getTime() - Date.now();
  if (delay < 60 * 1000) {
    logger.info("consultation reminder: слишком близко к окну отправки или в прошлом, пропуск", {
      bookingId,
      kind,
    });
    return;
  }
  await consultationReminderQueue.add(
    CONSULTATION_REMINDER_JOB_NAMES[kind],
    { bookingId, kind },
    {
      jobId: CONSULTATION_REMINDER_JOB_ID(bookingId, kind),
      delay,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  logger.info("consultation reminder запланирован", { bookingId, kind, runAt: runAt.toISOString() });
}

async function scheduleConsultationRemindersIfNeeded(
  bookingId: string,
  slotStartAt: Date,
): Promise<void> {
  await scheduleConsultationReminderIfNeeded(bookingId, slotStartAt, "30m");
  await scheduleConsultationReminderIfNeeded(bookingId, slotStartAt, "start");
}

async function tryConsultationPush(
  userId: string,
  title: string,
  body: string,
  url: string,
  logCtx: { bookingId?: string; kind: string },
): Promise<void> {
  try {
    const { sendImmediatePushNotification } = await import("@gafus/webpush");
    const pushResult = await sendImmediatePushNotification({ userId, title, body, url });
    if (!pushResult.success) {
      logger.warn("пуш не отправлен", { ...logCtx, error: pushResult.error });
    }
  } catch (err) {
    logger.error(
      "ошибка пуша консультации",
      err instanceof Error ? err : new Error(String(err)),
      logCtx,
    );
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

function getConfirmationDeadlineAt(slaMinutes?: number | null, now = new Date()): Date {
  const minutes =
    typeof slaMinutes === "number" && Number.isFinite(slaMinutes) && slaMinutes > 0
      ? slaMinutes
      : DEFAULT_CONFIRMATION_SLA_MIN;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

export async function toBookingDto(bookingId: string): Promise<ConsultationBookingDto | null> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      client: { select: { username: true } },
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
    clientUsername: b.client.username,
    clientOwnerName: b.clientOwnerName,
    clientPhone: b.clientPhone,
    petName: b.petName,
    petGender: b.petGender,
    petAge: b.petAge,
    petBreed: b.petBreed,
    clientProblem: b.clientProblem,
    clientSelfHelpAttempt: b.clientSelfHelpAttempt,
    cancelReason: b.cancelReason,
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
      const d = replay.data;
      return {
        ...d,
        booking: {
          ...d.booking,
          clientUsername: d.booking.clientUsername ?? null,
        },
      };
    }
  }
  if (idem?.bookingId && idem.expiresAt > new Date()) {
    const replayDto = await toBookingDto(idem.bookingId);
    if (
      replayDto &&
      replayDto.status !== ConsultationBookingStatus.CANCELLED_BY_SYSTEM
    ) {
      return { kind: "idempotent_replay", booking: replayDto };
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

      const deadline = getConfirmationDeadlineAt(slot.cynologist.confirmationSlaMin);

      let booking;
      try {
        booking = await tx.consultationBooking.create({
          data: {
            clientId,
            cynologistId: slot.cynologistId,
            slotId: slot.id,
            clientOwnerName: input.clientOwnerName,
            clientPhone: input.clientPhone,
            petName: input.petName,
            petGender: input.petGender,
            petAge: input.petAge,
            petBreed: input.petBreed,
            clientProblem: input.clientProblem,
            clientSelfHelpAttempt: input.clientSelfHelpAttempt,
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

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.consultationBookingIdempotency.upsert({
      where: { clientId_key: { clientId, key: input.idempotencyKey } },
      create: {
        clientId,
        key: input.idempotencyKey,
        bookingId: result.bookingId,
        responseJson: { state: "BOOKING_CREATED" },
        expiresAt,
      },
      update: {
        bookingId: result.bookingId,
        expiresAt,
      },
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
      const failedBooking = await prisma.consultationBooking.findUnique({
        where: { id: result.bookingId },
        select: { clientId: true },
      });
      if (failedBooking) {
        await enqueueConsultationEmail(
          result.bookingId,
          ConsultationEmailType.CLIENT_BOOKING_TELEMOST_FAILED,
        );
        await tryConsultationPush(
          failedBooking.clientId,
          "Не удалось оформить консультацию",
          "Техническая ошибка при создании видеовстречи. Бронь отменена. Оформите запись снова при необходимости.",
          "/consultations",
          { bookingId: result.bookingId, kind: "telemost-fail" },
        );
      }
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

    const trainerForPush = await prisma.consultationBooking.findUnique({
      where: { id: result.bookingId },
      include: { cynologist: { select: { userId: true } } },
    });
    if (trainerForPush) {
      await tryConsultationPush(
        trainerForPush.cynologist.userId,
        "Новая заявка на консультацию",
        "В панели кинолога появилась новая заявка. Подтвердите или отклоните её в срок.",
        "/main-panel/consultations",
        { bookingId: result.bookingId, kind: "trainer-new-request" },
      );
    }

    const dto = await toBookingDto(result.bookingId);
    if (!dto) {
      throw new Error("toBookingDto failed after create");
    }

    const payload: BookSlotResult = { kind: "created", booking: dto };
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

export async function bookSlotWithPremiumOrRewardedCredits(input: {
  userId: string;
  platform: RewardedPlatform;
  body: BookSlotInput;
  requestId?: string;
}): Promise<BookSlotResult> {
  if (await hasLiveConsultationBookingReplay(input.userId, input.body.idempotencyKey)) {
    return bookSlot(input.userId, input.body, input.requestId);
  }

  const target = buildConsultationRewardedTarget(input.userId, input.body.idempotencyKey);
  const unlock = await unlockRewardedTarget({
    userId: input.userId,
    platform: input.platform,
    target,
  });

  try {
    return await bookSlot(input.userId, input.body, input.requestId);
  } catch (error) {
    if (unlock.spentCredits > 0) {
      await refundRewardedCredits({
        userId: input.userId,
        target,
        amount: unlock.spentCredits,
        reason: "BOOKING_FAILED",
        idempotencyKey: `rewarded:refund:consultation:${input.userId}:${input.body.idempotencyKey}:booking-failed`,
      });
    }
    throw error;
  }
}

export async function requireConsultationSlotsPremiumOrRewardedAccess(input: {
  userId: string;
  platform: RewardedPlatform;
  now?: Date;
}): Promise<void> {
  const gatingEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_APP_SUBSCRIPTION_GATING,
    true,
  );
  if (!gatingEnabled) return;

  const subscription = await getAppSubscriptionAccess(input.userId, input.now);
  if (subscription.hasActiveSubscription) return;

  const status = await getRewardedCreditsStatus({
    userId: input.userId,
    platform: input.platform,
    now: input.now,
  });
  if (status.wallet.balance >= REWARDED_CONSULTATION_BOOKING_COST) return;

  throw new SubscriptionOrCreditsRequiredError();
}

export async function confirmBookingByTrainer(
  actorUserId: string,
  actorRole: AuthRole,
  bookingId: string,
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

  await prisma.consultationBooking.update({
    where: { id: bookingId },
    data: {
      status: ConsultationBookingStatus.CONFIRMED,
      trainerConfirmedAt: new Date(),
    },
  });

  await enqueueConsultationEmail(bookingId, ConsultationEmailType.CLIENT_BOOKING_CONFIRMED);
  await enqueueConsultationEmail(bookingId, ConsultationEmailType.TRAINER_BOOKING_CONFIRMED);
  await scheduleConsultationRemindersIfNeeded(bookingId, b.slot.startAt);

  await tryConsultationPush(
    b.clientId,
    "Консультация подтверждена",
    "Ваша заявка на консультацию подтверждена кинологом. Подробности в письме или в разделе «Мои консультации».",
    "/consultations/my",
    { bookingId, kind: "client-confirmed" },
  );
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
  if (
    b.status !== ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION &&
    b.status !== ConsultationBookingStatus.CONFIRMED
  ) {
    throw new ConsultationForbiddenError("Некорректный статус");
  }

  await removeSlaJob(bookingId);
  await removeConsultationRemindJobSafe(bookingId);

  await prisma.$transaction(async (tx) => {
    await tx.consultationBooking.update({
      where: { id: bookingId },
      data: {
        status: ConsultationBookingStatus.CANCELLED_BY_TRAINER,
        cancelReason: reason?.trim() || null,
      },
    });
    await tx.consultationSlot.update({
      where: { id: b.slotId },
      data: { status: ConsultationSlotStatus.FREE },
    });
  });

  await enqueueConsultationEmail(
    bookingId,
    ConsultationEmailType.CLIENT_BOOKING_CANCELLED_BY_TRAINER,
  );
  await refundConsultationRewardedCreditsForBooking(bookingId, "CANCELLED_BY_TRAINER");
  await tryConsultationPush(
    b.clientId,
    b.trainerConfirmedAt
      ? "Встреча отменена кинологом"
      : "Заявка на консультацию отклонена",
    b.trainerConfirmedAt
      ? "Кинолог отменил запланированную встречу. Подробности в письме."
      : "Кинолог отклонил заявку. Подробности в письме.",
    "/consultations/my",
    { bookingId, kind: "client-cancelled-by-trainer" },
  );
}

export async function completeBookingByTrainer(
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
  if (b.status !== ConsultationBookingStatus.CONFIRMED) {
    throw new ConsultationForbiddenError("Завершение доступно только для подтверждённой консультации");
  }

  await removeConsultationRemindJobSafe(bookingId);

  await prisma.consultationBooking.update({
    where: { id: bookingId },
    data: {
      status: ConsultationBookingStatus.COMPLETED,
    },
  });
}

export async function markBookingNoShowByTrainer(
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
  if (b.status !== ConsultationBookingStatus.CONFIRMED) {
    throw new ConsultationForbiddenError("Неявку можно выставить только для подтверждённой консультации");
  }

  await removeConsultationRemindJobSafe(bookingId);

  await prisma.consultationBooking.update({
    where: { id: bookingId },
    data: {
      status: ConsultationBookingStatus.NO_SHOW,
    },
  });

  await enqueueConsultationEmail(bookingId, ConsultationEmailType.CLIENT_CONSULTATION_NO_SHOW);
}

export async function cancelBookingByUser(clientId: string, bookingId: string): Promise<void> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: { slot: true, cynologist: { select: { userId: true } } },
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

  const wasConfirmed = b.status === ConsultationBookingStatus.CONFIRMED;

  await removeSlaJob(bookingId);
  await removeConsultationRemindJobSafe(bookingId);

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

  await enqueueConsultationEmail(
    bookingId,
    ConsultationEmailType.TRAINER_BOOKING_CANCELLED_BY_USER,
  );
  await refundConsultationRewardedCreditsForBooking(bookingId, "CANCELLED_BY_USER");
  await tryConsultationPush(
    b.cynologist.userId,
    wasConfirmed ? "Клиент отменил встречу" : "Клиент отменил заявку",
    wasConfirmed
      ? "Запланированная консультация отменена клиентом. Подробности в письме."
      : "Заявка на консультацию отменена клиентом. Слот снова свободен.",
    "/main-panel/consultations",
    { bookingId, kind: "trainer-user-cancel" },
  );
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
  if (b.confirmationDeadlineAt.getTime() > Date.now()) {
    return;
  }

  const clientId = b.clientId;

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
  await refundConsultationRewardedCreditsForBooking(bookingId, "CANCELLED_BY_SLA");
  await tryConsultationPush(
    clientId,
    "Консультация не подтверждена",
    "Кинолог не ответил в срок, бронь снята. Можно записаться снова в разделе консультаций.",
    "/consultations/my",
    { bookingId, kind: "client-sla" },
  );
}

/**
 * Воркер: за 30 минут до встречи — письма и пуши клиенту и кинологу (если бронь ещё CONFIRMED).
 */
export async function processConsultationReminder(
  bookingId: string,
  kind: ConsultationReminderKind = "30m",
): Promise<void> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: {
      slot: true,
      cynologist: { include: { user: { select: { id: true } } } },
      client: { select: { id: true } },
    },
  });
  if (!b || b.status !== ConsultationBookingStatus.CONFIRMED) {
    return;
  }

  const slotMsk = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CONSULTATION_TIMEZONE,
  }).format(b.slot.startAt);

  if (kind === "start") {
    const emailResult = await enqueueConsultationEmail(
      bookingId,
      ConsultationEmailType.CLIENT_CONSULTATION_START,
    );
    if (emailResult === "duplicate") {
      return;
    }
    await tryConsultationPush(
      b.clientId,
      "Консультация начинается",
      "Ваша консультация начинается прямо сейчас. Присоединяйтесь по ссылке из приложения. Кинолог вас ждёт.",
      "/consultations/my",
      { bookingId, kind: "start-client" },
    );
    return;
  }

  const clientEmailResult = await enqueueConsultationEmail(
    bookingId,
    ConsultationEmailType.CLIENT_CONSULTATION_REMINDER_30M,
  );
  if (clientEmailResult === "duplicate") {
    return;
  }
  await enqueueConsultationEmail(
    bookingId,
    ConsultationEmailType.TRAINER_CONSULTATION_REMINDER_30M,
  );

  await tryConsultationPush(
    b.clientId,
    "Скоро консультация",
    `Напоминание: начало примерно в ${slotMsk} (МСК). Проверьте связь и ссылку на встречу в письме или в «Мои консультации».`,
    "/consultations/my",
    { bookingId, kind: "remind-client" },
  );
  await tryConsultationPush(
    b.cynologist.userId,
    "Скоро консультация",
    `Напоминание: встреча с клиентом примерно в ${slotMsk} (МСК). Ссылка на Телемост в панели кинолога.`,
    "/main-panel/consultations",
    { bookingId, kind: "remind-trainer" },
  );
}

export async function reconcileMissedConsultationReminders(options?: {
  now?: Date;
  lookbackMinutes?: number;
  batchSize?: number;
}): Promise<{ checked: number; triggered30m: number; triggeredStart: number }> {
  const now = options?.now ?? new Date();
  const lookbackMs =
    Math.max(1, options?.lookbackMinutes ?? CONSULTATION_RECONCILE_LOOKBACK_MINUTES) * 60 * 1000;
  const batchSize = Math.min(500, Math.max(1, options?.batchSize ?? 100));

  const startLower = new Date(now.getTime() - lookbackMs);
  const startUpper = now;
  const reminder30mLower = new Date(now.getTime() + 30 * 60 * 1000 - lookbackMs);
  const reminder30mUpper = new Date(now.getTime() + 30 * 60 * 1000);

  const bookings = await prisma.consultationBooking.findMany({
    where: {
      status: ConsultationBookingStatus.CONFIRMED,
      OR: [
        { slot: { startAt: { gte: startLower, lte: startUpper } } },
        { slot: { startAt: { gte: reminder30mLower, lte: reminder30mUpper } } },
      ],
    },
    include: {
      slot: true,
      emailLogs: {
        where: {
          type: {
            in: [
              ConsultationEmailType.CLIENT_CONSULTATION_REMINDER_30M,
              ConsultationEmailType.CLIENT_CONSULTATION_START,
            ],
          },
        },
        select: { type: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  let triggered30m = 0;
  let triggeredStart = 0;

  for (const booking of bookings) {
    const startAtMs = booking.slot.startAt.getTime();
    const loggedTypes = new Set(booking.emailLogs.map((log) => log.type));

    const is30mWindow =
      startAtMs >= reminder30mLower.getTime() && startAtMs <= reminder30mUpper.getTime();
    if (
      is30mWindow &&
      !loggedTypes.has(ConsultationEmailType.CLIENT_CONSULTATION_REMINDER_30M)
    ) {
      await processConsultationReminder(booking.id, "30m");
      triggered30m += 1;
    }

    const isStartWindow = startAtMs >= startLower.getTime() && startAtMs <= startUpper.getTime();
    if (isStartWindow && !loggedTypes.has(ConsultationEmailType.CLIENT_CONSULTATION_START)) {
      await processConsultationReminder(booking.id, "start");
      triggeredStart += 1;
    }
  }

  return { checked: bookings.length, triggered30m, triggeredStart };
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
      client: { select: { username: true } },
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
    clientUsername: b.client.username,
    clientOwnerName: b.clientOwnerName,
    clientPhone: b.clientPhone,
    petName: b.petName,
    petGender: b.petGender,
    petAge: b.petAge,
    petBreed: b.petBreed,
    clientProblem: b.clientProblem,
    clientSelfHelpAttempt: b.clientSelfHelpAttempt,
    cancelReason: b.cancelReason,
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
      client: { select: { username: true } },
      cynologist: {
        include: {
          user: { include: { profile: { select: { fullName: true } } } },
        },
      },
    },
  });

  rows.sort((a, b) => {
    const aCompleted = a.status === ConsultationBookingStatus.COMPLETED;
    const bCompleted = b.status === ConsultationBookingStatus.COMPLETED;
    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
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
    clientUsername: b.client.username,
    clientOwnerName: b.clientOwnerName,
    clientPhone: b.clientPhone,
    petName: b.petName,
    petGender: b.petGender,
    petAge: b.petAge,
    petBreed: b.petBreed,
    clientProblem: b.clientProblem,
    clientSelfHelpAttempt: b.clientSelfHelpAttempt,
    cancelReason: b.cancelReason,
    joinUrl: b.telemostJoinUrl,
    watchUrl: b.telemostWatchUrl,
    confirmationDeadlineAt: b.confirmationDeadlineAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
  }));
}
