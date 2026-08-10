import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as GafusPrisma from "@gafus/prisma";

import {
  ConsultationBookingStatus,
  ConsultationPetGender,
  ConsultationSlotStatus,
  Prisma,
} from "@gafus/prisma";

import { ConsultationSlotTakenError } from "./errors";
import { SubscriptionRequiredError } from "../appSubscription/errors";

const enqueueConsultationEmail = vi.fn();
const createTelemostConference = vi.fn();
const queueAdd = vi.fn();
const removeConsultationSlaJob = vi.fn();
const removeConsultationReminderJob = vi.fn();
const sendImmediatePushNotification = vi.fn();
const getAppSubscriptionAccess = vi.fn();

vi.mock("../appSubscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../appSubscription")>()),
  getAppSubscriptionAccess: (...args: unknown[]) => getAppSubscriptionAccess(...args),
}));

vi.mock("./notificationService", () => ({
  enqueueConsultationEmail: (...a: unknown[]) => enqueueConsultationEmail(...a),
}));

vi.mock("./telemostService", () => ({
  createTelemostConference: (...a: unknown[]) => createTelemostConference(...a),
}));

vi.mock("@gafus/webpush", () => ({
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
  prismaUpsertIdem,
  prismaFindUniqueBooking,
  prismaFindManyBooking,
  prismaTransaction,
} = vi.hoisted(() => ({
  idemFindFirst: vi.fn(),
  idemFindUnique: vi.fn(),
  txUpdateMany: vi.fn(),
  txFindUnique: vi.fn(),
  txCreateBooking: vi.fn(),
  prismaUpdateBooking: vi.fn(),
  prismaUpsertIdem: vi.fn(),
  prismaFindUniqueBooking: vi.fn(),
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
      },
      consultationBooking: {
        ...mod.prisma.consultationBooking,
        update: prismaUpdateBooking,
        findUnique: prismaFindUniqueBooking,
        findMany: prismaFindManyBooking,
      },
      $transaction: prismaTransaction,
    },
  };
});

beforeEach(() => {
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
    const txBookingUpdate = vi.fn();
    const txSlotUpdate = vi.fn();
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({
        consultationBooking: { update: txBookingUpdate },
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
    expect(txBookingUpdate).toHaveBeenCalled();
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
      status: ConsultationBookingStatus.CONFIRMED,
      cynologist: { userId: "trainer-1" },
    });

    const { markBookingNoShowByTrainer } = await import("./bookingService");
    await markBookingNoShowByTrainer("trainer-1", "TRAINER", "b-no-show");

    expect(removeConsultationReminderJob).toHaveBeenCalledWith("b-no-show");
    expect(prismaUpdateBooking).toHaveBeenCalledWith({
      where: { id: "b-no-show" },
      data: { status: ConsultationBookingStatus.NO_SHOW },
    });
    expect(enqueueConsultationEmail).toHaveBeenCalledWith(
      "b-no-show",
      "CLIENT_CONSULTATION_NO_SHOW",
    );
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
        joinUrl: null,
        watchUrl: null,
        confirmationDeadlineAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
    idemFindUnique.mockResolvedValue({
      responseJson: cached,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { bookSlot } = await import("./bookingService");
    const out = await bookSlot("client1", {
      slotId: "s1",
      idempotencyKey: "k1",
      ...bookBodyBase,
    });
    expect(out).toEqual(cached);
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
      telemostJoinUrl: null,
      telemostWatchUrl: null,
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
      telemostJoinUrl: null,
      telemostWatchUrl: null,
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
        consultationBooking: { create: txCreateBooking },
      };
      return cb(tx);
    });
    const { bookSlot } = await import("./bookingService");
    await expect(
      bookSlot("client1", {
        slotId: "s1",
        idempotencyKey: "k-cancelled",
        ...bookBodyBase,
      }),
    ).rejects.toBeInstanceOf(ConsultationSlotTakenError);
  });

  it("бросает ConsultationSlotTakenError, если слот уже занят", async () => {
    idemFindUnique.mockResolvedValue(null);
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        consultationSlot: {
          updateMany: txUpdateMany.mockResolvedValue({ count: 0 }),
          findUnique: txFindUnique,
        },
        consultationBooking: { create: txCreateBooking },
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
        consultationBooking: { create: txCreateBooking },
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
      createTelemostConference.mockResolvedValue({
        id: "telemost-1",
        joinUrl: "https://telemost.test/join",
        watchUrl: null,
      });
      prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          consultationSlot: {
            updateMany: txUpdateMany,
            findUnique: txFindUnique,
          },
          consultationBooking: { create: txCreateBooking },
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
          telemostJoinUrl: "https://telemost.test/join",
          telemostWatchUrl: null,
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

  it("при ошибке Телемоста откатывает бронь и слот", async () => {
    idemFindUnique.mockResolvedValue(null);
    const bookingId = "new-booking";
    txUpdateMany.mockResolvedValue({ count: 1 });
    const startAt = new Date(Date.now() + 50 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() + 50 * 60 * 60 * 1000 + 30 * 60 * 1000);
    txFindUnique.mockResolvedValue({
      id: "slot1",
      startAt,
      endAt,
      cynologistId: "cy1",
      cynologist: {
        bookingLeadTimeMin: 0,
        confirmationSlaMin: 60,
      },
    });
    txCreateBooking.mockResolvedValue({ id: bookingId });
    createTelemostConference.mockRejectedValue(new Error("telemost down"));

    const compBookingUpdate = vi.fn();
    const compSlotUpdate = vi.fn();
    let txPhase = 0;
    prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      txPhase += 1;
      if (txPhase === 1) {
        const tx = {
          consultationSlot: {
            updateMany: txUpdateMany,
            findUnique: txFindUnique,
          },
          consultationBooking: { create: txCreateBooking },
        };
        return cb(tx);
      }
      const tx = {
        consultationBooking: { update: compBookingUpdate },
        consultationSlot: { update: compSlotUpdate },
      };
      return cb(tx);
    });

    const { bookSlot } = await import("./bookingService");
    await expect(
      bookSlot("c1", { slotId: "slot1", idempotencyKey: "k3", ...bookBodyBase }),
    ).rejects.toThrow("telemost down");
    expect(compBookingUpdate).toHaveBeenCalled();
    expect(compSlotUpdate).toHaveBeenCalled();
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
        joinUrl: null,
        watchUrl: null,
        confirmationDeadlineAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
    idemFindUnique.mockResolvedValue({
      bookingId: "booking-replay",
      responseJson: cached,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { bookSlotWithSubscription } = await import("./bookingService");

    await expect(
      bookSlotWithSubscription({
        userId: "client-1",
        body: { slotId: "slot-1", idempotencyKey: "existing-key", ...bookBodyBase },
      }),
    ).resolves.toEqual(cached);
    expect(getAppSubscriptionAccess).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
  });
});
