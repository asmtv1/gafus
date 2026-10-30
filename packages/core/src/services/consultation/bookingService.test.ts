import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as GafusPrisma from "@gafus/prisma";
import type * as AppSubscriptionModule from "../appSubscription";

import {
  ConsultationBookingStatus,
  ConsultationPetGender,
  ConsultationSlotStatus,
  Prisma,
} from "@gafus/prisma";

import { ConsultationBookingNotIncludedError, ConsultationSlotTakenError } from "./errors";
import { SubscriptionRequiredError } from "../appSubscription/errors";

const enqueueConsultationEmail = vi.fn();
const queueAdd = vi.fn();
const removeConsultationSlaJob = vi.fn();
const removeConsultationReminderJob = vi.fn();
const sendImmediatePushNotification = vi.fn();
const getAppSubscriptionAccess = vi.fn();

vi.mock("../appSubscription", async (importOriginal) => ({
  ...(await importOriginal<typeof AppSubscriptionModule>()),
  getAppSubscriptionAccess: (...args: unknown[]) => getAppSubscriptionAccess(...args),
  getCynologistEntitlements: async (...args: unknown[]) => {
    const status = await getAppSubscriptionAccess(...args);
    return {
      canUseCynologistChat: Boolean(status?.hasActiveSubscription),
      canBookConsultations: Boolean(
        status?.hasActiveSubscription && status?.planCode !== "TWO_WEEKS",
      ),
    };
  },
}));

vi.mock("./notificationService", () => ({
  enqueueConsultationEmail: (...a: unknown[]) => enqueueConsultationEmail(...a),
}));

vi.mock("../notifications/immediatePushService", () => ({
  sendImmediatePushNotification: (...a: unknown[]) => sendImmediatePushNotification(...a),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/queues", () => ({
  consultationSlaQueue: { add: (...a: unknown[]) => queueAdd(...a) },
  consultationReminderQueue: { add: (...a: unknown[]) => queueAdd(...a) },
  CONSULTATION_SLA_JOB_ID: (id: string) => `sla:${id}`,
  CONSULTATION_REMINDER_JOB_ID: (id: string, kind: string) => `reminder:${id}:${kind}`,
  removeConsultationSlaJob: (...a: unknown[]) => removeConsultationSlaJob(...a),
  removeConsultationReminderJob: (...a: unknown[]) => removeConsultationReminderJob(...a),
}));

const {
  idemFindFirst,
  idemFindUnique,
  txUpdateMany,
  txFindUnique,
  txCreateBooking,
  prismaUpdateBooking,
  prismaUpdateManyBooking,
  prismaUpsertIdem,
  prismaUpdateManyIdem,
  prismaFindUniqueBooking,
  prismaFindFirstBooking,
  prismaFindManyBooking,
  prismaTransaction,
} = vi.hoisted(() => ({
  idemFindFirst: vi.fn(),
  idemFindUnique: vi.fn(),
  txUpdateMany: vi.fn(),
  txFindUnique: vi.fn(),
  txCreateBooking: vi.fn(),
  prismaUpdateBooking: vi.fn(),
  prismaUpdateManyBooking: vi.fn(),
  prismaUpsertIdem: vi.fn(),
  prismaUpdateManyIdem: vi.fn(),
  prismaFindUniqueBooking: vi.fn(),
  prismaFindFirstBooking: vi.fn(),
  prismaFindManyBooking: vi.fn(),
  prismaTransaction: vi.fn(),
}));

vi.mock("@gafus/prisma", async (importOriginal) => {
  const mod = await importOriginal<typeof GafusPrisma>();
  return {
    ...mod,
    prisma: {
      ...mod.prisma,
      consultationBookingIdempotency: {
        ...mod.prisma.consultationBookingIdempotency,
        findFirst: idemFindFirst,
        findUnique: idemFindUnique,
        upsert: prismaUpsertIdem,
        updateMany: prismaUpdateManyIdem,
      },
      consultationBooking: {
        ...mod.prisma.consultationBooking,
        update: prismaUpdateBooking,
        updateMany: prismaUpdateManyBooking,
        findUnique: prismaFindUniqueBooking,
        findFirst: prismaFindFirstBooking,
        findMany: prismaFindManyBooking,
      },
      $transaction: prismaTransaction,
    },
  };
});

beforeEach(() => {
  prismaFindFirstBooking.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const found = await prismaFindUniqueBooking({ where: { id: where.id } });
    return found ? { id: found.id, status: found.status } : null;
  });
  prismaUpdateManyBooking.mockResolvedValue({ count: 1 });
  sendImmediatePushNotification.mockResolvedValue({ success: true });
  getAppSubscriptionAccess.mockResolvedValue({ hasActiveSubscription: false });
});

describe("processBookingSlaTimeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ничего не делает, если бронь не найдена", async () => {
    prismaFindUniqueBooking.mockResolvedValue(null);
    const { processBookingSlaTimeout } = await import("./bookingService");
    await processBookingSlaTimeout("missing");
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(enqueueConsultationEmail).not.toHaveBeenCalled();
  }, 60_000);

  it("не отменяет бронь, если статус не ожидание тренера", async () => {
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b1",
      status: ConsultationBookingStatus.CONFIRMED,
      slotId: "s1",
      slot: { id: "s1" },
    });
    const { processBookingSlaTimeout } = await import("./bookingService");
    await processBookingSlaTimeout("b1");
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("переводит в CANCELLED_BY_SLA, освобождает слот и ставит письмо в очередь", async () => {
    const txBookingUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txSlotUpdate = vi.fn();
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        consultationBooking: { updateMany: txBookingUpdateMany },
        consultationSlot: { update: txSlotUpdate },
      });
    });
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b1",
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
      slotId: "s1",
      confirmationDeadlineAt: new Date(Date.now() - 60 * 1000),
      slot: { id: "s1" },
    });
    const { processBookingSlaTimeout } = await import("./bookingService");
    await processBookingSlaTimeout("b1");
    expect(txBookingUpdateMany).toHaveBeenCalled();
    expect(txSlotUpdate).toHaveBeenCalled();
    expect(enqueueConsultationEmail).toHaveBeenCalled();
  });

  it("не отменяет бронь, если SLA job сработал раньше confirmationDeadlineAt", async () => {
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-early",
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
      slotId: "s1",
      confirmationDeadlineAt: new Date(Date.now() + 60 * 60 * 1000),
      slot: { id: "s1" },
    });
    const { processBookingSlaTimeout } = await import("./bookingService");
    await processBookingSlaTimeout("b-early");
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(enqueueConsultationEmail).not.toHaveBeenCalled();
  });
});

describe("processConsultationReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("в момент старта отправляет клиенту email и push о начале консультации", async () => {
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-start",
      clientId: "client-1",
      status: ConsultationBookingStatus.CONFIRMED,
      slot: { startAt: new Date("2026-05-18T10:00:00.000Z") },
      cynologist: { user: { id: "trainer-1" } },
      client: { id: "client-1" },
    });

    const { processConsultationReminder } = await import("./bookingService");
    await processConsultationReminder("b-start", "start");

    expect(enqueueConsultationEmail).toHaveBeenCalledWith("b-start", "CLIENT_CONSULTATION_START");
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(1);
    expect(sendImmediatePushNotification).toHaveBeenCalledWith({
      userId: "client-1",
      title: "Консультация начинается",
      body: "Ваша консультация начинается прямо сейчас. Присоединяйтесь по ссылке из приложения. Кинолог вас ждёт.",
      url: "/consultations/my",
    });
    expect(sendImmediatePushNotification).toHaveBeenCalledWith({
      userId: "trainer-1",
      title: "Консультация начинается",
      body: "Запланированная видеоконсультация начинается. Откройте встречу из панели кинолога.",
      url: "/main-panel/consultations",
    });
    expect(sendImmediatePushNotification).toHaveBeenCalledTimes(2);
  });

  it("не дублирует push, если стартовое письмо уже было создано другим процессом", async () => {
    enqueueConsultationEmail.mockResolvedValueOnce("duplicate");
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-start-duplicate",
      clientId: "client-1",
      status: ConsultationBookingStatus.CONFIRMED,
      slot: { startAt: new Date("2026-05-18T10:00:00.000Z") },
      cynologist: { user: { id: "trainer-1" } },
      client: { id: "client-1" },
    });

    const { processConsultationReminder } = await import("./bookingService");
    await processConsultationReminder("b-start-duplicate", "start");

    expect(sendImmediatePushNotification).not.toHaveBeenCalled();
  });
});

describe("reconcileMissedConsultationReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("догоняет пропущенное стартовое уведомление, если нет клиентского email-log", async () => {
    prismaFindManyBooking.mockResolvedValue([
      {
        id: "b-missed-start",
        clientId: "client-1",
        status: ConsultationBookingStatus.CONFIRMED,
        slot: { startAt: new Date("2026-05-18T10:00:00.000Z") },
        cynologist: { user: { id: "trainer-1" } },
        client: { id: "client-1" },
        emailLogs: [],
      },
    ]);
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-missed-start",
      clientId: "client-1",
      status: ConsultationBookingStatus.CONFIRMED,
      slot: { startAt: new Date("2026-05-18T10:00:00.000Z") },
      cynologist: { user: { id: "trainer-1" } },
      client: { id: "client-1" },
    });

    const { reconcileMissedConsultationReminders } = await import("./bookingService");
    const result = await reconcileMissedConsultationReminders();

    expect(result).toEqual({ checked: 1, triggered30m: 0, triggeredStart: 1 });
    expect(enqueueConsultationEmail).toHaveBeenCalledWith(
      "b-missed-start",
      "CLIENT_CONSULTATION_START",
    );
  });
});

describe("markBookingNoShowByTrainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("переводит подтверждённую бронь в NO_SHOW и ставит клиентское письмо в очередь", async () => {
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-no-show",
      clientId: "client-1",
      status: ConsultationBookingStatus.CONFIRMED,
      cynologist: { userId: "trainer-1" },
    });

    const { markBookingNoShowByTrainer } = await import("./bookingService");
    await markBookingNoShowByTrainer("trainer-1", "TRAINER", "b-no-show");

    expect(removeConsultationReminderJob).toHaveBeenCalledWith("b-no-show");
    expect(prismaUpdateManyBooking).toHaveBeenCalledWith({
      where: { id: "b-no-show", status: ConsultationBookingStatus.CONFIRMED },
      data: { status: ConsultationBookingStatus.NO_SHOW },
    });
    expect(enqueueConsultationEmail).toHaveBeenCalledWith(
      "b-no-show",
      "CLIENT_CONSULTATION_NO_SHOW",
    );
    expect(sendImmediatePushNotification).toHaveBeenCalledWith({
      userId: "client-1",
      title: "Кинолог отметил неявку",
      body: "Консультация отмечена как несостоявшаяся из-за неявки. Подробности в «Мои консультации».",
      url: "/consultations/my",
    });
  });
});

describe("confirmBookingByTrainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("после подтверждения планирует клиентские напоминания за 30 минут и на момент старта", async () => {
    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-confirm",
      clientId: "client-1",
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
      cynologist: { userId: "trainer-1" },
      slot: { startAt },
    });

    const { confirmBookingByTrainer } = await import("./bookingService");
    await confirmBookingByTrainer("trainer-1", "TRAINER", "b-confirm");

    expect(queueAdd).toHaveBeenCalledWith(
      "remind-30m",
      { bookingId: "b-confirm", kind: "30m" },
      expect.objectContaining({
        jobId: "reminder:b-confirm:30m",
        delay: expect.any(Number),
        attempts: 5,
      }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "remind-start",
      { bookingId: "b-confirm", kind: "start" },
      expect.objectContaining({
        jobId: "reminder:b-confirm:start",
        delay: expect.any(Number),
        attempts: 5,
      }),
    );
  });
});

const bookBodyBase = {
  clientOwnerName: "Анна",
  clientPhone: "+79991234567",
  petName: "Жучка",
  petGender: "MALE" as const,
  petAge: "3 года",
  petBreed: "Собака",
  clientProblem: "Описание проблемы не менее десяти символов",
  clientSelfHelpAttempt: "Самолечение",
};

describe("bookSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaFindUniqueBooking.mockReset();
  });

  it("возвращает кэш идемпотентности без транзакции", async () => {
    const cached = {
      kind: "created" as const,
      booking: {
        id: "bid",
        status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
        slot: {
          id: "sid",
          startAtUtc: new Date().toISOString(),
          endAtUtc: new Date().toISOString(),
          status: ConsultationSlotStatus.BOOKED,
        },
        cynologistUserId: "u1",
        cynologistDisplayName: null,
        clientUsername: null,
        clientOwnerName: "Анна",
        clientPhone: "+79991234567",
        petName: "Жучка",
        petGender: ConsultationPetGender.MALE,
        petAge: "3 года",
        petBreed: "Собака",
        clientProblem: "Описание проблемы не менее десяти символов",
        clientSelfHelpAttempt: "Самолечение",
        cancelReason: null,
        confirmationDeadlineAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
    idemFindUnique.mockResolvedValue({
      responseJson: cached,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaFindFirstBooking.mockResolvedValueOnce({
      id: "bid",
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
    });
    const { bookSlot } = await import("./bookingService");
    const out = await bookSlot("client1", {
      slotId: "s1",
      idempotencyKey: "k1",
      ...bookBodyBase,
    });
    expect(out).toEqual({ ...cached, kind: "idempotent_replay" });
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("делает replay по bookingId при частичном состоянии идемпотентности", async () => {
    idemFindUnique.mockResolvedValue({
      bookingId: "b-replay",
      responseJson: { state: "BOOKING_CREATED" },
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-replay",
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
      slot: {
        id: "sid",
        startAt: new Date("2026-05-01T10:00:00.000Z"),
        endAt: new Date("2026-05-01T10:30:00.000Z"),
        status: ConsultationSlotStatus.BOOKED,
      },
      cynologist: {
        userId: "trainer-1",
        user: {
          profile: { fullName: "Кинолог Тест" },
        },
      },
      client: { username: "user1" },
      clientOwnerName: "Анна",
      clientPhone: "+79991234567",
      petName: "Жучка",
      petGender: ConsultationPetGender.MALE,
      petAge: "3 года",
      petBreed: "Собака",
      clientProblem: "Описание проблемы не менее десяти символов",
      clientSelfHelpAttempt: "Самолечение",
      cancelReason: null,
      confirmationDeadlineAt: new Date("2026-05-01T09:00:00.000Z"),
      createdAt: new Date("2026-04-30T09:00:00.000Z"),
    });
    const { bookSlot } = await import("./bookingService");
    const out = await bookSlot("client1", {
      slotId: "s1",
      idempotencyKey: "k-replay",
      ...bookBodyBase,
    });
    expect(out.kind).toBe("idempotent_replay");
    expect(out.booking.id).toBe("b-replay");
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("не делает replay по bookingId, если бронь уже CANCELLED_BY_SYSTEM", async () => {
    idemFindUnique.mockResolvedValue({
      bookingId: "b-cancelled",
      responseJson: { state: "BOOKING_CREATED" },
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaFindUniqueBooking.mockResolvedValue({
      id: "b-cancelled",
      status: ConsultationBookingStatus.CANCELLED_BY_SYSTEM,
      slot: {
        id: "sid",
        startAt: new Date("2026-05-01T10:00:00.000Z"),
        endAt: new Date("2026-05-01T10:30:00.000Z"),
        status: ConsultationSlotStatus.FREE,
      },
      cynologist: {
        userId: "trainer-1",
        user: {
          profile: { fullName: "Кинолог Тест" },
        },
      },
      client: { username: "user1" },
      clientOwnerName: "Анна",
      clientPhone: "+79991234567",
      petName: "Жучка",
      petGender: ConsultationPetGender.MALE,
      petAge: "3 года",
      petBreed: "Собака",
      clientProblem: "Описание проблемы не менее десяти символов",
      clientSelfHelpAttempt: "Самолечение",
      cancelReason: null,
      confirmationDeadlineAt: new Date("2026-05-01T09:00:00.000Z"),
      createdAt: new Date("2026-04-30T09:00:00.000Z"),
    });
    txUpdateMany.mockResolvedValue({ count: 0 });
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        consultationSlot: {
          updateMany: txUpdateMany,
          findUnique: txFindUnique,
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        consultationBooking: {
          create: txCreateBooking,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        consultationBookingIdempotency: {
          findUnique: idemFindUnique,
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    });
    const { bookSlot } = await import("./bookingService");
    const cancelled = await bookSlot("client1", {
      slotId: "s1",
      idempotencyKey: "k-cancelled",
      ...bookBodyBase,
    });
    // A cancelled legacy receipt is still an existing booking; retry cannot create a second one.
    expect(cancelled.kind).toBe("idempotent_replay");
    expect(cancelled.booking.status).toBe(ConsultationBookingStatus.CANCELLED_BY_SYSTEM);
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(enqueueConsultationEmail).not.toHaveBeenCalled();
  });

  it("бросает ConsultationSlotTakenError, если слот уже занят", async () => {
    idemFindUnique.mockResolvedValue(null);
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        consultationSlot: {
          updateMany: txUpdateMany.mockResolvedValue({ count: 0 }),
          findUnique: txFindUnique,
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        consultationBooking: {
          create: txCreateBooking,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        consultationBookingIdempotency: {
          findUnique: idemFindUnique,
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    });
    const { bookSlot } = await import("./bookingService");
    await expect(
      bookSlot("c1", { slotId: "s1", idempotencyKey: "k2", ...bookBodyBase }),
    ).rejects.toBeInstanceOf(ConsultationSlotTakenError);
  });

  it("мапит P2002 по slotId в ConsultationSlotTakenError", async () => {
    idemFindUnique.mockResolvedValue(null);
    txUpdateMany.mockResolvedValue({ count: 1 });
    txFindUnique.mockResolvedValue({
      id: "slot1",
      startAt: new Date(Date.now() + 50 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 50 * 60 * 60 * 1000 + 30 * 60 * 1000),
      cynologistId: "cy1",
      cynologist: {
        bookingLeadTimeMin: 0,
        confirmationSlaMin: 60,
      },
    });
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { modelName: "ConsultationBooking", target: ["slotId"] },
    });
    txCreateBooking.mockRejectedValue(p2002);
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        consultationSlot: {
          updateMany: txUpdateMany,
          findUnique: txFindUnique,
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        consultationBooking: {
          create: txCreateBooking,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        consultationBookingIdempotency: {
          findUnique: idemFindUnique,
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    });
    const { bookSlot } = await import("./bookingService");
    await expect(
      bookSlot("c1", { slotId: "slot1", idempotencyKey: "k-p2002", ...bookBodyBase }),
    ).rejects.toBeInstanceOf(ConsultationSlotTakenError);
  });

  it("ставит дедлайн подтверждения через 24 часа после создания брони", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T20:20:24.951Z"));

    try {
      idemFindUnique.mockResolvedValue(null);
      txUpdateMany.mockResolvedValue({ count: 1 });
      txFindUnique.mockResolvedValue({
        id: "slot1",
        startAt: new Date("2026-07-11T09:30:00.000Z"),
        endAt: new Date("2026-07-11T10:00:00.000Z"),
        cynologistId: "cy1",
        cynologist: {
          bookingLeadTimeMin: 0,
          confirmationSlaMin: 1440,
        },
      });
      txCreateBooking.mockResolvedValue({ id: "booking-24h" });
      prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          consultationSlot: {
            updateMany: txUpdateMany,
            findUnique: txFindUnique,
          },
          $queryRaw: vi.fn().mockResolvedValue([]),
          consultationBooking: {
            create: txCreateBooking,
            findFirst: vi.fn().mockResolvedValue(null),
          },
          consultationBookingIdempotency: {
            findUnique: idemFindUnique,
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });
      prismaFindUniqueBooking
        .mockResolvedValueOnce({
          id: "booking-24h",
          cynologist: { userId: "trainer-1" },
        })
        .mockResolvedValueOnce({
          id: "booking-24h",
          status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
          slot: {
            id: "slot1",
            startAt: new Date("2026-07-11T09:30:00.000Z"),
            endAt: new Date("2026-07-11T10:00:00.000Z"),
            status: ConsultationSlotStatus.BOOKED,
          },
          cynologist: {
            userId: "trainer-1",
            user: { profile: { fullName: "Кинолог Тест" } },
          },
          client: { username: "user1" },
          clientOwnerName: bookBodyBase.clientOwnerName,
          clientPhone: bookBodyBase.clientPhone,
          petName: bookBodyBase.petName,
          petGender: ConsultationPetGender.MALE,
          petAge: bookBodyBase.petAge,
          petBreed: bookBodyBase.petBreed,
          clientProblem: bookBodyBase.clientProblem,
          clientSelfHelpAttempt: bookBodyBase.clientSelfHelpAttempt,
          cancelReason: null,
          confirmationDeadlineAt: new Date("2026-07-09T20:20:24.951Z"),
          createdAt: new Date("2026-07-08T20:20:24.951Z"),
        });

      const { bookSlot } = await import("./bookingService");
      await bookSlot("c1", { slotId: "slot1", idempotencyKey: "k-24h", ...bookBodyBase });

      expect(txCreateBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confirmationDeadlineAt: new Date("2026-07-09T20:20:24.951Z"),
          }),
        }),
      );
      expect(queueAdd).toHaveBeenCalledWith(
        "sla-timeout",
        { bookingId: "booking-24h" },
        expect.objectContaining({
          jobId: "sla:booking-24h",
          delay: 24 * 60 * 60 * 1000,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("subscription-only consultation access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppSubscriptionAccess.mockResolvedValue({ hasActiveSubscription: false });
  });

  it("requires an active paid subscription for slot verification", async () => {
    const { requireConsultationSlotsSubscriptionAccess } = await import("./bookingService");

    await expect(
      requireConsultationSlotsSubscriptionAccess({
        userId: "client-1",
      }),
    ).rejects.toBeInstanceOf(SubscriptionRequiredError);

    getAppSubscriptionAccess.mockResolvedValueOnce({ hasActiveSubscription: true });
    await expect(
      requireConsultationSlotsSubscriptionAccess({
        userId: "client-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a new booking without a subscription before touching a slot", async () => {
    idemFindUnique.mockResolvedValue(null);
    const { bookSlotWithSubscription } = await import("./bookingService");

    await expect(
      bookSlotWithSubscription({
        userId: "client-1",
        body: { slotId: "slot-1", idempotencyKey: "new-key", ...bookBodyBase },
      }),
    ).rejects.toBeInstanceOf(SubscriptionRequiredError);
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("lets a two-week YooKassa subscriber view slots but blocks a new booking", async () => {
    getAppSubscriptionAccess.mockResolvedValue({
      hasActiveSubscription: true,
      provider: "YOOKASSA",
      planCode: "TWO_WEEKS",
    });
    const { bookSlotWithSubscription, requireConsultationSlotsSubscriptionAccess } = await import(
      "./bookingService"
    );

    await expect(
      requireConsultationSlotsSubscriptionAccess({ userId: "client-1" }),
    ).resolves.toBeUndefined();
    await expect(
      bookSlotWithSubscription({
        userId: "client-1",
        body: { slotId: "slot-1", idempotencyKey: "two-weeks-key", ...bookBodyBase },
      }),
    ).rejects.toBeInstanceOf(ConsultationBookingNotIncludedError);
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it("restricts new consultation bookings to the three-month plan", async () => {
    const { canBookConsultations } = await import("./bookingService");

    for (const subscription of [
      { hasActiveSubscription: true, provider: "YOOKASSA", planCode: "MONTHLY" },
      { hasActiveSubscription: true, provider: "YOOKASSA", planCode: "THREE_MONTHS" },
      { hasActiveSubscription: true, provider: "YOOKASSA", planCode: "WEEKLY" },
      { hasActiveSubscription: true, provider: "APPLE", planCode: "MONTHLY" },
      { hasActiveSubscription: true, provider: "MANUAL", planCode: "MONTHLY" },
      { hasActiveSubscription: true, provider: "MANUAL", planCode: "TWO_WEEKS" },
    ]) {
      expect(canBookConsultations(subscription)).toBe(subscription.planCode === "THREE_MONTHS");
    }
  });

  it("replays an existing booking after the subscription expires", async () => {
    const cached = {
      kind: "created" as const,
      booking: {
        id: "booking-replay",
        status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
        slot: {
          id: "slot-1",
          startAtUtc: new Date().toISOString(),
          endAtUtc: new Date().toISOString(),
          status: ConsultationSlotStatus.BOOKED,
        },
        cynologistUserId: "trainer-1",
        cynologistDisplayName: null,
        clientUsername: null,
        clientOwnerName: "Анна",
        clientPhone: "+79991234567",
        petName: "Жучка",
        petGender: ConsultationPetGender.MALE,
        petAge: "3 года",
        petBreed: "Собака",
        clientProblem: "Описание проблемы не менее десяти символов",
        clientSelfHelpAttempt: "Самолечение",
        cancelReason: null,
        confirmationDeadlineAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
    idemFindUnique.mockResolvedValue({
      bookingId: "booking-replay",
      responseJson: cached,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaFindFirstBooking.mockResolvedValueOnce({
      id: "booking-replay",
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
    });
    const { bookSlotWithSubscription } = await import("./bookingService");

    await expect(
      bookSlotWithSubscription({
        userId: "client-1",
        body: { slotId: "slot-1", idempotencyKey: "existing-key", ...bookBodyBase },
      }),
    ).resolves.toEqual({ ...cached, kind: "idempotent_replay" });
    expect(getAppSubscriptionAccess).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
  });
});

/** AG1 same-transaction idempotency proof with a SERIALIZED in-memory transaction
 * engine. It does NOT claim real PostgreSQL; real DB requires AG4 synthetic lease. */
describe("G1 booking atomicity: retained key, concurrent replay, fault injection", () => {
  const form = (key: string, overrides: Record<string, unknown> = {}) => ({
    ...bookBodyBase,
    slotId: "atomic-slot",
    idempotencyKey: key,
    ...overrides,
  });

  function setupEngine(
    opts: {
      failReceiptInsert?: boolean;
      failBookingInsert?: boolean;
      failAfterReceiptBeforeCommit?: boolean;
      failNotificationsOnce?: boolean;
      forceTwoPrereads?: boolean;
    } = {},
  ) {
    const ledger = new Map<
      string,
      { clientId: string; key: string; bookingId: string; responseJson: object; expiresAt: Date }
    >();
    const commits: string[] = [];
    let bookingCount = 0,
      slotBooked = false,
      receiptCreates = 0;
    let waiting = Promise.resolve();
    const when = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const bookingDto = (id: string) => ({
      id,
      status: ConsultationBookingStatus.PENDING_TRAINER_CONFIRMATION,
      slot: {
        id: "atomic-slot",
        startAt: new Date(when),
        endAt: new Date(when.getTime() + 1800000),
        status: ConsultationSlotStatus.BOOKED,
      },
      cynologist: { userId: "trainer-atomic", user: { profile: { fullName: "Synthetic" } } },
      client: { username: "owner-atomic" },
      clientOwnerName: bookBodyBase.clientOwnerName,
      clientPhone: bookBodyBase.clientPhone,
      petName: bookBodyBase.petName,
      petGender: ConsultationPetGender.MALE,
      petAge: bookBodyBase.petAge,
      petBreed: bookBodyBase.petBreed,
      clientProblem: bookBodyBase.clientProblem,
      clientSelfHelpAttempt: bookBodyBase.clientSelfHelpAttempt,
      cancelReason: null,
      confirmationDeadlineAt: deadline,
      createdAt: new Date(),
    });
    prismaFindUniqueBooking.mockImplementation(async ({ where }: { where: { id: string } }) =>
      bookingDto(where.id),
    );
    getAppSubscriptionAccess.mockResolvedValue({
      hasActiveSubscription: true,
      planCode: "THREE_MONTHS",
    });
    sendImmediatePushNotification.mockResolvedValue({ success: true });
    enqueueConsultationEmail.mockResolvedValue("created");
    queueAdd.mockResolvedValue({});
    if (opts.failNotificationsOnce)
      enqueueConsultationEmail.mockRejectedValueOnce(Error("SYNTHETIC_EMAIL_AFTER_COMMIT_FAULT"));
    let preReads = 0;
    idemFindUnique.mockImplementation(
      async ({ where }: { where: { clientId_key: { clientId: string; key: string } } }) => {
        preReads++;
        // Both simultaneous callers observe no receipt BEFORE client row locking.
        if (opts.forceTwoPrereads && preReads <= 2) return null;
        const k = where.clientId_key;
        return ledger.get(k.clientId + ":" + k.key) ?? null;
      },
    );
    prismaUpdateManyIdem.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { clientId: string; key: string; bookingId: string };
        data: { responseJson: object };
      }) => {
        const receipt = ledger.get(where.clientId + ":" + where.key);
        if (receipt && receipt.bookingId === where.bookingId)
          receipt.responseJson = data.responseJson;
        return { count: receipt ? 1 : 0 };
      },
    );
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const held = waiting;
      waiting = new Promise<void>((r) => {
        release = r;
      });
      await held;
      let newBooking: string | null = null,
        pendingReceipt: typeof ledger extends Map<string, infer V> ? V | null : never = null,
        acquiredSlot = false;
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        consultationBookingIdempotency: {
          findUnique: async ({
            where,
          }: {
            where: { clientId_key: { clientId: string; key: string } };
          }) => ledger.get(where.clientId_key.clientId + ":" + where.clientId_key.key) ?? null,
          create: async ({ data }: { data: {
            clientId: string; key: string; bookingId: string;
            responseJson: object; expiresAt: Date;
          } }) => {
            receiptCreates++;
            if (opts.failReceiptInsert) throw Error("SYNTHETIC_LEDGER_INSERT_FAULT");
            pendingReceipt = { ...data };
            return data;
          },
        },
        consultationBooking: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: async () => {
            if (opts.failBookingInsert) throw Error("SYNTHETIC_BOOKING_INSERT_FAULT");
            newBooking = "atomic-booking-" + (bookingCount + 1);
            commits.push("booking_staged");
            return { id: newBooking };
          },
        },
        consultationSlot: {
          updateMany: async () => {
            if (slotBooked) return { count: 0 };
            acquiredSlot = true;
            commits.push("slot_staged");
            return { count: 1 };
          },
          findUnique: async () => ({
            id: "atomic-slot",
            cynologistId: "trainer-atomic-id",
            startAt: when,
            endAt: new Date(when.getTime() + 1800000),
            cynologist: { bookingLeadTimeMin: 0, confirmationSlaMin: 60 },
          }),
        },
      };
      try {
        const result = await cb(tx);
        if (opts.failAfterReceiptBeforeCommit && pendingReceipt)
          throw Error("SYNTHETIC_PRECOMMIT_FAILURE");
        if (newBooking) {
          if (!pendingReceipt) throw Error("ATOMIC_ENGINE_MISSING_RECEIPT");
          bookingCount++;
          slotBooked = acquiredSlot;
          ledger.set("owner-atomic:" + pendingReceipt.key, pendingReceipt);
          commits.push("transaction_committed");
        }
        return result;
      } finally {
        release();
      }
    });
    return { ledger, commits, stats: () => ({ bookingCount, slotBooked, receiptCreates }) };
  }
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AT01 receipt insert exception rolls booking+slot staging back, no notifications", async () => {
    const e = setupEngine({ failReceiptInsert: true });
    const { bookSlot } = await import("./bookingService");
    await expect(bookSlot("owner-atomic", form("atomic-fault-1"))).rejects.toThrow(
      "SYNTHETIC_LEDGER_INSERT_FAULT",
    );
    expect(e.stats()).toMatchObject({ bookingCount: 0, slotBooked: false, receiptCreates: 1 });
    expect(e.ledger.size).toBe(0);
    expect(enqueueConsultationEmail).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
    expect(sendImmediatePushNotification).not.toHaveBeenCalled();
  });
  it("AT02 successful booking and ledger commit before emails, queue and push", async () => {
    const e = setupEngine();
    const { bookSlot } = await import("./bookingService");
    enqueueConsultationEmail.mockImplementation(async () => {
      expect(e.commits).toContain("transaction_committed");
      return "created";
    });
    const r = await bookSlot("owner-atomic", form("atomic-ok-1"));
    expect(r.kind).toBe("created");
    expect(e.stats()).toMatchObject({ bookingCount: 1, slotBooked: true, receiptCreates: 1 });
    expect(e.ledger.size).toBe(1);
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(2);
    expect(queueAdd).toHaveBeenCalled();
    expect(sendImmediatePushNotification).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([...e.ledger.values()][0]?.responseJson)).toMatch(/requestFingerprint/);
  });
  it("AT03 concurrent exact same key: one booking, one 200 replay, one postcommit notification round", async () => {
    const e = setupEngine({ forceTwoPrereads: true });
    const { bookSlot } = await import("./bookingService");
    const [a, b] = await Promise.all([
      bookSlot("owner-atomic", form("same-key-1")),
      bookSlot("owner-atomic", form("same-key-1")),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(["created", "idempotent_replay"]);
    expect(e.stats()).toMatchObject({ bookingCount: 1, receiptCreates: 1 });
    expect(e.ledger.size).toBe(1);
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(2);
    expect(sendImmediatePushNotification).toHaveBeenCalledTimes(1);
  });
  it("AT04 concurrent same key with different payload rejects conflict before second slot lock", async () => {
    const e = setupEngine({ forceTwoPrereads: true });
    const { bookSlot } = await import("./bookingService");
    const outcomes = await Promise.allSettled([
      bookSlot("owner-atomic", form("same-key-different")),
      bookSlot("owner-atomic", form("same-key-different", { clientPhone: "+79990000001" })),
    ]);
    const fulfilled = outcomes.filter((x) => x.status === "fulfilled"),
      rejected = outcomes.filter((x) => x.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "CONSULTATION_IDEMPOTENCY_CONFLICT",
    });
    expect(e.stats()).toMatchObject({ bookingCount: 1, receiptCreates: 1 });
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(2);
  });
  it("AT05 lost ACK after transaction commit: next request finds retained receipt, no duplicated emails", async () => {
    const e = setupEngine({ failNotificationsOnce: true });
    const { bookSlot } = await import("./bookingService");
    await expect(bookSlot("owner-atomic", form("lost-ack-key"))).rejects.toThrow(
      "SYNTHETIC_EMAIL_AFTER_COMMIT_FAULT",
    );
    expect(e.stats()).toMatchObject({ bookingCount: 1, receiptCreates: 1 });
    const ret = await bookSlot("owner-atomic", form("lost-ack-key"));
    expect(ret.kind).toBe("idempotent_replay");
    expect(e.stats().bookingCount).toBe(1);
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(1);
  });
  it("AT06 wrong fingerprint rejects before booking transaction", async () => {
    const e = setupEngine();
    const { bookSlot } = await import("./bookingService");
    await bookSlot("owner-atomic", form("fp-conflict"));
    await expect(
      bookSlot("owner-atomic", form("fp-conflict", { petName: "NOT_SAME_DOG" })),
    ).rejects.toMatchObject({ code: "CONSULTATION_IDEMPOTENCY_CONFLICT" });
    expect(e.stats().bookingCount).toBe(1);
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(2);
  });
  it("AT08 booking insert fault rolls back staged FREE slot and never persists a receipt", async () => {
    const e = setupEngine({ failBookingInsert: true });
    const { bookSlot } = await import("./bookingService");
    await expect(bookSlot("owner-atomic", form("booking-insert-fault"))).rejects.toThrow(
      "SYNTHETIC_BOOKING_INSERT_FAULT",
    );
    expect(e.stats()).toMatchObject({ bookingCount: 0, slotBooked: false, receiptCreates: 0 });
    expect(e.ledger.size).toBe(0);
    expect(enqueueConsultationEmail).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
  it("AT09 precommit fault after receipt INSERT rolls back booking, slot and receipt together", async () => {
    const e = setupEngine({ failAfterReceiptBeforeCommit: true });
    const { bookSlot } = await import("./bookingService");
    await expect(bookSlot("owner-atomic", form("precommit-fault"))).rejects.toThrow(
      "SYNTHETIC_PRECOMMIT_FAILURE",
    );
    expect(e.stats()).toMatchObject({ bookingCount: 0, slotBooked: false, receiptCreates: 1 });
    expect(e.ledger.size).toBe(0);
    expect(enqueueConsultationEmail).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
    expect(sendImmediatePushNotification).not.toHaveBeenCalled();
  });
  it("AT10 parallel DIFFERENT keys same slot result one created, one slot-taken; no duplicate receipt", async () => {
    const e = setupEngine({ forceTwoPrereads: true });
    const { bookSlot } = await import("./bookingService");
    const res = await Promise.allSettled([
      bookSlot("owner-atomic", form("different-slot-key-1")),
      bookSlot("owner-atomic", form("different-slot-key-2")),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(res.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(
      (res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason,
    ).toBeInstanceOf(ConsultationSlotTakenError);
    expect(e.stats()).toMatchObject({ bookingCount: 1, receiptCreates: 1 });
    expect(e.ledger.size).toBe(1);
    expect(enqueueConsultationEmail).toHaveBeenCalledTimes(2);
  });
  it("AT11 canonical digest changes when slot changes; same key rejects regardless of availability", async () => {
    const e = setupEngine();
    const { bookSlot } = await import("./bookingService");
    await bookSlot("owner-atomic", form("key-slot-mismatch"));
    await expect(
      bookSlot("owner-atomic", form("key-slot-mismatch", { slotId: "other-slot" })),
    ).rejects.toMatchObject({ code: "CONSULTATION_IDEMPOTENCY_CONFLICT" });
    expect(e.stats().bookingCount).toBe(1);
  });
  it("AT07 expired retained key cannot create a second booking from unknown old intent", async () => {
    const e = setupEngine();
    const { bookSlot } = await import("./bookingService");
    await bookSlot("owner-atomic", form("retention-expired"));
    const receipt = e.ledger.get("owner-atomic:retention-expired")!;
    receipt.expiresAt = new Date(Date.now() - 1000);
    await expect(bookSlot("owner-atomic", form("retention-expired"))).rejects.toMatchObject({
      code: "CONSULTATION_IDEMPOTENCY_CONFLICT",
    });
    expect(e.stats().bookingCount).toBe(1);
  });
});
