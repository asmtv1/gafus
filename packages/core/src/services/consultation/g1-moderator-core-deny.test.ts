/** AG4-approved G1-POLICY-001; real Core guards, mocked data/queues. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GafusPrisma from "@gafus/prisma";
const m = vi.hoisted(() => ({
  bookingFind: vi.fn(), bookingFindMany: vi.fn(), bookingUpdate: vi.fn(),
  cynFind: vi.fn(), tx: vi.fn(), usersFindMany: vi.fn(),
  queueAdd: vi.fn(),
}));
vi.mock("@gafus/prisma", async original => {
  const source = await original<typeof GafusPrisma>();
  return {
    ...source,
    prisma: {
      ...source.prisma,
      consultationBooking: {
        ...source.prisma.consultationBooking,
        findUnique: m.bookingFind, findMany: m.bookingFindMany, updateMany: m.bookingUpdate,
      },
      consultationCynologist: {
        ...source.prisma.consultationCynologist,
        findUnique: m.cynFind,
      },
      user: { ...source.prisma.user, findMany: m.usersFindMany },
      $transaction: m.tx,
    },
  };
});
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock("@gafus/queues", () => ({
  consultationSlaQueue: { add: m.queueAdd },
  consultationReminderQueue: { add: m.queueAdd },
  CONSULTATION_SLA_JOB_ID: () => "sla",
  CONSULTATION_REMINDER_JOB_ID: () => "reminder",
  removeConsultationSlaJob: vi.fn(),
  removeConsultationReminderJob: vi.fn(),
}));
vi.mock("./notificationService", () => ({ enqueueConsultationEmail: vi.fn() }));
vi.mock("../notifications/immediatePushService", () => ({ sendImmediatePushNotification: vi.fn() }));
import { ConsultationForbiddenError } from "./errors";
import {
  confirmBookingByTrainer, completeBookingByTrainer, markBookingNoShowByTrainer,
  rejectBookingByTrainer, listTrainerBookings,
} from "./bookingService";
import { adminSetListedCynologists } from "./cynologistService";
import {
  canAdminManageListed, canTrainerActAsCynologist, isTrainerOrAdmin,
} from "./permissions";

beforeEach(() => {
  vi.clearAllMocks();
  m.cynFind.mockResolvedValue(null);
  m.bookingFindMany.mockResolvedValue([]);
  m.usersFindMany.mockResolvedValue([]);
});

describe("AG4 decision: Core must reject MODERATOR before any data access", () => {
  it.each(["USER", "PARTNER", "MODERATOR"] as const)(
    "%s cannot list staff bookings via direct Core call", async role => {
      await expect(listTrainerBookings("actor-A", role))
        .rejects.toBeInstanceOf(ConsultationForbiddenError);
      expect(m.cynFind).not.toHaveBeenCalled();
      expect(m.bookingFindMany).not.toHaveBeenCalled();
    },
  );

  const mutations = [
    ["confirm", () => confirmBookingByTrainer("mod-A", "MODERATOR", "booking-A")],
    ["complete", () => completeBookingByTrainer("mod-A", "MODERATOR", "booking-A")],
    ["no-show", () => markBookingNoShowByTrainer("mod-A", "MODERATOR", "booking-A")],
    ["reject", () => rejectBookingByTrainer("mod-A", "MODERATOR", "booking-A")],
  ] as const;
  it.each(mutations)("MODERATOR %s booking is forbidden before lookup/side effect", async (_, fn) => {
    await expect(fn()).rejects.toBeInstanceOf(ConsultationForbiddenError);
    expect(m.bookingFind).not.toHaveBeenCalled();
    expect(m.bookingUpdate).not.toHaveBeenCalled();
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.queueAdd).not.toHaveBeenCalled();
  });

  it("MODERATOR cannot relist trainers even when body is empty", async () => {
    await expect(adminSetListedCynologists("mod-A", "MODERATOR", []))
      .rejects.toBeInstanceOf(ConsultationForbiddenError);
    expect(m.usersFindMany).not.toHaveBeenCalled();
    expect(m.tx).not.toHaveBeenCalled();
  });

  it("pure role decisions accept only ADMIN or own TRAINER", () => {
    expect(canAdminManageListed("MODERATOR")).toBe(false);
    expect(canTrainerActAsCynologist("MODERATOR")).toBe(false);
    expect(isTrainerOrAdmin("MODERATOR")).toBe(false);
    expect(canAdminManageListed("ADMIN")).toBe(true);
    expect(canTrainerActAsCynologist("TRAINER")).toBe(true);
    expect(isTrainerOrAdmin("ADMIN")).toBe(true);
  });

  it("TRAINER may view own booking list and ADMIN may view all", async () => {
    expect(await listTrainerBookings("trainer-A", "TRAINER")).toEqual([]);
    expect(await listTrainerBookings("admin-A", "ADMIN")).toEqual([]);
    expect(m.bookingFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
