/** WORK070 additive mailer disposition: no PG, Resend or Redis used. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  enqueue: vi.fn(), resend: vi.fn(), attempt: vi.fn(),
  outboxEnabled: true,
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { transactionalMailAttempt: { findUnique: m.attempt } },
}));
vi.mock("./outbox.js", () => ({
  mailOutboxEnabled: () => m.outboxEnabled,
  enqueueTransactionalMail: m.enqueue,
}));
vi.mock("./resend.js", () => ({ sendResendMail: m.resend }));
import {
  sendTransactionalMail, sendTransactionalMailWithDisposition,
} from "./send-transactional-mail.js";
import type { MailerEnv } from "./env.js";
const env = { provider: "resend" } as MailerEnv;
const request = {
  deliveryKey: "consultation-log-A", to: "synthetic@invalid.test",
  subject: "Synthetic", text: "No actual mail",
  category: "consultation" as const,
};
const acceptedAt = new Date("2026-10-21T12:01:02Z");
beforeEach(() => {
  vi.resetAllMocks();
  m.outboxEnabled = true;
  m.enqueue.mockResolvedValue(undefined);
  m.resend.mockResolvedValue(undefined);
  m.attempt.mockResolvedValue(null);
});
describe("WORK070 existing void mailer + additive evidence outcome", () => {
  it("deferred uses immutable delivery key; QUEUED cannot claim Resend ACK", async () => {
    expect(await sendTransactionalMailWithDisposition(request, env))
      .toEqual({ kind: "QUEUED" });
    expect(m.enqueue).toHaveBeenCalledExactlyOnceWith(request);
    expect(m.resend).not.toHaveBeenCalled();
    expect(m.attempt).not.toHaveBeenCalled();
  });
  it("generic legacy void interface remains unchanged", async () => {
    expect(await sendTransactionalMail(request, env)).toBeUndefined();
    expect(m.enqueue).toHaveBeenCalledExactlyOnceWith(request);
  });
  it("immediate uses persisted acceptedAt/provider id and never enqueue", async () => {
    m.attempt.mockResolvedValue({
      status: "ACCEPTED", providerMessageId: "message-1", acceptedAt,
    });
    expect(await sendTransactionalMailWithDisposition(
      { ...request, deliveryMode: "immediate" }, env,
    )).toEqual({ kind: "PROVIDER_ACCEPTED", acceptedAt });
    expect(m.resend).toHaveBeenCalledOnce();
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(m.attempt).toHaveBeenCalledExactlyOnceWith({
      where: { id: request.deliveryKey },
      select: { status: true, acceptedAt: true, providerMessageId: true },
    });
  });
  it.each(["UNKNOWN", "ACCEPTED", "FAILED"])(
    "missing/malformed persisted acceptance %s fails closed", async status => {
      m.attempt.mockResolvedValue({
        status, acceptedAt, providerMessageId: null,
      });
      expect(await sendTransactionalMailWithDisposition(
        { ...request, deliveryMode: "immediate" }, env,
      )).toEqual({ kind: "QUEUED" });
    },
  );
  it("provider exception propagates, never reports provider ACK", async () => {
    m.resend.mockRejectedValue(new Error("SYNTHETIC_TRANSPORT_FAILURE"));
    await expect(sendTransactionalMailWithDisposition(
      { ...request, deliveryMode: "immediate" }, env,
    )).rejects.toThrow("SYNTHETIC_TRANSPORT_FAILURE");
    expect(m.attempt).not.toHaveBeenCalled();
  });
});
