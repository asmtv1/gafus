/** AG1 WORK070 original retry/ACK regression, updated for AG4 lifecycle.
 * Actor, Prisma, outbox and provider all synthetic; no external I/O.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  findLog: vi.fn(), cas: vi.fn(), outbox: vi.fn(), attempt: vi.fn(), transport: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  ConsultationEmailStatus: { PENDING: "PENDING", FAILED: "FAILED", SENT: "SENT" },
  prisma: {
    consultationEmailLog: { findUnique: m.findLog, updateMany: m.cas },
    transactionalMailOutbox: { findUnique: m.outbox },
    transactionalMailAttempt: { findUnique: m.attempt },
  },
}));
vi.mock("./consultationTransactionalMail", () => ({
  sendConsultationEmailFromLog: m.transport,
}));
import { processConsultationEmailLog } from "./consultationEmailDelivery";
const PRIVATE = "PRIVATE_PROVIDER_RECIPIENT_EMAIL_AND_TOKEN";
const acceptedAt = new Date("2026-10-21T12:04:05.000Z");
type State = {
  id: string; bookingId: string; type: string; status: string;
  attempts: number; sentAt: Date | null; lastError: string | null;
};
let state: State | null;
beforeEach(() => {
  vi.resetAllMocks();
  state = {
    id: "mail-log-A", bookingId: "booking-A", type: "CLIENT_BOOKING_RECEIVED",
    status: "PENDING", attempts: 0, sentAt: null, lastError: null,
  };
  m.findLog.mockImplementation(async () => state && { ...state });
  m.outbox.mockResolvedValue(null);
  m.attempt.mockResolvedValue(null);
  m.transport.mockResolvedValue({ kind: "QUEUED" });
  m.cas.mockImplementation(async (q: { where: { status: string; attempts?: number };
    data: { status?: string; sentAt?: Date | null; lastError?: string | null;
      attempts?: { increment: number } } }) => {
    if (!state || state.status !== q.where.status ||
        q.where.attempts !== undefined && state.attempts !== q.where.attempts) {
      return { count: 0 };
    }
    state.status = q.data.status ?? state.status;
    if (q.data.sentAt !== undefined) state.sentAt = q.data.sentAt;
    if (q.data.lastError !== undefined) state.lastError = q.data.lastError;
    if (q.data.attempts) state.attempts += q.data.attempts.increment;
    return { count: 1 };
  });
});
describe("AG1 WORK070 retry/ambiguous ACK source regression", () => {
  it("missing log no producer / provider", async () => {
    state = null;
    expect(await processConsultationEmailLog("mail-log-A")).toBe("missing");
    expect(m.transport).not.toHaveBeenCalled();
    expect(m.cas).not.toHaveBeenCalled();
  });
  it("P2 historical FAILED missing outbox/attempt with attempts0 is terminal, no mutation", async () => {
    state!.status = "FAILED";
    expect(await processConsultationEmailLog("mail-log-A")).toBe("failed");
    expect(state).toMatchObject({ status: "FAILED", attempts: 0, sentAt: null });
    expect(m.transport).not.toHaveBeenCalled();
    expect(m.outbox).not.toHaveBeenCalled();
    expect(m.attempt).not.toHaveBeenCalled();
    expect(m.cas).not.toHaveBeenCalled();
  });
  it("historical SENT always suppresses a later duplicate send", async () => {
    state!.status = "SENT";
    expect(await processConsultationEmailLog("mail-log-A")).toBe("already-sent");
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("deferred outbox upsert is QUEUED, not SENT, with one enqueue attempt", async () => {
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(state).toMatchObject({ status: "PENDING", sentAt: null, attempts: 1 });
    m.outbox.mockResolvedValueOnce({ id: "consultation-mail-log-A" });
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(m.transport).toHaveBeenCalledTimes(1);
  });
  it("durable immediate provider ACK persists provider time, not worker clock", async () => {
    m.transport.mockResolvedValueOnce({ kind: "PROVIDER_ACCEPTED", acceptedAt });
    expect(await processConsultationEmailLog("mail-log-A")).toBe("sent");
    expect(state).toMatchObject({
      status: "SENT", attempts: 1, sentAt: acceptedAt, lastError: null,
    });
    expect(await processConsultationEmailLog("mail-log-A")).toBe("already-sent");
    expect(m.transport).toHaveBeenCalledOnce();
  });
  it("pre-ACK synthetic transport failure is UNKNOWN, redacted PENDING, no blind retry", async () => {
    m.transport.mockRejectedValueOnce(new Error(PRIVATE));
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(state).toMatchObject({
      status: "PENDING", attempts: 1, sentAt: null,
      lastError: "CONSULTATION_MAIL_ACCEPTANCE_UNKNOWN",
    });
    expect(JSON.stringify(state)).not.toContain(PRIVATE);
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(m.transport).toHaveBeenCalledOnce();
  });
  it("provider ACK then failed Core DB CAS cannot be misrecorded FAILED or resent", async () => {
    m.transport.mockResolvedValueOnce({ kind: "PROVIDER_ACCEPTED", acceptedAt });
    m.cas.mockRejectedValueOnce(new Error("CORE_DB_CAS_FAULT"));
    m.attempt.mockResolvedValueOnce(null).mockResolvedValue({
      status: "ACCEPTED", providerMessageId: "resend-id", acceptedAt,
    });
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(state).toMatchObject({ status: "PENDING", sentAt: null });
    expect(await processConsultationEmailLog("mail-log-A")).toBe("sent");
    expect(m.transport).toHaveBeenCalledOnce();
    expect(state?.sentAt).toEqual(acceptedAt);
  });
  it("standalone attempt FAILED without terminal outbox cannot claim terminal reject", async () => {
    // The attempt may be 429 or another retryable failure: only an outbox
    // terminal state proves terminal FAILED/EXPIRED.
    m.attempt.mockResolvedValue({
      status: "FAILED", errorCode: "daily_quota_exceeded",
    });
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(state).toMatchObject({ status: "PENDING", sentAt: null });
    expect(m.transport).not.toHaveBeenCalled();
  });
});
