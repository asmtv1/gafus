/**
 * AG1 opt-in REAL Prisma/PostgreSQL faultpoint suite. Never run on normal CI.
 * The ONLY test doubles are side-effect providers (mail, queue, push, logger).
 * The pinned Core bookingService and all SQL transactions execute for real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

const { mail, queue, push, logError, failureMode } = vi.hoisted(() => ({
  mail: vi.fn(async () => "SYNTHETIC_MAIL_STUB"),
  queue: vi.fn(async () => ({ id: "ag1bk-job-stub" })),
  push: vi.fn(async () => ({ success: true })),
  logError: vi.fn(),
  failureMode: { failMailOnce: false },
}));
vi.mock("@gafus/queues", () => ({
  consultationSlaQueue: { add: (...a: unknown[]) => queue(...a) },
  consultationReminderQueue: { add: (...a: unknown[]) => queue(...a) },
  CONSULTATION_SLA_JOB_ID: (id: string) => `sla:${id}`,
  CONSULTATION_REMINDER_JOB_ID: (id: string, kind: string) => `remind:${id}:${kind}`,
  removeConsultationSlaJob: vi.fn(),
  removeConsultationReminderJob: vi.fn(),
}));
vi.mock("./notificationService", () => ({
  enqueueConsultationEmail: (...args: unknown[]) => {
    if (failureMode.failMailOnce) {
      failureMode.failMailOnce = false;
      return Promise.reject(new Error("AG1_POSTCOMMIT_MAIL_FAULT"));
    }
    return mail(...args);
  },
}));
vi.mock("../notifications/immediatePushService", () => ({
  sendImmediatePushNotification: (...args: unknown[]) => push(...args),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: logError, success: vi.fn() }),
}));
vi.mock("../appSubscription", () => ({
  getAppSubscriptionAccess: vi.fn(),
  getCynologistEntitlements: vi.fn(),
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {},
}));

import { bookSlot } from "./bookingService";
import { lookupOwnConsultationBookingByKey } from "../../../../../apps/api/src/lib/consultation-booking-lookup";

const dbName = "gafus_ag1_booking_atomicity_synthetic_20261017";
const prefix = "ag1bk_";
const key = (serial: number) => `00000000-0000-4000-8000-${String(serial).padStart(12, "0")}`;
const owner = (suffix: string) => `${prefix}owner_${suffix}`;
const slot = (number: number) => `${prefix}slot${number}`;
const input = (slotId: string, idempotencyKey: string, clientProblem = "SYNTHETIC") => ({
  slotId, idempotencyKey,
  clientOwnerName: "AG1 Synthetic Owner", clientPhone: "+79990000000",
  petName: "AG1 Synthetic Dog", petGender: "MALE" as const,
  petAge: "5", petBreed: "Mixed", clientProblem,
  clientSelfHelpAttempt: "Synthetic fixture only",
});
const enabled = process.env.AG1_BOOKING_REALPG_RUN === "1";
const suite = enabled ? describe : describe.skip;
const output = (caseId: string, evidence: object) =>
  console.warn("AG1_BOOKING_REALPG_CASE", JSON.stringify({ caseId, ...evidence }));

async function counts() {
  return {
    bookings: await prisma.consultationBooking.count(),
    receipts: await prisma.consultationBookingIdempotency.count(),
    emails: await prisma.consultationEmailLog.count(),
  };
}
async function ownerCounts(id: string) {
  return {
    bookings: await prisma.consultationBooking.count({ where: { clientId: id } }),
    receipts: await prisma.consultationBookingIdempotency.count({ where: { clientId: id } }),
  };
}

suite("AG1 active booking lease: ACTUAL Prisma/PostgreSQL source SQL, no outbound providers", () => {
  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (url !== `postgresql://ag1_booking_atomic_synthetic@127.0.0.1:55460/${dbName}?options=-c%20lock_timeout%3D1500ms`) {
      throw new Error("AG1 BOOKING REALPG: unexpected database identity");
    }
    const result = await prisma.$queryRaw<{ db: string; actor: string; port: number; migrations: bigint }[]>`
      SELECT current_database() AS db, current_user AS actor, inet_server_port() AS port,
        (SELECT count(*) FROM "_prisma_migrations") AS migrations
    `;
    expect(result).toEqual([{ db: dbName, actor: "ag1_booking_atomic_synthetic", port: 55460, migrations: 140n }]);
    expect(await prisma.user.count()).toBe(7);
    expect(await prisma.consultationSlot.count()).toBe(5);
    expect(await counts()).toEqual({ bookings: 0, receipts: 0, emails: 0 });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("SQL01 actual Prisma CREATE validation fault rolls back prior slot UPDATE", async () => {
    const malformed = {
      ...input(slot(1), key(102)),
      petGender: "INVALID_SYNTHETIC_ENUM" as "MALE",
    };
    await expect(bookSlot(owner("a"), malformed)).rejects.toThrow();
    expect(await counts()).toEqual({ bookings: 0, receipts: 0, emails: 0 });
    expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: slot(1) } })).status).toBe("FREE");
    expect(mail).not.toHaveBeenCalled();
    output("SQL01_PRISMA_CREATE_VALIDATION_ROLLBACK", { ...await counts(), freeSlot: true });
  });

  it("SQL02 real SQL receipt table lock timeout rolls back Core booking and slot", async () => {
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((done) => { release = done; });
    const locked = new Promise<void>((done) => { acquired = done; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "ConsultationBookingIdempotency" IN SHARE MODE`;
      acquired();
      await held;
    }, { maxWait: 2000, timeout: 20000 });
    try {
      await locked;
      await expect(bookSlot(owner("a"), input(slot(1), key(101)))).rejects.toThrow();
    } finally {
      release();
      await blocker;
    }
    expect(await counts()).toEqual({ bookings: 0, receipts: 0, emails: 0 });
    expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: slot(1) } })).status).toBe("FREE");
    expect(mail).not.toHaveBeenCalled();
    output("SQL02_SQL_LOCK_TIMEOUT_RECEIPT_ROLLBACK", { ...await counts(), freeSlot: true });
  }, 30000);

  it("SQL03 actual Prisma precommit rollback of slot/booking/receipt (transaction envelope)", async () => {
    await expect(prisma.$transaction(async (tx) => {
      const updated = await tx.consultationSlot.updateMany({
        where: { id: slot(3), status: "FREE" }, data: { status: "BOOKED" },
      });
      expect(updated.count).toBe(1);
      const booking = await tx.consultationBooking.create({
        data: {
          clientId: owner("c"), cynologistId: "ag1bk_cyno", slotId: slot(3),
          confirmationDeadlineAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.consultationBookingIdempotency.create({
        data: {
          clientId: owner("c"), key: key(103), bookingId: booking.id,
          responseJson: { state: "BOOKING_CREATED" },
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      throw new Error("AG1_SQL_PRECOMMIT_ROLLBACK_FAULT");
    })).rejects.toThrow("AG1_SQL_PRECOMMIT_ROLLBACK_FAULT");
    expect(await ownerCounts(owner("c"))).toEqual({ bookings: 0, receipts: 0 });
    expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: slot(3) } })).status).toBe("FREE");
    expect(mail).not.toHaveBeenCalled();
    output("SQL03_MANUAL_PRISMA_PRECOMMIT_ROLLBACK", { ...await ownerCounts(owner("c")), freeSlot: true });
  });

  it("SQL04 successful Core booking; replay same owner/key once; changed payload conflict", async () => {
    const first = await bookSlot(owner("a"), input(slot(1), key(104)));
    expect(first.kind).toBe("created");
    expect(await ownerCounts(owner("a"))).toEqual({ bookings: 1, receipts: 1 });
    expect((await prisma.consultationSlot.findUniqueOrThrow({ where: { id: slot(1) } })).status).toBe("BOOKED");
    expect(mail).toHaveBeenCalledTimes(2);
    const replay = await bookSlot(owner("a"), input(slot(1), key(104)));
    expect(replay.kind).toBe("idempotent_replay");
    expect(replay.booking.id).toBe(first.booking.id);
    expect(mail).toHaveBeenCalledTimes(2);
    await expect(bookSlot(owner("a"), { ...input(slot(1), key(104)), petName: "changed-dog" }))
      .rejects.toMatchObject({ code: "CONSULTATION_IDEMPOTENCY_CONFLICT" });
    expect(await ownerCounts(owner("a"))).toEqual({ bookings: 1, receipts: 1 });
    output("SQL04_CREATE_REPLAY_PAYLOAD_409", { ...await ownerCounts(owner("a")), first: first.kind, replay: replay.kind, emailCalls: mail.mock.calls.length });
  });

  it("SQL05 two actual concurrent same-owner requests yield 1 booking 1 receipt and replay", async () => {
    const beforeEmails = mail.mock.calls.length;
    const [a, b] = await Promise.all([
      bookSlot(owner("b"), input(slot(2), key(105))),
      bookSlot(owner("b"), input(slot(2), key(105))),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(["created", "idempotent_replay"]);
    expect(a.booking.id).toBe(b.booking.id);
    expect(await ownerCounts(owner("b"))).toEqual({ bookings: 1, receipts: 1 });
    expect(mail.mock.calls.length - beforeEmails).toBe(2);
    output("SQL05_CONCURRENT_SAME_KEY_LOCK_REPLAY", { ...await ownerCounts(owner("b")), outcome: [a.kind, b.kind], newMail: mail.mock.calls.length - beforeEmails });
  });

  it("SQL06 a deferred-fault owner can safely book after rollback with another key", async () => {
    const first = await bookSlot(owner("c"), input(slot(3), key(116)));
    expect(first.kind).toBe("created");
    expect(await ownerCounts(owner("c"))).toEqual({ bookings: 1, receipts: 1 });
    output("SQL06_SUCCESS_AFTER_REAL_ROLLBACK", await ownerCounts(owner("c")));
  });

  it("SQL07 lost post-commit email ACK still leaves booking+receipt; manual readback finds it", async () => {
    failureMode.failMailOnce = true;
    await expect(bookSlot(owner("d"), input(slot(4), key(106))))
      .rejects.toThrow("AG1_POSTCOMMIT_MAIL_FAULT");
    const persisted = await prisma.consultationBookingIdempotency.findUniqueOrThrow({
      where: { clientId_key: { clientId: owner("d"), key: key(106) } },
    });
    expect(persisted.bookingId).toBeTruthy();
    expect(await ownerCounts(owner("d"))).toEqual({ bookings: 1, receipts: 1 });
    const status = await lookupOwnConsultationBookingByKey(owner("d"), key(106));
    expect(status.state).toBe("FOUND");
    const before = mail.mock.calls.length;
    const replay = await bookSlot(owner("d"), input(slot(4), key(106)));
    expect(replay.kind).toBe("idempotent_replay");
    expect(mail.mock.calls.length).toBe(before);
    output("SQL07_POSTCOMMIT_LOST_ACK_READBACK", { ...await ownerCounts(owner("d")), lookup: status.state, replay: replay.kind, newMailOnReplay: 0 });
  });

  it("SQL08 different owners, different keys, same slot: PostgreSQL enforces only one winner", async () => {
    const results = await Promise.allSettled([
      bookSlot(owner("e"), input(slot(5), key(107))),
      bookSlot(owner("f"), input(slot(5), key(108))),
    ]);
    const successes = results.filter((p) => p.status === "fulfilled");
    const failures = results.filter((p) => p.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((await prisma.consultationBooking.findMany({
      where: { slotId: slot(5) },
    }))).toHaveLength(1);
    expect((await prisma.consultationBookingIdempotency.findMany({
      where: { clientId: { in: [owner("e"), owner("f")] } },
    }))).toHaveLength(1);
    output("SQL08_CONCURRENT_DISTINCT_OWNERS_ONE_SLOT", { winner: 1, rejected: 1 });
  });

  it("SQL09 owner-only readback: foreign/expired/dangling/absent are indistinguishable UNKNOWN", async () => {
    expect((await lookupOwnConsultationBookingByKey(owner("a"), key(104))).state).toBe("FOUND");
    expect(await lookupOwnConsultationBookingByKey(owner("b"), key(104))).toEqual({ state: "UNKNOWN" });
    expect(await lookupOwnConsultationBookingByKey(owner("a"), key(999))).toEqual({ state: "UNKNOWN" });
    await prisma.consultationBookingIdempotency.createMany({
      data: [
        { clientId: owner("a"), key: key(109), bookingId: "missing-booking", responseJson: { state: "BOOKING_CREATED" }, expiresAt: new Date(Date.now() - 1000) },
        { clientId: owner("b"), key: key(110), bookingId: "missing-booking", responseJson: { state: "BOOKING_CREATED" }, expiresAt: new Date(Date.now() + 3600000) },
      ],
    });
    expect(await lookupOwnConsultationBookingByKey(owner("a"), key(109))).toEqual({ state: "UNKNOWN" });
    expect(await lookupOwnConsultationBookingByKey(owner("b"), key(110))).toEqual({ state: "UNKNOWN" });
    output("SQL09_OWNER_SCOPED_LOOKUP_PRIVACY", { ownerFound: 1, ownerUnknown: 4, foreignResponse: "UNKNOWN" });
  });
});
