/**
 * AG1-WORK070: source characterization of deferred mail acceptance vs
 * actual provider ACK. Review-only: deliberately DOES NOT change status policy.
 * Actual mailer source with injected fake outbox; NO Redis/PG/Resend calls.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(), resend: vi.fn(), findLog: vi.fn(), updateLog: vi.fn(),
  outbox: vi.fn(), attempt: vi.fn(),
  bridge: vi.fn(),
}));
vi.mock("../../../../mailer/src/outbox.ts", () => ({
  mailOutboxEnabled: () => true,
  enqueueTransactionalMail: m.enqueue,
}));
vi.mock("../../../../mailer/src/resend.ts", () => ({
  sendResendMail: m.resend,
}));
vi.mock("@gafus/prisma", () => ({
  ConsultationEmailStatus: { PENDING: "PENDING", FAILED: "FAILED", SENT: "SENT" },
  prisma: {
    consultationEmailLog: { findUnique: m.findLog, updateMany: m.updateLog },
    transactionalMailOutbox: { findUnique: m.outbox },
    transactionalMailAttempt: { findUnique: m.attempt },
  },
}));
vi.mock("./consultationTransactionalMail", () => ({
  sendConsultationEmailFromLog: (...args: unknown[]) => m.bridge(...args),
}));
import { sendTransactionalMail } from "../../../../mailer/src/send-transactional-mail";
import { processConsultationEmailLog } from "./consultationEmailDelivery";
import type { MailerEnv } from "../../../../mailer/src/env";

const syntheticEnv = { provider: "resend" } as MailerEnv;

beforeEach(() => {
  vi.resetAllMocks();
  m.enqueue.mockResolvedValue(undefined);
  m.resend.mockResolvedValue(undefined);
  m.findLog.mockResolvedValue({
    id: "mail-log-A", type: "CLIENT_BOOKING_RECEIVED",
    bookingId: "booking-A", status: "PENDING", attempts: 0,
  });
  m.updateLog.mockResolvedValue({ count: 1 });
  m.outbox.mockResolvedValue(null);
  m.attempt.mockResolvedValue(null);
  m.bridge.mockImplementation(async (_id: string) => {
    await sendTransactionalMail({
    to: "user@synthetic.invalid", subject: "A", text: "B",
    category: "consultation", deliveryKey: "consultation-mail-log-A",
    maxQueueAgeMs: 4 * 60 * 60_000,
    }, syntheticEnv);
    return { kind: "QUEUED" };
  });
});
describe("AG1 WORK070 source-backed outbox acceptance is NOT provider ACK", () => {
  it("actual mailer in deferred outbox mode resolves after enqueue, before provider call", async () => {
    await sendTransactionalMail({
      to: "user@synthetic.invalid", subject: "A", text: "B",
      deliveryKey: "consultation-mail-log-A", category: "consultation",
    }, syntheticEnv);
    expect(m.enqueue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      deliveryKey: "consultation-mail-log-A",
    }));
    expect(m.resend).not.toHaveBeenCalled();
  });
  it("actual Core keeps ConsultationEmailLog PENDING on outbox-only acknowledgment", async () => {
    expect(await processConsultationEmailLog("mail-log-A")).toBe("queued");
    expect(m.resend).not.toHaveBeenCalled();
    expect(m.enqueue).toHaveBeenCalledOnce();
    expect(m.updateLog).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "mail-log-A", status: "PENDING", attempts: 0 },
      data: expect.objectContaining({
        lastError: null, attempts: { increment: 1 },
      }),
    }));
  });
});
