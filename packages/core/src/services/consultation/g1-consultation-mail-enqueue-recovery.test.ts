/**
 * AG1-WORK070: consultation mail enqueue after a lost queue-ADD ACK.
 * Fake Prisma+BullMQ only, no Redis, PG or email provider.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationEmailType, ConsultationEmailStatus, Prisma } from "@gafus/prisma";
import type * as GafusPrisma from "@gafus/prisma";
const m = vi.hoisted(() => ({
  findBooking: vi.fn(),
  create: vi.fn(),
  findLog: vi.fn(),
  add: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@gafus/prisma", async (importOriginal) => {
  const mod = await importOriginal<typeof GafusPrisma>();
  return {
    ...mod,
    prisma: {
      ...mod.prisma,
      consultationBooking: { findUnique: m.findBooking },
      consultationEmailLog: { create: m.create, findUnique: m.findLog },
    },
  };
});
vi.mock("@gafus/queues", () => ({
  CONSULTATION_MAIL_JOB_ID: (id: string) => `mail:${id}`,
  consultationMailQueue: { add: m.add },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: m.info, warn: m.warn, error: vi.fn() }),
}));

import { enqueueConsultationEmail } from "./notificationService";

const FIRST = ConsultationEmailType.CLIENT_BOOKING_RECEIVED;
const SECOND = ConsultationEmailType.TRAINER_CONFIRM_REQUEST;
const row = (type = FIRST, status = ConsultationEmailStatus.PENDING, attempts = 0) => ({
  id: type === FIRST ? "log-client-1" : "log-trainer-1",
  bookingId: "booking-1",
  type,
  status,
  attempts,
});
const uniqueError = () => new Prisma.PrismaClientKnownRequestError("constraint", {
  code: "P2002",
  clientVersion: "test",
  meta: { target: ["bookingId", "type"] },
});
beforeEach(() => {
  vi.resetAllMocks();
  m.findBooking.mockResolvedValue({
    id: "booking-1",
    client: { email: "client@synthetic.invalid" },
    cynologist: { user: { email: "trainer@synthetic.invalid" } },
  });
  m.create.mockResolvedValue({ id: "log-client-1" });
  m.findLog.mockResolvedValue(null);
  m.add.mockResolvedValue({ id: "mail:log-client-1" });
});
describe("AG1-WORK070 actual enqueueConsultationEmail identity/recovery", () => {
  it("after queue ADD fails, same booking/event replay must recover pending log's same job ID", async () => {
    m.add.mockRejectedValueOnce(new Error("SYNTHETIC_REDIS_UNAVAILABLE"));
    await expect(enqueueConsultationEmail("booking-1", FIRST))
      .rejects.toThrow("SYNTHETIC_REDIS_UNAVAILABLE");
    m.create.mockRejectedValueOnce(uniqueError());
    m.findLog.mockResolvedValueOnce(row());
    const result = await enqueueConsultationEmail("booking-1", FIRST);
    expect(result).toBe("duplicate");
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.add).toHaveBeenCalledTimes(2);
    expect(m.add).toHaveBeenNthCalledWith(2,
      "send", { emailLogId: "log-client-1" },
      expect.objectContaining({
        jobId: "mail:log-client-1",
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      }),
    );
    expect(m.findLog).toHaveBeenCalledWith({
      where: { bookingId_type: { bookingId: "booking-1", type: FIRST } },
      select: { id: true, status: true, attempts: true },
    });
  });

  it("recovery Queue.add failure propagates and later replay remains repairable", async () => {
    m.create.mockRejectedValue(uniqueError());
    m.findLog.mockResolvedValue(row());
    m.add
      .mockRejectedValueOnce(new Error("SYNTHETIC_REDIS_FAILURE_AGAIN"))
      .mockResolvedValueOnce({ id: "mail:log-client-1" });
    await expect(enqueueConsultationEmail("booking-1", FIRST))
      .rejects.toThrow("SYNTHETIC_REDIS_FAILURE_AGAIN");
    expect(await enqueueConsultationEmail("booking-1", FIRST)).toBe("duplicate");
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.add.mock.calls.map(([_, data, options]) => [
      data.emailLogId, options.jobId,
    ])).toEqual([
      ["log-client-1", "mail:log-client-1"],
      ["log-client-1", "mail:log-client-1"],
    ]);
  });
  it("duplicate PENDING with prior provider attempts is not blindly re-enqueued", async () => {
    m.create.mockRejectedValueOnce(uniqueError());
    m.findLog.mockResolvedValueOnce(row(FIRST, ConsultationEmailStatus.PENDING, 1));
    expect(await enqueueConsultationEmail("booking-1", FIRST)).toBe("duplicate");
    expect(m.add).not.toHaveBeenCalled();
  });
  it("duplicate already SENT must not enqueue or change provider state", async () => {
    m.create.mockRejectedValueOnce(uniqueError());
    m.findLog.mockResolvedValueOnce(row(FIRST, ConsultationEmailStatus.SENT));
    expect(await enqueueConsultationEmail("booking-1", FIRST)).toBe("duplicate");
    expect(m.add).not.toHaveBeenCalled();
  });

  it("duplicate already attempted is not blindly retried outside BullMQ delivery lifecycle", async () => {
    m.create.mockRejectedValueOnce(uniqueError());
    m.findLog.mockResolvedValueOnce(row(FIRST, ConsultationEmailStatus.FAILED, 2));
    expect(await enqueueConsultationEmail("booking-1", FIRST)).toBe("duplicate");
    expect(m.add).not.toHaveBeenCalled();
  });

  it("separate event for same booking retains distinct event-log identity", async () => {
    m.create
      .mockResolvedValueOnce({ id: "log-client-1" })
      .mockResolvedValueOnce({ id: "log-trainer-1" });
    expect(await enqueueConsultationEmail("booking-1", FIRST)).toBe("created");
    expect(await enqueueConsultationEmail("booking-1", SECOND)).toBe("created");
    expect(m.create.mock.calls.map(([query]) => [query.data.bookingId, query.data.type]))
      .toEqual([["booking-1", FIRST], ["booking-1", SECOND]]);
    expect(m.add.mock.calls.map(([_, data, options]) => [
      data.emailLogId, options.jobId,
    ])).toEqual([
      ["log-client-1", "mail:log-client-1"],
      ["log-trainer-1", "mail:log-trainer-1"],
    ]);
  });

  it("missing email recipient never creates a log or a BullMQ job", async () => {
    m.findBooking.mockResolvedValueOnce({
      client: { email: null }, cynologist: { user: { email: null } },
    });
    expect(await enqueueConsultationEmail("booking-1", FIRST)).toBe("no_recipient");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.add).not.toHaveBeenCalled();
  });

  it("unknown DB fault is not silently treated as duplicate/retry", async () => {
    m.create.mockRejectedValueOnce(new Error("SYNTHETIC_DB_UNAVAILABLE"));
    await expect(enqueueConsultationEmail("booking-1", FIRST))
      .rejects.toThrow("SYNTHETIC_DB_UNAVAILABLE");
    expect(m.add).not.toHaveBeenCalled();
    expect(m.findLog).not.toHaveBeenCalled();
  });
});
