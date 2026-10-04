import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { bookSlot, cancelBookingByUser, completeBookingByTrainer } from "./bookingService";
import { getConsultationBookingEligibility } from "./bookingEligibility";

vi.mock("./telemostService", () => ({ createTelemostConference: vi.fn().mockResolvedValue({
  id: "test-conference", joinUrl: "https://example.test/join", watchUrl: null,
}) }));
vi.mock("./notificationService", () => ({ enqueueConsultationEmail: vi.fn() }));
vi.mock("@gafus/webpush", () => ({ sendImmediatePushNotification: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@gafus/queues", () => ({
  consultationSlaQueue: { add: vi.fn() }, consultationReminderQueue: { add: vi.fn() },
  removeConsultationSlaJob: vi.fn(), removeConsultationReminderJob: vi.fn(),
  CONSULTATION_SLA_JOB_ID: (id: string) => id,
  CONSULTATION_REMINDER_JOB_ID: (id: string, kind: string) => `${id}:${kind}`,
}));

// Run only against an explicitly designated disposable database.
const enabled = process.env.CONSULTATION_LIMIT_TEST_DB === "1" &&
  (process.env.DATABASE_URL ?? "").includes("/gafus_consultation_limit_test_");
const suite = enabled ? describe : describe.skip;
const clientId = "limit-test-client";
const trainerIds = ["limit-test-trainer-1", "limit-test-trainer-2"];
let slots: string[];
const body = (slotId: string) => ({
  slotId, idempotencyKey: randomUUID(), clientOwnerName: "Анна", clientPhone: "+79991234567",
  petName: "Бим", petGender: "MALE" as const, petAge: "2 года", petBreed: "Корги",
  clientProblem: "Тянет поводок на прогулке", clientSelfHelpAttempt: "Пробовали лакомства",
});

suite("consultation limits with real PostgreSQL transactions", () => {
  beforeAll(async () => {
    for (const id of [clientId, ...trainerIds]) {
      await prisma.user.create({ data: { id, username: id, password: "test-only", role: id === clientId ? "USER" : "TRAINER" } });
    }
    for (const userId of trainerIds) await prisma.consultationCynologist.create({ data: { id: userId, userId, isListed: true } });
  });
  beforeEach(async () => {
    await prisma.consultationBookingIdempotency.deleteMany();
    await prisma.consultationBooking.deleteMany();
    await prisma.consultationSlot.deleteMany();
    slots = [];
    for (const [i, cynologistId] of trainerIds.entries()) {
      const startAt = new Date(Date.now() + (72 + i) * 60 * 60 * 1000);
      const slot = await prisma.consultationSlot.create({ data: { cynologistId, startAt, endAt: new Date(startAt.getTime() + 30 * 60 * 1000) } });
      slots.push(slot.id);
    }
  });
  afterAll(async () => {
    await prisma.consultationBookingIdempotency.deleteMany();
    await prisma.consultationBooking.deleteMany();
    await prisma.consultationSlot.deleteMany();
    await prisma.user.deleteMany({ where: { id: { in: [clientId, ...trainerIds] } } });
    await prisma.$disconnect();
  });

  it("allows only one of two simultaneous bookings with different trainers", async () => {
    const results = await Promise.allSettled(slots.map(slot => bookSlot(clientId, body(slot))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("CONSULTATION_ACTIVE_BOOKING");
    expect(await prisma.consultationBooking.count()).toBe(1);
    expect(await prisma.consultationSlot.count({ where: { status: "FREE" } })).toBe(1);
  });

  it("starts cooldown on completion, preserves replay and allows after 7 days", async () => {
    const request = body(slots[0]);
    const first = await bookSlot(clientId, request);
    await prisma.consultationBooking.update({ where: { id: first.booking.id }, data: { status: "CONFIRMED" } });
    await expect(bookSlot(clientId, body(slots[1]))).rejects.toMatchObject({ code: "CONSULTATION_ACTIVE_BOOKING" });
    const before = Date.now();
    await completeBookingByTrainer(trainerIds[0], "TRAINER", first.booking.id);
    const completed = await prisma.consultationBooking.findUniqueOrThrow({ where: { id: first.booking.id } });
    expect(completed.completedAt!.getTime()).toBeGreaterThanOrEqual(before);
    const eligibility = await getConsultationBookingEligibility(clientId);
    expect(eligibility.nextBookingAt).toBe(new Date(completed.completedAt!.getTime() + 168 * 60 * 60 * 1000).toISOString());
    await expect(bookSlot(clientId, body(slots[1]))).rejects.toMatchObject({ code: "CONSULTATION_WEEKLY_COOLDOWN" });
    expect((await bookSlot(clientId, request)).booking.id).toBe(first.booking.id);
    expect(await prisma.consultationBooking.count()).toBe(1);
    // Repeated completion cannot extend the timer.
    await expect(completeBookingByTrainer(trainerIds[0], "TRAINER", first.booking.id)).rejects.toThrow();
    expect((await prisma.consultationBooking.findUniqueOrThrow({ where: { id: first.booking.id } })).completedAt).toEqual(completed.completedAt);
    await prisma.consultationBooking.update({ where: { id: first.booking.id }, data: { completedAt: new Date(Date.now() - 168 * 60 * 60 * 1000) } });
    expect((await bookSlot(clientId, body(slots[1]))).kind).toBe("created");
  });

  it("allows a new booking immediately after cancellation", async () => {
    const first = await bookSlot(clientId, body(slots[0]));
    await cancelBookingByUser(clientId, first.booking.id);
    expect((await bookSlot(clientId, body(slots[1]))).kind).toBe("created");
  });

  it.each(["COMPLETED", "NO_SHOW"] as const)("ignores legacy %s without completion timestamp", async status => {
    const first = await bookSlot(clientId, body(slots[0]));
    await prisma.consultationBooking.update({ where: { id: first.booking.id }, data: { status } });
    expect((await bookSlot(clientId, body(slots[1]))).kind).toBe("created");
  });
});
