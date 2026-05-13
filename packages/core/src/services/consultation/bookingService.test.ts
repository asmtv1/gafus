import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ConsultationBookingStatus,
  ConsultationPetGender,
  ConsultationSlotStatus,
  Prisma,
} from "@gafus/prisma";

import { ConsultationSlotTakenError } from "./errors";

const enqueueConsultationEmail = vi.fn();
const createTelemostConference = vi.fn();
const queueAdd = vi.fn();
const removeConsultationSlaJob = vi.fn();
const removeConsultationReminderJob = vi.fn();

vi.mock("./notificationService", () => ({
  enqueueConsultationEmail: (...a: unknown[]) => enqueueConsultationEmail(...a),
}));

vi.mock("./telemostService", () => ({
  createTelemostConference: (...a: unknown[]) => createTelemostConference(...a),
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
  CONSULTATION_REMINDER_JOB_ID: (id: string) => `reminder:${id}`,
  removeConsultationSlaJob: (...a: unknown[]) => removeConsultationSlaJob(...a),
  removeConsultationReminderJob: (...a: unknown[]) => removeConsultationReminderJob(...a),
}));

const {
  idemFindUnique,
  txUpdateMany,
  txFindUnique,
  txCreateBooking,
  prismaUpdateBooking,
  prismaUpsertIdem,
  prismaFindUniqueBooking,
  prismaTransaction,
} = vi.hoisted(() => ({
  idemFindUnique: vi.fn(),
  txUpdateMany: vi.fn(),
  txFindUnique: vi.fn(),
  txCreateBooking: vi.fn(),
  prismaUpdateBooking: vi.fn(),
  prismaUpsertIdem: vi.fn(),
  prismaFindUniqueBooking: vi.fn(),
  prismaTransaction: vi.fn(),
}));

vi.mock("@gafus/prisma", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@gafus/prisma")>();
  return {
    ...mod,
    prisma: {
      ...mod.prisma,
      consultationBookingIdempotency: {
        ...mod.prisma.consultationBookingIdempotency,
        findUnique: idemFindUnique,
        upsert: prismaUpsertIdem,
      },
      consultationBooking: {
        ...mod.prisma.consultationBooking,
        update: prismaUpdateBooking,
        findUnique: prismaFindUniqueBooking,
      },
      $transaction: prismaTransaction,
    },
  };
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
  });

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
      slot: { id: "s1" },
    });
    const { processBookingSlaTimeout } = await import("./bookingService");
    await processBookingSlaTimeout("b1");
    expect(txBookingUpdate).toHaveBeenCalled();
    expect(txSlotUpdate).toHaveBeenCalled();
    expect(enqueueConsultationEmail).toHaveBeenCalled();
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
