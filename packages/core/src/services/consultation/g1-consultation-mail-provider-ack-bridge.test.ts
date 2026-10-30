/** WORK070 AG4-approved lifecycle, mocked Prisma/source Core, no provider, DB, Redis. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  logRead: vi.fn(), logCas: vi.fn(), outboxRead: vi.fn(), attemptRead: vi.fn(),
  transport: vi.fn(), logUpdate: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  ConsultationEmailStatus: { PENDING: "PENDING", SENT: "SENT", FAILED: "FAILED" },
  prisma: {
    consultationEmailLog: { findUnique: m.logRead, updateMany: m.logCas, update: m.logUpdate },
    transactionalMailOutbox: { findUnique: m.outboxRead },
    transactionalMailAttempt: { findUnique: m.attemptRead },
  },
}));
vi.mock("./consultationTransactionalMail", () => ({
  sendConsultationEmailFromLog: m.transport,
}));
import { processConsultationEmailLog, reconcileConsultationEmailLog } from "./consultationEmailDelivery";
const acceptance = new Date("2026-10-21T12:04:05.000Z");
const base = { id: "log-A", bookingId: "booking-A", type: "CLIENT_BOOKING_RECEIVED",
  status: "PENDING", sentAt: null, attempts: 0, lastError: null };
let state: typeof base;
const PRIVATE = "EMAIL_PRIVATE_TOKEN_AND_PROVIDER_TRACE";
beforeEach(() => {
  vi.resetAllMocks();
  state = { ...base };
  m.logRead.mockImplementation(async () => ({ ...state }));
  m.logCas.mockImplementation(async (query: {
    where: { status: string; attempts?: number; lastError?: string | null };
    data: Record<string, unknown>;
  }) => {
    if (query.where.status !== state.status ||
      (query.where.attempts !== undefined && query.where.attempts !== state.attempts) ||
      (query.where.lastError !== undefined && query.where.lastError !== state.lastError)) {
      return { count: 0 };
    }
    const d = query.data;
    state = { ...state, status: (d.status as string | undefined) ?? state.status,
      sentAt: (d.sentAt as null) ?? state.sentAt,
      lastError: d.lastError as null ?? null,
      attempts: state.attempts + (typeof d.attempts === "object" ? 1 : 0),
    };
    return { count: 1 };
  });
  m.outboxRead.mockResolvedValue(null);
  m.attemptRead.mockResolvedValue(null);
  m.transport.mockResolvedValue({ kind: "QUEUED" });
});
const outbox = (status: string, acceptedAt: Date | null = null) =>
  ({ id: "consultation-log-A", status, acceptedAt });
const attempt = (
  status: string, acceptedAt: Date | null = null, providerMessageId: string | null = null,
) => ({ id: "consultation-log-A", status, acceptedAt, providerMessageId });
describe("WORK070 stable-key durable ACK lifecycle", () => {
  it("durable enqueue is QUEUED, keeps PENDING/no sentAt and only one enqueue attempt", async () => {
    expect(await processConsultationEmailLog("log-A")).toBe("queued");
    expect(state).toMatchObject({ status: "PENDING", sentAt: null, attempts: 1 });
    m.outboxRead.mockResolvedValue(outbox("PENDING"));
    expect(await processConsultationEmailLog("log-A")).toBe("queued");
    expect(m.transport).toHaveBeenCalledTimes(1);
    expect(state.attempts).toBe(1);
  });
  it("immediate proven provider ACK uses persisted acceptedAt, one CAS, duplicates no resend", async () => {
    m.transport.mockResolvedValue({ kind: "PROVIDER_ACCEPTED", acceptedAt: acceptance });
    expect(await processConsultationEmailLog("log-A")).toBe("sent");
    expect(state).toMatchObject({ status: "SENT", sentAt: acceptance, attempts: 1 });
    expect(await processConsultationEmailLog("log-A")).toBe("already-sent");
    expect(m.transport).toHaveBeenCalledTimes(1);
  });
  it("unverified PENDING/PROCESSING or provider UNKNOWN never becomes SENT or resends", async () => {
    for (const status of ["PENDING", "PROCESSING"]) {
      m.outboxRead.mockResolvedValueOnce(outbox(status));
      m.attemptRead.mockResolvedValueOnce(attempt("UNKNOWN"));
      expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    }
    m.outboxRead.mockResolvedValue(outbox("PROCESSING"));
    expect(await processConsultationEmailLog("log-A")).toBe("queued");
    expect(m.transport).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: "PENDING", sentAt: null });
  });
  it("provider ACCEPTED alone or outbox SENT alone is insufficient", async () => {
    m.outboxRead.mockResolvedValue(outbox("SENT", acceptance));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    m.outboxRead.mockResolvedValue(outbox("PROCESSING"));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "provider-1"));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    expect(state.status).toBe("PENDING");
  });
  it("matching persisted provider id/time + committed outbox SENT promotes exact acceptedAt once", async () => {
    m.outboxRead.mockResolvedValue(outbox("SENT", acceptance));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "resend-id"));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("sent");
    expect(state).toMatchObject({ status: "SENT", sentAt: acceptance, attempts: 0 });
    expect(m.logCas).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { id: "log-A", status: "PENDING" },
      data: expect.objectContaining({ status: "SENT", sentAt: acceptance }),
    }));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("already-sent");
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("provider ACCEPTED timestamp mismatch fails closed and cannot set SENT", async () => {
    m.outboxRead.mockResolvedValue(outbox("SENT", new Date(acceptance.getTime() + 1)));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "resend-id"));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    expect(m.logCas).not.toHaveBeenCalled();
  });
  it.each(["FAILED", "EXPIRED"])("only durable outbox terminal %s yields sanitized FAILED", async status => {
    m.outboxRead.mockResolvedValue(outbox(status));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("failed");
    expect(state).toMatchObject({ status: "FAILED", sentAt: null, lastError: "CONSULTATION_MAIL_TERMINAL_" + status });
    expect(m.transport).not.toHaveBeenCalled();
  });
  it.each(["EXPIRED", "FAILED"])(
    "P1 provider ACCEPTED but outbox %s is contradiction, PENDING manual review not FAILED/SENT",
    async status => {
      m.outboxRead.mockResolvedValue(outbox(status));
      m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "provider-id"));
      expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
      expect(state).toMatchObject({
        status: "PENDING", sentAt: null,
        lastError: "CONSULTATION_MAIL_ACK_TERMINAL_CONFLICT",
      });
      expect(m.logCas).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        where: { id: "log-A", status: "PENDING", lastError: null },
        data: { lastError: "CONSULTATION_MAIL_ACK_TERMINAL_CONFLICT" },
      }));
      expect(await processConsultationEmailLog("log-A")).toBe("queued");
      expect(m.transport).not.toHaveBeenCalled();
    },
  );
  it.each(["EXPIRED", "FAILED"])(
    "WORK070 AG4-1202 P3 UNKNOWN attempt with terminal %s keeps PENDING/manual review",
    async status => {
      m.outboxRead.mockResolvedValue(outbox(status));
      m.attemptRead.mockResolvedValue(attempt("UNKNOWN"));
      expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
      expect(state).toMatchObject({
        status: "PENDING", sentAt: null, attempts: 0,
        lastError: "CONSULTATION_MAIL_TERMINAL_UNKNOWN",
      });
      expect(m.logCas).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        where: { id: "log-A", status: "PENDING", lastError: null },
        data: { lastError: "CONSULTATION_MAIL_TERMINAL_UNKNOWN" },
      }));
      expect(await processConsultationEmailLog("log-A")).toBe("queued");
      expect(m.transport).not.toHaveBeenCalled();
      expect(state.status).not.toBe("SENT");
      expect(state.status).not.toBe("FAILED");
    },
  );
  it("WORK070 AG4-1202 P3 repeated UNKNOWN review does not rewrite, resend, or change status", async () => {
    m.outboxRead.mockResolvedValue(outbox("FAILED"));
    m.attemptRead.mockResolvedValue(attempt("UNKNOWN"));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    const previousWrites = m.logCas.mock.calls.length;
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    expect(m.logCas).toHaveBeenCalledTimes(previousWrites);
    expect(state).toMatchObject({
      status: "PENDING", attempts: 0, sentAt: null,
      lastError: "CONSULTATION_MAIL_TERMINAL_UNKNOWN",
    });
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("WORK070 AG4-1202 P3 UNKNOWN terminal duplicate CAS is idempotent", async () => {
    m.outboxRead.mockResolvedValue(outbox("EXPIRED"));
    m.attemptRead.mockResolvedValue(attempt("UNKNOWN"));
    const outcome = await Promise.all([
      reconcileConsultationEmailLog("log-A"),
      reconcileConsultationEmailLog("log-A"),
    ]);
    expect(outcome).toEqual(["queued", "queued"]);
    expect(state).toMatchObject({
      status: "PENDING", sentAt: null,
      lastError: "CONSULTATION_MAIL_TERMINAL_UNKNOWN",
    });
    const writes = await Promise.all(
      m.logCas.mock.results.map((call) => call.value as Promise<{ count: number }>),
    );
    expect(writes.filter((r) => r.count === 1)).toHaveLength(1);
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("P1 incomplete ACCEPTED evidence still blocks terminal FAILED and false SENT", async () => {
    m.outboxRead.mockResolvedValue(outbox("FAILED"));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", null, null));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    expect(state).toMatchObject({
      status: "PENDING", sentAt: null,
      lastError: "CONSULTATION_MAIL_ACK_TERMINAL_CONFLICT",
    });
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("P1 repeated manual review does not rewrite or resend an unchanged conflict", async () => {
    m.outboxRead.mockResolvedValue(outbox("EXPIRED"));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "provider-1"));
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    const priorCAS = m.logCas.mock.calls.length;
    expect(await reconcileConsultationEmailLog("log-A")).toBe("queued");
    expect(m.logCas).toHaveBeenCalledTimes(priorCAS);
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("P1 conflicting ACCEPTED after duplicate CAS leaves one safe manual-review status", async () => {
    m.outboxRead.mockResolvedValue(outbox("EXPIRED"));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "provider-id"));
    const results = await Promise.all([
      reconcileConsultationEmailLog("log-A"),
      reconcileConsultationEmailLog("log-A"),
    ]);
    expect(results).toEqual(["queued", "queued"]);
    expect(state).toMatchObject({
      status: "PENDING", sentAt: null,
      lastError: "CONSULTATION_MAIL_ACK_TERMINAL_CONFLICT",
    });
    const casResults = await Promise.all(
      m.logCas.mock.results.map((call) => call.value as Promise<{ count: number }>),
    );
    expect(casResults.filter((result) => result.count === 1)).toHaveLength(1);
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("concurrent reconciliation uses conditional CAS exactly once", async () => {
    m.outboxRead.mockResolvedValue(outbox("SENT", acceptance));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "resend-id"));
    const results = await Promise.all([reconcileConsultationEmailLog("log-A"), reconcileConsultationEmailLog("log-A")]);
    expect(results.sort()).toEqual(["already-sent", "sent"]);
    expect(state.status).toBe("SENT");
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("CAS write fault keeps PENDING, no blind resend and no false SENT", async () => {
    m.outboxRead.mockResolvedValue(outbox("SENT", acceptance));
    m.attemptRead.mockResolvedValue(attempt("ACCEPTED", acceptance, "resend-id"));
    m.logCas.mockRejectedValueOnce(new Error(PRIVATE));
    await expect(reconcileConsultationEmailLog("log-A")).rejects.toThrow(PRIVATE);
    expect(state.status).toBe("PENDING");
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("historical SENT is preserved without inspecting old ACK evidence", async () => {
    state.status = "SENT";
    expect(await reconcileConsultationEmailLog("log-A")).toBe("already-sent");
    expect(m.outboxRead).not.toHaveBeenCalled();
    expect(m.attemptRead).not.toHaveBeenCalled();
    expect(m.logCas).not.toHaveBeenCalled();
  });
  it("unknown attempt/transport error cannot make new FAILED or auto resend", async () => {
    m.transport.mockRejectedValueOnce(new Error(PRIVATE));
    m.attemptRead.mockResolvedValue(attempt("UNKNOWN"));
    expect(await processConsultationEmailLog("log-A")).toBe("queued");
    expect(state).toMatchObject({ status: "PENDING", sentAt: null });
    expect(await processConsultationEmailLog("log-A")).toBe("queued");
    expect(m.transport).not.toHaveBeenCalled();
  });
});
